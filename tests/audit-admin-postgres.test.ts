// @ts-nocheck
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/db";
import { AuditService } from "../lib/domain/audit";
import { logAudit } from "../lib/auth/audit";

describe("PostgreSQL Integration: Audit Admin Viewer & Isolation", () => {
  const timestamp = Date.now();
  const testUserId = "audit-test-user-" + timestamp;
  const testUserGlobalId = "audit-test-global-user-" + timestamp;
  const testUnauthorizedUserId = "audit-test-unauth-" + timestamp;
  const projectAId = "proj-audit-a-" + timestamp;
  const projectBId = "proj-audit-b-" + timestamp;
  const inactiveProjectId = "proj-audit-inactive-" + timestamp;

  before(async () => {
    // 1. Create test projects (active & inactive)
    await prisma.project.createMany({
      data: [
        { id: projectAId, name: "Project Audit A", key: "audit-a-" + timestamp, status: "ACTIVE" },
        { id: projectBId, name: "Project Audit B", key: "audit-b-" + timestamp, status: "ACTIVE" },
        { id: inactiveProjectId, name: "Project Inactive", key: "audit-inact-" + timestamp, status: "ARCHIVED" },
      ],
    });

    // 2. Create test users with passwordHash and displayName
    await prisma.user.createMany({
      data: [
        { id: testUserId, email: "audit-user-" + timestamp + "@example.com", displayName: "Project Auditor", passwordHash: "dummyhash", status: "ACTIVE" },
        { id: testUserGlobalId, email: "global-audit-" + timestamp + "@example.com", displayName: "Global Auditor", passwordHash: "dummyhash", status: "ACTIVE" },
        { id: testUnauthorizedUserId, email: "unauth-" + timestamp + "@example.com", displayName: "Unauthorized User", passwordHash: "dummyhash", status: "ACTIVE" },
      ],
    });

    // 3. Ensure audit.view, admin.access, and projects.view permissions exist
    const permsToEnsure = ["audit.view", "admin.access", "projects.view"];
    const permMap: Record<string, string> = {};
    for (const pKey of permsToEnsure) {
      let perm = await prisma.permission.findUnique({ where: { key: pKey } });
      if (!perm) {
        perm = await prisma.permission.create({
          data: {
            key: pKey,
            description: "Permission for " + pKey,
          },
        });
      }
      permMap[pKey] = perm.id;
    }

    // 4. Assign permissions to testUserId for Project A
    for (const pKey of ["audit.view", "admin.access", "projects.view"]) {
      await prisma.userPermissionOverride.create({
        data: {
          userId: testUserId,
          permissionId: permMap[pKey],
          projectId: projectAId,
          isGranted: true,
        },
      });
    }

    // 5. Assign global permissions to testUserGlobalId (projectId: null)
    for (const pKey of ["audit.view", "admin.access", "projects.view"]) {
      await prisma.userPermissionOverride.create({
        data: {
          userId: testUserGlobalId,
          permissionId: permMap[pKey],
          projectId: null,
          isGranted: true,
        },
      });
    }

    // 6. Seed audit records in Project A, Project B, and SYSTEM scope
    await prisma.auditLog.create({
      data: {
        action: "CONTENT_PAGE_CREATED",
        scopeType: "PROJECT",
        scopeId: projectAId,
        resourceType: "PAGE",
        resourceId: "page-a-1",
        actorId: testUserId,
        metadata: {
          pageId: "page-a-1",
          pageTitle: "Page A1",
          revisionNumber: 1,
          secret: "do_not_leak_secret",
          token: "secret_token_123",
          access_token: "sensitive_oauth_token",
          passwordHash: "hash_to_omit",
          nestedUnsafe: { foo: "bar" },
        },
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

    await logAudit({
      action: "CONTENT_DRAFT_UPDATED",
      scopeType: "PROJECT",
      scopeId: projectAId,
      resourceType: "PAGE",
      resourceId: "page-a-1",
      actorId: testUserId,
      metadata: {
        pageId: "page-a-1",
        revisionNumber: 2,
        lockVersion: 1,
        note: "Sensitive unredacted draft memo",
        changedFields: ["title", "body"],
      },
    });

    await logAudit({
      action: "UNKNOWN_CUSTOM_EVENT",
      scopeType: "PROJECT",
      scopeId: projectAId,
      resourceType: "CUSTOM",
      resourceId: "custom-1",
      actorId: testUserId,
      metadata: {
        freeText: "some unvalidated free text",
        note: "untracked note",
      },
    });
  });

  after(async () => {
    try {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { scopeId: projectAId },
            { scopeId: projectBId },
            { scopeId: inactiveProjectId },
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
        where: { id: { in: [projectAId, projectBId, inactiveProjectId] } },
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
    const sysRes = await service.listAuditLogs({ scopeType: "SYSTEM" }, testUserGlobalId);
    assert.ok(sysRes.items.length >= 1, "Must find system logs");
    assert.ok(sysRes.items.some(i => i.action === "AUTH_LOGIN_SUCCESS"));

    const projBRes = await service.listAuditLogs({ projectId: projectBId }, testUserGlobalId);
    assert.ok(projBRes.items.length >= 1, "Must find Project B logs");
    assert.equal(projBRes.items[0].scopeId, projectBId);
  });

  it("sanitizes metadata in real query responses using explicit allowlist (omits secret, access_token, passwordHash)", async () => {
    const service = new AuditService();
    const res = await service.listAuditLogs({ projectId: projectAId, action: "CONTENT_PAGE_CREATED" }, testUserId);
    assert.ok(res.items.length >= 1);
    const item = res.items[0];
    assert.ok(item.metadata, "Metadata must be present");
    assert.equal(item.metadata.pageTitle, "Page A1");
    assert.equal(item.metadata.revisionNumber, 1);
    // Non-allowlisted fields omitted
    assert.equal(item.metadata.secret, undefined);
    assert.equal(item.metadata.token, undefined);
    assert.equal(item.metadata.access_token, undefined);
    assert.equal(item.metadata.passwordHash, undefined);
    assert.equal(item.metadata.nestedUnsafe, undefined);

    // Omission of free-text note in CONTENT_DRAFT_UPDATED
    const draftRes = await service.listAuditLogs({ projectId: projectAId, action: "CONTENT_DRAFT_UPDATED" }, testUserId);
    assert.ok(draftRes.items.length >= 1);
    const draftItem = draftRes.items[0];
    assert.ok(draftItem.metadata);
    assert.equal(draftItem.metadata.pageId, "page-a-1");
    assert.equal(draftItem.metadata.revisionNumber, 2);
    assert.equal(draftItem.metadata.lockVersion, 1);
    assert.deepEqual(draftItem.metadata.changedFields, ["title", "body"]);
    assert.equal(draftItem.metadata.note, undefined, "Unrestricted note must be omitted");

    // Complete omission of metadata for unknown events
    const unknownRes = await service.listAuditLogs({ projectId: projectAId, action: "UNKNOWN_CUSTOM_EVENT" }, testUserId);
    assert.ok(unknownRes.items.length >= 1);
    const unknownItem = unknownRes.items[0];
    assert.equal(unknownItem.metadata, null, "Unknown event type must project metadata to null");
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
