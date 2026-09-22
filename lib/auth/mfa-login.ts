import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/auth/audit";
import {
  checkMfaAllowed, computePrivacyIdentifier, recordMfaFailure, recordMfaSuccess,
} from "@/lib/auth/abuse-protection";
import {
  consumeMfaChallenge, getValidMfaChallenge, hashMfaChallengeToken,
  recordFailedMfaChallengeAttempt,
} from "@/lib/auth/mfa-challenge";
import { verifyRecoveryCode, verifyTotpToken } from "@/lib/auth/mfa";
import { decryptSecret } from "@/lib/security/encryption";
import type { Prisma } from "@prisma/client";

export const MFA_LOGIN_ERROR = "Ověření se nezdařilo. Zkuste to znovu nebo se přihlaste znovu.";

async function recordFailure(token: string, userId: string, accountHash: string, tx: Prisma.TransactionClient) {
  // Attempt both writes even if one store fails. Never include credentials in logs.
  await Promise.allSettled([
    recordMfaFailure({ accountHash }),
    recordFailedMfaChallengeAttempt(token, userId, tx),
  ]);
  return null;
}

/** Only the transaction that consumes the challenge may establish a session. */
export async function verifyMfaLogin(token: string | null, input: unknown): Promise<string | null> {
  const challengeToken = token && /^[a-f0-9]{64}$/.test(token) ? token : "";
  const code = typeof input === "string" ? input.trim() : "";
  let userId = "";
  let accountHash = computePrivacyIdentifier("account", "");
  let failureRecorded = false;
  try {
    return await prisma.$transaction(async (tx) => {
      const fail = () => {
        failureRecorded = true;
        return recordFailure(challengeToken, userId, accountHash, tx);
      };
      // Resolve identity from persistence, never from submitted user/account fields.
      const challenge = challengeToken ? await tx.mfaChallenge.findUnique({
        where: { tokenHash: hashMfaChallengeToken(challengeToken) },
        select: { userId: true },
      }) : null;
      // Without a persisted identity, account tracking is anonymous and the challenge write is a no-op.
      if (!challenge) return fail();
      userId = challenge.userId;

      // Serialize attempts across ALL challenges for this account. These row locks
      // also prevent a concurrent user disable/MFA reset from racing verification.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "UserMfa" WHERE "userId" = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: userId }, select: { id: true, email: true, status: true },
      });
      accountHash = computePrivacyIdentifier("account", user?.email ?? "");
      const valid = await getValidMfaChallenge(challengeToken, tx);
      const mfa = await tx.userMfa.findUnique({ where: { userId } });
      if (!valid || !user || user.status !== "ACTIVE" || mfa?.status !== "ENABLED" ||
          !(await checkMfaAllowed({ accountHash }))) return fail();

      let recoveryId: string | undefined;
      let verified = false;
      if (/^\d{6}$/.test(code) && mfa.totpSecretEncrypted) {
        try { verified = verifyTotpToken(decryptSecret(mfa.totpSecretEncrypted), code); }
        catch { verified = false; }
      } else if (/^(?:[A-Fa-f0-9]{20}|[A-Fa-f0-9]{5}(?:-[A-Fa-f0-9]{5}){3})$/.test(code)) {
        const codes = await tx.mfaRecoveryCode.findMany({ where: { mfaId: mfa.id, usedAt: null } });
        for (const item of codes) {
          if (await verifyRecoveryCode(code.toUpperCase(), item.codeHash)) {
            recoveryId = item.id;
            verified = true;
            break;
          }
        }
      }
      if (!verified) return fail();
      if (!(await consumeMfaChallenge(challengeToken, userId, tx))) return fail();
      if (recoveryId) {
        const used = await tx.mfaRecoveryCode.updateMany({
          where: { id: recoveryId, mfaId: mfa.id, usedAt: null }, data: { usedAt: new Date() },
        });
        // Roll back challenge consumption if another recovery-code consumer won.
        if (used.count !== 1) throw new Error("MFA_RECOVERY_RACE");
        await logAudit({ action: "AUTH_MFA_RECOVERY_USED", scopeType: "SYSTEM", actorId: userId,
          resourceType: "UserMfa", resourceId: mfa.id, tx });
      }
      await recordMfaSuccess({ accountHash });
      return userId;
    }, { timeout: 15000 });
  } catch {
    if (!failureRecorded) await recordFailure(challengeToken, userId, accountHash, prisma);
    return null;
  }
}
