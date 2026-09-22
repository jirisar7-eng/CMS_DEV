import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/auth/audit";
import { checkMfaAllowed, computePrivacyIdentifier, recordMfaFailure, recordMfaSuccess } from "@/lib/auth/abuse-protection";
import { consumeMfaChallenge, getValidMfaChallenge, hashMfaChallengeToken, recordFailedMfaChallengeAttempt } from "@/lib/auth/mfa-challenge";
import { verifyRecoveryCode, verifyTotpToken } from "@/lib/auth/mfa";
import { decryptSecret } from "@/lib/security/encryption";
import { createSessionRecord, type PendingSessionCookie } from "@/lib/auth/session";
import type { Prisma } from "@prisma/client";

export const MFA_LOGIN_ERROR = "Ověření se nezdařilo. Zkuste to znovu nebo se přihlaste znovu.";

async function recordFailure(token: string, userId: string, accountHash: string, tx?: Prisma.TransactionClient) {
  await Promise.allSettled([
    recordMfaFailure({ accountHash, tx }),
    recordFailedMfaChallengeAttempt(token, userId, tx),
  ]);
  return null;
}

interface MfaTransactionState { token: string; userId: string; accountHash: string; failureRecorded: boolean; verified: boolean; }

async function verifyMfaLoginInTransaction(
  token: string | null,
  input: unknown,
  tx: Prisma.TransactionClient,
  state: MfaTransactionState,
  onVerified: (userId: string) => Promise<void> = async () => {},
): Promise<string | null> {
  const challengeToken = token && /^[a-f0-9]{64}$/.test(token) ? token : "";
  const code = typeof input === "string" ? input.trim() : "";
  let userId = "";
  let accountHash = computePrivacyIdentifier("account", "");
  const fail = () => { state.failureRecorded = true; return recordFailure(challengeToken, userId, accountHash, tx); };

  const challenge = challengeToken ? await tx.mfaChallenge.findUnique({
    where: { tokenHash: hashMfaChallengeToken(challengeToken) }, select: { userId: true },
  }) : null;
  if (!challenge) return fail();
  userId = challenge.userId;
  state.userId = userId;

  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "UserMfa" WHERE "userId" = ${userId} FOR UPDATE`;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true, status: true } });
  accountHash = computePrivacyIdentifier("account", user?.email ?? "");
  state.accountHash = accountHash;
  const valid = await getValidMfaChallenge(challengeToken, tx);
  const mfa = await tx.userMfa.findUnique({ where: { userId } });
  if (!valid || !user || user.status !== "ACTIVE" || mfa?.status !== "ENABLED" ||
      !(await checkMfaAllowed({ accountHash, tx }))) return fail();

  let recoveryId: string | undefined;
  let verified = false;
  if (/^\d{6}$/.test(code) && mfa.totpSecretEncrypted) {
    try { verified = verifyTotpToken(decryptSecret(mfa.totpSecretEncrypted), code); } catch { verified = false; }
  } else if (/^(?:[A-Fa-f0-9]{20}|[A-Fa-f0-9]{5}(?:-[A-Fa-f0-9]{5}){3})$/.test(code)) {
    const codes = await tx.mfaRecoveryCode.findMany({ where: { mfaId: mfa.id, usedAt: null } });
    for (const item of codes) {
      if (await verifyRecoveryCode(code.toUpperCase(), item.codeHash)) { recoveryId = item.id; verified = true; break; }
    }
  }
  if (!verified) return fail();
  if (!(await consumeMfaChallenge(challengeToken, userId, tx))) return fail();
  if (recoveryId) {
    const used = await tx.mfaRecoveryCode.updateMany({
      where: { id: recoveryId, mfaId: mfa.id, usedAt: null }, data: { usedAt: new Date() },
    });
    if (used.count !== 1) throw new Error("MFA_RECOVERY_RACE");
    await logAudit({ action: "AUTH_MFA_RECOVERY_USED", scopeType: "SYSTEM", actorId: userId,
      resourceType: "UserMfa", resourceId: mfa.id, tx });
  }
  await recordMfaSuccess({ accountHash, tx });
  state.verified = true;
  await onVerified(userId);
  return userId;
}

export async function verifyMfaLogin(token: string | null, input: unknown): Promise<string | null> {
  const state: MfaTransactionState = { token: token && /^[a-f0-9]{64}$/.test(token) ? token : "", userId: "", accountHash: computePrivacyIdentifier("account", ""), failureRecorded: false, verified: false };
  try {
    return await prisma.$transaction((tx) => verifyMfaLoginInTransaction(token, input, tx, state), { timeout: 15000 });
  } catch {
    if (!state.failureRecorded && !state.verified) await recordFailure(state.token, state.userId, state.accountHash);
    return null;
  }
}

export async function completeMfaLogin(token: string | null, input: unknown): Promise<PendingSessionCookie | null> {
  const state: MfaTransactionState = { token: token && /^[a-f0-9]{64}$/.test(token) ? token : "", userId: "", accountHash: computePrivacyIdentifier("account", ""), failureRecorded: false, verified: false };
  try {
    return await prisma.$transaction(async (tx) => {
      let pending: PendingSessionCookie | null = null;
      const userId = await verifyMfaLoginInTransaction(token, input, tx, state, async (verifiedUserId) => {
        await logAudit({ action: "AUTH_LOGIN_SUCCESS", scopeType: "SYSTEM", actorId: verifiedUserId,
          resourceType: "UserMfa", tx });
        pending = await createSessionRecord(verifiedUserId, tx);
      });
      return userId ? pending : null;
    }, { timeout: 15000 });
  } catch {
    if (!state.failureRecorded && !state.verified) await recordFailure(state.token, state.userId, state.accountHash);
    return null;
  }
}
