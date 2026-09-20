import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/db";
import { AuditService } from "../lib/domain/audit";
import { logAudit } from "../lib/auth/audit";

describe("PostgreSQL Integration: Audit Admin Viewer & Isolation", () => {
  const timestamp = Date.now();
  const testUserId = `audit-test-user-${timestamp}`;
  const testUserGlobalId = `audit-test-global-user-${timestamp}`;
  const testUnauthorizedUserId = `audit-test-unauth-${timestamp}`;

  const projectAId = `proj-audit-a-${timestamp}`;
  const projectBId = `proj-audit-b-${timestamp}`;

  before(async () => {
    // 1. Create test projects
    await prisma.project.createMany({
      data: [
        { id: projectAId, name: "Project Audit A", key: `audit-a-${timestamp}`, status: "ACTIVE" },
        { id: projectBId, name: "Project Audit B", key: `audit-b-${timestamp}`, status: "ACTIVE" },
      ],
    });

    // 2. Create test users with passwordHash and displayName
    await prisma.user.createMany({
      data: [
        { id: testUserId, email: `audit-user-${timestamp}@example.com`, displayName: "Project Auditor", passwordHash: "dummyhash", status: "ACTIVE" },
        { id: testUserGlobalId, email: `global-audit-${timestamp}@example.com`, displayName: "Global Auditor", passwordHash: "dummyhash", status: "ACTIVE" },
        { id: testUnauthorizedUserId, email: `unauth-${timestamp}@example.com`, displayName: "Unauthorized User", passwordHash: "dummyhash", status: "ACTIVE" },
      ],
    });

    // 3. Ensure audit.view permission exists
    let perm = await prisma.permission.findUnique({ where: { key: "audit.view" } });
    if (!perm) {
      perm = await prisma.permission.create({
        data: {
          key: "audit.view",
          description: "Read permission for audit logs",
        },
      });
    }

    // 4. Assign project-scoped permission override to testUserId for Project A
    await prisma.userPermissionOverride.create({
      data: {
        userId: testUserId,
        permissionId: perm.id,
        projectId: projectAId,
        isGranted: true,
      },
    });

    // 5. Assign global permission override to testUserGlobalId (projectId: null)
    await prisma.userPermissionOverride.create({
      data: {
        userId: testUserGlobalId,
        permissionId: perm.id,
        projectId: null,
        isGranted: true,
      },
    });

    // 6. Seed audit records in Project A, Project B, and SYSTEM scope
    await prisma.auditLog.create({
      data: {
        action: "CONTENT_PAGE_CREATED",
        scopeType: "PROJECT",
        scopeId: projectAId,
        resourceType: "PAGE",
        resourceId: "page-a-1",
        actorId: testUserId,
        metadata: { pageTitle: "Page A1", secret: "do_not_leak", token: "secret_token_123" },
      },
    });

    await logAudit({
      action: "CONTENT_RELEASE_PUBLISHED",
      scopeType: "PROJECT",
      scopeId: projectAId,
      resourceType: "RELEASE",
      resourceId: "rel-a-1",
      actorId: testUserId,
      metadata: { releaseVersion: "v1.0" },
    });

    await logAudit({
      action: "BRAND_PUBLISHED",
      scopeType: "PROJECT",
      scopeId: projectBId,
      resourceType: "BRAND",
      resourceId: "brand-b-1",
      actorId: testUserId,
      metadata: { theme: "Dark" },
    });

    await logAudit({
      action: "AUTH_LOGIN_SUCCESS",
      scopeType: "SYSTEM",
      scopeId: null,
      resourceType: "USER",
      resourceId: testUserId,
      actorId: testUserId,
      metadata: { ip: "127.0.0.1", token: "jwt_token_to_redact" },
    });
  });

  after(async () => {
    try {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { scopeId: projectAId },
            { scopeId: projectBId },
            { actorId: testUserId },
            { actorId: testUserGlobalId },
          ],
        },
      });
      await prisma.userPermissionOverride.deleteMany({
        where: { userId: { in: [testUserId, testUserGlobalId, testUnauthorizedUserId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [testUserId, testUserGlobalId, testUnauthorizedUserId] } },
      });
      await prisma.project.deleteMany({
        where: { id: { in: [projectAId, projectBId] } },
      });
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }
  });

  it("enforces strict project isolation (Project A reader sees only Project A logs)", async () => {
    const service = new AuditService();
    const res = await service.listAuditLogs({ projectId: projectAId }, testUserId);

    assert.ok(res.items.length >= 2, "Must find at least 2 logs for Project A");
    for (const item of res.items) {
      assert.equal(item.scopeType, "PROJECT");
      assert.equal(item.scopeId, projectAId);
    }
  });

  it("denies access to Project B logs for a user who only has Project A permission", async () => {
    const service = new AuditService();
    await assert.rejects(
      async () => {
        await service.listAuditLogs({ projectId: projectBId }, testUserId);
      },
      (err: unknown) => {
        if (typeof err === "object" && err !== null && "code" in err && "status" in err) {
          const e = err as { code: string; status: number };
          assert.equal(e.code, "FORBIDDEN");
          assert.equal(e.status, 403);
          return true;
        }
        return false;
      }
    );
  });

  it("denies access to system logs for project-scoped user", async () => {
    const service = new AuditService();
    await assert.rejects(
      async () => {
        await service.listAuditLogs({ scopeType: "SYSTEM" }, testUserId);
      },
      (err: unknown) => {
        if (typeof err === "object" && err !== null && "code" in err && "status" in err) {
          const e = err as { code: string; status: number };
          assert.equal(e.code, "FORBIDDEN");
          assert.equal(e.status, 403);
          return true;
        }
        return false;
      }
    );
  });

  it("allows global auditor to read system logs and project logs", async () => {
    const service = new AuditService();

    // System logs
    const sysRes = await service.listAuditLogs({ scopeType: "SYSTEM" }, testUserGlobalId);
    assert.ok(sysRes.items.length >= 1, "Must find system logs");
    assert.ok(sysRes.items.some(i => i.action === "AUTH_LOGIN_SUCCESS"));

    // Project B logs
    const projBRes = await service.listAuditLogs({ projectId: projectBId }, testUserGlobalId);
    assert.ok(projBRes.items.length >= 1, "Must find Project B logs");
    assert.equal(projBRes.items[0].scopeId, projectBId);
  });

  it("sanitizes metadata in real query responses (redacts secrets & tokens)", async () => {
    const service = new AuditService();
    const res = await service.listAuditLogs({ projectId: projectAId, action: "CONTENT_PAGE_CREATED" }, testUserId);

    assert.ok(res.items.length >= 1);
    const item = res.items[0];
    assert.equal(item.metadata?.pageTitle, "Page A1");
    assert.equal(item.metadata?.secret, "[REDACTED]");
  });

  it("correctly handles deterministic pagination and filtering", async () => {
    const service = new AuditService();
    const res = await service.listAuditLogs({ projectId: projectAId, limit: 1, page: 1 }, testUserId);

    assert.equal(res.items.length, 1);
    assert.equal(res.limit, 1);
    assert.equal(res.page, 1);
    assert.ok(res.total >= 2);
    assert.equal(res.hasMore, true);
  });
});
