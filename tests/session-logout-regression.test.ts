import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import {
  hashSessionToken,
  createSessionRecord,
  invalidateSessionByRawToken,
  normalizeSessionUserAgent,
  SESSION_USER_AGENT_MAX_LENGTH,
} from "@/lib/auth/session";

test("PostgreSQL Session Logout and User-Agent Regression Integration", async (t) => {
  // 1. Pure unit assertions that run regardless of DB availability
  await t.test("normalizeSessionUserAgent: bounds, trims, and strips control characters", () => {
    assert.strictEqual(normalizeSessionUserAgent(null), null);
    assert.strictEqual(normalizeSessionUserAgent(undefined), null);
    assert.strictEqual(normalizeSessionUserAgent(""), null);
    assert.strictEqual(normalizeSessionUserAgent("   "), null);

    const normal = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
    assert.strictEqual(normalizeSessionUserAgent(normal), normal);

    const withControl = "Mozilla/5.0\r\nEvil-Header: inject\x00Test";
    const sanitized = normalizeSessionUserAgent(withControl);
    assert.ok(sanitized);
    assert.ok(!sanitized.includes("\r"));
    assert.ok(!sanitized.includes("\n"));
    assert.ok(!sanitized.includes("\x00"));

    const longUa = "A".repeat(1000);
    const bounded = normalizeSessionUserAgent(longUa);
    assert.strictEqual(bounded?.length, SESSION_USER_AGENT_MAX_LENGTH);
    assert.strictEqual(bounded?.length, 512);
  });

  await t.test("Migration verification: additive, nullable and contains no destructive SQL", () => {
    const migrationPath = path.join(
      process.cwd(),
      "prisma/migrations/20260928100000_session_user_agent/migration.sql"
    );
    assert.ok(fs.existsSync(migrationPath), "Migration file must exist");
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.match(sql, /ALTER TABLE\s+"Session"\s+ADD COLUMN\s+"userAgent"\s+TEXT/i);
    assert.doesNotMatch(sql, /DROP/i, "Must not contain DROP");
    assert.doesNotMatch(sql, /DELETE/i, "Must not contain DELETE");
    assert.doesNotMatch(sql, /TRUNCATE/i, "Must not contain TRUNCATE");
    assert.doesNotMatch(sql, /UPDATE/i, "Must not contain UPDATE");
  });

  await t.test("Code wiring verification: logoutAction calls invalidateSessionByRawToken", () => {
    const actionsPath = path.join(process.cwd(), "app/(auth)/admin/login/actions.ts");
    const code = fs.readFileSync(actionsPath, "utf8");
    assert.ok(code.includes("invalidateSessionByRawToken(rawToken)"), "logoutAction must invoke invalidateSessionByRawToken");
  });

  await t.test("Code wiring verification: password login and MFA pass User-Agent", () => {
    const loginActionsPath = path.join(process.cwd(), "app/(auth)/admin/login/actions.ts");
    const loginCode = fs.readFileSync(loginActionsPath, "utf8");
    assert.ok(loginCode.includes('headerList.get("user-agent")'), "login action must read user-agent header");
    assert.ok(loginCode.includes("createSessionRecord(user.id, tx, userAgent)"), "login action must pass userAgent");

    const mfaActionsPath = path.join(process.cwd(), "app/(auth)/admin/login/mfa/actions.ts");
    const mfaCode = fs.readFileSync(mfaActionsPath, "utf8");
    assert.ok(mfaCode.includes('headerList.get("user-agent")'), "mfa action must read user-agent header");
    assert.ok(
      mfaCode.includes(
        'completeMfaLogin(await getMfaChallengeCookieToken(), formData.get("code"), userAgent)'
      ),
      "mfa action must pass userAgent"
    );
  });

  // 2. PostgreSQL persistence assertions
  if (!process.env.DATABASE_URL) {
    console.log("Skipping PostgreSQL DB persistence assertions (DATABASE_URL not set)");
    return;
  }

  const email = `session-logout-test-${Date.now()}@synthesis.local`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: "dummy-hash",
      status: "ACTIVE",
      displayName: "Session Logout Test User",
    },
  });

  t.after(async () => {
    await prisma.user.delete({ where: { id: user.id } });
  });

  await t.test("createSessionRecord persists tokenHash, never rawToken, and stores normalized userAgent", async () => {
    const rawUA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36";
    const pending = await createSessionRecord(user.id, prisma, rawUA);

    assert.ok(pending.sessionId);
    assert.ok(pending.rawToken);
    assert.notStrictEqual(pending.sessionId, pending.rawToken, "Session.id must not equal rawToken");

    const persisted = await prisma.session.findUnique({
      where: { id: pending.sessionId },
    });
    assert.ok(persisted);
    assert.strictEqual(persisted.tokenHash, hashSessionToken(pending.rawToken));
    assert.strictEqual(persisted.userAgent, rawUA);
    assert.strictEqual(persisted.userId, user.id);
  });

  await t.test("createSessionRecord supports null userAgent gracefully", async () => {
    const pending = await createSessionRecord(user.id, prisma, null);
    const persisted = await prisma.session.findUnique({
      where: { id: pending.sessionId },
    });
    assert.ok(persisted);
    assert.strictEqual(persisted.userAgent, null);
  });

  await t.test("invalidateSessionByRawToken removes persisted modern session by tokenHash without touching unrelated sessions", async () => {
    const s1 = await createSessionRecord(user.id, prisma, "Device 1");
    const s2 = await createSessionRecord(user.id, prisma, "Device 2");

    // Verify both exist
    const p1Before = await prisma.session.findUnique({ where: { id: s1.sessionId } });
    const p2Before = await prisma.session.findUnique({ where: { id: s2.sessionId } });
    assert.ok(p1Before);
    assert.ok(p2Before);

    // Invalidate s1 by raw token
    await invalidateSessionByRawToken(s1.rawToken);

    // s1 must be deleted from DB
    const p1After = await prisma.session.findUnique({ where: { id: s1.sessionId } });
    assert.strictEqual(p1After, null, "s1 must be deleted from database by tokenHash lookup");

    // s2 must remain untouched
    const p2After = await prisma.session.findUnique({ where: { id: s2.sessionId } });
    assert.ok(p2After, "s2 must remain intact in database");

    // Clean up s2
    await invalidateSessionByRawToken(s2.rawToken);
  });
});
