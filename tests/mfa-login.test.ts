import assert from "node:assert/strict";
import { afterEach, beforeEach, test, mock } from "node:test";
import { createRequire } from "node:module";
import * as OTPAuth from "otpauth";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/security/encryption";
import { MFA_LOGIN_ERROR, verifyMfaLogin } from "@/lib/auth/mfa-login";
import { verifyMfaAction } from "@/app/(auth)/admin/login/mfa/actions";
import { middleware } from "../middleware";
import { NextRequest } from "next/server";
import {
  MemoryAbuseLimiterStore, setAbuseLimiterStoreForTesting, computePrivacyIdentifier,
  recordMfaFailure,
} from "@/lib/auth/abuse-protection";
import { hashRecoveryCode } from "@/lib/auth/mfa";

const require = createRequire(import.meta.url);
const headersApi = require("next/headers");
const token = "a".repeat(64);
const secret = "JBSWY3DPEHPK3PXP";
const now = new Date("2026-09-22T12:00:00Z");
const accountHash = computePrivacyIdentifier("account", "mfa@example.test");
let store: MemoryAbuseLimiterStore;
let used: boolean;
let attempts: number;
let attemptWrites: number;
let status: string;
let mfaStatus: string;
let valid: boolean;
let known: boolean;
let present: boolean;
let encrypted: string;
let sessionCount: number;
let auditActions: string[];
let cookieWrites: string[];
let recoveryCodes: { id: string; codeHash: string }[];
let sessionFailure: boolean;
let recoveryUses: number;
const restores: (() => void)[] = [];
function stub(target: object, key: string, implementation: unknown) {
  const original = Reflect.get(target, key);
  Reflect.set(target, key, implementation);
  restores.push(() => { Reflect.set(target, key, original); });
}
const previousDatabase = process.env.DATABASE_URL;
const previousKey = process.env.MFA_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.DATABASE_URL = "postgresql://unused:unused@localhost/unused";
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  mock.timers.enable({ apis: ["Date"], now });
  used = false; attempts = 0; attemptWrites = 0; status = "ACTIVE"; mfaStatus = "ENABLED";
  valid = true; known = true; present = true; sessionCount = 0;
  recoveryCodes = []; recoveryUses = 0; auditActions = []; cookieWrites = []; sessionFailure = false;
  encrypted = encryptSecret(secret);
  store = new MemoryAbuseLimiterStore();
  setAbuseLimiterStoreForTesting(store);
  stub(prisma, "$transaction", async (fn: (tx: typeof prisma) => unknown) => { const before = { used, auditLength: auditActions.length, sessionCount, recoveryUses, limiter: new Map((store as unknown as { records: Map<string, unknown> }).records) }; try { return await fn(prisma); } catch (error) { used = before.used; auditActions.length = before.auditLength; sessionCount = before.sessionCount; recoveryUses = before.recoveryUses; (store as unknown as { records: Map<string, unknown> }).records = before.limiter; throw error; } });
  stub(prisma, "$queryRaw", async () => []);
  stub(prisma.mfaChallenge, "findUnique", async () => known ? { userId: "user-1" } : null);
  stub(prisma.mfaChallenge, "findFirst", async () => valid && !used && attempts < 5 ? { userId: "user-1" } : null);
  stub(prisma.mfaChallenge, "updateMany", async ({ data }: { data: { usedAt?: Date; attempts?: unknown } }) => {
    attemptWrites++;
    if (!known || !valid || used || attempts >= 5) return { count: 0 };
    if (data.usedAt) used = true;
    else attempts++;
    return { count: 1 };
  });
  stub(prisma.user, "findUnique", async () => present ? { id: "user-1", email: "mfa@example.test", status } : null);
  stub(prisma.userMfa, "findUnique", async () => ({ id: "mfa-1", status: mfaStatus, totpSecretEncrypted: encrypted }));
  stub(prisma.mfaRecoveryCode, "findMany", async () => recoveryCodes);
  stub(prisma.mfaRecoveryCode, "updateMany", async () => { recoveryUses++; return { count: 1 }; });
  stub(prisma.auditLog, "create", async ({ data }: { data: { action: string } }) => { auditActions.push(data.action); return {}; });
  stub(prisma.session, "create", async () => {
    if (sessionFailure) throw new Error("session unavailable");
    assert.equal(used, true, "Session must follow challenge consumption");
    sessionCount++;
    return {};
  });
  stub(headersApi, "cookies", async () => ({
    get: () => ({ value: token }),
    set: (name: string) => cookieWrites.push(name),
  }));
});

