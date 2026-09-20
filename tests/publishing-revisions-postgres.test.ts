import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { PrismaContentLifecycleStore } from '../lib/domain/content/lifecycle/prisma-store';
import {
  ContentLifecycleService,
  ContentLifecycleError,
} from '../lib/domain/content/lifecycle';
import { PageContent } from '../lib/domain/content/contracts';

describe('PostgreSQL Real Integration - Publishing & Revisions Lifecycle', () => {
  let prisma: PrismaClient;
  let store: PrismaContentLifecycleStore;

  const testProjectIdA = `test-proj-a-${Date.now()}`;
  const testProjectIdB = `test-proj-b-${Date.now()}`;
  const testUserId = `test-user-${Date.now()}`;

  let pageAId = '';
  let revA1Id = '';
  let revA2Id = '';
  let releaseA1Id = '';

  // Fixtures for dedicated rollback test
  let pageRollbackId = '';
  let revRollback1Id = '';
  let revRollback2Id = '';
  let releaseRollback1Id = '';
  let releaseRollback2Id = '';

  // Fixtures for dedicated reopen draft test
  let pageReopenId = '';
  let revReopen1Id = '';

  before(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required for PostgreSQL integration tests.');
    }

    prisma = new PrismaClient();
    store = new PrismaContentLifecycleStore(prisma);

    // 1. Seed disposable test identities and projects
    await prisma.user.create({
      data: {
        id: testUserId,
        email: `test-${Date.now()}@synthesis.local`,
        passwordHash: 'insecure_hash_for_test',
        status: 'ACTIVE',
      },
    });

    await prisma.project.create({
      data: {
        id: testProjectIdA,
        key: `key-${testProjectIdA}`,
        name: 'Test Project A',
        status: 'ACTIVE',
      },
    });

    await prisma.project.create({
      data: {
        id: testProjectIdB,
        key: `key-${testProjectIdB}`,
        name: 'Test Project B',
        status: 'ACTIVE',
      },
    });

    const canonicalContent: PageContent = {
      version: 1,
      schemaVersion: '1.0',
      blocks: [
        { id: 'b1', type: 'heading', order: 1, data: { text: 'Projekt A - Vydání 1' } },
      ],
    };

    // 2. Seed Page A with published revision revA1 and draft revA2
    const pageA = await prisma.page.create({
      data: {
        projectId: testProjectIdA,
        key: 'home-a',
        sortOrder: 0,
      },
    });
    pageAId = pageA.id;

    const revA1 = await prisma.pageRevision.create({
      data: {
        pageId: pageA.id,
        revisionNumber: 1,
        status: 'PUBLISHED',
        title: 'Domů v1',
        slug: 'home',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: canonicalContent as any,
        seo: {},
        navigation: {},
        schemaVersion: '1.0',
        lockVersion: 1,
        createdById: testUserId,
        publishedAt: new Date(),
      },
    });
    revA1Id = revA1.id;

    const revA2 = await prisma.pageRevision.create({
      data: {
        pageId: pageA.id,
        revisionNumber: 2,
        status: 'DRAFT',
        title: 'Domů v2 - Koncept',
        slug: 'home',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: canonicalContent as any,
        seo: {},
        navigation: {},
        schemaVersion: '1.0',
        lockVersion: 1,
        createdById: testUserId,
        derivedFromRevisionId: revA1.id,
      },
    });
    revA2Id = revA2.id;

    await prisma.page.update({
      where: { id: pageA.id },
      data: {
        publishedRevisionId: revA1.id,
        draftRevisionId: revA2.id,
      },
    });

    const releaseA1 = await prisma.contentRelease.create({
      data: {
        projectId: testProjectIdA,
        status: 'PUBLISHED',
        createdById: testUserId,
        publishedAt: new Date(),
      },
    });
    releaseA1Id = releaseA1.id;

    await prisma.contentReleaseItem.create({
      data: {
        releaseId: releaseA1.id,
        pageId: pageA.id,
        revisionId: revA1.id,
        previousRevisionId: null,
      },
    });

    // 3. Seed Page for rollback test (has 2 published releases)
    const pageRollback = await prisma.page.create({
      data: {
        projectId: testProjectIdA,
        key: 'rollback-page',
        sortOrder: 1,
      },
    });
    pageRollbackId = pageRollback.id;

    const revRollback1 = await prisma.pageRevision.create({
      data: {
        pageId: pageRollback.id,
        revisionNumber: 1,
        status: 'PUBLISHED',
        title: 'Rollback Page v1',
        slug: 'rollback-page',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: canonicalContent as any,
        seo: {},
        navigation: {},
        schemaVersion: '1.0',
        lockVersion: 1,
        createdById: testUserId,
        publishedAt: new Date(Date.now() - 10000),
      },
    });
    revRollback1Id = revRollback1.id;

    const revRollback2 = await prisma.pageRevision.create({
      data: {
        pageId: pageRollback.id,
        revisionNumber: 2,
        status: 'PUBLISHED',
        title: 'Rollback Page v2',
        slug: 'rollback-page',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: canonicalContent as any,
        seo: {},
        navigation: {},
        schemaVersion: '1.0',
        lockVersion: 1,
        createdById: testUserId,
        derivedFromRevisionId: revRollback1.id,
        publishedAt: new Date(),
      },
    });
    revRollback2Id = revRollback2.id;

    await prisma.page.update({
      where: { id: pageRollback.id },
      data: {
        publishedRevisionId: revRollback2.id,
        draftRevisionId: null,
      },
    });

    const releaseRollback1 = await prisma.contentRelease.create({
      data: {
        projectId: testProjectIdA,
        status: 'PUBLISHED',
        createdById: testUserId,
        publishedAt: new Date(Date.now() - 10000),
      },
    });
    releaseRollback1Id = releaseRollback1.id;

    await prisma.contentReleaseItem.create({
      data: {
        releaseId: releaseRollback1.id,
        pageId: pageRollback.id,
        revisionId: revRollback1.id,
        previousRevisionId: null,
      },
    });

    const releaseRollback2 = await prisma.contentRelease.create({
      data: {
        projectId: testProjectIdA,
        status: 'PUBLISHED',
        createdById: testUserId,
        publishedAt: new Date(),
      },
    });
    releaseRollback2Id = releaseRollback2.id;

    await prisma.contentReleaseItem.create({
      data: {
        releaseId: releaseRollback2.id,
        pageId: pageRollback.id,
        revisionId: revRollback2.id,
        previousRevisionId: revRollback1.id,
      },
    });

    // 4. Seed Page for reopen draft test
    const pageReopen = await prisma.page.create({
      data: {
        projectId: testProjectIdA,
        key: 'reopen-page',
        sortOrder: 2,
      },
    });
    pageReopenId = pageReopen.id;

    const revReopen1 = await prisma.pageRevision.create({
      data: {
        pageId: pageReopen.id,
        revisionNumber: 1,
        status: 'PUBLISHED',
        title: 'Reopen Page v1',
        slug: 'reopen-page',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: canonicalContent as any,
        seo: {},
        navigation: {},
        schemaVersion: '1.0',
        lockVersion: 1,
        createdById: testUserId,
        publishedAt: new Date(),
      },
    });
    revReopen1Id = revReopen1.id;

    await prisma.page.update({
      where: { id: pageReopen.id },
      data: {
        publishedRevisionId: revReopen1.id,
        draftRevisionId: null,
      },
    });
  });

  after(async () => {
    if (!prisma) return;
    try {
      // Clean up audit logs and fixtures
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: testUserId },
            { scopeId: { in: [testProjectIdA, testProjectIdB] } },
          ],
        },
      });
      await prisma.contentReleaseItem.deleteMany({
        where: { release: { projectId: { in: [testProjectIdA, testProjectIdB] } } },
      });
      await prisma.contentRelease.deleteMany({
        where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
      });
      await prisma.pageRevision.deleteMany({
        where: { page: { projectId: { in: [testProjectIdA, testProjectIdB] } } },
      });
      await prisma.page.deleteMany({
        where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
      });
      await prisma.project.deleteMany({
        where: { id: { in: [testProjectIdA, testProjectIdB] } },
      });
      await prisma.user.deleteMany({
        where: { id: testUserId },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('verifies real PostgreSQL queries return persisted releases and revisions', async () => {
    const service = new ContentLifecycleService({
      store,
      hasPermission: async () => true,
    });

    const releases = await service.listReleases({ actorId: testUserId, projectId: testProjectIdA });
    assert.ok(releases.length >= 1);
    const releaseA1 = releases.find((r) => r.release.id === releaseA1Id);
    assert.ok(releaseA1);
    assert.strictEqual(releaseA1.release.status, 'PUBLISHED');
    assert.strictEqual(releaseA1.items[0].revisionId, revA1Id);

    const revisions = await service.listRevisions({ actorId: testUserId, projectId: testProjectIdA });
    assert.ok(revisions.length >= 2);
    const rev1 = revisions.find((r) => r.id === revA1Id);
    const rev2 = revisions.find((r) => r.id === revA2Id);
    assert.ok(rev1);
    assert.ok(rev2);
    assert.strictEqual(rev1.status, 'PUBLISHED');
    assert.strictEqual(rev2.status, 'DRAFT');
  });

  it('handles empty projects with real database returning clean empty lists', async () => {
    const service = new ContentLifecycleService({
      store,
      hasPermission: async () => true,
    });

    const releases = await service.listReleases({ actorId: testUserId, projectId: testProjectIdB });
    assert.deepStrictEqual(releases, []);

    const revisions = await service.listRevisions({ actorId: testUserId, projectId: testProjectIdB });
    assert.deepStrictEqual(revisions, []);
  });

  it('guarantees tenant isolation preventing cross-project data leakage in PostgreSQL', async () => {
    const service = new ContentLifecycleService({
      store,
      hasPermission: async () => true,
    });

    const releasesB = await service.listReleases({ actorId: testUserId, projectId: testProjectIdB });
    const revisionsB = await service.listRevisions({ actorId: testUserId, projectId: testProjectIdB });
    assert.ok(!releasesB.some((r) => r.release.projectId === testProjectIdA));
    assert.ok(!revisionsB.some((r) => r.pageTitle?.includes('Projekt A')));
  });

  it('executes successful rollback with persisted pointer and release assertions in PostgreSQL', async () => {
    const service = new ContentLifecycleService({
      store,
      hasPermission: async () => true,
    });

    const result = await service.rollbackRelease({
      actorId: testUserId,
      projectId: testProjectIdA,
      releaseId: releaseRollback2Id,
    });

    assert.strictEqual(result.rollbackRelease.status, 'ROLLED_BACK');
    assert.strictEqual(result.restoredRevision.id, revRollback1Id);
    assert.strictEqual(result.fromRevision.id, revRollback2Id);

    // Direct database assertions
    const updatedPage = await prisma.page.findUnique({
      where: { id: pageRollbackId },
    });
    assert.ok(updatedPage);
    assert.strictEqual(updatedPage.publishedRevisionId, revRollback1Id);

    const persistedRollbackRelease = await prisma.contentRelease.findUnique({
      where: { id: result.rollbackRelease.id },
    });
    assert.ok(persistedRollbackRelease);
    assert.strictEqual(persistedRollbackRelease.status, 'ROLLED_BACK');
    assert.ok(persistedRollbackRelease.rolledBackAt instanceof Date);

    const persistedRollbackItem = await prisma.contentReleaseItem.findFirst({
      where: { releaseId: result.rollbackRelease.id },
    });
    assert.ok(persistedRollbackItem);
    assert.strictEqual(persistedRollbackItem.revisionId, revRollback1Id);
    assert.strictEqual(persistedRollbackItem.previousRevisionId, revRollback2Id);

    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        resourceId: result.rollbackRelease.id,
        action: 'CONTENT_RELEASE_ROLLED_BACK',
      },
    });
    assert.ok(auditEntry);
    assert.strictEqual(auditEntry.scopeId, testProjectIdA);
  });

  it('executes successful reopen-draft with persisted revision and pointer assertions in PostgreSQL', async () => {
    const service = new ContentLifecycleService({
      store,
      hasPermission: async () => true,
    });

    const result = await service.createDraftFromPublished({
      actorId: testUserId,
      projectId: testProjectIdA,
      pageId: pageReopenId,
      expectedPublishedRevisionId: revReopen1Id,
    });

    assert.strictEqual(result.draftRevision.status, 'DRAFT');
    assert.strictEqual(result.draftRevision.revisionNumber, 2);
    assert.strictEqual(result.draftRevision.derivedFromRevisionId, revReopen1Id);

    // Direct database assertions
    const updatedPage = await prisma.page.findUnique({
      where: { id: pageReopenId },
    });
    assert.ok(updatedPage);
    assert.strictEqual(updatedPage.draftRevisionId, result.draftRevision.id);
    assert.strictEqual(updatedPage.publishedRevisionId, revReopen1Id);

    const persistedNewDraft = await prisma.pageRevision.findUnique({
      where: { id: result.draftRevision.id },
    });
    assert.ok(persistedNewDraft);
    assert.strictEqual(persistedNewDraft.status, 'DRAFT');
    assert.strictEqual(persistedNewDraft.revisionNumber, 2);
    assert.strictEqual(persistedNewDraft.derivedFromRevisionId, revReopen1Id);
    assert.strictEqual(persistedNewDraft.lockVersion, 1);

    // Source published revision in DB must remain unmodified
    const sourceRevInDb = await prisma.pageRevision.findUnique({
      where: { id: revReopen1Id },
    });
    assert.ok(sourceRevInDb);
    assert.strictEqual(sourceRevInDb.status, 'PUBLISHED');

    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        resourceId: result.draftRevision.id,
        action: 'CONTENT_DRAFT_REOPENED',
      },
    });
    assert.ok(auditEntry);
    assert.strictEqual(auditEntry.scopeId, testProjectIdA);
  });

  it('rejects cross-project mutations and leaves database state strictly unchanged', async () => {
    const service = new ContentLifecycleService({
      store,
      hasPermission: async () => true,
    });

    // Attempting to reopen draft for Project A page using Project B context
    await assert.rejects(
      async () => {
        await service.createDraftFromPublished({
          actorId: testUserId,
          projectId: testProjectIdB,
          pageId: pageAId,
          expectedPublishedRevisionId: revA1Id,
        });
      },
      (err: unknown) => err instanceof ContentLifecycleError && err.code === 'PAGE_NOT_FOUND'
    );

    // Attempting to rollback Project A release using Project B context
    await assert.rejects(
      async () => {
        await service.rollbackRelease({
          actorId: testUserId,
          projectId: testProjectIdB,
          releaseId: releaseA1Id,
        });
      },
      (err: unknown) => err instanceof ContentLifecycleError && err.code === 'RELEASE_NOT_FOUND'
    );

    // Database assertions: Page A and Project A state remains completely unchanged
    const pageAInDb = await prisma.page.findUnique({ where: { id: pageAId } });
    assert.ok(pageAInDb);
    assert.strictEqual(pageAInDb.publishedRevisionId, revA1Id);
    assert.strictEqual(pageAInDb.draftRevisionId, revA2Id);

    const projectBReleases = await prisma.contentRelease.findMany({
      where: { projectId: testProjectIdB },
    });
    assert.strictEqual(projectBReleases.length, 0);

    const projectBPages = await prisma.page.findMany({
      where: { projectId: testProjectIdB },
    });
    assert.strictEqual(projectBPages.length, 0);
  });

  it('rejects access when permission is missing (fail closed)', async () => {
    const service = new ContentLifecycleService({
      store,
      hasPermission: async () => false,
    });

    await assert.rejects(
      async () => {
        await service.listReleases({ actorId: testUserId, projectId: testProjectIdA });
      },
      (err: unknown) => err instanceof ContentLifecycleError && err.code === 'FORBIDDEN'
    );

    await assert.rejects(
      async () => {
        await service.listRevisions({ actorId: testUserId, projectId: testProjectIdA });
      },
      (err: unknown) => err instanceof ContentLifecycleError && err.code === 'FORBIDDEN'
    );
  });

  it('fails safely with ACTIVE_DRAFT_EXISTS during createDraftFromPublished', async () => {
    const service = new ContentLifecycleService({
      store,
      hasPermission: async () => true,
    });

    // Page A already has active draft revA2
    await assert.rejects(
      async () => {
        await service.createDraftFromPublished({
          actorId: testUserId,
          projectId: testProjectIdA,
          pageId: pageAId,
          expectedPublishedRevisionId: revA1Id,
        });
      },
      (err: unknown) => err instanceof ContentLifecycleError && err.code === 'ACTIVE_DRAFT_EXISTS'
    );
  });

  it('fails safely with LOCK_CONFLICT when expectedPublishedRevisionId is stale', async () => {
    const service = new ContentLifecycleService({
      store,
      hasPermission: async () => true,
    });

    await assert.rejects(
      async () => {
        await service.createDraftFromPublished({
          actorId: testUserId,
          projectId: testProjectIdA,
          pageId: pageAId,
          expectedPublishedRevisionId: 'stale-published-id',
        });
      },
      (err: unknown) => err instanceof ContentLifecycleError && err.code === 'LOCK_CONFLICT'
    );
  });

  it('propagates real PostgreSQL connection and query failures as errors rather than empty success', async () => {
    const unreachablePrisma = new PrismaClient({
      datasources: {
        db: {
          url: 'postgresql://invalid_user:invalid_password@127.0.0.1:5433/nonexistent?connect_timeout=1',
        },
      },
    });

    const brokenDbStore = new PrismaContentLifecycleStore(unreachablePrisma);
    const brokenDbService = new ContentLifecycleService({
      store: brokenDbStore,
      hasPermission: async () => true,
    });

    try {
      await assert.rejects(
        async () => {
          await brokenDbService.listReleases({ actorId: testUserId, projectId: testProjectIdA });
        },
        (err: unknown) => {
          assert.ok(err !== null && err !== undefined);
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await brokenDbService.listRevisions({ actorId: testUserId, projectId: testProjectIdA });
        },
        (err: unknown) => {
          assert.ok(err !== null && err !== undefined);
          return true;
        }
      );
    } finally {
      await unreachablePrisma.$disconnect().catch(() => {});
    }
  });
});
