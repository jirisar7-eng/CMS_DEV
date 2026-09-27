import { describe, it, beforeEach, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import Module from "node:module";
import { NextRequest } from "next/server";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { PermissionKey } from "@/lib/auth/rbac";
import type { UserStatus, SafeUserRecord } from "@/lib/domain/users/types";

// ============================================================================
// Deterministic Test Seams & Module Interception
// ============================================================================

interface NodeModuleWithRequire {
  require: (id: string, ...args: unknown[]) => unknown;
}

const originalRequire = (Module.prototype as unknown as NodeModuleWithRequire).require;

let mockAuthUser: { id: string; email: string; displayName: string | null; status: string } | null = {
  id: "user-admin-1",
  email: "admin@example.com",
  displayName: "Admin Master",
  status: "ACTIVE",
};

let mockRevokedUserIds: string[] = [];

(Module.prototype as unknown as NodeModuleWithRequire).require = function (
  id: string,
  ...args: unknown[]
) {
  if (id === "server-only") {
    return {};
  }
  if (id === "@/lib/auth/session") {
    return {
      requireAuthenticatedUser: async () => {
        if (!mockAuthUser || mockAuthUser.status !== "ACTIVE") {
          throw new Error("UNAUTHENTICATED");
        }
        return mockAuthUser;
      },
      getSession: async () => ({
        session: mockAuthUser
          ? { id: "sess-1", userId: mockAuthUser.id, expiresAt: new Date("2026-09-28T00:00:00.000Z") }
          : null,
        user: mockAuthUser,
      }),
      revokeAllUserSessions: async (userId: string, ..._rest: unknown[]) => {
        mockRevokedUserIds.push(userId);
      },
    };
  }
  if (id === "@/lib/domain/pages-api/origin") {
    return {
      validateMutationOrigin: (request: Request) => {
        const origin = request.headers.get("origin");
        if (origin) {
          let requestOrigin: string;
          try {
            requestOrigin = new URL(request.url).origin;
          } catch {
            throw { code: "CSRF_REJECTED", message: "Invalid request URL origin", status: 403 };
          }
          if (origin !== requestOrigin) {
            throw { code: "CSRF_REJECTED", message: "Cross-origin request rejected", status: 403 };
          }
          return;
        }
        const secFetchSite = request.headers.get("sec-fetch-site");
        if (secFetchSite) {
          if (secFetchSite === "cross-site") {
            throw { code: "CSRF_REJECTED", message: "Cross-site request rejected", status: 403 };
          }
          if (
            secFetchSite !== "same-origin" &&
            secFetchSite !== "same-site" &&
            secFetchSite !== "none"
          ) {
            throw { code: "CSRF_REJECTED", message: "Cross-site request rejected", status: 403 };
          }
        }
      },
    };
  }
  if (id.startsWith("@/")) {
    const rel = id.slice(2);
    return originalRequire.call(this, path.resolve(__dirname, "..", rel), ...args);
  }
  return originalRequire.call(this, id, ...args);
};

// Runtime bindings loaded dynamically AFTER module interception
type UserDomainError = import("../lib/domain/users/service").UserDomainError;
let UserService: typeof import("../lib/domain/users/service").UserService;
let setUserServiceForTesting: typeof import("../lib/domain/users/service").setUserServiceForTesting;
let toSafeUserRecord: typeof import("../lib/domain/users/service").toSafeUserRecord;
let UserDomainError: typeof import("../lib/domain/users/service").UserDomainError;
let listUsersRoute: typeof import("../app/api/admin/users/route").GET;
let createUserRoute: typeof import("../app/api/admin/users/route").POST;
let getUserRoute: typeof import("../app/api/admin/users/[userId]/route").GET;
let updateUserRoute: typeof import("../app/api/admin/users/[userId]/route").PATCH;
let verifyPassword: typeof import("../lib/auth/password").verifyPassword;

async function initRuntimeBindings() {
  if (UserService) return;
  const serviceMod = await import("../lib/domain/users/service");
  UserService = serviceMod.UserService;
  setUserServiceForTesting = serviceMod.setUserServiceForTesting;
  toSafeUserRecord = serviceMod.toSafeUserRecord;
  UserDomainError = serviceMod.UserDomainError;

  const collectionMod = await import("../app/api/admin/users/route");
  listUsersRoute = collectionMod.GET;
  createUserRoute = collectionMod.POST;

  const detailMod = await import("../app/api/admin/users/[userId]/route");
  getUserRoute = detailMod.GET;
  updateUserRoute = detailMod.PATCH;

  const passwordMod = await import("../lib/auth/password");
  verifyPassword = passwordMod.verifyPassword;
}

// ============================================================================
// In-Memory Deterministic Mock Prisma Store
// ============================================================================

interface MockDbUser {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  roles?: Array<{
    projectId: string | null;
    role?: { name: string } | null;
  }>;
  mfa?: { status: string } | null;
}

interface MockAuditEntry {
  action: string;
  scopeType: string;
  actorId: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
}

function createMockPrisma() {
  const users = new Map<string, MockDbUser>();
  const auditLogs: MockAuditEntry[] = [];
  const lockedIdsLog: string[][] = [];

  const mockDb = {
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id) {
          return users.get(where.id) ?? null;
        }
        if (where.email) {
          for (const u of users.values()) {
            if (u.email.toLowerCase() === where.email.toLowerCase()) {
              return u;
            }
          }
          return null;
        }
        return null;
      },
      findFirst: async ({
        where,
      }: {
        where?: {
          email?: string;
          id?: { not?: string };
          [key: string]: unknown;
        };
        select?: Record<string, boolean>;
      }) => {
        if (!where) return null;
        for (const u of users.values()) {
          let matches = true;
          if (where.email !== undefined) {
            if (u.email.toLowerCase() !== String(where.email).toLowerCase()) {
              matches = false;
            }
          }
          if (where.id && typeof where.id === "object" && "not" in where.id) {
            if (u.id === where.id.not) {
              matches = false;
            }
          }
          if (matches) {
            return u;
          }
        }
        return null;
      },
      findMany: async ({
        where,
        take,
        skip,
        orderBy,
      }: {
        where?: Record<string, unknown>;
        take?: number;
        skip?: number;
        orderBy?: Array<Record<string, string>>;
      }) => {
        let list = Array.from(users.values());
        if (where?.status) {
          list = list.filter((u) => u.status === where.status);
        }
        if (where?.OR && Array.isArray(where.OR)) {
          const conditions = where.OR as Array<{
            email?: { contains: string; mode?: string };
            displayName?: { contains: string; mode?: string };
          }>;
          list = list.filter((u) => {
            return conditions.some((c) => {
              if (c.email?.contains) {
                return u.email.toLowerCase().includes(c.email.contains.toLowerCase());
              }
              if (c.displayName?.contains) {
                return (
                  u.displayName &&
                  u.displayName.toLowerCase().includes(c.displayName.contains.toLowerCase())
                );
              }
              return false;
            });
          });
        }

        // Default sorting
        list.sort((a, b) => {
          const dateDiff = b.createdAt.getTime() - a.createdAt.getTime();
          if (dateDiff !== 0) return dateDiff;
          return a.id.localeCompare(b.id);
        });

        const offset = skip ?? 0;
        const limit = take ?? list.length;
        return list.slice(offset, offset + limit);
      },
      count: async ({ where }: { where?: Record<string, unknown> }) => {
        let list = Array.from(users.values());
        if (where?.status) {
          list = list.filter((u) => u.status === where.status);
        }
        if (where?.OR && Array.isArray(where.OR)) {
          const conditions = where.OR as Array<{
            email?: { contains: string; mode?: string };
            displayName?: { contains: string; mode?: string };
          }>;
          list = list.filter((u) => {
            return conditions.some((c) => {
              if (c.email?.contains) {
                return u.email.toLowerCase().includes(c.email.contains.toLowerCase());
              }
              if (c.displayName?.contains) {
                return (
                  u.displayName &&
                  u.displayName.toLowerCase().includes(c.displayName.contains.toLowerCase())
                );
              }
              return false;
            });
          });
        }
        return list.length;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const email = String(data.email).trim().toLowerCase();
        for (const existing of users.values()) {
          if (existing.email.toLowerCase() === email) {
            const err = new Error("Unique constraint failed");
            (err as unknown as { code: string }).code = "P2002";
            throw err;
          }
        }
        const created: MockDbUser = {
          id: String(data.id || `user-${users.size + 1}`),
          email,
          passwordHash: String(data.passwordHash),
          displayName: (data.displayName as string | null) ?? null,
          status: String(data.status || "ACTIVE"),
          createdAt: new Date("2026-09-27T00:00:00.000Z"),
          updatedAt: new Date("2026-09-27T00:00:00.000Z"),
          roles: [],
          mfa: null,
        };
        users.set(created.id, created);
        return created;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const existing = users.get(where.id);
        if (!existing) {
          throw new Error("Record to update not found");
        }
        let email = existing.email;
        if (data.email) {
          email = String(data.email).trim().toLowerCase();
          for (const other of users.values()) {
            if (other.id !== where.id && other.email.toLowerCase() === email) {
              const err = new Error("Unique constraint failed");
              (err as unknown as { code: string }).code = "P2002";
              throw err;
            }
          }
        }
        const updated: MockDbUser = {
          ...existing,
          email,
          displayName:
            data.displayName !== undefined
              ? ((data.displayName as string | null) ?? null)
              : existing.displayName,
          status: data.status ? String(data.status) : existing.status,
          updatedAt: new Date("2026-09-27T01:00:00.000Z"),
        };
        users.set(updated.id, updated);
        return updated;
      },
    },
    auditLog: {
      create: async ({ data }: { data: MockAuditEntry }) => {
        auditLogs.push(data);
        return data;
      },
    },
    $queryRaw: async (_query: unknown, ...values: unknown[]) => {
      // Record locked IDs
      lockedIdsLog.push(values.map(String));
      return [];
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(mockDb);
    },
  };

  return {
    mockDb,
    users,
    auditLogs,
    lockedIdsLog,
  };
}

