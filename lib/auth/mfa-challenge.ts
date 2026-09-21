import crypto from "node:crypto";
import { prisma } from "@/lib/db";

export const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function hashMfaChallengeToken(token: string) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createMfaChallenge(userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashMfaChallengeToken(token);
  const expiresAt = new Date(Date.now() + MFA_CHALLENGE_TTL_MS);

  await prisma.mfaChallenge.create({
    data: { userId, tokenHash, expiresAt },
  });

  return { token, expiresAt };
}

export async function getValidMfaChallenge(token: string) {
  const tokenHash = hashMfaChallengeToken(token);

  return prisma.mfaChallenge.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { userId: true },
  });
}

export async function consumeMfaChallenge(token: string, userId: string) {
  const tokenHash = hashMfaChallengeToken(token);

  const result = await prisma.mfaChallenge.updateMany({
    where: {
      tokenHash,
      userId,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });

  return result.count === 1;
}
