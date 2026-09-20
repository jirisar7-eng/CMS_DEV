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
  const dbUrl = process.env.DATABASE_URL;
  let prisma: PrismaClient | null = null;
  let store: PrismaContentLifecycleStore | null = null;

  const testProjectIdA = `test-proj-a-${Date.now()}`;
  const testProjectIdB = `test-proj-b-${Date.now()}`;
  const testUserId = `test-user-${Date.now()}`;

  let pageAId = '';
  let revA1Id = '';
  let revA2Id = '';
  let releaseA1Id = '';

  before(async () => {
    if (!dbUrl) {
      console.log('Skipping real PostgreSQL tests: DATABASE_URL is not set in this environment.');
      return;
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

    // 2. Seed Page and Revisions in Project A
    const canonicalContent: PageContent = {
      version: 1,
      schemaVersion: '1.0',
      blocks: [
        { id: 'b1', type: 'heading', order: 1, data: { text: 'Projekt A - Vydání 1' } },
      ],
    };

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
  });

  after(async () => {
    if (!prisma) return;
    try {
      // Disposable fixture cleanup
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
      await prisma.$disconnect();
    } catch {
      // Ignore teardown cleanup errors
    }
  });

  it('verifies real PostgreSQL queries return persisted releases and revisions', async () => {
    if (!store) return;
    const service = new ContentLifecycleService({
      store,
      hasPermission: async () => true,
    });

    const releases = await service.listReleases({ actorId: testUserId, projectId: testProjectIdA });
    assert.strictEqual(releases.length, 1);
    assert.strictEqual(releases[0].release.id, releaseA1Id);
    assert.strictEqual(releases[0].release.status, 'PUBLISHED');
    assert.strictEqual(releases[0].items.length, 1);
    assert.strictEqual(releases[0].items[0].revisionId, revA1Id);

    const revisions = await service.listRevisions({ actorId: testUserId, projectId: testProjectIdA });
    assert.strictEqual(revisions.length, 2);
    const rev1 = revisions.find((r) => r.id === revA1Id);
    const rev2 = revisions.find((r) => r.id === revA2Id);
    assert.ok(rev1);
    assert.ok(rev2);
    assert.strictEqual(rev1.status, 'PUBLISHED');
    assert.strictEqual(rev2.status, 'DRAFT');
  });

  it('handles empty projects with real database returning clean empty lists', async () => {
    if (!store) return;
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
    if (!store) return;
    const service = new ContentLifecycleService({
      store,
      hasPermission: async () => true,
    });

    const releasesB = await service.listReleases({ actorId: testUserId, projectId: testProjectIdB });
    const revisionsB = await service.listRevisions({ actorId: testUserId, projectId: testProjectIdB });

    assert.ok(!releasesB.some((r) => r.release.projectId === testProjectIdA));
    assert.ok(!revisionsB.some((r) => r.pageTitle?.includes('Projekt A')));
  });

  it('rejects access when permission is missing (fail closed)', async () => {
    if (!store) return;
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
    if (!store) return;
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
    if (!store) return;
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

  it('fails closed and rejects operations on database or store failure', async () => {
    const brokenStore = new PrismaContentLifecycleStore({} as any);
    const service = new ContentLifecycleService({
      store: brokenStore,
      hasPermission: async () => true,
    });

    await assert.rejects(
      async () => {
        await service.listReleases({ actorId: testUserId, projectId: testProjectIdA });
      }
    );

    await assert.rejects(
      async () => {
        await service.listRevisions({ actorId: testUserId, projectId: testProjectIdA });
      }
    );
  });
});
