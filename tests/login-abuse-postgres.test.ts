import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import {
  computePrivacyIdentifier,
  PrismaAbuseLimiterStore,
  checkLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
  setAbuseLimiterStoreForTesting,
  LOGIN_MAX_FAILED_ATTEMPTS,
} from "@/lib/auth/abuse-protection";

describe("PostgreSQL Integration: Login Abuse Protection (AuthRateLimit)", () => {
  if (!process.env.DATABASE_URL) {
    it("skips PostgreSQL login abuse tests when DATABASE_URL is not set", () => {
      console.log("Skipping PostgreSQL login abuse tests (DATABASE_URL not set)");
      assert.ok(true);
    });
    return;
  }

  const testEmail = `abuse-pg-test-${Date.now()}@synthesis.local`;
  const testIp = "198.51.100.99";
  const accountHash = computePrivacyIdentifier("account", testEmail);
  const ipHash = computePrivacyIdentifier("ip", testIp);

  let store: PrismaAbuseLimiterStore;

  before(async () => {
    store = new PrismaAbuseLimiterStore();
    setAbuseLimiterStoreForTesting(store);

    // Clean up any existing records for test keys
    await prisma.authRateLimit.deleteMany({
      where: { key: { in: [accountHash, ipHash] } },
    });
  });

  after(async () => {
    // Clean up test keys
    try {
      await prisma.authRateLimit.deleteMany({
        where: { key: { in: [accountHash, ipHash] } },
      });
    } catch {
      // Ignore cleanup error
    }
    setAbuseLimiterStoreForTesting(null);
  });

  it("persists failed attempt increments in the PostgreSQL AuthRateLimit table", async () => {
    const res = await store.increment(accountHash, 15 * 60 * 1000, 5, 15 * 60 * 1000);
    assert.equal(res.points, 1);
    assert.equal(res.blockedUntil, null);

    const record = await prisma.authRateLimit.findUnique({
      where: { key: accountHash },
    });

    assert.ok(record, "AuthRateLimit record must exist in PostgreSQL");
    assert.equal(record.points, 1);
    assert.equal(record.blockedUntil, null);
  });

  it("sets blockedUntil in PostgreSQL when threshold is reached", async () => {
    // Record 4 more failures (total 5)
    for (let i = 2; i <= 5; i++) {
      await store.increment(accountHash, 15 * 60 * 1000, 5, 15 * 60 * 1000);
    }

    const record = await prisma.authRateLimit.findUnique({
      where: { key: accountHash },
    });

    assert.ok(record);
    assert.equal(record.points, 5);
    assert.ok(record.blockedUntil !== null, "blockedUntil must be set in database");
    assert.ok(record.blockedUntil!.getTime() > Date.now(), "blockedUntil must be in future");

    // checkLoginAllowed verifies the block directly
    const check = await checkLoginAllowed({ accountHash, ipHash });
    assert.equal(check.allowed, false);
    assert.equal(check.reason, "ACCOUNT_BLOCKED");
  });

  it("allows recovery when blockedUntil timestamp has passed", async () => {
    // Update blockedUntil to the past in PostgreSQL
    const past = new Date(Date.now() - 10000);
    await prisma.authRateLimit.update({
      where: { key: accountHash },
      data: { blockedUntil: past },
    });

    const check = await checkLoginAllowed({ accountHash, ipHash });
    assert.equal(check.allowed, true, "Must be allowed once blockedUntil is in the past");
  });

  it("resets and clears record upon successful authentication", async () => {
    await recordLoginSuccess({ accountHash, ipHash });

    const record = await prisma.authRateLimit.findUnique({
      where: { key: accountHash },
    });

    assert.equal(record, null, "Record must be deleted from PostgreSQL on success");
  });
});
