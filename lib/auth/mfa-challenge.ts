import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const MFA_CHALLENGE_MAX_ATTEMPTS = 5;

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

export async function getValidMfaChallenge(token: string, db: Prisma.TransactionClient = prisma) {
  const tokenHash = hashMfaChallengeToken(token);

  return db.mfaChallenge.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
      attempts: { lt: MFA_CHALLENGE_MAX_ATTEMPTS },
    },
    select: { userId: true },
  });
}

export async function consumeMfaChallenge(token: string, userId: string, db: Prisma.TransactionClient = prisma) {
  const tokenHash = hashMfaChallengeToken(token);

  const result = await db.mfaChallenge.updateMany({
    where: {
      tokenHash,
      userId,
      usedAt: null,
      expiresAt: { gt: new Date() },
      attempts: { lt: MFA_CHALLENGE_MAX_ATTEMPTS },
    },
    data: { usedAt: new Date() },
  });

  return result.count === 1;
}

export const MFA_CHALLENGE_COOKIE_NAME = "syn_admin_mfa_challenge";

export async function setMfaChallengeCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(MFA_CHALLENGE_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin/login",
    expires: expiresAt,
  });
}

export async function getMfaChallengeCookieToken() {
  const store = await cookies();
  return store.get(MFA_CHALLENGE_COOKIE_NAME)?.value ?? null;
}

export async function clearMfaChallengeCookie() {
  const store = await cookies();
  store.set(MFA_CHALLENGE_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin/login",
    expires: new Date(0),
  });
}


export async function recordFailedMfaChallengeAttempt(token: string, userId: string, db: Prisma.TransactionClient = prisma) {
  const tokenHash = hashMfaChallengeToken(token);

  const result = await db.mfaChallenge.updateMany({
    where: {
      tokenHash,
      userId,
      usedAt: null,
      expiresAt: { gt: new Date() },
      attempts: { lt: MFA_CHALLENGE_MAX_ATTEMPTS },
    },
    data: { attempts: { increment: 1 } },
  });

  return result.count === 1;
}
