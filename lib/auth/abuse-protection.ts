import crypto from "crypto";
import { prisma } from "@/lib/db";
import { isDatabaseConfigured } from "@/lib/runtime/database";

// ============================================================
// CONSTANTS & POLICIES
// ============================================================

export const LOGIN_MAX_FAILED_ATTEMPTS = 5; // Account lockout threshold
export const LOGIN_MAX_IP_ATTEMPTS = 20; // IP lockout threshold
export const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15-minute sliding attempt window
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15-minute lockout duration

export const MFA_MAX_FAILED_ATTEMPTS = 5;
export const MFA_WINDOW_MS = 15 * 60 * 1000;
export const MFA_LOCKOUT_MS = 15 * 60 * 1000;

// Uniform external messages (Prevent Account Enumeration)
export const UNIFORM_LOGIN_ERROR = "Neplatné přihlašovací údaje.";
export const RATE_LIMIT_ERROR = "Příliš mnoho neúspěšných pokusů o přihlášení. Zkuste to prosím později.";
export const STORAGE_ERROR_LOGIN_MESSAGE = "Přihlášení je dočasně nedostupné. Zkuste to prosím později.";

// Precomputed cost-10 bcrypt hash for timing attack mitigation when account does not exist
export const DUMMY_BCRYPT_HASH = "$2b$10$DNGh0joNxKEGMo/.A9fJe.zSOscdCJoJGoQLCyUfX6okNN6CPiYVm";

// ============================================================
// PRIVACY-PRESERVING IDENTIFIERS & METADATA SANITIZATION
// ============================================================

/**
 * Derives a deterministic, privacy-preserving identifier for abuse tracking.
 * Normalizes input and hashes with HMAC/SHA-256 using a server-side pepper
 * so raw email and IP addresses are never exposed or stored.
 */
export function computePrivacyIdentifier(
  type: "account" | "ip",
  rawValue: string,
  pepper?: string
): string {
  if (!rawValue || typeof rawValue !== "string") {
    return `${type}_anonymous`;
  }

  let normalized = rawValue.trim();
  if (type === "account") {
    normalized = normalized.toLowerCase();
  } else if (type === "ip") {
    // If comma-separated (e.g. x-forwarded-for), take client IP (first entry)
    if (normalized.includes(",")) {
      normalized = normalized.split(",")[0].trim();
    }
    // Strip surrounding brackets for IPv6
    if (normalized.startsWith("[") && normalized.endsWith("]")) {
      normalized = normalized.slice(1, -1);
    }
    normalized = normalized.toLowerCase();
  }

  const salt = pepper || process.env.AUTH_ABUSE_PEPPER || "synthesis_auth_abuse_salt_v1";
  const hmac = crypto.createHmac("sha256", salt).update(`${type}:${normalized}`).digest("hex");
  return `${type}_${hmac.slice(0, 32)}`;
}

// Regexes to detect accidental raw PII or credentials
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const IPV4_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
const IPV6_REGEX = /(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}/;
const FORBIDDEN_KEYS = new Set([
  "email",
  "ip",
  "clientip",
  "userip",
  "password",
  "pwd",
  "pass",
  "passwordhash",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "jwt",
  "credentials",
  "cookie",
  "authorization",
  "apikey",
]);

/**
 * Asserts that metadata intended for abuse tracking / audit logging contains NO raw email, IP, or secrets.
 * Throws if raw PII or secrets are detected.
 */
