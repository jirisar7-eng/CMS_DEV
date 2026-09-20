// @ts-nocheck
import { describe, it, beforeEach, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";

// Mock next/server and server-only before route imports
class MockNextResponse {
  status: number;
  headers: Map<string, string>;
  private _body: any;
  constructor(body: any, init?: { status?: number; headers?: Record<string, string> }) {
    this._body = body;
    this.status = init?.status ?? 200;
    this.headers = new Map(Object.entries(init?.headers || {}));
  }
  static json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
    return new MockNextResponse(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  }
  async json() {
    return typeof this._body === "string" ? JSON.parse(this._body) : this._body;
  }
}

class MockNextRequest extends Request {
  nextUrl: URL;
  constructor(input: string | URL, init?: RequestInit) {
    super(input, init);
    this.nextUrl = new URL(typeof input === "string" ? input : input.toString());
  }
}

let mockProjectContextFn: (projectId?: string | null) => Promise<any> = async (projectId) => ({
  status: "PROJECT_VALID",
  projectId: projectId || "proj-alpha",
  userId: "user-auditor",
});

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === "server-only") return {};
  if (id === "next/server") return { NextResponse: MockNextResponse, NextRequest: MockNextRequest };
  if (id === "next/headers") return { cookies: async () => ({ get: () => undefined }) };
  if (id === "@/lib/db") return { prisma: {} };
  if (id === "@/lib/domain/pages-client/server-context") {
    return {
      getActiveProjectContext: (p: any) => mockProjectContextFn(p),
      getActiveProjectId: async () => "proj-alpha",
    };
  }
  return originalRequire.apply(this, arguments as any);
};

import {
  AuditService,
  AuditServiceError,
  handleAuditApiError,
  parseStrictPositiveInt,
  sanitizeAuditMetadata,
  setAuditServiceForTesting,
  validateAuditScopeType,
  validateDateRange,
} from "../lib/domain/audit";
let rootAuditGet: any;
let projectAuditGet: any;
let setAuthenticatedUserForTesting: any;

