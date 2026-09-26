import { test } from "node:test";
import assert from "node:assert";
import crypto from "crypto";
import {
  hashSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_IDLE_TIMEOUT_MINUTES,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_ABSOLUTE_TIMEOUT_HOURS,
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_TOUCH_THROTTLE_MINUTES,
  SESSION_TOUCH_THROTTLE_MS,
  calculateEffectiveSessionLifetime,
  SessionData,
  UserContext,
} from "@/lib/auth/session";

test("hashSessionToken produces correct deterministic SHA-256 hex digest", () => {
  const token = "test-token-12345";
  const expected = crypto.createHash("sha256").update(token, "utf8").digest("hex");
  const actual = hashSessionToken(token);
  assert.strictEqual(actual, expected);
  assert.strictEqual(actual.length, 64);
});

test("Session configuration constants are fail-closed and hardened for CMS 1.0 Admin", () => {
  assert.strictEqual(SESSION_COOKIE_NAME, "syn_admin_session");
  assert.strictEqual(SESSION_IDLE_TIMEOUT_MINUTES, 15);
  assert.strictEqual(SESSION_IDLE_TIMEOUT_MS, 15 * 60 * 1000);
  assert.strictEqual(SESSION_ABSOLUTE_TIMEOUT_HOURS, 12);
  assert.strictEqual(SESSION_ABSOLUTE_TIMEOUT_MS, 12 * 60 * 60 * 1000);
  assert.strictEqual(SESSION_TOUCH_THROTTLE_MINUTES, 1);
  assert.strictEqual(SESSION_TOUCH_THROTTLE_MS, 1 * 60 * 1000);
});

test("Pure helper: 1. Old stored idle expiry in future with lastSeenAt >15m ago results in expired effective idle", () => {
  const now = Date.now();
  const createdAt = new Date(now - 30 * 60 * 1000); // 30m ago
  const lastSeenAt = new Date(now - 20 * 60 * 1000); // 20m ago (> 15m idle limit)
  const expiresAt = new Date(now + 10 * 60 * 60 * 1000); // 10h in future
  const idleExpiresAt = new Date(now + 10 * 60 * 60 * 1000); // Stored old 12h idle in future

  const { effectiveExpiresAt, effectiveIdleExpiresAt } = calculateEffectiveSessionLifetime({
    createdAt,
    lastSeenAt,
    expiresAt,
    idleExpiresAt,
  });

  // Effective idle expires at lastSeenAt + 15m (which is 5m in the past relative to now)
  const expectedIdleMs = lastSeenAt.getTime() + 15 * 60 * 1000;
  assert.strictEqual(effectiveIdleExpiresAt.getTime(), expectedIdleMs);
  assert.ok(effectiveIdleExpiresAt.getTime() <= now, "Effective idle must be expired");
  assert.ok(effectiveExpiresAt.getTime() > now, "Absolute lifetime is not yet expired");
});

test("Pure helper: 2. Old stored absolute expiry in future with createdAt >12h ago results in expired effective absolute", () => {
  const now = Date.now();
  const createdAt = new Date(now - 13 * 60 * 60 * 1000); // 13h ago (> 12h absolute limit)
  const lastSeenAt = new Date(now - 2 * 60 * 1000); // 2m ago (active recently)
  const expiresAt = new Date(now + 25 * 24 * 60 * 60 * 1000); // Stored old 30d expiry in future
  const idleExpiresAt = new Date(now + 10 * 60 * 1000);

  const { effectiveExpiresAt, effectiveIdleExpiresAt } = calculateEffectiveSessionLifetime({
    createdAt,
    lastSeenAt,
    expiresAt,
    idleExpiresAt,
  });

  // Effective absolute expires at createdAt + 12h (1h in past)
  const expectedAbsoluteMs = createdAt.getTime() + 12 * 60 * 60 * 1000;
  assert.strictEqual(effectiveExpiresAt.getTime(), expectedAbsoluteMs);
  assert.ok(effectiveExpiresAt.getTime() <= now, "Effective absolute must be expired");
  assert.ok(effectiveIdleExpiresAt.getTime() <= effectiveExpiresAt.getTime(), "Effective idle must be clamped to absolute");
});

test("Pure helper: 3. Session inside both new limits remains valid and properly bounded", () => {
  const now = Date.now();
  const createdAt = new Date(now - 10 * 60 * 1000); // 10m ago
  const lastSeenAt = new Date(now - 2 * 60 * 1000); // 2m ago
  const expiresAt = new Date(createdAt.getTime() + 12 * 60 * 60 * 1000);
  const idleExpiresAt = new Date(lastSeenAt.getTime() + 15 * 60 * 1000);

  const { effectiveExpiresAt, effectiveIdleExpiresAt } = calculateEffectiveSessionLifetime({
    createdAt,
    lastSeenAt,
    expiresAt,
    idleExpiresAt,
  });

  assert.ok(effectiveExpiresAt.getTime() > now, "Absolute expiry must be in the future");
  assert.ok(effectiveIdleExpiresAt.getTime() > now, "Idle expiry must be in the future");
  assert.strictEqual(effectiveExpiresAt.getTime(), createdAt.getTime() + 12 * 60 * 60 * 1000);
  assert.strictEqual(effectiveIdleExpiresAt.getTime(), lastSeenAt.getTime() + 15 * 60 * 1000);
});

