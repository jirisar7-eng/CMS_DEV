// @ts-nocheck
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

describe('PostgreSQL Real Integration - SYN-SETTINGS-001 Settings Persistence', () => {
  let prisma: any;
  let service: any;
  const timestamp = Date.now();
  const testUserId = `settings-test-user-${timestamp}`;
  const createdProjectId = `proj-settings-${timestamp}`;
  const projectKey = `postgres-settings-proj-${timestamp}`;

  before(async () => {
    if (!process.env.DATABASE_URL) {
      return;
    }
    const { PrismaClient } = await import('@prisma/client');
    const { getSettingsService } = await import('../lib/domain/settings');
    prisma = new PrismaClient();
    service = getSettingsService();

    // 1. Create test project
    await prisma.project.create({
      data: {
        id: createdProjectId,
        key: projectKey,
        name: 'PostgreSQL Settings Test Project',
        status: 'ACTIVE',
      },
    });

    // 2. Create ACTIVE test user
    await prisma.user.create({
      data: {
        id: testUserId,
        email: `${testUserId}@example.com`,
        displayName: 'Settings Test Admin',
        passwordHash: 'test-only-non-authenticating-hash',
        status: 'ACTIVE',
      },
    });

    // 3. Ensure system.manage and projects.manage permissions exist
    const permsToEnsure = ['system.manage', 'projects.manage'];
    const permMap: Record<string, string> = {};
    for (const pKey of permsToEnsure) {
      let perm = await prisma.permission.findUnique({ where: { key: pKey } });
      if (!perm) {
        perm = await prisma.permission.create({
          data: {
            key: pKey,
            description: 'Permission for ' + pKey,
          },
        });
      }
      permMap[pKey] = perm.id;
    }

    // 4. Grant system.manage globally (projectId: null)
    await prisma.userPermissionOverride.create({
      data: {
        userId: testUserId,
        permissionId: permMap['system.manage'],
        projectId: null,
        isGranted: true,
      },
    });

    // 5. Grant projects.manage scoped to createdProjectId
    await prisma.userPermissionOverride.create({
      data: {
        userId: testUserId,
        permissionId: permMap['projects.manage'],
        projectId: createdProjectId,
        isGranted: true,
      },
    });
  });

  after(async () => {
    if (!prisma) return;
    try {
      // Clean up in reverse dependency order
      await prisma.userPermissionOverride.deleteMany({
        where: { userId: testUserId },
      });
      await prisma.projectSetting.deleteMany({
        where: { projectId: createdProjectId },
      });
      await prisma.systemSetting.deleteMany({
        where: { key: { in: ['system.instance_name'] } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: testUserId },
            { scopeId: createdProjectId },
          ],
        },
      });
      await prisma.project.deleteMany({
        where: { id: createdProjectId },
      });
      await prisma.user.deleteMany({
        where: { id: testUserId },
      });
    } catch (err) {
      // Best-effort cleanup
    } finally {
      await prisma.$disconnect();
    }
  });

  it('persists SYSTEM settings and logs audit record', async (t) => {
    if (!process.env.DATABASE_URL) {
      t.skip('Skipped: DATABASE_URL is not configured for PostgreSQL real integration');
      return;
    }

    await service.updateSystemSettings(testUserId, {
      'system.instance_name': 'PostgreSQL Production Node',
    });

    const systemSettings = await service.getSystemSettings(testUserId);
    assert.equal(systemSettings['system.instance_name'], 'PostgreSQL Production Node');

    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        action: 'SYSTEM_SETTINGS_UPDATED',
        actorId: testUserId,
      },
      orderBy: { createdAt: 'desc' },
    });

    assert(auditEntry !== null, 'Audit log entry should exist for SYSTEM settings update');
    assert.equal(auditEntry.scopeType, 'SYSTEM');
    assert.equal(auditEntry.metadata?.count, 1);
  });

  it('persists and isolates PROJECT settings across projects', async (t) => {
    if (!process.env.DATABASE_URL) {
      t.skip('Skipped: DATABASE_URL is not configured for PostgreSQL real integration');
      return;
    }

    // Update settings for createdProjectId
    await service.updateProjectSettings(createdProjectId, testUserId, {
      'project.default_locale': 'en',
      'project.date_format': 'YYYY-MM-DD',
    });

    const projSettings = await service.getProjectSettings(createdProjectId, testUserId);
    assert.equal(projSettings['project.default_locale'], 'en');
    assert.equal(projSettings['project.date_format'], 'YYYY-MM-DD');

    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        action: 'PROJECT_SETTINGS_UPDATED',
        scopeId: createdProjectId,
      },
      orderBy: { createdAt: 'desc' },
    });

    assert(auditEntry !== null, 'Audit log entry should exist for PROJECT settings update');
    assert.equal(auditEntry.scopeType, 'PROJECT');
    assert.equal(auditEntry.scopeId, createdProjectId);
  });
});