afterEach(() => {
  for (const restore of restores.splice(0).reverse()) restore();
  mock.restoreAll(); mock.timers.reset(); setAbuseLimiterStoreForTesting(null);
  if (previousDatabase === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabase;
  if (previousKey === undefined) delete process.env.MFA_ENCRYPTION_KEY;
  else process.env.MFA_ENCRYPTION_KEY = previousKey;
});

function totp() {
  return new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 }).generate({ timestamp: now.getTime() });
}
function form(code: string) { const data = new FormData(); data.set("code", code); return data; }

for (const scenario of ["invalid code", "empty code", "disabled user", "missing user", "pending MFA", "expired challenge", "used challenge", "exhausted challenge", "unknown challenge", "corrupt secret"]) {
  test(`MFA rejects ${scenario} without creating a session`, async () => {
    let code = totp();
    if (scenario === "invalid code") code = "invalid";
    if (scenario === "empty code") code = "";
    if (scenario === "disabled user") status = "DISABLED";
    if (scenario === "missing user") present = false;
    if (scenario === "pending MFA") mfaStatus = "PENDING";
    if (scenario === "expired challenge") valid = false;
    if (scenario === "used challenge") used = true;
    if (scenario === "exhausted challenge") attempts = 5;
    if (scenario === "unknown challenge") known = false;
    if (scenario === "corrupt secret") encrypted = "corrupt";
    assert.deepEqual(await verifyMfaAction({ error: null }, form(code)), { error: MFA_LOGIN_ERROR });
    assert.equal(sessionCount, 0);
    assert.deepEqual(cookieWrites, []);
    const key = known && present ? accountHash : "account_anonymous";
    assert.equal((await store.get(`mfa_${key}`))?.points, 1);
    assert.equal(attemptWrites, 1);
    assert.deepEqual(auditActions, []);
  });
}

for (const badToken of [null, "", "invalid", "a".repeat(10000)]) {
  test(`MFA rejects missing/malformed cookie (${badToken?.length ?? "null"})`, async () => {
    known = false;
    assert.equal(await verifyMfaLogin(badToken, totp()), null);
    assert.equal((await store.get("mfa_account_anonymous"))?.points, 1);
    assert.equal(attemptWrites, 1);
  });
}

test("MFA success consumes once, resets counters, clears cookie, audits and creates one session", async () => {
  await recordMfaFailure({ accountHash });
  await assert.rejects(verifyMfaAction({ error: null }, form(totp())), /NEXT_REDIRECT/);
  assert.equal(sessionCount, 1);
  assert.equal(await store.get(`mfa_${accountHash}`), null);
  assert.deepEqual(cookieWrites, ["syn_admin_mfa_challenge", "syn_admin_session"]);
  assert.deepEqual(auditActions, ["AUTH_LOGIN_SUCCESS"]);
  assert.deepEqual(await verifyMfaAction({ error: null }, form(totp())), { error: MFA_LOGIN_ERROR });
  assert.equal(sessionCount, 1);
});

test("Account lockout blocks even a correct code on a fresh challenge", async () => {
  for (let i = 0; i < 5; i++) await recordMfaFailure({ accountHash });
  assert.equal(await verifyMfaLogin(token, totp()), null);
  assert.equal(used, false);
  assert.equal(attempts, 1);
  assert.equal((await store.get(`mfa_${accountHash}`))?.points, 6);
});

test("Recovery login consumes a code and writes recovery evidence", async () => {
  const code = "ABCDE-12345-ABCDE-12345";
  recoveryCodes = [{ id: "recovery-1", codeHash: await hashRecoveryCode(code) }];
  assert.equal(await verifyMfaLogin(token, code.toLowerCase()), "user-1");
  assert.equal(recoveryUses, 1);
  assert.deepEqual(auditActions, ["AUTH_MFA_RECOVERY_USED"]);
});