describe("SYN-AUDIT-001: Audit Admin Viewer & Safe Projection Review Verification", () => {
  describe("1. Safe Metadata Projection (Explicit Allowlist & Default Omission)", () => {
    it("omits unknown fields, tokens, passwordHash, and nested objects by default", () => {
      const raw = {
        pageId: "page-123",
        pageTitle: "Homepage",
        secret_token: "do_not_leak_secret_token",
        access_token: "sensitive_oauth_token",
        refresh_token: "sensitive_refresh_token",
        passwordHash: "$2b$12$e8s7d8f7sd8f7s8d7f",
        nestedConfig: { internalUrl: "http://db-internal:5432" },
      };

      const sanitized = sanitizeAuditMetadata(raw, "CONTENT_PAGE_CREATED");
      assert.ok(sanitized);
      assert.equal(sanitized.pageId, "page-123");
      assert.equal(sanitized.pageTitle, "Homepage");
      assert.equal(sanitized.secret_token, undefined);
      assert.equal(sanitized.access_token, undefined);
      assert.equal(sanitized.refresh_token, undefined);
      assert.equal(sanitized.passwordHash, undefined);
      assert.equal(sanitized.nestedConfig, undefined);
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
      assert.equal(sanitized.reason, undefined); // reason not in PLUGIN_CONFIGURE schema
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
      assert.equal(sanitizeAuditMetadata(null, "CONTENT_PAGE_CREATED"), null);
      assert.equal(sanitizeAuditMetadata(undefined, "CONTENT_PAGE_CREATED"), null);
      assert.equal(sanitizeAuditMetadata("string", "CONTENT_PAGE_CREATED"), null);
      assert.equal(sanitizeAuditMetadata([], "CONTENT_PAGE_CREATED"), null);
      assert.equal(sanitizeAuditMetadata({}, "CONTENT_PAGE_CREATED"), null);
      assert.equal(
        sanitizeAuditMetadata(
          {
            access_token: "secret",
            passwordHash: "hash",
            unknownKey: "value",
          },
          "CONTENT_PAGE_CREATED"
        ),
        null
      );
    });

    it("omits metadata completely for unknown event types or missing action", () => {
      const sensitiveData = {
        note: "Confidential note",
        reason: "Security failure: token expired",
        pageId: "page-abc",
        title: "Test Page",
        arbitraryText: "Free text",
      };

      // Unknown event type -> strictly null
      assert.equal(sanitizeAuditMetadata(sensitiveData, "UNKNOWN_EVENT_ACTION"), null);
      assert.equal(sanitizeAuditMetadata(sensitiveData, "CUSTOM_UNTRACKED_EVENT"), null);
      assert.equal(sanitizeAuditMetadata(sensitiveData, "HACKER_EVENT"), null);

      // Missing or empty action -> strictly null
      assert.equal(sanitizeAuditMetadata(sensitiveData, undefined), null);
      assert.equal(sanitizeAuditMetadata(sensitiveData, ""), null);
    });

    it("omits unrestricted note and reason fields from known events while preserving approved structured metadata", () => {
      // 1. AUTH_LOGIN_FAILURE: sensitive plaintext password typed into reason
      const loginFail = sanitizeAuditMetadata(
        {
          ip: "10.0.0.1",
          userAgent: "Browser/1.0",
          email: "victim@example.com",
          reason: "User typed sensitive password in username field: SecretPassword123!",
          attempt: 2,
        },
        "AUTH_LOGIN_FAILURE"
      );
      assert.ok(loginFail);
      assert.equal(loginFail.ip, "10.0.0.1");
      assert.equal(loginFail.email, "victim@example.com");
      assert.equal(loginFail.attempt, 2);
      assert.equal(loginFail.reason, undefined, "reason must be strictly omitted from AUTH_LOGIN_FAILURE");

      // 2. AUTH_LOGOUT: sensitive session reason
      const logout = sanitizeAuditMetadata(
        {
          userId: "usr-42",
          reason: "Session invalidated due to token compromise: tok-xyz",
        },
        "AUTH_LOGOUT"
      );
      assert.ok(logout);
      assert.equal(logout.userId, "usr-42");
      assert.equal(logout.reason, undefined, "reason must be strictly omitted from AUTH_LOGOUT");

      // 3. AUTH_SESSION_REVOKED
      const revoked = sanitizeAuditMetadata(
        {
          targetUserId: "usr-99",
          reason: "Revoked by admin due to leak: key-abc",
        },
        "AUTH_SESSION_REVOKED"
      );
      assert.ok(revoked);
      assert.equal(revoked.targetUserId, "usr-99");
      assert.equal(revoked.reason, undefined, "reason must be strictly omitted from AUTH_SESSION_REVOKED");

      // 4. CONTENT_DRAFT_UPDATED: sensitive draft note
      const draftUpdate = sanitizeAuditMetadata(
        {
          pageId: "page-1",
          revisionId: "rev-2",
          revisionNumber: 2,
          lockVersion: 3,
          note: "Sensitive internal memo about upcoming confidential acquisition",
          changedFields: ["title", "slug"],
        },
        "CONTENT_DRAFT_UPDATED"
      );
      assert.ok(draftUpdate);
      assert.equal(draftUpdate.pageId, "page-1");
      assert.equal(draftUpdate.revisionId, "rev-2");
      assert.equal(draftUpdate.revisionNumber, 2);
      assert.equal(draftUpdate.lockVersion, 3);
      assert.deepEqual(draftUpdate.changedFields, ["title", "slug"]);
      assert.equal(draftUpdate.note, undefined, "note must be strictly omitted from CONTENT_DRAFT_UPDATED");

      // 5. CONTENT_REVIEW_SUBMITTED
      const reviewSubmit = sanitizeAuditMetadata(
        {
          pageId: "page-1",
          revisionId: "rev-2",
          revisionNumber: 2,
          lockVersion: 3,
          fromStatus: "DRAFT",
          toStatus: "IN_REVIEW",
          note: "Review note containing confidential PII of reviewer",
        },
        "CONTENT_REVIEW_SUBMITTED"
      );
      assert.ok(reviewSubmit);
      assert.equal(reviewSubmit.fromStatus, "DRAFT");
      assert.equal(reviewSubmit.toStatus, "IN_REVIEW");
      assert.equal(reviewSubmit.lockVersion, 3);
      assert.equal(reviewSubmit.note, undefined, "note must be strictly omitted from CONTENT_REVIEW_SUBMITTED");

      // 6. CONTENT_CHANGES_REQUESTED
      const changesReq = sanitizeAuditMetadata(
        {
          pageId: "page-1",
          revisionId: "rev-2",
          revisionNumber: 2,
          fromStatus: "IN_REVIEW",
          toStatus: "CHANGES_REQUESTED",
          reason: "Free-text rejection reason containing unredacted secrets",
        },
        "CONTENT_CHANGES_REQUESTED"
      );
      assert.ok(changesReq);
      assert.equal(changesReq.fromStatus, "IN_REVIEW");
      assert.equal(changesReq.toStatus, "CHANGES_REQUESTED");
      assert.equal(changesReq.reason, undefined, "reason must be strictly omitted from CONTENT_CHANGES_REQUESTED");

      // 7. CONTENT_RELEASE_ROLLED_BACK
      const rollback = sanitizeAuditMetadata(
        {
          pageId: "page-1",
          rollbackReleaseId: "rel-rb-1",
          sourcePublishReleaseId: "rel-pub-1",
          fromRevisionId: "rev-2",
          toRevisionId: "rev-1",
          fromRevisionNumber: 2,
          toRevisionNumber: 1,
          reason: "Emergency rollback due to security vulnerability CVE-2026-9999",
        },
        "CONTENT_RELEASE_ROLLED_BACK"
      );
      assert.ok(rollback);
      assert.equal(rollback.pageId, "page-1");
      assert.equal(rollback.rollbackReleaseId, "rel-rb-1");
      assert.equal(rollback.fromRevisionId, "rev-2");
      assert.equal(rollback.toRevisionId, "rev-1");
      assert.equal(rollback.fromRevisionNumber, 2);
      assert.equal(rollback.toRevisionNumber, 1);
      assert.equal(rollback.reason, undefined, "reason must be strictly omitted from CONTENT_RELEASE_ROLLED_BACK");
    });

    it("proves string truncation alone is not sanitization for free text", () => {
      // Short text cannot pass through simply because it is short
      const res = sanitizeAuditMetadata(
        {
          pageId: "page-1",
          note: "Short secret: 1234",
          reason: "Leak: abc",
        },
        "CONTENT_DRAFT_UPDATED"
      );
      assert.ok(res);
      assert.equal(res.pageId, "page-1");
      assert.equal(res.note, undefined);
      assert.equal(res.reason, undefined);
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

  describe("5. Exported GET Route Handlers Regression Tests (Both Audit Endpoints)", () => {
    before(async () => {
      const pagesApi = await import("../lib/domain/pages-api");
      setAuthenticatedUserForTesting = pagesApi.setAuthenticatedUserForTesting;

      const rootRoute = await import("../app/api/admin/audit/route");
      rootAuditGet = rootRoute.GET;

      const projectRoute = await import("../app/api/admin/projects/[projectId]/audit/route");
      projectAuditGet = projectRoute.GET;
    });
    let storeQueryCount = 0;
    let storeRecords: any[] = [];
    let storeShouldThrow: Error | null = null;
    let userHasAuditPermission = true;

    beforeEach(() => {
      storeQueryCount = 0;
      storeRecords = [];
      storeShouldThrow = null;
      userHasAuditPermission = true;
      mockProjectContextFn = async (projectId) => ({
        status: "PROJECT_VALID",
        projectId: projectId || "proj-alpha",
        userId: "user-auditor",
      });

      const mockStore = {
        count: async () => {
          storeQueryCount++;
          if (storeShouldThrow) throw storeShouldThrow;
          return storeRecords.length;
        },
        findMany: async () => {
          storeQueryCount++;
          if (storeShouldThrow) throw storeShouldThrow;
          return storeRecords;
        },
      };

      const testService = new AuditService({
        db: mockStore as any,
        hasPermissionFn: async () => userHasAuditPermission,
      });
      setAuditServiceForTesting(testService);
    });

    const activeUser = {
      id: "usr-auditor-1",
      email: "auditor@example.com",
      displayName: "Auditor User",
      status: "ACTIVE",
    };

    describe("Endpoint A: /api/admin/audit", () => {
      it("unauthenticated request returns 401 and does not query data store", async () => {
        setAuthenticatedUserForTesting(null);
        const req = new MockNextRequest("http://localhost/api/admin/audit?projectId=proj-alpha");
        const res = await rootAuditGet(req);

        assert.equal(res.status, 401);
        const body = await res.json();
        assert.equal(body.error.code, "UNAUTHENTICATED");
        assert.equal(storeQueryCount, 0, "Denied request must not reach the audit data query");
      });

      it("insufficient permissions returns 403 and does not query data store", async () => {
        setAuthenticatedUserForTesting(activeUser as any);
        userHasAuditPermission = false;

        const req = new MockNextRequest("http://localhost/api/admin/audit?projectId=proj-alpha");
        const res = await rootAuditGet(req);

        assert.equal(res.status, 403);
        const body = await res.json();
        assert.equal(body.error.code, "FORBIDDEN");
        assert.equal(storeQueryCount, 0, "Denied request must not reach the audit data query");
      });

      it("cross-project access denied returns 403 and does not query data store", async () => {
        setAuthenticatedUserForTesting(activeUser as any);
        mockProjectContextFn = async () => ({
          status: "PROJECT_FORBIDDEN",
          projectId: null,
        });

        const req = new MockNextRequest("http://localhost/api/admin/audit?projectId=proj-secret");
        const res = await rootAuditGet(req);

        assert.equal(res.status, 403);
        const body = await res.json();
        assert.equal(body.error.code, "PROJECT_FORBIDDEN");
        assert.equal(storeQueryCount, 0, "Denied request must not reach the audit data query");
      });

      it("inactive project returns 403 and does not query data store", async () => {
        setAuthenticatedUserForTesting(activeUser as any);
        mockProjectContextFn = async () => ({
          status: "PROJECT_INACTIVE",
          projectId: null,
        });

        const req = new MockNextRequest("http://localhost/api/admin/audit?projectId=proj-inactive");
        const res = await rootAuditGet(req);

        assert.equal(res.status, 403);
        const body = await res.json();
        assert.equal(body.error.code, "PROJECT_INACTIVE");
        assert.equal(storeQueryCount, 0, "Denied request must not reach the audit data query");
      });

      it("invalid scopeType returns 400 and does not query data store", async () => {
        setAuthenticatedUserForTesting(activeUser as any);
        const req = new MockNextRequest("http://localhost/api/admin/audit?scopeType=MALICIOUS_SCOPE");
        const res = await rootAuditGet(req);

        assert.equal(res.status, 400);
        const body = await res.json();
        assert.equal(body.error.code, "INVALID_INPUT");
        assert.equal(storeQueryCount, 0, "Denied request must not reach the audit data query");
      });

      it("invalid pagination parameters return 400 and do not query data store", async () => {
        setAuthenticatedUserForTesting(activeUser as any);

        // Negative page
        const reqNegative = new MockNextRequest("http://localhost/api/admin/audit?page=-1");
        const resNegative = await rootAuditGet(reqNegative);
        assert.equal(resNegative.status, 400);
        assert.equal(storeQueryCount, 0);

        // Non-numeric page
        const reqAlpha = new MockNextRequest("http://localhost/api/admin/audit?page=2abc");
        const resAlpha = await rootAuditGet(reqAlpha);
        assert.equal(resAlpha.status, 400);
        assert.equal(storeQueryCount, 0);

        // Zero limit
        const reqZero = new MockNextRequest("http://localhost/api/admin/audit?limit=0");
        const resZero = await rootAuditGet(reqZero);
        assert.equal(resZero.status, 400);
        assert.equal(storeQueryCount, 0);
      });

      it("reversed date range returns 400 and does not query data store", async () => {
        setAuthenticatedUserForTesting(activeUser as any);
        const req = new MockNextRequest(
          "http://localhost/api/admin/audit?from=2026-09-20&to=2026-09-01"
        );
        const res = await rootAuditGet(req);

        assert.equal(res.status, 400);
        const body = await res.json();
        assert.equal(body.error.code, "INVALID_INPUT");
        assert.equal(storeQueryCount, 0, "Denied request must not reach the audit data query");
      });

      it("database failure returns controlled 500 without leaking raw details", async () => {
        setAuthenticatedUserForTesting(activeUser as any);
        storeShouldThrow = new Error("FATAL: connection pool exhausted with secret host 10.20.30.40");

        const req = new MockNextRequest("http://localhost/api/admin/audit?projectId=proj-alpha");
        const res = await rootAuditGet(req);

        assert.equal(res.status, 500, "Must return HTTP 500 on database failure (not empty 200)");
        const body = await res.json();
        assert.equal(body.error.code, "DATABASE_ERROR");
        assert.ok(!body.error.message.includes("10.20.30.40"), "Must not leak internal database details");
        assert.ok(!body.error.message.includes("FATAL"), "Must not leak internal database details");
      });

      it("authorized request returns 200 with safely projected metadata", async () => {
        setAuthenticatedUserForTesting(activeUser as any);
        storeRecords = [
          {
            id: "audit-1",
            scopeType: "PROJECT",
            scopeId: "proj-alpha",
            action: "CONTENT_PAGE_CREATED",
            resourceType: "PAGE",
            resourceId: "page-1",
            actorId: "usr-auditor-1",
            actorEmail: "auditor@example.com",
            occurredAt: new Date("2026-09-20T10:00:00Z"),
            metadata: {
              pageId: "page-1",
              pageTitle: "Homepage",
              passwordHash: "hash-secret",
              secretToken: "tok-secret",
            },
          },
          {
            id: "audit-2",
            scopeType: "PROJECT",
            scopeId: "proj-alpha",
            action: "CONTENT_DRAFT_UPDATED",
            resourceType: "PAGE",
            resourceId: "page-1",
            actorId: "usr-auditor-1",
            actorEmail: "auditor@example.com",
            occurredAt: new Date("2026-09-20T10:05:00Z"),
            metadata: {
              pageId: "page-1",
              revisionId: "rev-2",
              revisionNumber: 2,
              lockVersion: 1,
              note: "Unrestricted sensitive note",
              changedFields: ["title"],
            },
          },
          {
            id: "audit-3",
            scopeType: "PROJECT",
            scopeId: "proj-alpha",
            action: "UNKNOWN_CUSTOM_ACTION",
            resourceType: "CUSTOM",
            resourceId: "custom-1",
            actorId: "usr-auditor-1",
            actorEmail: "auditor@example.com",
            occurredAt: new Date("2026-09-20T10:10:00Z"),
            metadata: {
              foo: "bar",
              arbitraryNote: "leak",
            },
          },
        ];

        const req = new MockNextRequest("http://localhost/api/admin/audit?projectId=proj-alpha");
        const res = await rootAuditGet(req);

        assert.equal(res.status, 200);
        assert.ok(storeQueryCount > 0, "Authorized request must query data store");
        const body = await res.json();
        assert.equal(body.data.items.length, 3);

        // Record 1: structured fields preserved, tokens/passwords omitted
        const item1 = body.data.items[0];
        assert.equal(item1.metadata.pageId, "page-1");
        assert.equal(item1.metadata.pageTitle, "Homepage");
        assert.equal(item1.metadata.passwordHash, undefined);
        assert.equal(item1.metadata.secretToken, undefined);

        // Record 2: note omitted, structured fields preserved
        const item2 = body.data.items[1];
        assert.equal(item2.metadata.pageId, "page-1");
        assert.equal(item2.metadata.revisionNumber, 2);
        assert.equal(item2.metadata.lockVersion, 1);
        assert.deepEqual(item2.metadata.changedFields, ["title"]);
        assert.equal(item2.metadata.note, undefined);

        // Record 3: unknown action -> metadata is null
        const item3 = body.data.items[2];
        assert.equal(item3.metadata, null, "Unknown event type must project metadata to null");
      });
    });

    describe("Endpoint B: /api/admin/projects/[projectId]/audit", () => {
      const projectContext = { params: Promise.resolve({ projectId: "proj-alpha" }) };

      it("unauthenticated request returns 401 and does not query data store", async () => {
        setAuthenticatedUserForTesting(null);
        const req = new MockNextRequest("http://localhost/api/admin/projects/proj-alpha/audit");
        const res = await projectAuditGet(req, projectContext);

        assert.equal(res.status, 401);
        const body = await res.json();
        assert.equal(body.error.code, "UNAUTHENTICATED");
        assert.equal(storeQueryCount, 0, "Denied request must not reach the audit data query");
      });

      it("insufficient permissions returns 403 and does not query data store", async () => {
        setAuthenticatedUserForTesting(activeUser as any);
        userHasAuditPermission = false;

        const req = new MockNextRequest("http://localhost/api/admin/projects/proj-alpha/audit");
        const res = await projectAuditGet(req, projectContext);

        assert.equal(res.status, 403);
        const body = await res.json();
        assert.equal(body.error.code, "FORBIDDEN");
        assert.equal(storeQueryCount, 0, "Denied request must not reach the audit data query");
      });

      it("cross-project access denied returns 403 and does not query data store", async () => {
        setAuthenticatedUserForTesting(activeUser as any);
        mockProjectContextFn = async () => ({
          status: "PROJECT_FORBIDDEN",
          projectId: null,
        });

        const req = new MockNextRequest("http://localhost/api/admin/projects/proj-alpha/audit");
        const res = await projectAuditGet(req, projectContext);

        assert.equal(res.status, 403);
        const body = await res.json();
        assert.equal(body.error.code, "PROJECT_FORBIDDEN");
        assert.equal(storeQueryCount, 0, "Denied request must not reach the audit data query");
      });

      it("inactive project returns 403 and does not query data store", async () => {
        setAuthenticatedUserForTesting(activeUser as any);
        mockProjectContextFn = async () => ({
          status: "PROJECT_INACTIVE",
          projectId: null,
        });

        const req = new MockNextRequest("http://localhost/api/admin/projects/proj-alpha/audit");
        const res = await projectAuditGet(req, projectContext);

        assert.equal(res.status, 403);
        const body = await res.json();
        assert.equal(body.error.code, "PROJECT_INACTIVE");
        assert.equal(storeQueryCount, 0, "Denied request must not reach the audit data query");
      });

      it("invalid scopeType on project route returns 400 and does not query data store", async () => {
        setAuthenticatedUserForTesting(activeUser as any);

        // Invalid scope string
        const reqInvalid = new MockNextRequest(
          "http://localhost/api/admin/projects/proj-alpha/audit?scopeType=INVALID_SCOPE"
        );
        const resInvalid = await projectAuditGet(reqInvalid, projectContext);
        assert.equal(resInvalid.status, 400);
        assert.equal(storeQueryCount, 0);

        // SYSTEM scope requested on project endpoint
        const reqSystem = new MockNextRequest(
          "http://localhost/api/admin/projects/proj-alpha/audit?scopeType=SYSTEM"
        );
        const resSystem = await projectAuditGet(reqSystem, projectContext);
        assert.equal(resSystem.status, 400);
        assert.equal(storeQueryCount, 0);
      });

      it("invalid pagination parameters return 400 and do not query data store", async () => {
        setAuthenticatedUserForTesting(activeUser as any);

        // Negative page
        const reqNeg = new MockNextRequest(
          "http://localhost/api/admin/projects/proj-alpha/audit?page=-5"
        );
        const resNeg = await projectAuditGet(reqNeg, projectContext);
        assert.equal(resNeg.status, 400);
        assert.equal(storeQueryCount, 0);

        // Zero limit
        const reqLimit = new MockNextRequest(
          "http://localhost/api/admin/projects/proj-alpha/audit?limit=0"
        );
        const resLimit = await projectAuditGet(reqLimit, projectContext);
        assert.equal(resLimit.status, 400);
        assert.equal(storeQueryCount, 0);
      });

      it("reversed date range returns 400 and does not query data store", async () => {
        setAuthenticatedUserForTesting(activeUser as any);
        const req = new MockNextRequest(
          "http://localhost/api/admin/projects/proj-alpha/audit?from=2026-09-20&to=2026-09-01"
        );
        const res = await projectAuditGet(req, projectContext);

        assert.equal(res.status, 400);
        const body = await res.json();
        assert.equal(body.error.code, "INVALID_INPUT");
        assert.equal(storeQueryCount, 0, "Denied request must not reach the audit data query");
      });

      it("database failure returns controlled 500 without leaking raw details", async () => {
        setAuthenticatedUserForTesting(activeUser as any);
        storeShouldThrow = new Error("FATAL: connection terminated abruptly with secret token");

        const req = new MockNextRequest("http://localhost/api/admin/projects/proj-alpha/audit");
        const res = await projectAuditGet(req, projectContext);

        assert.equal(res.status, 500, "Must return HTTP 500 on database failure (not empty 200)");
        const body = await res.json();
        assert.equal(body.error.code, "DATABASE_ERROR");
        assert.ok(!body.error.message.includes("secret token"), "Must not leak internal details");
        assert.ok(!body.error.message.includes("abruptly"), "Must not leak internal details");
      });

      it("authorized request returns 200 with safely projected metadata", async () => {
        setAuthenticatedUserForTesting(activeUser as any);
        storeRecords = [
          {
            id: "audit-p1",
            scopeType: "PROJECT",
            scopeId: "proj-alpha",
            action: "CONTENT_PAGE_CREATED",
            resourceType: "PAGE",
            resourceId: "page-1",
            actorId: "usr-auditor-1",
            actorEmail: "auditor@example.com",
            occurredAt: new Date("2026-09-20T10:00:00Z"),
            metadata: {
              pageId: "page-1",
              pageTitle: "Project Homepage",
              access_token: "secret-token",
              passwordHash: "hash-secret",
            },
          },
          {
            id: "audit-p2",
            scopeType: "PROJECT",
            scopeId: "proj-alpha",
            action: "CONTENT_CHANGES_REQUESTED",
            resourceType: "PAGE",
            resourceId: "page-1",
            actorId: "usr-auditor-1",
            actorEmail: "auditor@example.com",
            occurredAt: new Date("2026-09-20T10:15:00Z"),
            metadata: {
              pageId: "page-1",
              revisionId: "rev-2",
              revisionNumber: 2,
              fromStatus: "IN_REVIEW",
              toStatus: "CHANGES_REQUESTED",
              reason: "Unrestricted feedback reason",
            },
          },
          {
            id: "audit-p3",
            scopeType: "PROJECT",
            scopeId: "proj-alpha",
            action: "UNREGISTERED_PLUGIN_EVENT",
            resourceType: "PLUGIN",
            resourceId: "plugin-xyz",
            actorId: "usr-auditor-1",
            actorEmail: "auditor@example.com",
            occurredAt: new Date("2026-09-20T10:20:00Z"),
            metadata: {
              debugLog: "Sensitive internal state",
            },
          },
        ];

        const req = new MockNextRequest("http://localhost/api/admin/projects/proj-alpha/audit");
        const res = await projectAuditGet(req, projectContext);

        assert.equal(res.status, 200);
        assert.ok(storeQueryCount > 0, "Authorized request must query data store");
        const body = await res.json();
        assert.equal(body.data.items.length, 3);

        // Record 1
        const item1 = body.data.items[0];
        assert.equal(item1.metadata.pageId, "page-1");
        assert.equal(item1.metadata.pageTitle, "Project Homepage");
        assert.equal(item1.metadata.access_token, undefined);
        assert.equal(item1.metadata.passwordHash, undefined);

        // Record 2: reason omitted, status fields preserved
        const item2 = body.data.items[1];
        assert.equal(item2.metadata.fromStatus, "IN_REVIEW");
        assert.equal(item2.metadata.toStatus, "CHANGES_REQUESTED");
        assert.equal(item2.metadata.reason, undefined);

        // Record 3: unregistered event -> metadata is null
        const item3 = body.data.items[2];
        assert.equal(item3.metadata, null, "Unregistered event type must project metadata to null");
      });
    });
  });
});
