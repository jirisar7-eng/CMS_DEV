import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { UserService, UserDomainError } from "@/lib/domain/users/service";
import type { PermissionKey } from "@/lib/auth/rbac";
import type { SafeUserRecord } from "@/lib/domain/users/types";

describe("PostgreSQL Integration: User Lifecycle & Concurrency (SYN-USERS-001)", () => {
  let prisma: PrismaClient;
  let service: UserService;
  const runId = `test-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const createdUserIds = new Set<string>();
  const authorizedAdmins = new Set<string>();

  const hasPermissionFn = async (
    userId: string,
    permissionKey: PermissionKey,
    _projectId?: string | null
  ): Promise<boolean> => {
    if (!authorizedAdmins.has(userId)) return false;
    return permissionKey === "users.view" || permissionKey === "users.manage";
  };

  async function createTestUser(data: {
    id: string;
    email: string;
    displayName?: string;
    status?: string;
  }) {
    createdUserIds.add(data.id);
    return await prisma.user.create({
      data: {
        id: data.id,
        email: data.email,
        displayName: data.displayName ?? "Lifecycle Test User",
        passwordHash: "test-hash-non-authenticating",
        status: data.status ?? "ACTIVE",
      },
    });
  }

  async function createTestSession(userId: string) {
    const sessionId = `sess-${crypto.randomUUID()}`;
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    return await prisma.session.create({
      data: {
        id: sessionId,
        userId,
        tokenHash,
        expiresAt,
        idleExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        lastSeenAt: now,
        revokedAt: null,
      },
    });
  }

  before(async () => {
    if (!process.env.DATABASE_URL) {
      console.log("Skipping PostgreSQL user lifecycle tests: DATABASE_URL is not set");
      return;
    }
    prisma = new PrismaClient();
    service = new UserService({ prisma, hasPermissionFn });
  });

  after(async () => {
    if (!prisma) return;
    try {
      const ids = Array.from(createdUserIds);
      if (ids.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            OR: [
              { actorId: { in: ids } },
              { resourceId: { in: ids } },
            ],
          },
        });
        await prisma.session.deleteMany({
          where: { userId: { in: ids } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: ids } },
        });
      }
    } catch (cleanupErr) {
      console.error("[PostgreSQL User Lifecycle] Cleanup error:", cleanupErr);
    } finally {
      await prisma.$disconnect();
    }
  });

  it("1 & 2. REAL STATUS LIFECYCLE & SESSION REVOCATION: ACTIVE -> DISABLED and DISABLED -> ACTIVE", async () => {
    if (!process.env.DATABASE_URL) return;

    const admin = await createTestUser({
      id: `admin-lc-${runId}-1`,
      email: `admin-lc-${runId}-1@example.com`,
      displayName: "Lifecycle Admin",
      status: "ACTIVE",
    });
    authorizedAdmins.add(admin.id);

    const target = await createTestUser({
      id: `target-lc-${runId}-1`,
      email: `target-lc-${runId}-1@example.com`,
      displayName: "Target User",
      status: "ACTIVE",
    });

    // Create at least two real sessions for the target prior to deactivation
    const session1 = await createTestSession(target.id);
    const session2 = await createTestSession(target.id);
    assert.strictEqual(session1.revokedAt, null);
    assert.strictEqual(session2.revokedAt, null);

    // Transition: ACTIVE -> DISABLED
    const disabledResult = await service.updateUser(
      target.id,
      { status: "DISABLED" },
      admin.id
    );

    // Assert SafeUserRecord and persisted User
    assert.strictEqual(disabledResult.status, "DISABLED");
    const persistedAfterDisable = await prisma.user.findUnique({
      where: { id: target.id },
    });
    assert.ok(persistedAfterDisable);
    assert.strictEqual(persistedAfterDisable.status, "DISABLED");

    // Assert audit log for deactivation
    const auditLogsAfterDisable = await prisma.auditLog.findMany({
      where: {
        resourceId: target.id,
        action: "USER_STATUS_CHANGED",
      },
      orderBy: { createdAt: "asc" },
    });
    assert.strictEqual(auditLogsAfterDisable.length, 1);
    const metaDisable = auditLogsAfterDisable[0].metadata as {
      previousStatus?: string;
      status?: string;
      targetUserId?: string;
    } | null;
    assert.ok(metaDisable);
    assert.strictEqual(metaDisable.previousStatus, "ACTIVE");
    assert.strictEqual(metaDisable.status, "DISABLED");
    assert.strictEqual(metaDisable.targetUserId, target.id);

    // Assert all target sessions are revoked
    const targetSessionsAfterDisable = await prisma.session.findMany({
      where: { userId: target.id },
    });
    assert.strictEqual(targetSessionsAfterDisable.length, 2);
    for (const sess of targetSessionsAfterDisable) {
      assert.ok(sess.revokedAt !== null, `Session ${sess.id} must be revoked`);
    }

    // Transition: DISABLED -> ACTIVE
    const reactivatedResult = await service.updateUser(
      target.id,
      { status: "ACTIVE" },
      admin.id
    );

    // Assert SafeUserRecord and persisted User
    assert.strictEqual(reactivatedResult.status, "ACTIVE");
    const persistedAfterReactivate = await prisma.user.findUnique({
      where: { id: target.id },
    });
    assert.ok(persistedAfterReactivate);
    assert.strictEqual(persistedAfterReactivate.status, "ACTIVE");

    // Assert audit logs
    const auditLogsAfterReactivate = await prisma.auditLog.findMany({
      where: {
        resourceId: target.id,
        action: "USER_STATUS_CHANGED",
      },
      orderBy: { createdAt: "asc" },
    });
    assert.strictEqual(auditLogsAfterReactivate.length, 2);
    const metaReactivate = auditLogsAfterReactivate[1].metadata as {
      previousStatus?: string;
      status?: string;
      targetUserId?: string;
    } | null;
    assert.ok(metaReactivate);
    assert.strictEqual(metaReactivate.previousStatus, "DISABLED");
    assert.strictEqual(metaReactivate.status, "ACTIVE");
    assert.strictEqual(metaReactivate.targetUserId, target.id);
  });

  it("3. EMAIL CHANGE SESSION REVOCATION: revokes sessions and logs audit without credential exposure", async () => {
    if (!process.env.DATABASE_URL) return;

    const admin = await createTestUser({
      id: `admin-email-${runId}`,
      email: `admin-email-${runId}@example.com`,
      displayName: "Email Admin",
      status: "ACTIVE",
    });
    authorizedAdmins.add(admin.id);

    const target = await createTestUser({
      id: `target-email-${runId}`,
      email: `target-old-email-${runId}@example.com`,
      displayName: "Target User Email",
      status: "ACTIVE",
    });

    // Create fresh target sessions
    const sessA = await createTestSession(target.id);
    const sessB = await createTestSession(target.id);
    assert.strictEqual(sessA.revokedAt, null);
    assert.strictEqual(sessB.revokedAt, null);

    const newEmail = `target-new-email-${runId}@example.com`;
    const updateResult = await service.updateUser(
      target.id,
      { email: newEmail },
      admin.id
    );

    // Assert persisted email changed
    assert.strictEqual(updateResult.email, newEmail);
    const persistedUser = await prisma.user.findUnique({
      where: { id: target.id },
    });
    assert.ok(persistedUser);
    assert.strictEqual(persistedUser.email, newEmail);

    // Assert target sessions are revoked
    const targetSessions = await prisma.session.findMany({
      where: { userId: target.id },
    });
    assert.strictEqual(targetSessions.length, 2);
    for (const sess of targetSessions) {
      assert.ok(sess.revokedAt !== null, `Session ${sess.id} must be revoked upon email change`);
    }

    // Assert USER_UPDATED audit contains changedFields including exactly email
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        resourceId: target.id,
        action: "USER_UPDATED",
      },
    });
    assert.strictEqual(auditLogs.length, 1);
    const meta = auditLogs[0].metadata as {
      targetUserId?: string;
      changedFields?: string[];
      [key: string]: unknown;
    } | null;
    assert.ok(meta);
    assert.deepStrictEqual(meta.changedFields, ["email"]);

    // Verify audit metadata contains no password, hash, token, session token, MFA secret
    const metaStr = JSON.stringify(meta).toLowerCase();
    assert.ok(!metaStr.includes("password"), "Metadata must not contain password");
    assert.ok(!metaStr.includes("passwordhash"), "Metadata must not contain password hash");
    assert.ok(!metaStr.includes("sessiontoken"), "Metadata must not contain session token");
    assert.ok(!metaStr.includes("secret"), "Metadata must not contain secret");
  });

  it("4. DISPLAY-NAME-ONLY DOES NOT REVOKE SESSIONS: preserves active sessions", async () => {
    if (!process.env.DATABASE_URL) return;

    const admin = await createTestUser({
      id: `admin-name-${runId}`,
      email: `admin-name-${runId}@example.com`,
      displayName: "Name Admin",
      status: "ACTIVE",
    });
    authorizedAdmins.add(admin.id);

    const target = await createTestUser({
      id: `target-name-${runId}`,
      email: `target-name-${runId}@example.com`,
      displayName: "Old Display Name",
      status: "ACTIVE",
    });

    const activeSession = await createTestSession(target.id);
    assert.strictEqual(activeSession.revokedAt, null);

    const updatedResult = await service.updateUser(
      target.id,
      { displayName: "New Display Name" },
      admin.id
    );

    // Assert displayName persisted
    assert.strictEqual(updatedResult.displayName, "New Display Name");
    const persisted = await prisma.user.findUnique({
      where: { id: target.id },
    });
    assert.ok(persisted);
    assert.strictEqual(persisted.displayName, "New Display Name");

    // Assert session revokedAt remains null
    const sessionAfter = await prisma.session.findUnique({
      where: { id: activeSession.id },
    });
    assert.ok(sessionAfter);
    assert.strictEqual(sessionAfter.revokedAt, null, "Session revokedAt must remain null on displayName change");

    // Assert USER_UPDATED changedFields is exactly ["displayName"]
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        resourceId: target.id,
        action: "USER_UPDATED",
      },
    });
    assert.strictEqual(auditLogs.length, 1);
    const meta = auditLogs[0].metadata as {
      targetUserId?: string;
      changedFields?: string[];
      [key: string]: unknown;
    } | null;
    assert.ok(meta);
    assert.deepStrictEqual(meta.changedFields, ["displayName"]);
  });

  it("5. SUSPENDED LEGACY STATE: read projection allowed, lifecycle mutation fails closed with 409", async () => {
    if (!process.env.DATABASE_URL) return;

    const admin = await createTestUser({
      id: `admin-susp-${runId}`,
      email: `admin-susp-${runId}@example.com`,
      displayName: "Suspended Admin",
      status: "ACTIVE",
    });
    authorizedAdmins.add(admin.id);

    // Create a target user directly in PostgreSQL with status SUSPENDED
    const suspendedTarget = await createTestUser({
      id: `target-susp-${runId}`,
      email: `target-susp-${runId}@example.com`,
      displayName: "Suspended User",
      status: "SUSPENDED",
    });

    // Verify read projection is allowed
    const safeUser = await service.getUserById(suspendedTarget.id, admin.id);
    assert.strictEqual(safeUser.id, suspendedTarget.id);
    assert.strictEqual(safeUser.status, "SUSPENDED");

    // Attempt lifecycle mutation through UserService: must fail closed with INVALID_USER_STATE (409)
    await assert.rejects(
      async () => {
        await service.updateUser(
          suspendedTarget.id,
          { status: "ACTIVE" },
          admin.id
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof UserDomainError);
        assert.strictEqual(err.code, "INVALID_USER_STATE");
        assert.strictEqual(err.status, 409);
        return true;
      }
    );

    // Verify persisted status is still SUSPENDED
    const persisted = await prisma.user.findUnique({
      where: { id: suspendedTarget.id },
    });
    assert.ok(persisted);
    assert.strictEqual(persisted.status, "SUSPENDED");
  });

  it("6. CROSS-ADMIN DEACTIVATION CONCURRENCY: race between two admins deactivating each other", async () => {
    if (!process.env.DATABASE_URL) return;

    const adminA = await createTestUser({
      id: `admin-race-a-${runId}`,
      email: `admin-race-a-${runId}@example.com`,
      displayName: "Race Admin A",
      status: "ACTIVE",
    });
    const adminB = await createTestUser({
      id: `admin-race-b-${runId}`,
      email: `admin-race-b-${runId}@example.com`,
      displayName: "Race Admin B",
      status: "ACTIVE",
    });

    authorizedAdmins.add(adminA.id);
    authorizedAdmins.add(adminB.id);

    // Run concurrently:
    // adminA disables adminB
    // adminB disables adminA
    const results = await Promise.allSettled([
      service.updateUser(adminB.id, { status: "DISABLED" }, adminA.id),
      service.updateUser(adminA.id, { status: "DISABLED" }, adminB.id),
    ]);

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<SafeUserRecord> => r.status === "fulfilled"
    );
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );

    assert.strictEqual(fulfilled.length, 1, "Exactly one deactivation operation must succeed");
    assert.strictEqual(rejected.length, 1, "Exactly one deactivation operation must fail");

    const failedReason = rejected[0].reason;
    assert.ok(
      failedReason instanceof UserDomainError,
      `Rejected reason must be UserDomainError, got: ${failedReason}`
    );
    assert.strictEqual(
      (failedReason as UserDomainError).code,
      "FORBIDDEN",
      "Failed operation must be UserDomainError with code FORBIDDEN"
    );
    assert.strictEqual(
      (failedReason as UserDomainError).status,
      403,
      "Failed operation HTTP status must be 403"
    );

    // Verify final persisted state: exactly one ACTIVE admin and one DISABLED admin
    const userA = await prisma.user.findUnique({ where: { id: adminA.id } });
    const userB = await prisma.user.findUnique({ where: { id: adminB.id } });
    assert.ok(userA);
    assert.ok(userB);

    const statuses = [userA.status, userB.status].sort();
    assert.deepStrictEqual(
      statuses,
      ["ACTIVE", "DISABLED"],
      "Final state must contain exactly one ACTIVE admin and one DISABLED admin (never both DISABLED)"
    );

    // Exactly one USER_STATUS_CHANGED audit event was committed for this race
    const raceAuditLogs = await prisma.auditLog.findMany({
      where: {
        action: "USER_STATUS_CHANGED",
        resourceId: { in: [adminA.id, adminB.id] },
      },
    });
    assert.strictEqual(
      raceAuditLogs.length,
      1,
      "Exactly one USER_STATUS_CHANGED audit log must be committed for the race"
    );
  });
});