test("Unknown recovery code records both failures and never consumes challenge", async () => {
  recoveryCodes = [{ id: "recovery-1", codeHash: await hashRecoveryCode("ABCDE-12345-ABCDE-12345") }];
  assert.equal(await verifyMfaLogin(token, "FFFFF-FFFFF-FFFFF-FFFFF"), null);
  assert.equal(used, false); assert.equal(recoveryUses, 0); assert.equal(attempts, 1);
  assert.equal((await store.get(`mfa_${accountHash}`))?.points, 1);
});

test("Limiter failure remains closed and still attempts challenge accounting", async () => {
  stub(store, "get", async () => { throw new Error("store unavailable"); });
  stub(store, "increment", async () => { throw new Error("store unavailable"); });
  assert.equal(await verifyMfaLogin(token, totp()), null);
  assert.equal(attempts, 1); assert.equal(used, false);
});

test("MFA route is reachable without a session and adjacent admin paths remain protected", () => {
  assert.equal(middleware(new NextRequest("https://example.test/admin/login/mfa")).status, 200);
  assert.equal(middleware(new NextRequest("https://example.test/admin/login/mfa/other")).status, 307);
  assert.equal(middleware(new NextRequest("https://example.test/admin")).status, 307);
});


test("A lost challenge compare-and-set cannot issue a session", async () => {
  stub(prisma.mfaChallenge, "updateMany", async ({ data }: { data: { usedAt?: Date } }) => {
    if (!data.usedAt) attemptWrites++;
    return { count: 0 };
  });
  assert.deepEqual(await verifyMfaAction({ error: null }, form(totp())), { error: MFA_LOGIN_ERROR });
  assert.equal(sessionCount, 0);
  assert.equal(attemptWrites, 1);
  assert.equal((await store.get(`mfa_${accountHash}`))?.points, 1);
});

test("Database read failure attempts both failure writes and remains closed", async () => {
  stub(prisma.userMfa, "findUnique", async () => { throw new Error("database unavailable"); });
  assert.equal(await verifyMfaLogin(token, totp()), null);
  assert.equal(attemptWrites, 1);
  assert.equal((await store.get(`mfa_${accountHash}`))?.points, 1);
  assert.equal(sessionCount, 0);
});

test("Audit failure after MFA success cannot issue a session", async () => {
  stub(prisma.auditLog, "create", async () => { throw new Error("audit unavailable"); });
  assert.deepEqual(await verifyMfaAction({ error: null }, form(totp())), { error: MFA_LOGIN_ERROR });
  assert.equal(used, false);
  assert.equal(sessionCount, 0);
  assert.deepEqual(cookieWrites, []);
});


test("Session persistence failure rolls back completion and leaves challenge retryable", async () => {
  sessionFailure = true;
  assert.deepEqual(await verifyMfaAction({ error: null }, form(totp())), { error: MFA_LOGIN_ERROR });
  assert.equal(used, false);
  assert.equal(sessionCount, 0);
  assert.deepEqual(auditActions, []);
  assert.deepEqual(cookieWrites, []);
  sessionFailure = false;
  await assert.rejects(verifyMfaAction({ error: null }, form(totp())), /NEXT_REDIRECT/);
  assert.equal(used, true);
  assert.equal(sessionCount, 1);
  assert.deepEqual(auditActions, ["AUTH_LOGIN_SUCCESS"]);
});

test("Transactional limiter reset failure cannot complete MFA or issue a session", async () => {
  stub(store, "reset", async () => { throw new Error("reset unavailable"); });
  assert.deepEqual(await verifyMfaAction({ error: null }, form(totp())), { error: MFA_LOGIN_ERROR });
  assert.equal(sessionCount, 0);
  assert.deepEqual(cookieWrites, []);
  assert.deepEqual(auditActions, []);
  assert.equal((await store.get(`mfa_${accountHash}`))?.points, 1);
});