export function assertNoRawSecretsOrPii(metadata: Record<string, unknown>): void {
  function checkValue(val: unknown, keyName: string): void {
    if (val === null || val === undefined) return;

    if (FORBIDDEN_KEYS.has(keyName.toLowerCase())) {
      throw new Error(`PRIVACY_VIOLATION: Forbidden sensitive key "${keyName}" detected in abuse metadata`);
    }

    if (typeof val === "string") {
      if (EMAIL_REGEX.test(val)) {
        throw new Error(`PRIVACY_VIOLATION: Raw email detected in metadata key "${keyName}"`);
      }
      if (IPV4_REGEX.test(val) && !val.includes("[REDACTED]")) {
        throw new Error(`PRIVACY_VIOLATION: Raw IPv4 detected in metadata key "${keyName}"`);
      }
      if (IPV6_REGEX.test(val) && !val.includes("[REDACTED]")) {
        throw new Error(`PRIVACY_VIOLATION: Raw IPv6 detected in metadata key "${keyName}"`);
      }
      if (val.startsWith("Bearer ") || val.startsWith("ghp_") || val.startsWith("sk_")) {
        throw new Error(`PRIVACY_VIOLATION: Secret token detected in metadata key "${keyName}"`);
      }
    } else if (Array.isArray(val)) {
      for (const item of val) {
        checkValue(item, keyName);
      }
    } else if (typeof val === "object") {
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        checkValue(v, k);
      }
    }
  }

  for (const [k, v] of Object.entries(metadata)) {
    checkValue(v, k);
  }
}

/**
 * Sanitizes abuse metadata by stripping sensitive keys and verifying absence of PII.
 */
export function sanitizeAbuseMetadata(raw: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(raw)) {
    const lk = k.toLowerCase();
    if (FORBIDDEN_KEYS.has(lk)) {
      continue; // Strip forbidden keys
    }
    if (typeof v === "string") {
      if (EMAIL_REGEX.test(v) || IPV4_REGEX.test(v) || IPV6_REGEX.test(v)) {
        continue; // Drop strings containing raw email or IP
      }
      result[k] = v;
    } else if (typeof v === "number" || typeof v === "boolean") {
      result[k] = v;
    }
  }

  assertNoRawSecretsOrPii(result);
  return result;
}

// ============================================================
// STORAGE ABSTRACTIONS
// ============================================================

export interface AbuseLimiterRecord {
  key: string;
  points: number;
  blockedUntil: Date | null;
  lastFailedAt: Date;
}

export interface AbuseLimiterStore {
  get(key: string): Promise<AbuseLimiterRecord | null>;
  increment(
    key: string,
    windowMs: number,
    maxPoints: number,
    lockoutMs: number,
    now?: Date
  ): Promise<{ points: number; blockedUntil: Date | null }>;
  reset(key: string): Promise<void>;
  clearAll?(): Promise<void>;
}

/**
 * In-memory store for unit tests and local non-database testing.
 */
export class MemoryAbuseLimiterStore implements AbuseLimiterStore {
  private records = new Map<string, AbuseLimiterRecord>();

  async get(key: string): Promise<AbuseLimiterRecord | null> {
    const r = this.records.get(key);
    if (!r) return null;
    return { ...r };
  }

  async increment(
    key: string,
    windowMs: number,
    maxPoints: number,
    lockoutMs: number,
    nowDate: Date = new Date()
  ): Promise<{ points: number; blockedUntil: Date | null }> {
    const existing = this.records.get(key);
    const now = nowDate.getTime();

    if (!existing) {
      const record: AbuseLimiterRecord = {
        key,
        points: 1,
        blockedUntil: 1 >= maxPoints ? new Date(now + lockoutMs) : null,
        lastFailedAt: nowDate,
      };
      this.records.set(key, record);
      return { points: record.points, blockedUntil: record.blockedUntil };
    }

    // Check if the previous attempt window has expired and no active block
    const isWindowExpired = existing.lastFailedAt.getTime() < now - windowMs;
    const isBlockExpired = !existing.blockedUntil || existing.blockedUntil.getTime() <= now;

    let newPoints = existing.points + 1;
    if (isWindowExpired && isBlockExpired) {
      newPoints = 1;
    }

    let blockedUntil = existing.blockedUntil;
    if (newPoints >= maxPoints) {
      blockedUntil = new Date(now + lockoutMs);
    }

    const updated: AbuseLimiterRecord = {
      key,
      points: newPoints,
      blockedUntil,
      lastFailedAt: nowDate,
    };
    this.records.set(key, updated);
    return { points: updated.points, blockedUntil: updated.blockedUntil };
  }

  async reset(key: string): Promise<void> {
    this.records.delete(key);
  }

  async clearAll(): Promise<void> {
    this.records.clear();
  }
}

/**
 * PostgreSQL / Prisma persistent store.
 */
