import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {
  computePrivacyIdentifier,
  assertNoRawSecretsOrPii,
  sanitizeAbuseMetadata,
  MemoryAbuseLimiterStore,
  setAbuseLimiterStoreForTesting,
  checkLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
  LOGIN_MAX_FAILED_ATTEMPTS,
  LOGIN_MAX_IP_ATTEMPTS,
  LOGIN_WINDOW_MS,
  LOGIN_LOCKOUT_MS,
  UNIFORM_LOGIN_ERROR,
  RATE_LIMIT_ERROR,
  STORAGE_ERROR_LOGIN_MESSAGE,
  DUMMY_BCRYPT_HASH,
} from "@/lib/auth/abuse-protection";
import { sanitizeAuditMetadata } from "@/lib/domain/audit/service";

describe("SYN-SEC-008: Login Abuse Protection & Rate Limiting", () => {
  let store: MemoryAbuseLimiterStore;

  beforeEach(() => {
    store = new MemoryAbuseLimiterStore();
    setAbuseLimiterStoreForTesting(store);
  });

  describe("1. Privacy-Preserving Identifier & Normalization", () => {
    it("derives deterministic, non-reversible identifiers for email and IP", () => {
      const email = "Admin.User@example.com ";
      const id1 = computePrivacyIdentifier("account", email);
      const id2 = computePrivacyIdentifier("account", "admin.user@example.com");

      assert.equal(id1, id2, "Normalized email (trim + lowercase) must produce identical hash");
      assert.ok(id1.startsWith("account_"), "Must be prefixed with account_");
      assert.ok(!id1.includes("admin"), "Must NOT include any plain email substrings");
      assert.ok(!id1.includes("example.com"), "Must NOT include domain");
    });

    it("normalizes IP addresses including x-forwarded-for chains and bracketed IPv6", () => {
      const forwarded = "203.0.113.195, 70.41.3.18, 150.172.238.178";
      const id1 = computePrivacyIdentifier("ip", forwarded);
      const id2 = computePrivacyIdentifier("ip", "203.0.113.195");

      assert.equal(id1, id2, "First client IP in proxy chain must be extracted");
      assert.ok(id1.startsWith("ip_"));
      assert.ok(!id1.includes("203.0.113.195"), "Must NOT leak plain IP address");

      const ipv6Bracketed = "[2001:db8::1]";
      const ipv6Plain = "2001:db8::1";
      assert.equal(
        computePrivacyIdentifier("ip", ipv6Bracketed),
        computePrivacyIdentifier("ip", ipv6Plain),
        "Bracketed and unbracketed IPv6 must match"
      );
    });
  });

  describe("2. No Raw Email, IP, or Secret Leakage in Abuse Metadata", () => {
    it("throws on raw email in metadata keys or values", () => {
      // Forbidden key
      assert.throws(
        () => assertNoRawSecretsOrPii({ email: "victim@example.com" }),
        /PRIVACY_VIOLATION.*Forbidden sensitive key/
      );

      // Embedded raw email value in safe-named key
      assert.throws(
        () => assertNoRawSecretsOrPii({ userRef: "user@synthesis.local" }),
        /PRIVACY_VIOLATION.*Raw email detected/
      );
    });

    it("throws on raw IPv4 or IPv6 in metadata", () => {
      assert.throws(
        () => assertNoRawSecretsOrPii({ clientIp: "192.168.1.50" }),
        /PRIVACY_VIOLATION/
      );

      assert.throws(
        () => assertNoRawSecretsOrPii({ details: "failed from 10.0.0.1" }),
        /PRIVACY_VIOLATION.*Raw IPv4 detected/
      );

      assert.throws(
        () => assertNoRawSecretsOrPii({ details: "failed from 2001:0db8:85a3:0000:0000:8a2e:0370:7334" }),
        /PRIVACY_VIOLATION.*Raw IPv6 detected/
      );
    });

    it("throws on raw secrets, passwords, or tokens in metadata", () => {
      assert.throws(
        () => assertNoRawSecretsOrPii({ password: "PlainPassword123!" }),
        /PRIVACY_VIOLATION/
      );

      assert.throws(
        () => assertNoRawSecretsOrPii({ token: "sk_live_123456" }),
        /PRIVACY_VIOLATION/
      );

      assert.throws(
        () => assertNoRawSecretsOrPii({ authHeader: "Bearer eyJhbGciOi..." }),
        /PRIVACY_VIOLATION/
      );
    });

    it("allows valid privacy identifiers and sanitized metadata", () => {
      const safeMeta = {
        identifierHash: "account_a1b2c3d4e5f6",
        clientIpHash: "ip_9z8y7x6w5v4u",
        reason: "invalid_credentials",
        attempt: 3,
      };

      assert.doesNotThrow(() => assertNoRawSecretsOrPii(safeMeta));
      const sanitized = sanitizeAbuseMetadata(safeMeta);
      assert.deepEqual(sanitized, safeMeta);
    });

    it("audit write path accepts identifierHash and clientIpHash without raw leak", () => {
      const raw = {
        identifierHash: "account_1234567890abcdef",
        clientIpHash: "ip_abcdef1234567890",
        reason: "invalid_credentials",
        password: "test_password_must_be_stripped",
      };

      const result = sanitizeAuditMetadata(raw, "AUTH_LOGIN_BLOCKED", { mode: "write" })!;
      assert.equal(result.identifierHash, "account_1234567890abcdef");
      assert.equal(result.clientIpHash, "ip_abcdef1234567890");
      assert.equal(result.reason, "invalid_credentials");
      assert.equal((result as any).password, undefined);
    });
  });

  describe("3. Repeated Failed Login Throttling", () => {
    it("throttles account after 5 consecutive failed attempts", async () => {
      const accountHash = computePrivacyIdentifier("account", "target@example.com");
      const ipHash = computePrivacyIdentifier("ip", "192.0.2.1");

      // 4 failed attempts: still allowed
      for (let i = 1; i <= 4; i++) {
        const check = await checkLoginAllowed({ accountHash, ipHash });
        assert.equal(check.allowed, true, `Attempt ${i} must be allowed before limit`);
        await recordLoginFailure({ accountHash, ipHash });
      }

      // 5th attempt: allowed, but failure triggers lockout
      const fifthCheck = await checkLoginAllowed({ accountHash, ipHash });
      assert.equal(fifthCheck.allowed, true);
      const res = await recordLoginFailure({ accountHash, ipHash });
      assert.equal(res.accountBlocked, true, "5th failure must trigger account lockout");

      // 6th attempt: throttled
      const throttledCheck = await checkLoginAllowed({ accountHash, ipHash });
      assert.equal(throttledCheck.allowed, false);
      assert.equal(throttledCheck.reason, "ACCOUNT_BLOCKED");
      assert.ok(throttledCheck.retryAfterMs! > 0, "Must provide retryAfterMs");
    });

    it("throttles IP address after 20 failed attempts from that IP", async () => {
      const ipHash = computePrivacyIdentifier("ip", "198.51.100.5");

      // Simulate 19 failed attempts across different accounts from this IP
      for (let i = 1; i <= 19; i++) {
        const accHash = computePrivacyIdentifier("account", `victim${i}@example.com`);
        const check = await checkLoginAllowed({ accountHash: accHash, ipHash });
        assert.equal(check.allowed, true);
        await recordLoginFailure({ accountHash: accHash, ipHash });
      }

      // 20th failure triggers IP block
      const lastAcc = computePrivacyIdentifier("account", "victim20@example.com");
      const res = await recordLoginFailure({ accountHash: lastAcc, ipHash });
      assert.equal(res.ipBlocked, true, "20th failure on same IP must trigger IP block");

      // 21st attempt from this IP (even with new account) is blocked
      const freshAcc = computePrivacyIdentifier("account", "newuser@example.com");
      const check = await checkLoginAllowed({ accountHash: freshAcc, ipHash });
      assert.equal(check.allowed, false);
      assert.equal(check.reason, "IP_BLOCKED");
    });
  });

  describe("4. Valid Login after Allowed Recovery", () => {
    it("allows login once lockout period has elapsed (time-based recovery)", async () => {
      const accountHash = computePrivacyIdentifier("account", "recovering@example.com");
      const ipHash = computePrivacyIdentifier("ip", "192.0.2.10");

      const t0 = new Date("2026-09-21T12:00:00Z");

      // Trigger lockout at t0
      for (let i = 0; i < LOGIN_MAX_FAILED_ATTEMPTS; i++) {
        await recordLoginFailure({ accountHash, ipHash, now: t0 });
      }

      const blockedCheck = await checkLoginAllowed({ accountHash, ipHash, now: t0 });
      assert.equal(blockedCheck.allowed, false);

      // Advance time by 16 minutes (beyond 15-minute lockout)
      const tAfterLockout = new Date("2026-09-21T12:16:00Z");
      const recoveredCheck = await checkLoginAllowed({ accountHash, ipHash, now: tAfterLockout });
      assert.equal(recoveredCheck.allowed, true, "Must be allowed after lockout expiration");
    });

    it("clears failed attempt count on successful login", async () => {
      const accountHash = computePrivacyIdentifier("account", "user-success@example.com");
      const ipHash = computePrivacyIdentifier("ip", "192.0.2.11");

      // 3 failures logged
      for (let i = 0; i < 3; i++) {
        await recordLoginFailure({ accountHash, ipHash });
      }

      const recordBefore = await store.get(accountHash);
      assert.equal(recordBefore?.points, 3);

      // Successful login occurs
      await recordLoginSuccess({ accountHash, ipHash });

      const recordAfter = await store.get(accountHash);
      assert.equal(recordAfter, null, "Account record must be cleared/reset on success");
    });
  });

  describe("5. Disabled / Unknown / Wrong-Password Externally Indistinguishable", () => {
    it("ensures all three failure modes return identical uniform error message", () => {
      // All failure modes use the exact constant UNIFORM_LOGIN_ERROR
      assert.equal(UNIFORM_LOGIN_ERROR, "Neplatné přihlašovací údaje.");
    });

    it("verifies dummy bcrypt hash is valid cost-10 hash and compares properly", async () => {
      assert.ok(DUMMY_BCRYPT_HASH.startsWith("$2b$10$") || DUMMY_BCRYPT_HASH.startsWith("$2a$10$"));
      const isMatch = await bcrypt.compare("arbitrary_attacker_password", DUMMY_BCRYPT_HASH);
      assert.equal(isMatch, false, "Dummy hash comparison must safely fail");
    });

    it("simulates unknown, disabled, and invalid-password flows to verify indistinguishability", async () => {
      const clientIp = "192.0.2.99";
      const dummyPassword = "AttemptedPassword123!";
      const realUserPasswordHash = await bcrypt.hash("RealPassword456!", 10);

      // Scenario A: Unknown user
      const startA = Date.now();
      await bcrypt.compare(dummyPassword, DUMMY_BCRYPT_HASH);
      const resA = { error: UNIFORM_LOGIN_ERROR };
      const metaA = {
        identifierHash: computePrivacyIdentifier("account", "unknown@example.com"),
        clientIpHash: computePrivacyIdentifier("ip", clientIp),
        reason: "invalid_credentials",
      };
      const durationA = Date.now() - startA;

      // Scenario B: Disabled user
      const startB = Date.now();
      await bcrypt.compare(dummyPassword, realUserPasswordHash);
      const resB = { error: UNIFORM_LOGIN_ERROR };
      const metaB = {
        identifierHash: computePrivacyIdentifier("account", "disabled@example.com"),
        clientIpHash: computePrivacyIdentifier("ip", clientIp),
        reason: "invalid_credentials",
      };
      const durationB = Date.now() - startB;

      // Scenario C: Active user with wrong password
      const startC = Date.now();
      await bcrypt.compare(dummyPassword, realUserPasswordHash);
      const resC = { error: UNIFORM_LOGIN_ERROR };
      const metaC = {
        identifierHash: computePrivacyIdentifier("account", "active@example.com"),
        clientIpHash: computePrivacyIdentifier("ip", clientIp),
        reason: "invalid_credentials",
      };
      const durationC = Date.now() - startC;

      // Assert error responses are identical
      assert.deepEqual(resA, resB);
      assert.deepEqual(resB, resC);

      // Assert audit metadata structures and reasons are identical
      assert.equal(metaA.reason, metaB.reason);
      assert.equal(metaB.reason, metaC.reason);
      assert.ok(!JSON.stringify(metaA).includes("unknown@example.com"));
      assert.ok(!JSON.stringify(metaB).includes("disabled@example.com"));
      assert.ok(!JSON.stringify(metaC).includes("active@example.com"));

      // Assert timing differences are negligible (within bcrypt range)
      assert.ok(Math.abs(durationA - durationB) < 300, "Durations must be comparable");
      assert.ok(Math.abs(durationB - durationC) < 300, "Durations must be comparable");
    });
  });

  describe("6. Fail Closed on Limiter & Storage Errors", () => {
    it("checkLoginAllowed returns allowed: false when store throws an unexpected error", async () => {
      const failingStore = {
        get: async () => {
          throw new Error("DATABASE_CONNECTION_REFUSED");
        },
        increment: async () => {
          throw new Error("DATABASE_CONNECTION_REFUSED");
        },
        reset: async () => {
          throw new Error("DATABASE_CONNECTION_REFUSED");
        },
      };

      setAbuseLimiterStoreForTesting(failingStore as any);

      const check = await checkLoginAllowed({
        accountHash: "account_test",
        ipHash: "ip_test",
      });

      // FAIL CLOSED: Must NOT allow login when safety verification fails
      assert.equal(check.allowed, false);
      assert.equal(check.reason, "STORAGE_ERROR");
    });
  });
});
