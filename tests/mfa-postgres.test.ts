import assert from "node:assert/strict";
import { test } from "node:test";
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
