import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { PrismaContentLifecycleStore } from '../lib/domain/content/lifecycle/prisma-store';
import { ContentLifecycleError, ContentLifecycleService } from '../lib/domain/content/lifecycle';
import { PageContent } from '../lib/domain/content/contracts';
import { PermissionKey } from '../lib/auth/rbac';

const isolatedDatabase = 'mfa_test';
const isolatedPort = '55449';
const content: PageContent = {
  version: 1,
  schemaVersion: '1.0.0',
  blocks: [{ id: 'postgres-heading', type: 'heading', order: 0, data: { text: 'Postgres lifecycle', level: 1 } }],
};
const scheduleAt = new Date('2030-02-03T04:05:06.000Z');
const dueAt = new Date('2030-02-03T04:06:06.000Z');

let prisma: PrismaClient;
let sequence = 0;

function proveIsolatedDatabase(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('BLOCKER: DATABASE_URL is not configured for the isolated PostgreSQL test database');
  const url = new URL(raw);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== isolatedPort || url.pathname !== `/${isolatedDatabase}`) {
    throw new Error(`BLOCKER: refusing PostgreSQL test against non-isolated endpoint ${url.hostname}:${url.port}/${url.pathname}`);
  }
}

function ids() {
  const suffix = `${Date.now()}-${++sequence}`;
  return {
    projectId: `content-006-pg-project-${suffix}`,
    otherProjectId: `content-006-pg-other-${suffix}`,
    userId: `content-006-pg-user-${suffix}`,
    otherUserId: `content-006-pg-other-user-${suffix}`,
    email: `content-006-pg-${suffix}@synthesis.local`,
    pageKey: `content-006-page-${suffix}`,
  };
}

type Fixture = ReturnType<typeof ids> & { pageId: string; revisionId: string };

async function createFixture(options: { status?: 'ACTIVE' | 'SUSPENDED'; revisionStatus?: 'APPROVED' | 'PUBLISHED'; withDraft?: boolean } = {}): Promise<Fixture> {
  const identity = ids();
  await prisma.user.create({
    data: { id: identity.userId, email: identity.email, passwordHash: 'postgres-lifecycle-test', status: options.status ?? 'ACTIVE' },
  });
  await prisma.project.create({ data: { id: identity.projectId, key: identity.projectId, name: 'Content 006 PostgreSQL Test', status: 'ACTIVE' } });
  const page = await prisma.page.create({ data: { projectId: identity.projectId, key: identity.pageKey, sortOrder: 0 } });
  const revision = await prisma.pageRevision.create({
    data: {
      pageId: page.id,
      revisionNumber: 1,
      status: options.revisionStatus ?? 'APPROVED',
      title: 'Postgres lifecycle page',
      slug: 'postgres-lifecycle',
      locale: 'en',
      visibility: 'PUBLIC',
      content: content as any,
      seo: {},
      navigation: {},
      schemaVersion: '1.0.0',
      lockVersion: 7,
      createdById: identity.userId,
      approvedAt: new Date('2030-02-01T00:00:00.000Z'),
      publishedAt: options.revisionStatus === 'PUBLISHED' ? new Date('2030-02-02T00:00:00.000Z') : null,
    },
  });
  await prisma.page.update({
    where: { id: page.id },
    data: { publishedRevisionId: options.revisionStatus === 'PUBLISHED' ? revision.id : null, draftRevisionId: options.revisionStatus === 'PUBLISHED' && !options.withDraft ? null : revision.id },
  });
  return { ...identity, pageId: page.id, revisionId: revision.id };
}

async function addDraft(fixture: Fixture, revisionNumber = 2): Promise<string> {
  const draft = await prisma.pageRevision.create({
    data: {
      pageId: fixture.pageId,
      revisionNumber,
      status: 'DRAFT',
      title: 'Existing draft',
      slug: 'postgres-lifecycle',
      locale: 'en',
      visibility: 'PUBLIC',
      content: content as any,
      seo: {},
      navigation: {},
      schemaVersion: '1.0.0',
      lockVersion: 1,
      createdById: fixture.userId,
      derivedFromRevisionId: fixture.revisionId,
    },
  });
  await prisma.page.update({ where: { id: fixture.pageId }, data: { draftRevisionId: draft.id } });
  return draft.id;
}