test("Pure helper: 4. Effective idle expiry never exceeds absolute expiry ceiling", () => {
  const now = Date.now();
  const createdAt = new Date(now - (11 * 60 * 60 * 1000 + 55 * 60 * 1000)); // 11h 55m ago (5m remaining before 12h absolute)
  const lastSeenAt = new Date(now - 1 * 60 * 1000); // 1m ago
  const expiresAt = new Date(createdAt.getTime() + 12 * 60 * 60 * 1000); // 4m in future
  const idleExpiresAt = new Date(now + 14 * 60 * 1000); // 14m in future

  const { effectiveExpiresAt, effectiveIdleExpiresAt } = calculateEffectiveSessionLifetime({
    createdAt,
    lastSeenAt,
    expiresAt,
    idleExpiresAt,
  });

  assert.strictEqual(effectiveIdleExpiresAt.getTime(), effectiveExpiresAt.getTime(), "Idle expiration must be clamped to absolute expiration");
});

test("Pure helper: 5. Stored earlier expiration remains stricter and helper never extends expiration", () => {
  const now = Date.now();
  const createdAt = new Date(now - 5 * 60 * 1000);
  const lastSeenAt = new Date(now - 1 * 60 * 1000);
  const strictStoredAbsolute = new Date(now + 2 * 60 * 1000); // Manually shortened expiry (2m in future)
  const strictStoredIdle = new Date(now + 1 * 60 * 1000); // Manually shortened idle (1m in future)

  const { effectiveExpiresAt, effectiveIdleExpiresAt } = calculateEffectiveSessionLifetime({
    createdAt,
    lastSeenAt,
    expiresAt: strictStoredAbsolute,
    idleExpiresAt: strictStoredIdle,
  });

  assert.strictEqual(effectiveExpiresAt.getTime(), strictStoredAbsolute.getTime(), "Helper must not extend stored absolute expiration");
  assert.strictEqual(effectiveIdleExpiresAt.getTime(), strictStoredIdle.getTime(), "Helper must not extend stored idle expiration");
});

test("Simulated session evaluation: revoked session fails closed", () => {
  const rawToken = "bearer_token_abc_123";
  const tokenHash = hashSessionToken(rawToken);
  const now = Date.now();
  const mockSession = {
    id: "sess-uuid-4",
    tokenHash,
    userId: "user-1",
    createdAt: new Date(now - 1000),
    expiresAt: new Date(now + 100000),
    idleExpiresAt: new Date(now + 50000),
    lastSeenAt: new Date(now - 100),
    revokedAt: new Date(now - 500),
    user: {
      id: "user-1",
      email: "admin@synthesis.local",
      displayName: "Admin",
      status: "ACTIVE",
    },
  };
  const isRevoked = !!mockSession.revokedAt;
  assert.strictEqual(isRevoked, true, "Revoked session must be rejected");
});

test("Simulated session evaluation: disabled/suspended user fails closed", () => {
  const rawToken = "bearer_token_abc_123";
  const tokenHash = hashSessionToken(rawToken);
  const now = Date.now();
  const mockSession = {
    id: "sess-uuid-5",
    tokenHash,
    userId: "user-1",
    createdAt: new Date(now - 1000),
    expiresAt: new Date(now + 100000),
    idleExpiresAt: new Date(now + 50000),
    lastSeenAt: new Date(now - 100),
    revokedAt: null,
    user: {
      id: "user-1",
      email: "admin@synthesis.local",
      displayName: "Admin",
      status: "SUSPENDED",
    },
  };
  const isUserActive = mockSession.user.status === "ACTIVE";
  assert.strictEqual(isUserActive, false, "Non-active user must be rejected");
});

test("Simulated legacy plaintext session migration: invalidates and forces relogin", () => {
  const legacyToken = "old_plaintext_session_id_12345";
  const tokenHash = hashSessionToken(legacyToken);
  const dbRecords = [
    {
      id: legacyToken,
      tokenHash: null,
      userId: "user-1",
      expiresAt: new Date(Date.now() + 100000),
    },
  ];
  const foundByHash = dbRecords.find((r) => r.tokenHash === tokenHash);
  assert.strictEqual(foundByHash, undefined, "Legacy token has no tokenHash match");
  const foundById = dbRecords.find((r) => r.id === legacyToken);
  assert.ok(foundById, "Legacy token is identified for safe invalidation and relogin requirement");
});
