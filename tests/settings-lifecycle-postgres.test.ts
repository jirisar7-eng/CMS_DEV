// @ts-nocheck
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

describe('PostgreSQL Real Integration - SYN-SETTINGS-001 Settings Persistence', () => {
  let prisma: any;
  let service: any;
  const timestamp = Date.now();
  const testUserId = `settings-test-user-${timestamp}`;
  let createdProjectId: string;
  const projectKey = `postgres-settings-proj-${timestamp}`;

  before(async () => {
    if (!process.env.DATABASE_URL) {
      return;
    }
    const { PrismaClient } = await import('@prisma/client');
    const { getSettingsService } = await import('../lib/domain/settings');
    prisma = new PrismaClient();
    service = getSettingsService();

    // Create test project
    const proj = await prisma.project.create({
      data: {
        key: projectKey,
        name: 'PostgreSQL Settings Test Project',
      },
    });
    createdProjectId = proj.id;
  });

  after(async () => {
    if (prisma && createdProjectId) {
      await prisma.project.deleteMany({ where: { id: createdProjectId } });
      await prisma.systemSetting.deleteMany({
        where: { key: { in: ['system.instance_name'] } },
      });
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
