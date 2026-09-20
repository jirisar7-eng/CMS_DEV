// @ts-nocheck
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  AuditService,
  AuditServiceError,
  handleAuditApiError,
  mapAuditErrorToResponse,
  parseStrictPositiveInt,
  sanitizeAuditMetadata,
  validateAuditScopeType,
  validateDateRange,
} from "../lib/domain/audit";

describe("SYN-AUDIT-001: Audit Admin Viewer & Safe Projection Review Verification", () => {
  describe("1. Safe Metadata Projection (Explicit Allowlist)", () => {
    it("omits unknown fields, tokens, passwordHash, and nested objects by default", () => {
      const raw = {
        pageId: "page-123",
        revisionNumber: 4,
        access_token: "sensitive_oauth_token",
        refresh_token: "sensitive_refresh_token",
        passwordHash: "$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW",
        secret: "super_secret",
        authorization: "Bearer 123",
        apiKey: "key_xyz",
        nestedSecretObject: {
          token: "nested_token",
          internalIp: "10.0.0.1",
        },
        unrecognizedFreeTextField: "Some random sensitive note or SQL snippet",
        customPayload: "<script>alert(1)</script>",
      };

      const sanitized = sanitizeAuditMetadata(raw, "CONTENT_PAGE_CREATED");
      assert.ok(sanitized, "Sanitized output should not be null for allowlisted properties");
      assert.equal(sanitized.pageId, "page-123");
      assert.equal(sanitized.revisionNumber, 4);

      // Verify all non-allowlisted properties are omitted completely
      assert.equal(sanitized.access_token, undefined);
      assert.equal(sanitized.refresh_token, undefined);
      assert.equal(sanitized.passwordHash, undefined);
      assert.equal(sanitized.secret, undefined);
      assert.equal(sanitized.authorization, undefined);
      assert.equal(sanitized.apiKey, undefined);
      assert.equal(sanitized.nestedSecretObject, undefined);
      assert.equal(sanitized.unrecognizedFreeTextField, undefined);
      assert.equal(sanitized.customPayload, undefined);
    });

    it("bounds strings and arrays to safe limits and validates value types", () => {
      const longString = "A".repeat(1000);
      const raw = {
        pluginId: "plugin-analytics",
        updatedKeys: ["key1", "key2", 123, null, { not: "a string" }, "B".repeat(200)],
        reason: longString,
      };

      const sanitized = sanitizeAuditMetadata(raw, "PLUGIN_CONFIGURE");
      assert.ok(sanitized);
      assert.equal(sanitized.pluginId, "plugin-analytics");
      assert.ok(Array.isArray(sanitized.updatedKeys));
      assert.equal(sanitized.updatedKeys.length, 3); // key1, key2, bounded B...
      assert.equal(sanitized.updatedKeys[0], "key1");
      assert.equal(sanitized.updatedKeys[1], "key2");
      assert.equal(sanitized.updatedKeys[2].length, 100); // truncated to maxLen 100
    });

    it("validates event-specific safe fields accurately", () => {
      const authRaw = {
        ip: "192.168.1.1",
        userAgent: "Mozilla/5.0",
        attempt: 3,
        password: "plain_password",
        sessionToken: "token_123",
      };
      const authSanitized = sanitizeAuditMetadata(authRaw, "AUTH_LOGIN_FAILURE");
      assert.ok(authSanitized);
      assert.equal(authSanitized.ip, "192.168.1.1");
      assert.equal(authSanitized.userAgent, "Mozilla/5.0");
      assert.equal(authSanitized.attempt, 3);
      assert.equal(authSanitized.password, undefined);
      assert.equal(authSanitized.sessionToken, undefined);
    });

    it("returns null when object contains only non-allowlisted keys or is empty", () => {
      assert.equal(sanitizeAuditMetadata(null), null);
      assert.equal(sanitizeAuditMetadata(undefined), null);
      assert.equal(sanitizeAuditMetadata("string"), null);
      assert.equal(sanitizeAuditMetadata([]), null);
      assert.equal(sanitizeAuditMetadata({}), null);
      assert.equal(
        sanitizeAuditMetadata({
          access_token: "secret",
          passwordHash: "hash",
          unknownKey: "value",
        }),
        null
      );
    });
  });

  describe("2. Input Validation", () => {
    it("validates scopeType at runtime and rejects unknown values", () => {
      assert.equal(validateAuditScopeType("PROJECT"), "PROJECT");
      assert.equal(validateAuditScopeType("system"), "SYSTEM");
      assert.equal(validateAuditScopeType("ALL"), "ALL");
      assert.equal(validateAuditScopeType(undefined), undefined);

      assert.throws(
        () => validateAuditScopeType("INVALID_SCOPE"),
        (err: any) => {
          assert.ok(err instanceof AuditServiceError);
          assert.equal(err.code, "INVALID_INPUT");
          assert.equal(err.status, 400);
          return true;
        }
      );
      assert.throws(
        () => validateAuditScopeType("GLOBAL"),
        (err: any) => {
          assert.ok(err instanceof AuditServiceError);
          assert.equal(err.code, "INVALID_INPUT");
          assert.equal(err.status, 400);
          return true;
        }
      );
    });

    it("validates strict positive integers and rejects malformed values (e.g. 2abc, -5, 0, 1.5)", () => {
      assert.equal(parseStrictPositiveInt("1", 1, "page"), 1);
      assert.equal(parseStrictPositiveInt("25", 1, "page"), 25);
      assert.equal(parseStrictPositiveInt(undefined, 10, "limit"), 10);
      assert.equal(parseStrictPositiveInt("", 20, "limit"), 20);

      // Rejects permissive parseInt strings like 2abc
      assert.throws(
        () => parseStrictPositiveInt("2abc", 1, "page"),
        (err: any) => {
          assert.ok(err instanceof AuditServiceError);
          assert.equal(err.code, "INVALID_INPUT");
          assert.equal(err.status, 400);
          return true;
        }
      );

      // Rejects zero, negative, floating point
      assert.throws(() => parseStrictPositiveInt("0", 1, "page"));
      assert.throws(() => parseStrictPositiveInt("-5", 1, "page"));
      assert.throws(() => parseStrictPositiveInt("1.5", 1, "page"));
      assert.throws(() => parseStrictPositiveInt("abc", 1, "page"));
    });

    it("rejects reversed date ranges and malformed dates", () => {
      const valid = validateDateRange("2026-09-01", "2026-09-20");
      assert.ok(valid.fromDate instanceof Date);
      assert.ok(valid.toDate instanceof Date);

      // Malformed date
      assert.throws(
        () => validateDateRange("invalid-date", "2026-09-20"),
        (err: any) => {
          assert.ok(err instanceof AuditServiceError);
          assert.equal(err.code, "INVALID_DATE_FILTER");
          assert.equal(err.status, 400);
          return true;
        }
      );

      // Reversed date range (from > to)
      assert.throws(
        () => validateDateRange("2026-09-20", "2026-09-01"),
        (err: any) => {
          assert.ok(err instanceof AuditServiceError);
          assert.equal(err.code, "INVALID_INPUT");
          assert.equal(err.status, 400);
          return true;
        }
      );
    });

    it("rejects offsets exceeding maximum safe bounds in AuditService", async () => {
      const service = new AuditService({
        db: {
          count: async () => 0,
          findMany: async () => [],
        },
        hasPermissionFn: async () => true,
      });

      await assert.rejects(
        async () => {
          // page 20,000 with limit 100 exceeds 1,000,000 offset
          await service.listAuditLogs({ page: 20000, limit: 100, projectId: "proj-1" }, "user-1");
        },
        (err: any) => {
          assert.ok(err instanceof AuditServiceError);
          assert.equal(err.code, "INVALID_INPUT");
          assert.equal(err.status, 400);
          return true;
        }
      );
    });
  });

  describe("3. HTTP Error Mapping", () => {
    it("maps AuditServiceError correctly to safe JSON HTTP responses", async () => {
      const unauthRes = handleAuditApiError(
        new AuditServiceError("UNAUTHENTICATED", "Authentication required", 401)
      );
      assert.equal(unauthRes.status, 401);
      const unauthBody = await unauthRes.json();
      assert.equal(unauthBody.error.code, "UNAUTHENTICATED");

      const forbiddenRes = handleAuditApiError(
        new AuditServiceError("FORBIDDEN", "Forbidden: insufficient permissions", 403)
      );
      assert.equal(forbiddenRes.status, 403);
      const forbiddenBody = await forbiddenRes.json();
      assert.equal(forbiddenBody.error.code, "FORBIDDEN");

      const invalidInputRes = handleAuditApiError(
        new AuditServiceError("INVALID_INPUT", "Invalid page: must be a positive integer", 400)
      );
      assert.equal(invalidInputRes.status, 400);
      const invalidInputBody = await invalidInputRes.json();
      assert.equal(invalidInputBody.error.code, "INVALID_INPUT");

      const dbErrorRes = handleAuditApiError(
        new AuditServiceError("DATABASE_ERROR", "Raw postgres error connection refused", 500)
      );
      assert.equal(dbErrorRes.status, 500);
      const dbErrorBody = await dbErrorRes.json();
      assert.equal(dbErrorBody.error.code, "DATABASE_ERROR");
      // Must not leak raw connection details in 500 responses
      assert.ok(!dbErrorBody.error.message.includes("connection refused"));
    });
  });

  describe("4. Removal of Static Demo Data from Admin Audit Page", () => {
    it("ensures app/admin/audit/page.tsx does not contain hardcoded demo data", () => {
      const filePath = path.resolve(process.cwd(), "app/admin/audit/page.tsx");
      const pageCode = fs.readFileSync(filePath, "utf8");
      assert.ok(!pageCode.includes("unknown_bot"), "Must not contain demo actor unknown_bot");
      assert.ok(!pageCode.includes("45.134.22.10"), "Must not contain demo IP 45.134.22.10");
      assert.ok(!pageCode.includes("hero-banner-main.webp"), "Must not contain demo banner filename");
      assert.ok(pageCode.includes("AuditWorkspace"), "Must render AuditWorkspace component");
    });

    it("ensures components/admin/audit/AuditWorkspace.tsx is connected to real API", () => {
      const filePath = path.resolve(process.cwd(), "components/admin/audit/AuditWorkspace.tsx");
      const wsCode = fs.readFileSync(filePath, "utf8");
      assert.ok(wsCode.includes("/api/admin/"), "Must fetch from admin audit API endpoints");
      assert.ok(wsCode.includes("SafeAuditRecord"), "Must type records with SafeAuditRecord");
      assert.ok(!wsCode.includes("45.134.22.10"), "Must not contain static demo IPs");
    });
  });
});