function serviceFor(fixture: Fixture, permissions: Set<string> = new Set(['content.publish'])) {
  const store = new PrismaContentLifecycleStore(prisma);
  const service = new ContentLifecycleService({
    store,
    hasPermission: async (actorId: string, permission: PermissionKey, projectId: string | null) => permissions.has(`${actorId}:${permission}:${projectId}`) || (actorId === fixture.userId && permission === 'content.publish' && projectId === fixture.projectId && permissions.has('content.publish')),
  });
  return { store, service, permissions };
}

async function cleanup(fixture: Partial<Fixture>): Promise<void> {
  if (fixture.projectId) {
    await prisma.auditLog.deleteMany({ where: { scopeId: fixture.projectId } });
    await prisma.contentReleaseItem.deleteMany({ where: { page: { projectId: fixture.projectId } } });
    await prisma.contentRelease.deleteMany({ where: { projectId: fixture.projectId } });
    await prisma.pageRevision.deleteMany({ where: { page: { projectId: fixture.projectId } } });
    await prisma.page.deleteMany({ where: { projectId: fixture.projectId } });
    await prisma.project.deleteMany({ where: { id: fixture.projectId } });
  }
  if (fixture.userId) await prisma.user.deleteMany({ where: { id: fixture.userId } });
  if (fixture.otherUserId) await prisma.user.deleteMany({ where: { id: fixture.otherUserId } });
}

async function expectCode(action: Promise<unknown>, code: ContentLifecycleError['code']): Promise<void> {
  await assert.rejects(action, (error: unknown) => error instanceof ContentLifecycleError && error.code === code);
}

