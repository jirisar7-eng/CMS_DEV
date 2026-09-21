import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { logAudit } from "@/lib/auth/audit";
import {
  sanitizeAuditMetadata,
  redactSensitiveData,
  isSensitiveKey,
  redactSensitiveString,
} from "@/lib/domain/audit/service";

// Mock Prisma for testing logAudit
let createdAuditLog: any = null;

const mockPrisma = {
  auditLog: {
    create: async (args: any) => {
      createdAuditLog = args.data;
      return { id: "mock-audit-id", ...args.data };
    },
  },
};

describe("SYN-AUDIT-002: Audit Write-Path Metadata Policy", () => {
  beforeEach(() => {
    createdAuditLog = null;
  });

  describe("Unit tests: isSensitiveKey and redactSensitiveString", () => {
    it("correctly identifies sensitive keys and safe exempt keys", () => {
      assert.equal(isSensitiveKey("password"), true);
      assert.equal(isSensitiveKey("passwordHash"), true);
      assert.equal(isSensitiveKey("pwd"), true);
      assert.equal(isSensitiveKey("access_token"), true);
      assert.equal(isSensitiveKey("refreshToken"), true);
      assert.equal(isSensitiveKey("jwt"), true);
      assert.equal(isSensitiveKey("secret"), true);
      assert.equal(isSensitiveKey("nestedSecret"), true);
      assert.equal(isSensitiveKey("credentials"), true);
      assert.equal(isSensitiveKey("cookie"), true);
      assert.equal(isSensitiveKey("authorization"), true);
      assert.equal(isSensitiveKey("apiKey"), true);
      assert.equal(isSensitiveKey("privateKey"), true);

      // Safe keys
      assert.equal(isSensitiveKey("author"), false);
      assert.equal(isSensitiveKey("authorId"), false);
      assert.equal(isSensitiveKey("updatedKeys"), false);
      assert.equal(isSensitiveKey("key"), false);
      assert.equal(isSensitiveKey("pageTitle"), false);
      assert.equal(isSensitiveKey("email"), false);
      assert.equal(isSensitiveKey("ip"), false);
      assert.equal(isSensitiveKey("userAgent"), false);
    });

    it("redacts sensitive value strings", () => {
      assert.equal(redactSensitiveString("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."), "[REDACTED]");
      assert.equal(redactSensitiveString("ghp_12345678901234567890"), "[REDACTED]");
      assert.equal(redactSensitiveString("sk_live_12345678901234567890"), "[REDACTED]");
      assert.equal(redactSensitiveString("Standard non-secret string"), "Standard non-secret string");
    });
  });

  describe("Recursive metadata redaction", () => {
    it("recursively redacts nested secret objects and array elements", () => {
      const input = {
        pageTitle: "Homepage",
        user: {
          id: "usr-1",
          email: "user@example.com",
          credentials: {
            password: "super_secret_password",
            token: "secret_token_123",
          },
        },
        items: [
          { id: "item-1", safeVal: "ok" },
          { id: "item-2", secretKey: "hidden_token" },
        ],
        customHeader: "Bearer eyJhbGciOi...",
      };

      const cleaned = redactSensitiveData(input) as any;
      assert.equal(cleaned.pageTitle, "Homepage");
      assert.equal(cleaned.user.id, "usr-1");
      assert.equal(cleaned.user.email, "user@example.com");
      assert.equal(cleaned.user.credentials, undefined);
      assert.equal(cleaned.items.length, 2);
      assert.equal(cleaned.items[0].safeVal, "ok");
      assert.equal(cleaned.items[1].secretKey, undefined);
      assert.equal(cleaned.customHeader, "[REDACTED]");
    });
  });

  describe("sanitizeAuditMetadata shared policy", () => {
    it("write mode sanitizes registered events with schema allowlist and secret redaction", () => {
      const raw = {
        email: "admin@example.com",
        ip: "192.168.1.1",
        userAgent: "Mozilla/5.0",
        password: "plaintext_password",
        secret: "sensitive_token",
        nested: { token: "abc" },
      };

      const result = sanitizeAuditMetadata(raw, "AUTH_LOGIN_SUCCESS", { mode: "write" });
      assert.deepEqual(result, {
        email: "admin@example.com",
        ip: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      });
      assert.equal((result as any).password, undefined);
      assert.equal((result as any).secret, undefined);
      assert.equal((result as any).nested, undefined);
    });

    it("write mode recursively redacts secrets for unregistered event actions", () => {
      const raw = {
        customActionName: "ExportPDF",
        user: {
          id: "u123",
          passwordHash: "hash_xyz",
        },
        customHeader: "Bearer eyJhbGciOi...",
        safeCount: 10,
      };

      const result = sanitizeAuditMetadata(raw, "CUSTOM_UNTRACKED_ACTION", { mode: "write" });
      assert.deepEqual(result, {
        customActionName: "ExportPDF",
        user: {
          id: "u123",
        },
        customHeader: "[REDACTED]",
        safeCount: 10,
      });
      assert.equal((result as any).user.passwordHash, undefined);
    });

    it("read mode projects unregistered event actions to null as defense-in-depth", () => {
      const raw = {
        customActionName: "ExportPDF",
        safeCount: 10,
      };

      const result = sanitizeAuditMetadata(raw, "CUSTOM_UNTRACKED_ACTION", { mode: "read" });
      assert.equal(result, null);
    });
  });

  describe("logAudit write path integration", () => {
    it("sanitizes metadata before storing in DB on logAudit", async () => {
      await logAudit({
        action: "AUTH_LOGIN_SUCCESS",
        scopeType: "SYSTEM",
        actorId: "usr-admin-1",
        metadata: {
          email: "admin@example.com",
          ip: "10.0.0.1",
          password: "plain_password_must_be_stripped",
          token: "jwt_token_must_be_stripped",
          nestedSecret: { key: "secret_value" },
        },
        tx: mockPrisma as any,
      });

      assert.ok(createdAuditLog, "Audit log must be created");
      assert.equal(createdAuditLog.action, "AUTH_LOGIN_SUCCESS");
      assert.equal(createdAuditLog.scopeType, "SYSTEM");
      assert.equal(createdAuditLog.actorId, "usr-admin-1");
      assert.deepEqual(createdAuditLog.metadata, {
        email: "admin@example.com",
        ip: "10.0.0.1",
      });
      assert.equal(createdAuditLog.metadata.password, undefined);
      assert.equal(createdAuditLog.metadata.token, undefined);
      assert.equal(createdAuditLog.metadata.nestedSecret, undefined);
    });

    it("sanitizes metadata before storing in DB for unregistered actions on logAudit", async () => {
      await logAudit({
        action: "NAVIGATION_SET_CREATED" as any,
        scopeType: "PROJECT",
        scopeId: "proj-1",
        actorId: "usr-admin-1",
        metadata: {
          setId: "nav-1",
          key: "main-nav",
          password: "should_not_be_stored",
          auth: { secretToken: "abc" },
        },
        tx: mockPrisma as any,
      });

      assert.ok(createdAuditLog);
      assert.equal(createdAuditLog.action, "NAVIGATION_SET_CREATED");
      assert.equal(createdAuditLog.scopeId, "proj-1");
      assert.deepEqual(createdAuditLog.metadata, {
        setId: "nav-1",
        key: "main-nav",
      });
    });
  });
});
