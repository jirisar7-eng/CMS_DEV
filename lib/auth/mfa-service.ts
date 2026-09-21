import { prisma } from "@/lib/db";
import {
  generateTotpSecret,
  generateRecoveryCode,
  hashRecoveryCode,
} from "@/lib/auth/mfa";
import { encryptSecret } from "@/lib/security/encryption";

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

    return record;
  });

  return { mfaId: mfa.id, secret, recoveryCodes };
}