describe('PostgreSQL integration: SYN-CONTENT-006 schedule and unpublish lifecycle', () => {
  before(async () => {
    proveIsolatedDatabase();
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it('persists the exact scheduled revision, time, and actor tuple', async () => {
    const fixture = await createFixture();
    try {
      const { service } = serviceFor(fixture);
      await service.schedulePublish({ actorId: fixture.userId, projectId: fixture.projectId, pageId: fixture.pageId, expectedLockVersion: 7, publishAt: scheduleAt });
      const page = await prisma.page.findUnique({ where: { id: fixture.pageId } });
      assert.equal(page?.scheduledRevisionId, fixture.revisionId);
      assert.equal(page?.scheduledPublishAt?.getTime(), scheduleAt.getTime());
      assert.equal(page?.scheduledById, fixture.userId);
    } finally {
      await cleanup(fixture);
    }
  });

  it('rejects duplicate or stale schedule CAS without partial state', async () => {
    const fixture = await createFixture();
    try {
      const { service } = serviceFor(fixture);
      await service.schedulePublish({ actorId: fixture.userId, projectId: fixture.projectId, pageId: fixture.pageId, expectedLockVersion: 7, publishAt: scheduleAt });
      const scheduledBefore = await prisma.page.findUnique({ where: { id: fixture.pageId } });
      await expectCode(service.schedulePublish({ actorId: fixture.userId, projectId: fixture.projectId, pageId: fixture.pageId, expectedLockVersion: 7, publishAt: dueAt }), 'STATE_TRANSITION_INVALID');
      await expectCode(service.schedulePublish({ actorId: fixture.userId, projectId: fixture.projectId, pageId: fixture.pageId, expectedLockVersion: 6, publishAt: dueAt }), 'STATE_TRANSITION_INVALID');
      const scheduledAfter = await prisma.page.findUnique({ where: { id: fixture.pageId } });
      assert.equal(scheduledAfter?.scheduledRevisionId, scheduledBefore?.scheduledRevisionId);
      assert.equal(scheduledAfter?.scheduledPublishAt?.getTime(), scheduledBefore?.scheduledPublishAt?.getTime());
      assert.equal(scheduledAfter?.scheduledById, scheduledBefore?.scheduledById);
    } finally {
      await cleanup(fixture);
    }
  });

  it('requires the exact schedule tuple and clears it atomically on cancel', async () => {
    const fixture = await createFixture();
    try {
      const { service } = serviceFor(fixture);
      await service.schedulePublish({ actorId: fixture.userId, projectId: fixture.projectId, pageId: fixture.pageId, expectedLockVersion: 7, publishAt: scheduleAt });
      await expectCode(service.cancelScheduledPublish({ actorId: fixture.userId, projectId: fixture.projectId, pageId: fixture.pageId, expectedScheduledRevisionId: fixture.revisionId, expectedScheduledPublishAt: dueAt }), 'LOCK_CONFLICT');
      const stillScheduled = await prisma.page.findUnique({ where: { id: fixture.pageId } });
      assert.equal(stillScheduled?.scheduledRevisionId, fixture.revisionId);
      const result = await service.cancelScheduledPublish({ actorId: fixture.userId, projectId: fixture.projectId, pageId: fixture.pageId, expectedScheduledRevisionId: fixture.revisionId, expectedScheduledPublishAt: scheduleAt });
      assert.equal(result.page.scheduledRevisionId, null);
      const cancelled = await prisma.page.findUnique({ where: { id: fixture.pageId } });
      assert.equal(cancelled?.scheduledRevisionId, null);
      assert.equal(cancelled?.scheduledPublishAt, null);
      assert.equal(cancelled?.scheduledById, null);
    } finally {
      await cleanup(fixture);
    }
  });

  it('manual publish clears a pending schedule atomically', async () => {
    const fixture = await createFixture();
    try {
      const { service } = serviceFor(fixture);
      await service.schedulePublish({ actorId: fixture.userId, projectId: fixture.projectId, pageId: fixture.pageId, expectedLockVersion: 7, publishAt: scheduleAt });
      const result = await service.publishApproved({ actorId: fixture.userId, projectId: fixture.projectId, pageId: fixture.pageId, expectedLockVersion: 7 });
      assert.equal(result.revision.status, 'PUBLISHED');
      const page = await prisma.page.findUnique({ where: { id: fixture.pageId } });
      assert.equal(page?.publishedRevisionId, fixture.revisionId);
      assert.equal(page?.draftRevisionId, null);
      assert.equal(page?.scheduledRevisionId, null);
      assert.equal(page?.scheduledPublishAt, null);
      assert.equal(page?.scheduledById, null);
    } finally {
      await cleanup(fixture);
    }
  });

  it('due scheduled publish performs APPROVED to PUBLISHED and updates all pointers atomically', async () => {
    const fixture = await createFixture();
    try {
      const { service } = serviceFor(fixture);
      await service.schedulePublish({ actorId: fixture.userId, projectId: fixture.projectId, pageId: fixture.pageId, expectedLockVersion: 7, publishAt: scheduleAt });
      const result = await service.publishScheduled({ projectId: fixture.projectId, pageId: fixture.pageId, expectedScheduledRevisionId: fixture.revisionId, expectedScheduledPublishAt: scheduleAt, expectedScheduledById: fixture.userId, expectedLockVersion: 7, now: dueAt });
      assert.equal(result.revision.status, 'PUBLISHED');
      assert.equal(result.revision.lockVersion, 8);
      const revision = await prisma.pageRevision.findUnique({ where: { id: fixture.revisionId } });
      const page = await prisma.page.findUnique({ where: { id: fixture.pageId } });
      assert.equal(revision?.status, 'PUBLISHED');
      assert.equal(page?.publishedRevisionId, fixture.revisionId);
      assert.equal(page?.draftRevisionId, null);
      assert.equal(page?.scheduledRevisionId, null);
      assert.equal(page?.scheduledPublishAt, null);
      assert.equal(page?.scheduledById, null);
    } finally {
      await cleanup(fixture);
    }
  });

  it('inactive scheduled actor fails closed without lifecycle mutation', async () => {
    const fixture = await createFixture({ status: 'SUSPENDED' });
    try {
      const { service } = serviceFor(fixture);
      await service.schedulePublish({ actorId: fixture.userId, projectId: fixture.projectId, pageId: fixture.pageId, expectedLockVersion: 7, publishAt: scheduleAt });
      const before = await prisma.$transaction([
        prisma.page.findUnique({ where: { id: fixture.pageId } }),
        prisma.pageRevision.findUnique({ where: { id: fixture.revisionId } }),
        prisma.contentRelease.count({ where: { projectId: fixture.projectId } }),
      ]);
      await expectCode(service.publishScheduled({ projectId: fixture.projectId, pageId: fixture.pageId, expectedScheduledRevisionId: fixture.revisionId, expectedScheduledPublishAt: scheduleAt, expectedScheduledById: fixture.userId, expectedLockVersion: 7, now: dueAt }), 'FORBIDDEN');
      const after = await prisma.$transaction([
        prisma.page.findUnique({ where: { id: fixture.pageId } }),
        prisma.pageRevision.findUnique({ where: { id: fixture.revisionId } }),
        prisma.contentRelease.count({ where: { projectId: fixture.projectId } }),
      ]);
      assert.deepEqual(after, before);
    } finally {
      await cleanup(fixture);
    }
  });

  it('revoked content.publish fails closed without lifecycle mutation', async () => {
    const fixture = await createFixture();
    try {
      const permissions = new Set<string>(['content.publish']);
      const { service } = serviceFor(fixture, permissions);
      await service.schedulePublish({ actorId: fixture.userId, projectId: fixture.projectId, pageId: fixture.pageId, expectedLockVersion: 7, publishAt: scheduleAt });
      permissions.delete('content.publish');
      const before = await prisma.$transaction([
        prisma.page.findUnique({ where: { id: fixture.pageId } }),
        prisma.pageRevision.findUnique({ where: { id: fixture.revisionId } }),
        prisma.contentRelease.count({ where: { projectId: fixture.projectId } }),
      ]);
      await expectCode(service.publishScheduled({ projectId: fixture.projectId, pageId: fixture.pageId, expectedScheduledRevisionId: fixture.revisionId, expectedScheduledPublishAt: scheduleAt, expectedScheduledById: fixture.userId, expectedLockVersion: 7, now: dueAt }), 'FORBIDDEN');
      const after = await prisma.$transaction([
        prisma.page.findUnique({ where: { id: fixture.pageId } }),
        prisma.pageRevision.findUnique({ where: { id: fixture.revisionId } }),
        prisma.contentRelease.count({ where: { projectId: fixture.projectId } }),
      ]);
      assert.deepEqual(after, before);
    } finally {
      await cleanup(fixture);
    }
  });

  it('unpublish uses the published-pointer CAS', async () => {
    const fixture = await createFixture({ revisionStatus: 'PUBLISHED' });
    try {
      const { service } = serviceFor(fixture);
      await expectCode(service.unpublish({ actorId: fixture.userId, projectId: fixture.projectId, pageId: fixture.pageId, expectedPublishedRevisionId: 'stale-published-revision' }), 'LOCK_CONFLICT');
      const page = await prisma.page.findUnique({ where: { id: fixture.pageId } });
      assert.equal(page?.publishedRevisionId, fixture.revisionId);
      assert.equal(page?.draftRevisionId, null);
    } finally {
      await cleanup(fixture);
    }
  });

  it('keeps the historical PUBLISHED revision immutable during unpublish', async () => {
    const fixture = await createFixture({ revisionStatus: 'PUBLISHED' });
    try {
      const { service } = serviceFor(fixture);
      const before = await prisma.pageRevision.findUnique({ where: { id: fixture.revisionId } });
      const result = await service.unpublish({ actorId: fixture.userId, projectId: fixture.projectId, pageId: fixture.pageId, expectedPublishedRevisionId: fixture.revisionId });
      const after = await prisma.pageRevision.findUnique({ where: { id: fixture.revisionId } });
      assert.deepEqual(after, before);
      assert.equal(result.unpublishedRevision.id, fixture.revisionId);
    } finally {
      await cleanup(fixture);
    }
  });

  it('preserves an existing draft during unpublish', async () => {
    const fixture = await createFixture({ revisionStatus: 'PUBLISHED', withDraft: true });
    try {
      const draftId = await addDraft(fixture);
      const { service } = serviceFor(fixture);
      const result = await service.unpublish({ actorId: fixture.userId, projectId: fixture.projectId, pageId: fixture.pageId, expectedPublishedRevisionId: fixture.revisionId });
      assert.equal(result.draftRevision.id, draftId);
      assert.equal(result.createdDraft, false);
      const page = await prisma.page.findUnique({ where: { id: fixture.pageId } });
      assert.equal(page?.draftRevisionId, draftId);
    } finally {
      await cleanup(fixture);
    }
  });

  it('recreates a missing draft from the unpublished revision', async () => {
    const fixture = await createFixture({ revisionStatus: 'PUBLISHED' });
    try {
      const { service } = serviceFor(fixture);
      const result = await service.unpublish({ actorId: fixture.userId, projectId: fixture.projectId, pageId: fixture.pageId, expectedPublishedRevisionId: fixture.revisionId });
      assert.equal(result.createdDraft, true);
      assert.equal(result.draftRevision.status, 'DRAFT');
      assert.equal(result.draftRevision.derivedFromRevisionId, fixture.revisionId);
      assert.deepEqual(result.draftRevision.content, content);
      const page = await prisma.page.findUnique({ where: { id: fixture.pageId } });
      assert.equal(page?.draftRevisionId, result.draftRevision.id);
    } finally {
      await cleanup(fixture);
    }
  });

  it('preserves project isolation', async () => {
    const fixture = await createFixture();
    try {
      await prisma.project.create({ data: { id: fixture.otherProjectId, key: fixture.otherProjectId, name: 'Other project', status: 'ACTIVE' } });
      const permissions = new Set([`${fixture.userId}:content.publish:${fixture.otherProjectId}`]);
      const { service } = serviceFor(fixture, permissions);
      await expectCode(service.schedulePublish({ actorId: fixture.userId, projectId: fixture.otherProjectId, pageId: fixture.pageId, expectedLockVersion: 7, publishAt: scheduleAt }), 'PAGE_NOT_FOUND');
      const page = await prisma.page.findUnique({ where: { id: fixture.pageId } });
      assert.equal(page?.scheduledRevisionId, null);
    } finally {
      await prisma.project.deleteMany({ where: { id: fixture.otherProjectId } });
      await cleanup(fixture);
    }
  });

  it('persists the expected lifecycle audit records', async () => {
    const fixture = await createFixture();
    try {
      const { service } = serviceFor(fixture);
      await service.schedulePublish({ actorId: fixture.userId, projectId: fixture.projectId, pageId: fixture.pageId, expectedLockVersion: 7, publishAt: scheduleAt });
      await service.cancelScheduledPublish({ actorId: fixture.userId, projectId: fixture.projectId, pageId: fixture.pageId, expectedScheduledRevisionId: fixture.revisionId, expectedScheduledPublishAt: scheduleAt });
      await service.schedulePublish({ actorId: fixture.userId, projectId: fixture.projectId, pageId: fixture.pageId, expectedLockVersion: 7, publishAt: scheduleAt });
      await service.publishScheduled({ projectId: fixture.projectId, pageId: fixture.pageId, expectedScheduledRevisionId: fixture.revisionId, expectedScheduledPublishAt: scheduleAt, expectedScheduledById: fixture.userId, expectedLockVersion: 7, now: dueAt });
      await service.unpublish({ actorId: fixture.userId, projectId: fixture.projectId, pageId: fixture.pageId, expectedPublishedRevisionId: fixture.revisionId });
      const audits = await prisma.auditLog.findMany({ where: { scopeId: fixture.projectId }, orderBy: { createdAt: 'asc' } });
      assert.deepEqual(audits.map((audit) => audit.action), [
        'CONTENT_PUBLISH_SCHEDULED',
        'CONTENT_PUBLISH_SCHEDULE_CANCELLED',
        'CONTENT_PUBLISH_SCHEDULED',
        'CONTENT_RELEASE_PUBLISHED',
        'CONTENT_PAGE_UNPUBLISHED',
      ]);
      const scheduleAudit = audits.find((audit) => audit.action === 'CONTENT_PUBLISH_SCHEDULED');
      assert.equal((scheduleAudit?.metadata as any).revisionId, fixture.revisionId);
      assert.equal((scheduleAudit?.metadata as any).scheduledById, fixture.userId);
      assert.equal((scheduleAudit?.metadata as any).scheduledPublishAt, scheduleAt.toISOString());
    } finally {
      await cleanup(fixture);
    }
  });

  it('returns authoritative page lifecycle pointers in revision reads with project isolation', async () => {
    const fixture = await createFixture();
    const otherFixture = await createFixture();
    try {
      const historicalPublished = await prisma.pageRevision.create({
        data: {
          pageId: fixture.pageId,
          revisionNumber: 2,
          status: 'PUBLISHED',
          title: 'Historical published revision',
          slug: 'postgres-lifecycle',
          locale: 'en',
          visibility: 'PUBLIC',
          content: content as any,
          seo: {},
          navigation: {},
          schemaVersion: '1.0.0',
          lockVersion: 3,
          createdById: fixture.userId,
          publishedAt: new Date('2030-02-02T00:00:00.000Z'),
        },
      });
      await prisma.page.update({ where: { id: fixture.pageId }, data: { publishedRevisionId: historicalPublished.id } });

      const { service } = serviceFor(fixture, new Set([
        'content.publish',
        `${fixture.userId}:content.view:${fixture.projectId}`,
      ]));
      await service.schedulePublish({ actorId: fixture.userId, projectId: fixture.projectId, pageId: fixture.pageId, expectedLockVersion: 7, publishAt: scheduleAt });

      const otherService = serviceFor(otherFixture, new Set([
        'content.publish',
        `${otherFixture.userId}:content.view:${otherFixture.projectId}`,
      ]));
      await otherService.service.schedulePublish({ actorId: otherFixture.userId, projectId: otherFixture.projectId, pageId: otherFixture.pageId, expectedLockVersion: 7, publishAt: dueAt });

      const revisions = await service.listRevisions({ actorId: fixture.userId, projectId: fixture.projectId });
      const current = revisions.find((revision) => revision.id === fixture.revisionId);
      const historical = revisions.find((revision) => revision.id === historicalPublished.id);
      assert.ok(current);
      assert.ok(historical);
      for (const revision of [current, historical]) {
        assert.equal(revision.draftRevisionId, fixture.revisionId);
        assert.equal(revision.publishedRevisionId, historicalPublished.id);
        assert.equal(revision.scheduledRevisionId, fixture.revisionId);
        assert.equal(revision.scheduledPublishAt?.getTime(), scheduleAt.getTime());
        assert.equal(revision.pageTitle, revision.title);
        assert.equal(revision.pageSlug, revision.slug);
        assert.equal('scheduledById' in revision, false);
      }
      assert.equal(revisions.some((revision) => revision.id === otherFixture.revisionId), false);
      assert.equal(revisions.some((revision) => revision.scheduledPublishAt?.getTime() === dueAt.getTime()), false);

      const nullFixture = await createFixture();
      try {
        const nullService = serviceFor(nullFixture, new Set([`${nullFixture.userId}:content.view:${nullFixture.projectId}`]));
        const nullRevision = (await nullService.service.listRevisions({ actorId: nullFixture.userId, projectId: nullFixture.projectId })).find((revision) => revision.id === nullFixture.revisionId);
        assert.ok(nullRevision);
        assert.equal(nullRevision.draftRevisionId, nullFixture.revisionId);
        assert.equal(nullRevision.publishedRevisionId, null);
        assert.equal(nullRevision.scheduledRevisionId, null);
        assert.equal(nullRevision.scheduledPublishAt, null);
      } finally {
        await cleanup(nullFixture);
      }
    } finally {
      await cleanup(fixture);
      await cleanup(otherFixture);
    }
  });
});
