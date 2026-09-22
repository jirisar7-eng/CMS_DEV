import assert from "node:assert/strict";
import { test } from "node:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import { createMfaChallenge, hashMfaChallengeToken, recordFailedMfaChallengeAttempt } from "@/lib/auth/mfa-challenge";
import { verifyMfaLogin, MFA_LOGIN_ERROR } from "@/lib/auth/mfa-login";
import { verifyMfaAction } from "@/app/(auth)/admin/login/mfa/actions";
import { computePrivacyIdentifier, checkMfaAllowed, recordMfaFailure, recordMfaSuccess } from "@/lib/auth/abuse-protection";
import { encryptSecret } from "@/lib/security/encryption";
import { hashRecoveryCode } from "@/lib/auth/mfa";
import * as OTPAuth from "otpauth";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import {
  startMfaEnrollment,
  verifyMfaEnrollment,
  consumeMfaRecoveryCode,
} from "@/lib/auth/mfa-service";

test("PostgreSQL MFA lifecycle", async () => {
  if (!process.env.DATABASE_URL) return;

  process.env.MFA_ENCRYPTION_KEY =
    crypto.randomBytes(32).toString("base64");

  const user = await prisma.user.create({
    data: {
      email: `mfa-pg-${Date.now()}@synthesis.local`,
      passwordHash: "test-only",
    },
  });

  try {
    const enrollment = await startMfaEnrollment(user.id);

    const stored = await prisma.userMfa.findUnique({
      where: { userId: user.id },
      include: { recoveryCodes: true },
    });

    assert.ok(stored);
    assert.notEqual(stored.totpSecretEncrypted, enrollment.secret);
    assert.equal(stored.recoveryCodes.length, 10);
    assert.ok(
      stored.recoveryCodes.every(
        (r) => !enrollment.recoveryCodes.includes(r.codeHash)
      )
    );

    const token = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(enrollment.secret),
      digits: 6,
      period: 30,
    }).generate();

    assert.equal(await verifyMfaEnrollment(user.id, token), true);
    assert.equal(
      await consumeMfaRecoveryCode(user.id, enrollment.recoveryCodes[0]),
      true
    );
    assert.equal(
      await consumeMfaRecoveryCode(user.id, enrollment.recoveryCodes[0]),
      false
    );

    const actions = await prisma.auditLog.findMany({
      where: { actorId: user.id },
      select: { action: true },
    });

    assert.deepEqual(
      new Set(actions.map((a) => a.action)),
      new Set([
        "AUTH_MFA_ENROLLMENT_STARTED",
        "AUTH_MFA_ENABLED",
        "AUTH_MFA_RECOVERY_USED",
      ])
    );
  } finally {
    await prisma.auditLog.deleteMany({ where: { actorId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});


test("PostgreSQL MFA login completion and concurrency", { skip: !process.env.DATABASE_URL }, async (t) => {
  const previousKey = process.env.MFA_ENCRYPTION_KEY;
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  const secret = "JBSWY3DPEHPK3PXP";
  const code = "ABCDE-12345-ABCDE-12345";
  const codeHash = await hashRecoveryCode(code);
  const request = new AsyncLocalStorage<{ token: string; writes: string[] }>();
  const headersApi = createRequire(import.meta.url)("next/headers");
  const originalCookies = headersApi.cookies;
  headersApi.cookies = async () => ({
    get: () => ({ value: request.getStore()?.token }),
    set: (name: string) => { request.getStore()?.writes.push(name); },
  });
  t.after(() => {
    headersApi.cookies = originalCookies;
    if (previousKey === undefined) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = previousKey;
  });

  async function fixture(run: (data: { userId: string; mfaId: string; accountHash: string }) => Promise<void>) {
    const user = await prisma.user.create({ data: {
      email: `mfa-login-${crypto.randomUUID()}@example.test`, passwordHash: "test-only", status: "ACTIVE",
    } });
    const accountHash = computePrivacyIdentifier("account", user.email);
    try {
      const mfa = await prisma.userMfa.create({ data: {
        userId: user.id, status: "ENABLED", totpSecretEncrypted: encryptSecret(secret),
        recoveryCodes: { create: [{ codeHash }] },
      } });
      await run({ userId: user.id, mfaId: mfa.id, accountHash });
    } finally {
      await prisma.authRateLimit.deleteMany({ where: { key: { in: [accountHash, `mfa_${accountHash}`] } } });
      await prisma.auditLog.deleteMany({ where: { actorId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  }
  function totp() {
    return new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
  }
  async function submit(token: string, input: string) {
    const context = { token, writes: [] as string[] };
    return request.run(context, async () => {
      const data = new FormData(); data.set("code", input);
      try {
        const result = await verifyMfaAction({ error: null }, data);
        assert.deepEqual(result, { error: MFA_LOGIN_ERROR });
        return { success: false, writes: context.writes };
      } catch (error) {
        assert.match(String(error), /NEXT_REDIRECT/);
        return { success: true, writes: context.writes };
      }
    });
  }

  await t.test("MFA failure counters share transaction visibility and rollback", () => fixture(async ({ userId, accountHash }) => {
    const challenge = await createMfaChallenge(userId);
    const where = { tokenHash: hashMfaChallengeToken(challenge.token) };
    await assert.rejects(prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      for (let i = 0; i < 5; i++) {
        await recordMfaFailure({ accountHash, tx });
        await recordFailedMfaChallengeAttempt(challenge.token, userId, tx);
      }
      assert.equal(await checkMfaAllowed({ accountHash, tx }), false);
      assert.equal((await tx.authRateLimit.findUnique({ where: { key: `mfa_${accountHash}` } }))?.points, 5);
      assert.equal((await tx.mfaChallenge.findUnique({ where }))?.attempts, 5);
      throw new Error("ROLLBACK_MFA_FAILURE_COUNTERS");
    }), /ROLLBACK_MFA_FAILURE_COUNTERS/);
    assert.equal(await prisma.authRateLimit.findUnique({ where: { key: `mfa_${accountHash}` } }), null);
    assert.equal((await prisma.mfaChallenge.findUnique({ where }))?.attempts, 0);
  }));

  await t.test("MFA success resets both counters only when its transaction commits", () => fixture(async ({ accountHash }) => {
    const keys = [accountHash, `mfa_${accountHash}`];
    await prisma.authRateLimit.createMany({ data: keys.map((key) => ({ key, points: 1, lastFailedAt: new Date() })) });
    await assert.rejects(prisma.$transaction(async (tx) => {
      await recordMfaSuccess({ accountHash, tx });
      assert.equal(await tx.authRateLimit.count({ where: { key: { in: keys } } }), 0);
      throw new Error("ROLLBACK_MFA_SUCCESS_COUNTERS");
    }), /ROLLBACK_MFA_SUCCESS_COUNTERS/);
    assert.equal(await prisma.authRateLimit.count({ where: { key: { in: keys } } }), 2);
    await prisma.$transaction(async (tx) => { await recordMfaSuccess({ accountHash, tx }); });
    assert.equal(await prisma.authRateLimit.count({ where: { key: { in: keys } } }), 0);
  }));

  for (const method of ["totp", "recovery"]) {
    await t.test(`${method}: concurrent submissions create exactly one session and login audit`, () => fixture(async ({ userId }) => {
      const challenge = await createMfaChallenge(userId);
      const input = method === "totp" ? totp() : code;
      const results = await Promise.all(Array.from({ length: 4 }, () => submit(challenge.token, input)));
      assert.equal(results.filter((result) => result.success).length, 1);
      assert.deepEqual(results.find((result) => result.success)?.writes, ["syn_admin_mfa_challenge", "syn_admin_session"]);
      assert.ok(results.filter((result) => !result.success).every((result) => result.writes.length === 0));
      assert.equal(await prisma.session.count({ where: { userId } }), 1);
      assert.equal(await prisma.auditLog.count({ where: { actorId: userId, action: "AUTH_LOGIN_SUCCESS" } }), 1);
      assert.equal(await prisma.auditLog.count({ where: { actorId: userId, action: "AUTH_MFA_RECOVERY_USED" } }), method === "recovery" ? 1 : 0);
      assert.equal((await submit(challenge.token, input)).success, false);
      assert.equal(await prisma.session.count({ where: { userId } }), 1);
    }));
  }

  await t.test("one recovery code cannot complete two different challenges", () => fixture(async ({ userId, mfaId }) => {
    const challenges = await Promise.all([createMfaChallenge(userId), createMfaChallenge(userId)]);
    const results = await Promise.all(challenges.map((challenge) => submit(challenge.token, code)));
    assert.equal(results.filter((result) => result.success).length, 1);
    assert.equal(await prisma.mfaRecoveryCode.count({ where: { mfaId, usedAt: { not: null } } }), 1);
    assert.equal(await prisma.mfaChallenge.count({ where: { userId, usedAt: { not: null } } }), 1);
    assert.equal(await prisma.session.count({ where: { userId } }), 1);
  }));

  await t.test("concurrent failures cannot lose account increments across different challenges", () => fixture(async ({ userId, accountHash }) => {
    const challenges = await Promise.all(Array.from({ length: 6 }, () => createMfaChallenge(userId)));
    assert.deepEqual(await Promise.all(challenges.map((challenge) => verifyMfaLogin(challenge.token, "invalid"))), Array(6).fill(null));
    const limiter = await prisma.authRateLimit.findUnique({ where: { key: `mfa_${accountHash}` } });
    assert.equal(limiter?.points, 6);
    assert.ok(limiter?.blockedUntil);
    const records = await prisma.mfaChallenge.findMany({ where: { userId } });
    assert.ok(records.every((record) => record.attempts === 1));
    const fresh = await createMfaChallenge(userId);
    assert.equal(await verifyMfaLogin(fresh.token, totp()), null);
    assert.equal(await prisma.session.count({ where: { userId } }), 0);
  }));

  await t.test("challenge attempt cap survives account limiter reset", () => fixture(async ({ userId, accountHash }) => {
    const challenge = await createMfaChallenge(userId);
    await Promise.all(Array.from({ length: 7 }, () => verifyMfaLogin(challenge.token, "invalid")));
    const record = await prisma.mfaChallenge.findUnique({ where: { tokenHash: hashMfaChallengeToken(challenge.token) } });
    assert.equal(record?.attempts, 5);
    await prisma.authRateLimit.deleteMany({ where: { key: `mfa_${accountHash}` } });
    assert.equal(await verifyMfaLogin(challenge.token, totp()), null);
  }));

  for (const state of ["disabled user", "pending MFA", "missing MFA", "expired", "used", "exhausted", "deleted user"]) {
    await t.test(`persisted ${state} rejects a correct code`, () => fixture(async ({ userId }) => {
      const challenge = await createMfaChallenge(userId);
      const where = { tokenHash: hashMfaChallengeToken(challenge.token) };
      if (state === "disabled user") await prisma.user.update({ where: { id: userId }, data: { status: "DISABLED" } });
      if (state === "pending MFA") await prisma.userMfa.update({ where: { userId }, data: { status: "PENDING" } });
      if (state === "missing MFA") await prisma.userMfa.delete({ where: { userId } });
      if (state === "expired") await prisma.mfaChallenge.update({ where, data: { expiresAt: new Date(0) } });
      if (state === "used") await prisma.mfaChallenge.update({ where, data: { usedAt: new Date() } });
      if (state === "exhausted") await prisma.mfaChallenge.update({ where, data: { attempts: 5 } });
      if (state === "deleted user") await prisma.user.delete({ where: { id: userId } });
      assert.equal((await submit(challenge.token, totp())).success, false);
      assert.equal(await prisma.session.count({ where: { userId } }), 0);
    }));
  }
  await prisma.authRateLimit.deleteMany({ where: { key: "mfa_account_anonymous" } });
});