export class PrismaAbuseLimiterStore implements AbuseLimiterStore {
  async get(key: string): Promise<AbuseLimiterRecord | null> {
    const record = await prisma.authRateLimit.findUnique({
      where: { key },
    });
    if (!record) return null;
    return {
      key: record.key,
      points: record.points,
      blockedUntil: record.blockedUntil,
      lastFailedAt: record.lastFailedAt,
    };
  }

  async increment(
    key: string,
    windowMs: number,
    maxPoints: number,
    lockoutMs: number,
    nowDate: Date = new Date()
  ): Promise<{ points: number; blockedUntil: Date | null }> {
    const now = nowDate.getTime();

    return await prisma.$transaction(async (tx) => {
      const existing = await tx.authRateLimit.findUnique({
        where: { key },
      });

      if (!existing) {
        const blockedUntil = 1 >= maxPoints ? new Date(now + lockoutMs) : null;
        const created = await tx.authRateLimit.create({
          data: {
            key,
            points: 1,
            blockedUntil,
            lastFailedAt: nowDate,
          },
        });
        return { points: created.points, blockedUntil: created.blockedUntil };
      }

      const isWindowExpired = existing.lastFailedAt.getTime() < now - windowMs;
      const isBlockExpired = !existing.blockedUntil || existing.blockedUntil.getTime() <= now;

      let newPoints = existing.points + 1;
      if (isWindowExpired && isBlockExpired) {
        newPoints = 1;
      }

      let blockedUntil = existing.blockedUntil;
      if (newPoints >= maxPoints) {
        blockedUntil = new Date(now + lockoutMs);
      }

      const updated = await tx.authRateLimit.update({
        where: { key },
        data: {
          points: newPoints,
          blockedUntil,
          lastFailedAt: nowDate,
        },
      });

      return { points: updated.points, blockedUntil: updated.blockedUntil };
    });
  }

  async reset(key: string): Promise<void> {
    try {
      await prisma.authRateLimit.deleteMany({
        where: { key },
      });
    } catch {
      // Ignore if record already absent
    }
  }

  async clearAll(): Promise<void> {
    await prisma.authRateLimit.deleteMany();
  }
}

// Active store singleton with test override
let activeStore: AbuseLimiterStore | null = null;

export function setAbuseLimiterStoreForTesting(store: AbuseLimiterStore | null): void {
  activeStore = store;
}

export function getAbuseLimiterStore(): AbuseLimiterStore {
  if (activeStore) {
    return activeStore;
  }
  if (isDatabaseConfigured()) {
    return new PrismaAbuseLimiterStore();
  }
  return new MemoryAbuseLimiterStore();
}

/**
 * Checks whether an MFA attempt is allowed. Fail-closed.
 */
export async function checkMfaAllowed(params: {
  accountHash: string;
  now?: Date;
}): Promise<boolean> {
  const store = getAbuseLimiterStore();
  const now = params.now || new Date();
  const nowMs = now.getTime();
  const key = `mfa_${params.accountHash}`;

  try {
    const record = await store.get(key);
    if (record?.blockedUntil && record.blockedUntil.getTime() > nowMs) {
      return false;
    }
    return true;
  } catch (error) {
    console.error("[MfaAbuse] Storage error during checkMfaAllowed (failing closed):", error);
    return false;
  }
}

/**
 * Records an MFA failure.
 */
export async function recordMfaFailure(params: {
  accountHash: string;
  now?: Date;
}): Promise<void> {
  const store = getAbuseLimiterStore();
  const now = params.now || new Date();
  const key = `mfa_${params.accountHash}`;

  try {
    await store.increment(
      key,
      MFA_WINDOW_MS,
      MFA_MAX_FAILED_ATTEMPTS,
      MFA_LOCKOUT_MS,
      now
    );
  } catch (error) {
    console.error("[MfaAbuse] Storage error during recordMfaFailure:", error);
    throw error;
  }
}

/**
 * Clears the MFA limiter and normal login counter upon success.
 */
