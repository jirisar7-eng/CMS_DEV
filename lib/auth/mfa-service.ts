import { prisma } from "@/lib/db";
import {
  generateTotpSecret,
  generateRecoveryCode,
  hashRecoveryCode,
  verifyTotpToken,
  verifyRecoveryCode,
} from "@/lib/auth/mfa";
import { encryptSecret, decryptSecret } from "@/lib/security/encryption";

export async function startMfaEnrollment(userId: string) {
  const secret = generateTotpSecret();
  const recoveryCodes = Array.from({ length: 10 }, generateRecoveryCode);
  const recoveryHashes = await Promise.all(recoveryCodes.map(hashRecoveryCode));

  const mfa = await prisma.$transaction(async (tx) => {
    const record = await tx.userMfa.upsert({
      where: { userId },
      update: {
        totpSecretEncrypted: encryptSecret(secret),
        status: "PENDING",
        verifiedAt: null,
        enabledAt: null,
      },
      create: {
        userId,
        totpSecretEncrypted: encryptSecret(secret),
      },
    });

    await tx.mfaRecoveryCode.deleteMany({ where: { mfaId: record.id } });
    await tx.mfaRecoveryCode.createMany({
      data: recoveryHashes.map((codeHash) => ({ mfaId: record.id, codeHash })),
    });

    await logAudit({
      action: "AUTH_MFA_ENROLLMENT_STARTED",
      scopeType: "SYSTEM",
      actorId: userId,
      resourceType: "UserMfa",
      resourceId: record.id,
      tx,
    });

    return record;
  });

  return { mfaId: mfa.id, secret, recoveryCodes };
}

export async function verifyMfaEnrollment(userId: string, token: string) {
  const mfa = await prisma.userMfa.findUnique({ where: { userId } });
  if (!mfa?.totpSecretEncrypted || mfa.status !== "PENDING") return false;

  let secret: string;
  try { secret = decryptSecret(mfa.totpSecretEncrypted); }
  catch { return false; }

  if (!verifyTotpToken(secret, token)) return false;

  const now = new Date();
  const result = await prisma.userMfa.updateMany({
    where: { id: mfa.id, userId, status: "PENDING" },
    data: { status: "ENABLED", verifiedAt: now, enabledAt: now },
  });

  return result.count === 1;
}

export async function consumeMfaRecoveryCode(userId: string, code: string) {
  const mfa = await prisma.userMfa.findUnique({
    where: { userId },
    include: {
      recoveryCodes: {
        where: { usedAt: null },
        select: { id: true, codeHash: true },
      },
    },
  });

  if (!mfa || mfa.status !== "ENABLED") return false;

  for (const item of mfa.recoveryCodes) {
    if (!(await verifyRecoveryCode(code, item.codeHash))) continue;

    const used = await prisma.mfaRecoveryCode.updateMany({
      where: { id: item.id, mfaId: mfa.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    return used.count === 1;
  }

  return false;
}
