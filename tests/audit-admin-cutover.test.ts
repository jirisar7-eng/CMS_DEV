import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sanitizeAuditMetadata, AuditService } from "../lib/domain/audit";
import { AuditServiceError } from "../lib/domain/audit/contracts";

describe("Audit Admin Cutover — Unit & Security Checks", () => {
  describe("Safe Metadata Sanitization", () => {
    it("redacts sensitive keys including passwords, tokens, secrets, and auth headers", () => {
      const raw = {
        actionName: "USER_LOGIN",
        ip: "127.0.0.1",
        password: "super_secret_password",
        token: "jwt.token.here",
        secret: "app_secret",
        authorization: "Bearer secret_token",
        apiKey: "api_key_12345",
        sessionToken: "sess_xyz",
        nested: {
          clientSecret: "client_secret_xyz",
          safeField: "safeValue",
        },
        arrayData: [
          { token: "sub_token", visible: true },
          "plain string",
        ],
      };

      const sanitized = sanitizeAuditMetadata(raw);
      assert.ok(sanitized, "Sanitized output must not be null");
      assert.equal(sanitized.actionName, "USER_LOGIN");
      assert.equal(sanitized.ip, "127.0.0.1");
      assert.equal(sanitized.password, "[REDACTED]");
      assert.equal(sanitized.token, "[REDACTED]");
      assert.equal(sanitized.secret, "[REDACTED]");
      assert.equal(sanitized.authorization, "[REDACTED]");
      assert.equal(sanitized.apiKey, "[REDACTED]");
      assert.equal(sanitized.sessionToken, "[REDACTED]");

      const nested = sanitized.nested as Record<string, unknown>;
      assert.equal(nested.clientSecret, "[REDACTED]");
      assert.equal(nested.safeField, "safeValue");

      const arr = sanitized.arrayData as unknown[];
      const arrFirst = arr[0] as Record<string, unknown>;
      assert.equal(arrFirst.token, "[REDACTED]");
      assert.equal(arrFirst.visible, true);
    });

    it("returns null for empty or non-object values", () => {
      assert.equal(sanitizeAuditMetadata(null), null);
      assert.equal(sanitizeAuditMetadata(undefined), null);
      assert.equal(sanitizeAuditMetadata("string"), null);
      assert.equal(sanitizeAuditMetadata([]), null);
      assert.equal(sanitizeAuditMetadata({}), null);
    });
  });

  describe("AuditService Authorization and Project Isolation", () => {
    function createMockStore(records: any[] = []) {
      let lastWhere: any = null;
      return {
        count: async ({ where }: any) => {
          lastWhere = where;
          return records.length;
        },
        findMany: async ({ where, take, skip }: any) => {
          lastWhere = where;
          return records.slice(skip, skip + take);
        },
        getLastWhere: () => lastWhere,
      };
    }

    it("throws UNAUTHENTICATED (401) when requestingUserId is empty", async () => {
      const service = new AuditService({
        db: createMockStore(),
        hasPermissionFn: async () => true,
      });

      await assert.rejects(
        async () => {
          await service.listAuditLogs({ projectId: "proj-1" }, "");
        },
        (err: unknown) => {
          assert.ok(err instanceof AuditServiceError);
          assert.equal(err.code, "UNAUTHENTICATED");
          assert.equal(err.status, 401);
          return true;
        }
      );
    });

    it("throws FORBIDDEN (403) when user lacks audit.view on the requested project", async () => {
      const service = new AuditService({
        db: createMockStore(),
        hasPermissionFn: async (_userId, _perm, projectId) => {
          return projectId === "proj-allowed";
        },
      });

      await assert.rejects(
        async () => {
          await service.listAuditLogs({ projectId: "proj-forbidden" }, "user-1");
        },
        (err: unknown) => {
          assert.ok(err instanceof AuditServiceError);
          assert.equal(err.code, "FORBIDDEN");
          assert.equal(err.status, 403);
          return true;
        }
      );
    });

    it("throws FORBIDDEN (403) when user lacks global audit.view for system logs", async () => {
      const service = new AuditService({
        db: createMockStore(),
        hasPermissionFn: async (_userId, _perm, projectId) => {
          // only project-scoped permission, not global (null)
          return projectId !== null;
        },
      });

      await assert.rejects(
        async () => {
          await service.listAuditLogs({ scopeType: "SYSTEM" }, "user-project-only");
        },
        (err: unknown) => {
          assert.ok(err instanceof AuditServiceError);
          assert.equal(err.code, "FORBIDDEN");
          assert.equal(err.status, 403);
          return true;
        }
      );
    });

    it("enforces strict project isolation in query WHERE clause", async () => {
      const mockStore = createMockStore([
        {
          id: "log-1",
          action: "CONTENT_PAGE_CREATED",
          scopeType: "PROJECT",
          scopeId: "proj-1",
          resourceType: "PAGE",
          resourceId: "p1",
          metadata: { title: "Test Page" },
          createdAt: new Date(),
          actorId: "u1",
          actor: { id: "u1", name: "User One", email: "u1@test.com" },
        },
      ]);

      const service = new AuditService({
        store: mockStore,
        hasPermissionFn: async () => true,
      });

      const res = await service.listAuditLogs({ projectId: "proj-1" }, "user-1");
      assert.equal(res.items.length, 1);
      assert.equal(res.items[0].id, "log-1");

      const where = mockStore.getLastWhere();
      assert.equal(where.scopeType, "PROJECT");
      assert.equal(where.scopeId, "proj-1");
    });

    it("clamps pagination limit between 1 and 100", async () => {
      const mockStore = createMockStore([]);
      const service = new AuditService({
        store: mockStore,
        hasPermissionFn: async () => true,
      });

      const resHigh = await service.listAuditLogs({ projectId: "proj-1", limit: 500 }, "user-1");
      assert.equal(resHigh.limit, 100);

      const resLow = await service.listAuditLogs({ projectId: "proj-1", limit: -5 }, "user-1");
      assert.equal(resLow.limit, 20); // fallback default
    });

    it("validates date filters and throws 400 on malformed date", async () => {
      const service = new AuditService({
        db: createMockStore(),
        hasPermissionFn: async () => true,
      });

      await assert.rejects(
        async () => {
          await service.listAuditLogs(
            { projectId: "proj-1", from: "invalid-date-format" },
            "user-1"
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof AuditServiceError);
          assert.equal(err.code, "INVALID_DATE_FILTER");
          assert.equal(err.status, 400);
          return true;
        }
      );
    });

    it("propagates database errors truthfully as 500 DATABASE_ERROR (not empty results)", async () => {
      const failingStore = {
        count: async () => {
          throw new Error("Connection lost to PostgreSQL cluster");
        },
        findMany: async () => {
          throw new Error("Connection lost to PostgreSQL cluster");
        },
      };

      const service = new AuditService({
        store: failingStore,
        hasPermissionFn: async () => true,
      });

      await assert.rejects(
        async () => {
          await service.listAuditLogs({ projectId: "proj-1" }, "user-1");
        },
        (err: unknown) => {
          assert.ok(err instanceof AuditServiceError);
          assert.equal(err.code, "DATABASE_ERROR");
          assert.equal(err.status, 500);
          return true;
        }
      );
    });
  });

  describe("Removal of Static Demo Data from Admin Audit Page", () => {
    it("ensures app/admin/audit/page.tsx does not contain hardcoded demo data", () => {
      const pageCode = fs.readFileSync("app/admin/audit/page.tsx", "utf8");
      assert.ok(!pageCode.includes("unknown_bot"), "Must not contain demo actor unknown_bot");
      assert.ok(!pageCode.includes("45.134.22.10"), "Must not contain demo IP 45.134.22.10");
      assert.ok(!pageCode.includes("hero-banner-main.webp"), "Must not contain demo banner filename");
      assert.ok(pageCode.includes("AuditWorkspace"), "Must render AuditWorkspace component");
    });

    it("ensures components/admin/audit/AuditWorkspace.tsx is connected to real API", () => {
      const wsCode = fs.readFileSync("components/admin/audit/AuditWorkspace.tsx", "utf8");
      assert.ok(wsCode.includes("/api/admin/"), "Must fetch from admin audit API endpoints");
      assert.ok(wsCode.includes("SafeAuditRecord"), "Must type records with SafeAuditRecord");
      assert.ok(!wsCode.includes("45.134.22.10"), "Must not contain static demo IPs");
    });
  });
});