// ============================================================================
// TEST SUITE: SYN-USERS-001 (Deterministic Service & API)
// ============================================================================

describe("SYN-USERS-001: Deterministic Users Service & API", () => {
  let mockEnv: ReturnType<typeof createMockPrisma>;
  let grantedPermissions: Set<string>;

  before(async () => {
    await initRuntimeBindings();
  });

  beforeEach(async () => {
    await initRuntimeBindings();
    mockEnv = createMockPrisma();
    grantedPermissions = new Set(["user-admin-1:users.view", "user-admin-1:users.manage"]);
    mockRevokedUserIds = [];
    mockAuthUser = {
      id: "user-admin-1",
      email: "admin@example.com",
      displayName: "Admin Master",
      status: "ACTIVE",
    };

    // Pre-seed actor user
    mockEnv.users.set("user-admin-1", {
      id: "user-admin-1",
      email: "admin@example.com",
      passwordHash: "$2a$12$fakehashfakehashfakehashfakehashfakehashfakehash",
      displayName: "Admin Master",
      status: "ACTIVE",
      createdAt: new Date("2026-09-26T00:00:00.000Z"),
      updatedAt: new Date("2026-09-26T00:00:00.000Z"),
      roles: [{ projectId: null, role: { name: "SUPERADMIN" } }],
      mfa: { status: "ENABLED" },
    });

    // Wire service test seam
    const service = new UserService({
      prisma: mockEnv.mockDb as unknown as PrismaClient,
      hasPermissionFn: async (userId: string, perm: PermissionKey) => {
        return grantedPermissions.has(`${userId}:${perm}`);
      },
    });
    setUserServiceForTesting(service);
  });

  // --------------------------------------------------------------------------
  // A. UserService Authorization
  // --------------------------------------------------------------------------
  describe("A. UserService Authorization", () => {
    it("listUsers requires users.view and fails closed when denied", async () => {
      grantedPermissions.delete("user-admin-1:users.view");
      const service = new UserService({
        prisma: mockEnv.mockDb as unknown as PrismaClient,
        hasPermissionFn: async (userId: string, perm: PermissionKey) => {
          return grantedPermissions.has(`${userId}:${perm}`);
        },
      });

      await assert.rejects(
        () => service.listUsers({}, "user-admin-1"),
        (err: unknown) => {
          assert.ok(err instanceof UserDomainError);
          assert.strictEqual(err.code, "FORBIDDEN");
          assert.strictEqual(err.status, 403);
          return true;
        }
      );
    });

    it("getUserById requires users.view and fails closed when denied", async () => {
      grantedPermissions.delete("user-admin-1:users.view");
      const service = new UserService({
        prisma: mockEnv.mockDb as unknown as PrismaClient,
        hasPermissionFn: async (userId: string, perm: PermissionKey) => {
          return grantedPermissions.has(`${userId}:${perm}`);
        },
      });

      await assert.rejects(
        () => service.getUserById("user-admin-1", "user-admin-1"),
        (err: unknown) => {
          assert.ok(err instanceof UserDomainError);
          assert.strictEqual(err.code, "FORBIDDEN");
          assert.strictEqual(err.status, 403);
          return true;
        }
      );
    });

    it("createUser requires users.manage and prevents DB insertion when denied", async () => {
      grantedPermissions.delete("user-admin-1:users.manage");
      const service = new UserService({
        prisma: mockEnv.mockDb as unknown as PrismaClient,
        hasPermissionFn: async (userId: string, perm: PermissionKey) => {
          return grantedPermissions.has(`${userId}:${perm}`);
        },
      });

      await assert.rejects(
        () =>
          service.createUser(
            {
              email: "newuser@example.com",
              password: "SecurePassword123!",
              displayName: "New User",
            },
            "user-admin-1"
          ),
        (err: unknown) => {
          assert.ok(err instanceof UserDomainError);
          assert.strictEqual(err.code, "FORBIDDEN");
          assert.strictEqual(err.status, 403);
          return true;
        }
      );

      // Verify no user was created in DB
      assert.strictEqual(mockEnv.users.size, 1);
    });

    it("updateUser requires users.manage and prevents mutation when denied", async () => {
      grantedPermissions.delete("user-admin-1:users.manage");
      const service = new UserService({
        prisma: mockEnv.mockDb as unknown as PrismaClient,
        hasPermissionFn: async (userId: string, perm: PermissionKey) => {
          return grantedPermissions.has(`${userId}:${perm}`);
        },
      });

      await assert.rejects(
        () =>
          service.updateUser(
            "user-admin-1",
            { displayName: "Updated Name" },
            "user-admin-1"
          ),
        (err: unknown) => {
          assert.ok(err instanceof UserDomainError);
          assert.strictEqual(err.code, "FORBIDDEN");
          assert.strictEqual(err.status, 403);
          return true;
        }
      );
    });
  });

  // --------------------------------------------------------------------------
  // B. Safe Projection
  // --------------------------------------------------------------------------
  describe("B. Safe Projection", () => {
    it("returns strictly safe fields and filters sensitive fields completely", () => {
      const rawUser = {
        id: "user-target-1",
        email: "target@example.com",
        passwordHash: "$2a$12$supersecretpasswordhashthatmustneverleak",
        totpSecretEncrypted: "enc_totp_secret_12345",
        recoveryCodes: ["code1", "code2"],
        tokenHash: "session_token_hash_abc",
        sessionToken: "raw_token_xyz",
        displayName: "Target User",
        status: "ACTIVE",
        createdAt: new Date("2026-09-27T00:00:00.000Z"),
        updatedAt: new Date("2026-09-27T00:00:00.000Z"),
        roles: [
          { projectId: "proj-1", role: { name: "PROJECT_EDITOR" } },
          { projectId: null, role: { name: "Z_ROLE" } },
          { projectId: null, role: { name: "A_ROLE" } },
        ],
        mfa: { status: "ENABLED" },
      };

      const safe = toSafeUserRecord(rawUser);

      // Verify presence of exact safe fields
      assert.strictEqual(safe.id, "user-target-1");
      assert.strictEqual(safe.email, "target@example.com");
      assert.strictEqual(safe.displayName, "Target User");
      assert.strictEqual(safe.status, "ACTIVE");
      assert.deepStrictEqual(safe.globalRoles, ["A_ROLE", "Z_ROLE"]);
      assert.strictEqual(safe.hasMfa, true);
      assert.strictEqual(safe.createdAt, "2026-09-27T00:00:00.000Z");
      assert.strictEqual(safe.updatedAt, "2026-09-27T00:00:00.000Z");

      // Verify absence of sensitive properties
      const safeObj = safe as unknown as Record<string, unknown>;
      assert.strictEqual(safeObj.passwordHash, undefined);
      assert.strictEqual(safeObj.totpSecretEncrypted, undefined);
      assert.strictEqual(safeObj.recoveryCodes, undefined);
      assert.strictEqual(safeObj.tokenHash, undefined);
      assert.strictEqual(safeObj.sessionToken, undefined);
    });

    it("represents MFA only as boolean and non-enabled state yields false", () => {
      const pendingMfa = toSafeUserRecord({
        id: "u-1",
        email: "u1@example.com",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        mfa: { status: "PENDING" },
      });
      assert.strictEqual(pendingMfa.hasMfa, false);

      const nullMfa = toSafeUserRecord({
        id: "u-2",
        email: "u2@example.com",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        mfa: null,
      });
      assert.strictEqual(nullMfa.hasMfa, false);
    });
  });

  // --------------------------------------------------------------------------
  // C. Listing
  // --------------------------------------------------------------------------
  describe("C. Listing", () => {
    beforeEach(() => {
      // Seed additional users
      mockEnv.users.set("user-2", {
        id: "user-2",
        email: "beta@example.com",
        passwordHash: "hash2",
        displayName: "Beta Tester",
        status: "ACTIVE",
        createdAt: new Date("2026-09-26T12:00:00.000Z"),
        updatedAt: new Date("2026-09-26T12:00:00.000Z"),
      });
      mockEnv.users.set("user-3", {
        id: "user-3",
        email: "gamma@example.com",
        passwordHash: "hash3",
        displayName: "Gamma Disabled",
        status: "DISABLED",
        createdAt: new Date("2026-09-25T12:00:00.000Z"),
        updatedAt: new Date("2026-09-25T12:00:00.000Z"),
      });
    });

    it("paginates and filters by status correctly", async () => {
      const service = new UserService({
        prisma: mockEnv.mockDb as unknown as PrismaClient,
        hasPermissionFn: async () => true,
      });

      const activeOnly = await service.listUsers({ status: "ACTIVE" }, "user-admin-1");
      assert.strictEqual(activeOnly.total, 2);
      assert.strictEqual(activeOnly.items.length, 2);
      assert.ok(activeOnly.items.every((i) => i.status === "ACTIVE"));

      const disabledOnly = await service.listUsers({ status: "DISABLED" }, "user-admin-1");
      assert.strictEqual(disabledOnly.total, 1);
      assert.strictEqual(disabledOnly.items[0].email, "gamma@example.com");
    });

    it("filters deterministically by query across email and displayName", async () => {
      const service = new UserService({
        prisma: mockEnv.mockDb as unknown as PrismaClient,
        hasPermissionFn: async () => true,
      });

      const resByEmail = await service.listUsers({ query: "beta@" }, "user-admin-1");
      assert.strictEqual(resByEmail.items.length, 1);
      assert.strictEqual(resByEmail.items[0].id, "user-2");

      const resByName = await service.listUsers({ query: "Tester" }, "user-admin-1");
      assert.strictEqual(resByName.items.length, 1);
      assert.strictEqual(resByName.items[0].displayName, "Beta Tester");
    });

    it("rejects invalid page and limit inputs with INVALID_INPUT (400)", async () => {
      const service = new UserService({
        prisma: mockEnv.mockDb as unknown as PrismaClient,
        hasPermissionFn: async () => true,
      });

      await assert.rejects(
        () => service.listUsers({ page: 0 }, "user-admin-1"),
        (err: unknown) => (err as UserDomainError).code === "INVALID_INPUT"
      );

      await assert.rejects(
        () => service.listUsers({ limit: -5 }, "user-admin-1"),
        (err: unknown) => (err as UserDomainError).code === "INVALID_INPUT"
      );
    });
  });

  // --------------------------------------------------------------------------
  // D. Create User
  // --------------------------------------------------------------------------
  describe("D. Create User", () => {
    it("creates an ACTIVE user with bcrypt hash and audit log without secret leakage", async () => {
      const service = new UserService({
        prisma: mockEnv.mockDb as unknown as PrismaClient,
        hasPermissionFn: async () => true,
      });

      const rawPass = "VerySecurePassword2026!";
      const created = await service.createUser(
        {
          email: "charlie@example.com",
          password: rawPass,
          displayName: "Charlie Brown",
        },
        "user-admin-1"
      );

      assert.strictEqual(created.email, "charlie@example.com");
      assert.strictEqual(created.displayName, "Charlie Brown");
      assert.strictEqual(created.status, "ACTIVE");

      // Verify DB storage and password hashing
      const inDb = mockEnv.users.get(created.id);
      assert.ok(inDb);
      assert.notStrictEqual(inDb.passwordHash, rawPass);
      const isMatch = await verifyPassword(rawPass, inDb.passwordHash);
      assert.strictEqual(isMatch, true);

      // Verify audit log
      assert.strictEqual(mockEnv.auditLogs.length, 1);
      const audit = mockEnv.auditLogs[0];
      assert.strictEqual(audit.action, "USER_CREATED");
      assert.strictEqual(audit.actorId, "user-admin-1");
      assert.strictEqual(audit.resourceId, created.id);
      assert.strictEqual(audit.metadata.targetUserId, created.id);
      assert.strictEqual(audit.metadata.email, "charlie@example.com");
      assert.strictEqual(audit.metadata.displayName, "Charlie Brown");

      // Invariant: password and passwordHash NEVER enter audit metadata
      assert.strictEqual(audit.metadata.password, undefined);
      assert.strictEqual(audit.metadata.passwordHash, undefined);
    });

    it("duplicate email maps to EMAIL_EXISTS (409)", async () => {
      const service = new UserService({
        prisma: mockEnv.mockDb as unknown as PrismaClient,
        hasPermissionFn: async () => true,
      });

      await assert.rejects(
        () =>
          service.createUser(
            {
              email: "admin@example.com", // Already exists
              password: "SecurePassword123!",
              displayName: "Duplicate Admin",
            },
            "user-admin-1"
          ),
        (err: unknown) => {
          assert.ok(err instanceof UserDomainError);
          assert.strictEqual(err.code, "EMAIL_EXISTS");
          assert.strictEqual(err.status, 409);
          return true;
        }
      );
    });
  });

  // --------------------------------------------------------------------------
  // E. Update Lifecycle
  // --------------------------------------------------------------------------
  describe("E. Update Lifecycle", () => {
    beforeEach(() => {
      mockEnv.users.set("user-target-1", {
        id: "user-target-1",
        email: "target@example.com",
        passwordHash: "$2a$12$hash",
        displayName: "Original Name",
        status: "ACTIVE",
        createdAt: new Date("2026-09-26T00:00:00.000Z"),
        updatedAt: new Date("2026-09-26T00:00:00.000Z"),
      });
    });

    it("allows ACTIVE -> DISABLED transition and revokes target sessions", async () => {
      const service = new UserService({
        prisma: mockEnv.mockDb as unknown as PrismaClient,
        hasPermissionFn: async () => true,
      });

      const updated = await service.updateUser(
        "user-target-1",
        { status: "DISABLED" },
        "user-admin-1"
      );

      assert.strictEqual(updated.status, "DISABLED");
      assert.ok(mockRevokedUserIds.includes("user-target-1"));

      const statusAudit = mockEnv.auditLogs.find((a) => a.action === "USER_STATUS_CHANGED");
      assert.ok(statusAudit);
      assert.strictEqual(statusAudit.metadata.status, "DISABLED");
      assert.strictEqual(statusAudit.metadata.previousStatus, "ACTIVE");
    });

    it("allows DISABLED -> ACTIVE transition and revokes target sessions", async () => {
      mockEnv.users.get("user-target-1")!.status = "DISABLED";

      const service = new UserService({
        prisma: mockEnv.mockDb as unknown as PrismaClient,
        hasPermissionFn: async () => true,
      });

      const updated = await service.updateUser(
        "user-target-1",
        { status: "ACTIVE" },
        "user-admin-1"
      );

      assert.strictEqual(updated.status, "ACTIVE");
      assert.ok(mockRevokedUserIds.includes("user-target-1"));
    });

    it("rejects SUSPENDED as mutation target", async () => {
      const service = new UserService({
        prisma: mockEnv.mockDb as unknown as PrismaClient,
        hasPermissionFn: async () => true,
      });

      await assert.rejects(
        () =>
          service.updateUser(
            "user-target-1",
            { status: "SUSPENDED" as UserStatus },
            "user-admin-1"
          ),
        (err: unknown) => (err as UserDomainError).code === "INVALID_INPUT"
      );
    });

    it("denies self-deactivation with CANNOT_DEACTIVATE_SELF", async () => {
      const service = new UserService({
        prisma: mockEnv.mockDb as unknown as PrismaClient,
        hasPermissionFn: async () => true,
      });

      await assert.rejects(
        () =>
          service.updateUser(
            "user-admin-1",
            { status: "DISABLED" },
            "user-admin-1"
          ),
        (err: unknown) => {
          assert.ok(err instanceof UserDomainError);
          assert.strictEqual(err.code, "CANNOT_DEACTIVATE_SELF");
          return true;
        }
      );
    });

    it("email change revokes target sessions", async () => {
      const service = new UserService({
        prisma: mockEnv.mockDb as unknown as PrismaClient,
        hasPermissionFn: async () => true,
      });

      await service.updateUser(
        "user-target-1",
        { email: "newtarget@example.com" },
        "user-admin-1"
      );

      assert.ok(mockRevokedUserIds.includes("user-target-1"));
    });

    it("displayName-only update does NOT revoke sessions and logs deterministic changedFields", async () => {
      const service = new UserService({
        prisma: mockEnv.mockDb as unknown as PrismaClient,
        hasPermissionFn: async () => true,
      });

      const updated = await service.updateUser(
        "user-target-1",
        { displayName: "Brand New Name" },
        "user-admin-1"
      );

      assert.strictEqual(updated.displayName, "Brand New Name");
      assert.strictEqual(mockRevokedUserIds.length, 0);

      const updateAudit = mockEnv.auditLogs.find((a) => a.action === "USER_UPDATED");
      assert.ok(updateAudit);
      assert.deepStrictEqual(updateAudit.metadata.changedFields, ["displayName"]);
    });
  });

  // --------------------------------------------------------------------------
  // F. Actor/Concurrency Unit Behavior
  // --------------------------------------------------------------------------
  describe("F. Actor/Concurrency Unit Behavior", () => {
    it("re-checks actor ACTIVE inside transaction and fails closed if inactive", async () => {
      mockEnv.users.get("user-admin-1")!.status = "DISABLED";

      const service = new UserService({
        prisma: mockEnv.mockDb as unknown as PrismaClient,
        hasPermissionFn: async () => true,
      });

      await assert.rejects(
        () =>
          service.updateUser(
            "user-admin-1",
            { displayName: "New" },
            "user-admin-1"
          ),
        (err: unknown) => {
          assert.ok(err instanceof UserDomainError);
          assert.strictEqual(err.code, "FORBIDDEN");
          assert.strictEqual(err.status, 403);
          return true;
        }
      );
    });

    it("locks actor and target in deterministic lexicographical order", async () => {
      mockEnv.users.set("user-bbb", {
        id: "user-bbb",
        email: "bbb@example.com",
        passwordHash: "hash",
        displayName: "BBB",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockEnv.users.set("user-aaa", {
        id: "user-aaa",
        email: "aaa@example.com",
        passwordHash: "hash",
        displayName: "AAA",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const service = new UserService({
        prisma: mockEnv.mockDb as unknown as PrismaClient,
        hasPermissionFn: async () => true,
      });

      await service.updateUser("user-aaa", { displayName: "Updated AAA" }, "user-bbb");

      assert.strictEqual(mockEnv.lockedIdsLog.length, 2);
      assert.deepStrictEqual(mockEnv.lockedIdsLog[0], ["user-aaa"]);
      assert.deepStrictEqual(mockEnv.lockedIdsLog[1], ["user-bbb"]);
      const lockedIds = mockEnv.lockedIdsLog.flat();
      assert.deepStrictEqual(lockedIds, ["user-aaa", "user-bbb"]);
    });

    it("locks exactly once when actorId === targetUserId", async () => {
      const service = new UserService({
        prisma: mockEnv.mockDb as unknown as PrismaClient,
        hasPermissionFn: async () => true,
      });

      await service.updateUser("user-admin-1", { displayName: "Self Rename" }, "user-admin-1");

      assert.strictEqual(mockEnv.lockedIdsLog.length, 1);
      const locked = mockEnv.lockedIdsLog[0];
      assert.deepStrictEqual(locked, ["user-admin-1"]);
    });
  });

  // --------------------------------------------------------------------------
  // G. Collection API Handlers
  // --------------------------------------------------------------------------
  describe("G. Collection API Handlers", () => {
    it("GET: unauthenticated returns 401 with no-store header", async () => {
      mockAuthUser = null;
      const req = new NextRequest("http://localhost/api/admin/users", { method: "GET" });
      const res = await listUsersRoute(req);

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.headers.get("Cache-Control"), "no-store");
      const body = await res.json();
      assert.strictEqual(body.error.code, "UNAUTHENTICATED");
    });

    it("GET: malformed page returns 400 INVALID_INPUT", async () => {
      const req = new NextRequest("http://localhost/api/admin/users?page=invalid", { method: "GET" });
      const res = await listUsersRoute(req);

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.headers.get("Cache-Control"), "no-store");
      const body = await res.json();
      assert.strictEqual(body.error.code, "INVALID_INPUT");
    });

    it("GET: malformed status returns 400 INVALID_INPUT", async () => {
      const req = new NextRequest("http://localhost/api/admin/users?status=SUSPENDED", { method: "GET" });
      const res = await listUsersRoute(req);

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error.code, "INVALID_INPUT");
    });

    it("GET: valid request returns 200 with SafeUserRecord projection and no-store", async () => {
      const req = new NextRequest("http://localhost/api/admin/users?page=1&limit=10", { method: "GET" });
      const res = await listUsersRoute(req);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get("Cache-Control"), "no-store");
      const body = await res.json();
      assert.ok(Array.isArray(body.items));
      assert.strictEqual(body.total, 1);
      assert.strictEqual(body.items[0].email, "admin@example.com");
      assert.strictEqual(body.items[0].passwordHash, undefined);
    });

    it("POST: cross-origin request rejected with 403 CSRF_REJECTED", async () => {
      const req = new NextRequest("http://localhost/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://attacker-evil.com",
        },
        body: JSON.stringify({
          email: "csrf@example.com",
          password: "SecurePassword123!",
        }),
      });

      const res = await createUserRoute(req);
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.headers.get("Cache-Control"), "no-store");
      const body = await res.json();
      assert.strictEqual(body.error.code, "CSRF_REJECTED");
    });

    it("POST: invalid input returns 400 INVALID_INPUT", async () => {
      const req = new NextRequest("http://localhost/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({
          email: "not-an-email",
          password: "short",
        }),
      });

      const res = await createUserRoute(req);
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error.code, "INVALID_INPUT");
    });

    it("POST: duplicate email returns 409 EMAIL_EXISTS", async () => {
      const req = new NextRequest("http://localhost/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({
          email: "admin@example.com",
          password: "SecurePassword123!",
        }),
      });

      const res = await createUserRoute(req);
      assert.strictEqual(res.status, 409);
      const body = await res.json();
      assert.strictEqual(body.error.code, "EMAIL_EXISTS");
    });

    it("POST: successful create returns 201 with SafeUserRecord", async () => {
      const req = new NextRequest("http://localhost/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({
          email: "fresh@example.com",
          password: "SecurePassword123!",
          displayName: "Fresh User",
        }),
      });

      const res = await createUserRoute(req);
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.headers.get("Cache-Control"), "no-store");
      const body = await res.json();
      assert.strictEqual(body.email, "fresh@example.com");
      assert.strictEqual(body.status, "ACTIVE");
      assert.strictEqual(body.passwordHash, undefined);
    });
  });

  // --------------------------------------------------------------------------
  // H. Detail API Handlers
  // --------------------------------------------------------------------------
  describe("H. Detail API Handlers", () => {
    beforeEach(() => {
      mockEnv.users.set("user-target-1", {
        id: "user-target-1",
        email: "target@example.com",
        passwordHash: "$2a$12$hash",
        displayName: "Target User",
        status: "ACTIVE",
        createdAt: new Date("2026-09-26T00:00:00.000Z"),
        updatedAt: new Date("2026-09-26T00:00:00.000Z"),
      });
    });

    it("GET: rejects whitespace-padded or malformed userId with 400 INVALID_INPUT", async () => {
      const req = new NextRequest("http://localhost/api/admin/users/bad-id", { method: "GET" });
      const res = await getUserRoute(req, {
        params: Promise.resolve({ userId: " user-target-1 " }),
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error.code, "INVALID_INPUT");
    });

    it("GET: non-existent userId returns 404 NOT_FOUND", async () => {
      const req = new NextRequest("http://localhost/api/admin/users/nonexistent", { method: "GET" });
      const res = await getUserRoute(req, {
        params: Promise.resolve({ userId: "nonexistent" }),
      });

      assert.strictEqual(res.status, 404);
      const body = await res.json();
      assert.strictEqual(body.error.code, "NOT_FOUND");
    });

    it("GET: existing userId returns 200 with SafeUserRecord and no-store", async () => {
      const req = new NextRequest("http://localhost/api/admin/users/user-target-1", { method: "GET" });
      const res = await getUserRoute(req, {
        params: Promise.resolve({ userId: "user-target-1" }),
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get("Cache-Control"), "no-store");
      const body = await res.json();
      assert.strictEqual(body.id, "user-target-1");
      assert.strictEqual(body.email, "target@example.com");
      assert.strictEqual(body.passwordHash, undefined);
    });

    it("PATCH: cross-origin mutation rejected with 403 CSRF_REJECTED", async () => {
      const req = new NextRequest("http://localhost/api/admin/users/user-target-1", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://evil-origin.com",
        },
        body: JSON.stringify({ displayName: "Hacked" }),
      });

      const res = await updateUserRoute(req, {
        params: Promise.resolve({ userId: "user-target-1" }),
      });

      assert.strictEqual(res.status, 403);
      const body = await res.json();
      assert.strictEqual(body.error.code, "CSRF_REJECTED");
    });

    it("PATCH: self-deactivation maps to 409 CANNOT_DEACTIVATE_SELF", async () => {
      const req = new NextRequest("http://localhost/api/admin/users/user-admin-1", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({ status: "DISABLED" }),
      });

      const res = await updateUserRoute(req, {
        params: Promise.resolve({ userId: "user-admin-1" }),
      });

      assert.strictEqual(res.status, 409);
      const body = await res.json();
      assert.strictEqual(body.error.code, "CANNOT_DEACTIVATE_SELF");
    });

    it("PATCH: successful update returns 200 with SafeUserRecord and no-store", async () => {
      const req = new NextRequest("http://localhost/api/admin/users/user-target-1", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({ displayName: "Patched Target" }),
      });

      const res = await updateUserRoute(req, {
        params: Promise.resolve({ userId: "user-target-1" }),
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get("Cache-Control"), "no-store");
      const body = await res.json();
      assert.strictEqual(body.displayName, "Patched Target");
      assert.strictEqual(body.passwordHash, undefined);
    });
  });

  // --------------------------------------------------------------------------
  // I. Error Safety
  // --------------------------------------------------------------------------
  describe("I. Error Safety", () => {
    it("masks unexpected database errors with generic 500 DATABASE_ERROR without leaking internals", async () => {
      const failingDb = {
        user: {
          count: async () => {
            throw new Error("CRITICAL FATAL: SQL syntax error at table users_secret_key");
          },
          findMany: async () => {
            throw new Error("CRITICAL FATAL: SQL syntax error at table users_secret_key");
          },
        },
      };

      const failingService = new UserService({
        prisma: failingDb as unknown as PrismaClient,
        hasPermissionFn: async () => true,
      });
      setUserServiceForTesting(failingService);

      const req = new NextRequest("http://localhost/api/admin/users", { method: "GET" });
      const res = await listUsersRoute(req);

      assert.strictEqual(res.status, 500);
      assert.strictEqual(res.headers.get("Cache-Control"), "no-store");
      const body = await res.json();
      assert.strictEqual(body.error.code, "DATABASE_ERROR");
      assert.strictEqual(body.error.message, "A database error occurred");

      // Verify no leak of table or SQL text
      const rawText = JSON.stringify(body);
      assert.strictEqual(rawText.includes("users_secret_key"), false);
      assert.strictEqual(rawText.includes("SQL"), false);
    });
  });
});
