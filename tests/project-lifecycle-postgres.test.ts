// @ts-nocheck
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { ProjectService } from "../lib/domain/projects/service";

describe("PostgreSQL Real Integration - SYN-PROJECTS-002 Project Lifecycle", () => {
  let prisma: PrismaClient;
  let service: ProjectService;
  const timestamp = Date.now();
  const testUserId = `proj-test-user-${timestamp}`;
  let createdProjectId: string;
  const projectKey = `postgres-proj-${timestamp}`;

  before(async () => {
    if (!process.env.DATABASE_URL) {
      console.log("Skipping PostgreSQL tests: DATABASE_URL is not set");
      return;
    }
    prisma = new PrismaClient();
    service = new ProjectService({ prisma });

    try {
      await prisma.user.create({
        data: {
          id: testUserId,
          email: `${testUserId}@example.com`,
          displayName: "Project Test User",
          status: "ACTIVE",
        },
      });
    } catch {
      // User table structure or already exists
    }
  });

  after(async () => {
    if (!prisma) return;
    try {
      if (createdProjectId) {
        await prisma.auditLog.deleteMany({
          where: { resourceId: createdProjectId },
        });
        await prisma.page.deleteMany({
          where: { projectId: createdProjectId },
        });
        await prisma.project.delete({
          where: { id: createdProjectId },
        }).catch(() => {});
      }
      await prisma.user.delete({
        where: { id: testUserId },
      }).catch(() => {});
    } catch {
      // Best effort cleanup
    } finally {
      await prisma.$disconnect();
    }
  });

  it("creates project and commits PROJECT_CREATED audit log atomically in PostgreSQL", async (t) => {
    if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL not set");

    const project = await service.createProject(
      { name: "Postgres Test Project", key: projectKey },
      testUserId
    );
    createdProjectId = project.id;

    assert.ok(project.id);
    assert.strictEqual(project.key, projectKey);
    assert.strictEqual(project.status, "ACTIVE");

    const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
    assert.ok(dbProject);
    assert.strictEqual(dbProject.status, "ACTIVE");

    const auditLogs = await prisma.auditLog.findMany({
      where: { resourceId: project.id, action: "PROJECT_CREATED" },
    });
    assert.strictEqual(auditLogs.length, 1);
    assert.strictEqual(auditLogs[0].scopeType, "SYSTEM");
    assert.strictEqual(auditLogs[0].actorId, testUserId);
    assert.strictEqual((auditLogs[0].metadata as any)?.key, projectKey);
  });

  it("enforces PostgreSQL UNIQUE constraint on Project.key and prevents collision", async (t) => {
    if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL not set");

    await assert.rejects(
      () =>
        service.createProject(
          { name: "Duplicate Key Project", key: projectKey },
          testUserId
        ),
      (err: any) => err.code === "KEY_COLLISION" && err.status === 409
    );
  });

  it("renames project and commits PROJECT_UPDATED audit log atomically", async (t) => {
    if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL not set");

    const renamed = await service.renameProject(
      createdProjectId,
      "Postgres Test Project Renamed",
      testUserId
    );
    assert.strictEqual(renamed.name, "Postgres Test Project Renamed");
    assert.strictEqual(renamed.key, projectKey);

    const dbProject = await prisma.project.findUnique({ where: { id: createdProjectId } });
    assert.strictEqual(dbProject.name, "Postgres Test Project Renamed");

    const auditLogs = await prisma.auditLog.findMany({
      where: { resourceId: createdProjectId, action: "PROJECT_UPDATED" },
    });
    assert.strictEqual(auditLogs.length, 1);
    assert.strictEqual(auditLogs[0].scopeType, "PROJECT");
    assert.strictEqual(auditLogs[0].scopeId, createdProjectId);
    assert.strictEqual((auditLogs[0].metadata as any)?.name, "Postgres Test Project Renamed");
  });

  it("archives project, preserves dependent data, and logs PROJECT_ARCHIVED audit atomically", async (t) => {
    if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL not set");

    const page = await prisma.page.create({
      data: {
        projectId: createdProjectId,
        key: `page-${timestamp}`,
      },
    });

    const archived = await service.archiveProject(createdProjectId, testUserId);
    assert.strictEqual(archived.status, "ARCHIVED");

    const dbProject = await prisma.project.findUnique({ where: { id: createdProjectId } });
    assert.strictEqual(dbProject.status, "ARCHIVED");

    const dbPage = await prisma.page.findUnique({ where: { id: page.id } });
    assert.ok(dbPage, "Dependent page must survive project archival");
    assert.strictEqual(dbPage.projectId, createdProjectId);

    const auditLogs = await prisma.auditLog.findMany({
      where: { resourceId: createdProjectId, action: "PROJECT_ARCHIVED" },
    });
    assert.strictEqual(auditLogs.length, 1);
    assert.strictEqual(auditLogs[0].scopeType, "PROJECT");
    assert.strictEqual(auditLogs[0].scopeId, createdProjectId);
    assert.strictEqual((auditLogs[0].metadata as any)?.status, "ARCHIVED");
  });

  it("prevents repeated archive on already archived project", async (t) => {
    if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL not set");

    await assert.rejects(
      () => service.archiveProject(createdProjectId, testUserId),
      (err: any) => err.code === "INVALID_LIFECYCLE_STATE" && err.status === 409
    );
  });
});