export async function recordMfaSuccess(params: {
  accountHash: string;
}): Promise<void> {
  const store = getAbuseLimiterStore();
  const loginKey = params.accountHash;
  const mfaKey = `mfa_${params.accountHash}`;

  try {
    await Promise.all([
      store.reset(mfaKey),
      store.reset(loginKey),
    ]);
  } catch (error) {
    console.warn("[MfaAbuse] Non-fatal error resetting limiters on MFA success:", error);
  }
}

// ============================================================
// RATE LIMITING & ABUSE CHECKS
// ============================================================

export interface CheckLoginAllowedParams {
  accountHash: string;
  ipHash: string;
  now?: Date;
}

export interface CheckLoginAllowedResult {
  allowed: boolean;
  reason?: "ACCOUNT_BLOCKED" | "IP_BLOCKED" | "STORAGE_ERROR";
  retryAfterMs?: number;
}

/**
 * Checks whether a login attempt is allowed for the given account and IP privacy hashes.
 * Enforces Fail-Closed: any storage error or unexpected exception blocks the attempt.
 */
export async function checkLoginAllowed(
  params: CheckLoginAllowedParams
): Promise<CheckLoginAllowedResult> {
  const store = getAbuseLimiterStore();
  const now = params.now || new Date();
  const nowMs = now.getTime();

  try {
    const [accountRecord, ipRecord] = await Promise.all([
      store.get(params.accountHash),
      store.get(params.ipHash),
    ]);

    // Check account block
    if (accountRecord?.blockedUntil && accountRecord.blockedUntil.getTime() > nowMs) {
      const retryAfterMs = Math.max(0, accountRecord.blockedUntil.getTime() - nowMs);
      return {
        allowed: false,
        reason: "ACCOUNT_BLOCKED",
        retryAfterMs,
      };
    }

    // Check IP block
    if (ipRecord?.blockedUntil && ipRecord.blockedUntil.getTime() > nowMs) {
      const retryAfterMs = Math.max(0, ipRecord.blockedUntil.getTime() - nowMs);
      return {
        allowed: false,
        reason: "IP_BLOCKED",
        retryAfterMs,
      };
    }

    return { allowed: true };
  } catch (error) {
    // FAIL CLOSED: If storage fails or is unreachable, reject the login
    console.error("[LoginAbuse] Storage error during checkLoginAllowed (failing closed):", error);
    return {
      allowed: false,
      reason: "STORAGE_ERROR",
    };
  }
}

export interface RecordLoginFailureParams {
  accountHash: string;
  ipHash: string;
  now?: Date;
}

/**
 * Records a failed login attempt for both account and IP privacy identifiers.
 * Enforces sliding window increments and applies lockout threshold if reached.
 */
export async function recordLoginFailure(
  params: RecordLoginFailureParams
): Promise<{ accountBlocked: boolean; ipBlocked: boolean }> {
  const store = getAbuseLimiterStore();
  const now = params.now || new Date();

  try {
    const [accountRes, ipRes] = await Promise.all([
      store.increment(
        params.accountHash,
        LOGIN_WINDOW_MS,
        LOGIN_MAX_FAILED_ATTEMPTS,
        LOGIN_LOCKOUT_MS,
        now
      ),
      store.increment(
        params.ipHash,
        LOGIN_WINDOW_MS,
        LOGIN_MAX_IP_ATTEMPTS,
        LOGIN_LOCKOUT_MS,
        now
      ),
    ]);

    return {
      accountBlocked: !!accountRes.blockedUntil && accountRes.blockedUntil.getTime() > now.getTime(),
      ipBlocked: !!ipRes.blockedUntil && ipRes.blockedUntil.getTime() > now.getTime(),
    };
  } catch (error) {
    // Log failure in recording attempt; do not swallow silently
    console.error("[LoginAbuse] Storage error during recordLoginFailure:", error);
    throw error;
  }
}

/**
 * Resets failed login attempt counters upon a successful authentication.
 */
export async function recordLoginSuccess(params: {
  accountHash: string;
  ipHash: string;
}): Promise<void> {
  const store = getAbuseLimiterStore();
  try {
    // Reset account counter so legitimate user is not penalized
    await store.reset(params.accountHash);
  } catch (error) {
    console.warn("[LoginAbuse] Non-fatal error resetting account counter on success:", error);
  }
}
