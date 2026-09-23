import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ContentLifecycleError,
  ContentLifecycleService,
  ContentLifecycleStore,
  CreateDraftRevisionFromSourceParams,
  CreatePageWithDraftParams,
  CreatePublishedReleaseParams,
  CreateReleaseItemParams,
  LifecycleContentRelease,
  LifecycleContentReleaseItem,
  LifecyclePage,
  LifecyclePageRevision,
  RecordLifecycleAuditParams,
  SetPageDraftRevisionPointerParams,
  SetPublishedPagePointersAtomicParams,
  SetScheduledPublishAtomicParams,
  SetScheduledPublishedPagePointersAtomicParams,
  SetUnpublishedPagePointersAtomicParams,
  TransitionRevisionStatusAtomicParams,
  UpdateDraftRevisionAtomicParams,
  ClaimRevisionLockAtomicParams,
} from '../lib/domain/content/lifecycle';
import { PageContent } from '../lib/domain/content/contracts';
import { PermissionKey } from '../lib/auth/rbac';

const projectId = 'project-a';
const otherProjectId = 'project-b';
const actorId = 'actor-a';
const publishAt = new Date('2030-01-02T03:04:05.000Z');
const dueAt = new Date('2030-01-02T03:05:05.000Z');

const content: PageContent = {
  version: 1,
  schemaVersion: '1.0.0',
  blocks: [{ id: 'heading-1', type: 'heading', order: 0, data: { text: 'Hello', level: 1 } }],
};

function copy<T>(value: T): T {
  return structuredClone(value);
}

class ScheduleStore implements ContentLifecycleStore {
  pages = new Map<string, LifecyclePage>();
  revisions = new Map<string, LifecyclePageRevision>();
  releases = new Map<string, LifecycleContentRelease>();
  releaseItems: LifecycleContentReleaseItem[] = [];
  auditLogs: RecordLifecycleAuditParams[] = [];
  userStatuses = new Map<string, string>([[actorId, 'ACTIVE']]);
  private sequence = 0;

  async transaction<T>(fn: (txStore: ContentLifecycleStore) => Promise<T>): Promise<T> {
    const snapshot = copy({
      pages: this.pages,
      revisions: this.revisions,
      releases: this.releases,
      releaseItems: this.releaseItems,
      auditLogs: this.auditLogs,
    });
    try {
      return await fn(this);
    } catch (error) {
      this.pages = snapshot.pages;
      this.revisions = snapshot.revisions;
      this.releases = snapshot.releases;
      this.releaseItems = snapshot.releaseItems;
      this.auditLogs = snapshot.auditLogs;
      throw error;
    }
  }

  async findPageById(scopeProjectId: string, pageId: string): Promise<LifecyclePage | null> {
    const page = this.pages.get(pageId);
    return page && page.projectId === scopeProjectId ? copy(page) : null;
  }

  async findUserStatus(userId: string): Promise<string | null> {
    return this.userStatuses.get(userId) ?? null;
  }

  async createPageWithDraft(params: CreatePageWithDraftParams) {
    const pageId = `page-${++this.sequence}`;
    const revisionId = `revision-${this.sequence}`;
    const now = new Date('2030-01-01T00:00:00.000Z');
    const revision: LifecyclePageRevision = {
      id: revisionId,
      pageId,
      revisionNumber: 1,
      status: 'DRAFT',
      title: params.title,
      slug: params.slug,
      locale: params.locale,
      description: params.description,
      visibility: params.visibility,
      content: copy(params.content),
      seo: {},
      navigation: {},
      schemaVersion: params.schemaVersion,
      lockVersion: 1,
      createdById: params.actorId,
      createdAt: now,
      submittedAt: null,
      approvedAt: null,
      publishedAt: null,
      derivedFromRevisionId: null,
    };
    const page: LifecyclePage = {
      id: pageId,
      projectId: params.projectId,
      key: params.key,
      parentId: params.parentId,
      sortOrder: 0,
      draftRevisionId: revisionId,
      publishedRevisionId: null,
      scheduledRevisionId: null,
      scheduledPublishAt: null,
      scheduledById: null,
      createdAt: now,
      updatedAt: now,
    };
    this.pages.set(pageId, page);
    this.revisions.set(revisionId, revision);
    return { page: copy(page), revision: copy(revision) };
  }

  async findRevisionById(revisionId: string): Promise<LifecyclePageRevision | null> {
    const revision = this.revisions.get(revisionId);
    return revision ? copy(revision) : null;
  }

  async updateDraftRevisionAtomic(params: UpdateDraftRevisionAtomicParams) {
    const revision = this.revisions.get(params.revisionId);
    if (!revision || revision.pageId !== params.pageId || revision.status !== 'DRAFT' || revision.lockVersion !== params.expectedLockVersion) {
      return { updated: false };
    }
    const updated = { ...revision, ...params.data, lockVersion: revision.lockVersion + 1 };
    this.revisions.set(revision.id, updated);
    return { updated: true, revision: copy(updated) };
  }

  async transitionRevisionStatusAtomic(params: TransitionRevisionStatusAtomicParams) {
    const revision = this.revisions.get(params.revisionId);
    if (!revision || revision.pageId !== params.pageId || revision.status !== params.expectedStatus || revision.lockVersion !== params.expectedLockVersion) {
      return { updated: false };
    }
    const updated = {
      ...revision,
      status: params.targetStatus,
      lockVersion: revision.lockVersion + 1,
      submittedAt: params.submittedAt === undefined ? revision.submittedAt : params.submittedAt,
      approvedAt: params.approvedAt === undefined ? revision.approvedAt : params.approvedAt,
      publishedAt: params.publishedAt === undefined ? revision.publishedAt : params.publishedAt,
    } as LifecyclePageRevision;
    this.revisions.set(revision.id, updated);
    return { updated: true, revision: copy(updated) };
  }

  async claimRevisionLockAtomic(params: ClaimRevisionLockAtomicParams) {
    const revision = this.revisions.get(params.revisionId);
    if (!revision || revision.pageId !== params.pageId || revision.status !== params.expectedStatus || revision.lockVersion !== params.expectedLockVersion) {
      return { updated: false };
    }
    const updated = { ...revision, lockVersion: revision.lockVersion + 1 };
    this.revisions.set(revision.id, updated);
    return { updated: true, revision: copy(updated) };
  }

  async getNextRevisionNumber(pageId: string): Promise<number> {
    return Math.max(0, ...[...this.revisions.values()].filter((revision) => revision.pageId === pageId).map((revision) => revision.revisionNumber)) + 1;
  }

  async createDraftRevisionFromSource(params: CreateDraftRevisionFromSourceParams) {
    const source = params.sourceRevision;
    const revision: LifecyclePageRevision = {
      ...copy(source),
      id: `revision-${++this.sequence}`,
      revisionNumber: params.revisionNumber,
      status: 'DRAFT',
      lockVersion: 1,
      createdById: params.actorId,
      createdAt: new Date('2030-01-03T00:00:00.000Z'),
      submittedAt: null,
      approvedAt: null,
      publishedAt: null,
      derivedFromRevisionId: params.derivedFromRevisionId,
    };
    this.revisions.set(revision.id, revision);
    return copy(revision);
  }

  async setPageDraftRevisionPointer(params: SetPageDraftRevisionPointerParams) {
    const page = this.pages.get(params.pageId);
    if (!page || page.projectId !== params.projectId) throw new ContentLifecycleError('PAGE_NOT_FOUND', 'Page not found');
    const updated = { ...page, draftRevisionId: params.draftRevisionId };
    this.pages.set(page.id, updated);
    return copy(updated);
  }

  async touchPageUpdatedAt(scopeProjectId: string, pageId: string) {
    const page = await this.findPageById(scopeProjectId, pageId);
    if (!page) throw new ContentLifecycleError('PAGE_NOT_FOUND', 'Page not found');
    this.pages.set(page.id, page);
    return page;
  }

  async createPublishedRelease(params: CreatePublishedReleaseParams) {
    const release: LifecycleContentRelease = {
      id: `release-${++this.sequence}`,
      projectId: params.projectId,
      status: params.status,
      createdById: params.createdById,
      createdAt: params.publishedAt,
      publishedAt: params.publishedAt,
      rolledBackAt: null,
    };
    this.releases.set(release.id, release);
    return copy(release);
  }

  async createReleaseItem(params: CreateReleaseItemParams) {
    const item = { ...params };
    this.releaseItems.push(item);
    return copy(item);
  }

  async setPublishedPagePointersAtomic(params: SetPublishedPagePointersAtomicParams) {
    const page = this.pages.get(params.pageId);
    if (!page || page.projectId !== params.projectId || page.draftRevisionId !== params.expectedDraftRevisionId || page.publishedRevisionId !== params.expectedPreviousPublishedRevisionId) return { updated: false };
    const updated = { ...page, publishedRevisionId: params.newPublishedRevisionId, draftRevisionId: null, scheduledRevisionId: null, scheduledPublishAt: null, scheduledById: null };
    this.pages.set(page.id, updated);
    return { updated: true, page: copy(updated) };
  }

  async setScheduledPublishAtomic(params: SetScheduledPublishAtomicParams) {
    const page = this.pages.get(params.pageId);
    if (!page || page.projectId !== params.projectId || page.draftRevisionId !== params.expectedDraftRevisionId || page.scheduledRevisionId || page.scheduledPublishAt || page.scheduledById) return { updated: false };
    const updated = { ...page, scheduledRevisionId: params.scheduledRevisionId, scheduledPublishAt: params.scheduledPublishAt, scheduledById: params.scheduledById };
    this.pages.set(page.id, updated);
    return { updated: true, page: copy(updated) };
  }

  async clearScheduledPublishAtomic(params: { projectId: string; pageId: string; expectedScheduledRevisionId: string; expectedScheduledPublishAt: Date; expectedScheduledById: string }) {
    const page = this.pages.get(params.pageId);
    if (!page || page.projectId !== params.projectId || page.scheduledRevisionId !== params.expectedScheduledRevisionId || page.scheduledPublishAt?.getTime() !== params.expectedScheduledPublishAt.getTime() || page.scheduledById !== params.expectedScheduledById) return { updated: false };
    const updated = { ...page, scheduledRevisionId: null, scheduledPublishAt: null, scheduledById: null };
    this.pages.set(page.id, updated);
    return { updated: true, page: copy(updated) };
  }

  async setScheduledPublishedPagePointersAtomic(params: SetScheduledPublishedPagePointersAtomicParams) {
    const page = this.pages.get(params.pageId);
    if (!page || page.projectId !== params.projectId || page.draftRevisionId !== params.expectedDraftRevisionId || page.publishedRevisionId !== params.expectedPreviousPublishedRevisionId || page.scheduledRevisionId !== params.expectedScheduledRevisionId || page.scheduledPublishAt?.getTime() !== params.expectedScheduledPublishAt.getTime() || page.scheduledById !== params.expectedScheduledById) return { updated: false };
    const updated = { ...page, publishedRevisionId: params.newPublishedRevisionId, draftRevisionId: null, scheduledRevisionId: null, scheduledPublishAt: null, scheduledById: null };
    this.pages.set(page.id, updated);
    return { updated: true, page: copy(updated) };
  }

  async setUnpublishedPagePointersAtomic(params: SetUnpublishedPagePointersAtomicParams) {
    const page = this.pages.get(params.pageId);
    if (!page || page.projectId !== params.projectId || page.publishedRevisionId !== params.expectedPublishedRevisionId || page.draftRevisionId !== params.expectedDraftRevisionId) return { updated: false };
    const updated = { ...page, publishedRevisionId: null, draftRevisionId: params.newDraftRevisionId };
    this.pages.set(page.id, updated);
    return { updated: true, page: copy(updated) };
  }

  async recordAudit(params: RecordLifecycleAuditParams): Promise<void> {
    this.auditLogs.push(copy(params));
  }
}

function setup() {
  const store = new ScheduleStore();
  const granted = new Set<string>();
  const service = new ContentLifecycleService({
    store,
    hasPermission: async (id: string, permission: PermissionKey, scope: string | null) => granted.has(`${id}:${permission}:${scope}`),
  });
  const grant = (id = actorId, permission: PermissionKey = 'content.publish', scope = projectId) => granted.add(`${id}:${permission}:${scope}`);
  return { store, service, grant };
}

async function approvedPage(service: ContentLifecycleService, grant: (id?: string, permission?: PermissionKey, scope?: string) => void, key = 'home', scope = projectId) {
  grant(actorId, 'content.create', scope);
  grant(actorId, 'content.edit', scope);
  grant(actorId, 'content.approve', scope);
  const draft = await service.createPageDraft({ actorId, projectId: scope, key, title: 'Home', slug: key, locale: 'en', visibility: 'PUBLIC', content });
  const review = await service.submitForReview({ actorId, projectId: scope, pageId: draft.page.id, expectedLockVersion: draft.revision.lockVersion });
  return service.approveReview({ actorId, projectId: scope, pageId: review.page.id, expectedLockVersion: review.revision.lockVersion });
}

async function publishedPage(service: ContentLifecycleService, grant: ReturnType<typeof setup>['grant'], key = 'home') {
  const approved = await approvedPage(service, grant, key);
  grant(actorId, 'content.publish', projectId);
  return service.publishApproved({ actorId, projectId, pageId: approved.page.id, expectedLockVersion: approved.revision.lockVersion });
}

async function expectCode(action: Promise<unknown>, code: ContentLifecycleError['code']) {
  await assert.rejects(action, (error: unknown) => error instanceof ContentLifecycleError && error.code === code);
}

describe('SYN-CONTENT-006: schedule and unpublish lifecycle', () => {
  it('schedule success', async () => {
    const { service, grant } = setup();
    const approved = await approvedPage(service, grant);
    grant();
    const result = await service.schedulePublish({ actorId, projectId, pageId: approved.page.id, expectedLockVersion: approved.revision.lockVersion, publishAt });
    assert.equal(result.page.scheduledRevisionId, approved.revision.id);
    assert.equal(result.page.scheduledPublishAt?.getTime(), publishAt.getTime());
  });

  it('past timestamp rejection', async () => {
    const { service, grant } = setup();
    const approved = await approvedPage(service, grant);
    grant();
    await expectCode(service.schedulePublish({ actorId, projectId, pageId: approved.page.id, expectedLockVersion: approved.revision.lockVersion, publishAt: new Date('2020-01-01T00:00:00Z') }), 'INVALID_INPUT');
  });

  it('permission denial', async () => {
    const { service, grant } = setup();
    const approved = await approvedPage(service, grant);
    await expectCode(service.schedulePublish({ actorId, projectId, pageId: approved.page.id, expectedLockVersion: approved.revision.lockVersion, publishAt }), 'FORBIDDEN');
  });

  it('project isolation', async () => {
    const { service, grant } = setup();
    const approved = await approvedPage(service, grant, 'home', projectId);
    grant(actorId, 'content.publish', otherProjectId);
    await expectCode(service.schedulePublish({ actorId, projectId: otherProjectId, pageId: approved.page.id, expectedLockVersion: approved.revision.lockVersion, publishAt }), 'PAGE_NOT_FOUND');
  });

  it('stale lock', async () => {
    const { service, grant } = setup();
    const approved = await approvedPage(service, grant);
    grant();
    await expectCode(service.schedulePublish({ actorId, projectId, pageId: approved.page.id, expectedLockVersion: approved.revision.lockVersion - 1, publishAt }), 'LOCK_CONFLICT');
  });

  it('duplicate schedule', async () => {
    const { service, grant } = setup();
    const approved = await approvedPage(service, grant);
    grant();
    await service.schedulePublish({ actorId, projectId, pageId: approved.page.id, expectedLockVersion: approved.revision.lockVersion, publishAt });
    await expectCode(service.schedulePublish({ actorId, projectId, pageId: approved.page.id, expectedLockVersion: approved.revision.lockVersion, publishAt: dueAt }), 'STATE_TRANSITION_INVALID');
  });

  it('cancel success', async () => {
    const { store, service, grant } = setup();
    const approved = await approvedPage(service, grant);
    grant();
    await service.schedulePublish({ actorId, projectId, pageId: approved.page.id, expectedLockVersion: approved.revision.lockVersion, publishAt });
    const result = await service.cancelScheduledPublish({ actorId, projectId, pageId: approved.page.id, expectedScheduledRevisionId: approved.revision.id, expectedScheduledPublishAt: publishAt });
    assert.equal(result.page.scheduledRevisionId, null);
    assert.equal(store.auditLogs.at(-1)?.action, 'CONTENT_PUBLISH_SCHEDULE_CANCELLED');
  });

  it('stale cancel CAS', async () => {
    const { service, grant } = setup();
    const approved = await approvedPage(service, grant);
    grant();
    await service.schedulePublish({ actorId, projectId, pageId: approved.page.id, expectedLockVersion: approved.revision.lockVersion, publishAt });
    await expectCode(service.cancelScheduledPublish({ actorId, projectId, pageId: approved.page.id, expectedScheduledRevisionId: approved.revision.id, expectedScheduledPublishAt: dueAt }), 'LOCK_CONFLICT');
  });

  it('manual publish clears schedule', async () => {
    const { service, grant } = setup();
    const approved = await approvedPage(service, grant);
    grant();
    await service.schedulePublish({ actorId, projectId, pageId: approved.page.id, expectedLockVersion: approved.revision.lockVersion, publishAt });
    const result = await service.publishApproved({ actorId, projectId, pageId: approved.page.id, expectedLockVersion: approved.revision.lockVersion });
    assert.equal(result.page.scheduledRevisionId, null);
    assert.equal(result.page.scheduledPublishAt, null);
  });

  it('due publish success', async () => {
    const { service, grant } = setup();
    const approved = await approvedPage(service, grant);
    grant();
    await service.schedulePublish({ actorId, projectId, pageId: approved.page.id, expectedLockVersion: approved.revision.lockVersion, publishAt });
    const result = await service.publishScheduled({ projectId, pageId: approved.page.id, expectedScheduledRevisionId: approved.revision.id, expectedScheduledPublishAt: publishAt, expectedScheduledById: actorId, expectedLockVersion: approved.revision.lockVersion, now: dueAt });
    assert.equal(result.revision.status, 'PUBLISHED');
    assert.equal(result.page.publishedRevisionId, approved.revision.id);
    assert.equal(result.page.scheduledRevisionId, null);
  });

  it('early publish rejection', async () => {
    const { service, grant } = setup();
    const approved = await approvedPage(service, grant);
    grant();
    await service.schedulePublish({ actorId, projectId, pageId: approved.page.id, expectedLockVersion: approved.revision.lockVersion, publishAt });
    await expectCode(service.publishScheduled({ projectId, pageId: approved.page.id, expectedScheduledRevisionId: approved.revision.id, expectedScheduledPublishAt: publishAt, expectedScheduledById: actorId, expectedLockVersion: approved.revision.lockVersion, now: new Date('2030-01-02T03:00:00Z') }), 'STATE_TRANSITION_INVALID');
  });

  it('inactive scheduled actor', async () => {
    const { store, service, grant } = setup();
    const approved = await approvedPage(service, grant);
    grant();
    await service.schedulePublish({ actorId, projectId, pageId: approved.page.id, expectedLockVersion: approved.revision.lockVersion, publishAt });
    store.userStatuses.set(actorId, 'SUSPENDED');
    await expectCode(service.publishScheduled({ projectId, pageId: approved.page.id, expectedScheduledRevisionId: approved.revision.id, expectedScheduledPublishAt: publishAt, expectedScheduledById: actorId, expectedLockVersion: approved.revision.lockVersion, now: dueAt }), 'FORBIDDEN');
  });

  it('revoked content.publish', async () => {
    const { store, service, grant } = setup();
    const approved = await approvedPage(service, grant);
    grant();
    await service.schedulePublish({ actorId, projectId, pageId: approved.page.id, expectedLockVersion: approved.revision.lockVersion, publishAt });
    const revoked = setup();
    revoked.store.pages = store.pages;
    revoked.store.revisions = store.revisions;
    revoked.store.userStatuses = store.userStatuses;
    await expectCode(revoked.service.publishScheduled({ projectId, pageId: approved.page.id, expectedScheduledRevisionId: approved.revision.id, expectedScheduledPublishAt: publishAt, expectedScheduledById: actorId, expectedLockVersion: approved.revision.lockVersion, now: dueAt }), 'FORBIDDEN');
  });

  it('unpublish success', async () => {
    const { service, grant } = setup();
    const published = await publishedPage(service, grant);
    const result = await service.unpublish({ actorId, projectId, pageId: published.page.id, expectedPublishedRevisionId: published.revision.id });
    assert.equal(result.page.publishedRevisionId, null);
    assert.equal(result.draftRevision.status, 'DRAFT');
    assert.equal(result.createdDraft, true);
  });

  it('stale published pointer', async () => {
    const { service, grant } = setup();
    const published = await publishedPage(service, grant);
    await expectCode(service.unpublish({ actorId, projectId, pageId: published.page.id, expectedPublishedRevisionId: 'stale-revision' }), 'LOCK_CONFLICT');
  });

  it('historical PUBLISHED revision immutability', async () => {
    const { store, service, grant } = setup();
    const published = await publishedPage(service, grant);
    const before = await store.findRevisionById(published.revision.id);
    await service.unpublish({ actorId, projectId, pageId: published.page.id, expectedPublishedRevisionId: published.revision.id });
    assert.deepEqual(await store.findRevisionById(published.revision.id), before);
  });

  it('existing draft preservation', async () => {
    const { store, service, grant } = setup();
    const published = await publishedPage(service, grant);
    const draft = await store.createDraftRevisionFromSource({ pageId: published.page.id, revisionNumber: 2, actorId, derivedFromRevisionId: published.revision.id, sourceRevision: published.revision });
    store.pages.get(published.page.id)!.draftRevisionId = draft.id;
    const result = await service.unpublish({ actorId, projectId, pageId: published.page.id, expectedPublishedRevisionId: published.revision.id });
    assert.equal(result.draftRevision.id, draft.id);
    assert.equal(result.createdDraft, false);
  });

  it('missing draft recreation', async () => {
    const { store, service, grant } = setup();
    const published = await publishedPage(service, grant);
    const page = store.pages.get(published.page.id)!;
    page.draftRevisionId = null;
    const result = await service.unpublish({ actorId, projectId, pageId: page.id, expectedPublishedRevisionId: published.revision.id });
    assert.equal(result.createdDraft, true);
    assert.equal(result.draftRevision.derivedFromRevisionId, published.revision.id);
  });

  it('lifecycle audit actions', async () => {
    const { store, service, grant } = setup();
    const approved = await approvedPage(service, grant);
    grant();
    await service.schedulePublish({ actorId, projectId, pageId: approved.page.id, expectedLockVersion: approved.revision.lockVersion, publishAt });
    await service.cancelScheduledPublish({ actorId, projectId, pageId: approved.page.id, expectedScheduledRevisionId: approved.revision.id, expectedScheduledPublishAt: publishAt });
    await service.schedulePublish({ actorId, projectId, pageId: approved.page.id, expectedLockVersion: approved.revision.lockVersion, publishAt });
    await service.publishScheduled({ projectId, pageId: approved.page.id, expectedScheduledRevisionId: approved.revision.id, expectedScheduledPublishAt: publishAt, expectedScheduledById: actorId, expectedLockVersion: approved.revision.lockVersion, now: dueAt });
    await service.unpublish({ actorId, projectId, pageId: approved.page.id, expectedPublishedRevisionId: approved.revision.id });
    assert.deepEqual(store.auditLogs.map((audit) => audit.action), [
      'CONTENT_PAGE_CREATED', 'CONTENT_REVIEW_SUBMITTED', 'CONTENT_REVIEW_APPROVED',
      'CONTENT_PUBLISH_SCHEDULED', 'CONTENT_PUBLISH_SCHEDULE_CANCELLED',
      'CONTENT_PUBLISH_SCHEDULED', 'CONTENT_RELEASE_PUBLISHED', 'CONTENT_PAGE_UNPUBLISHED',
    ]);
  });

  it('no PageContent in audit metadata', async () => {
    const { store, service, grant } = setup();
    const approved = await approvedPage(service, grant);
    grant();
    await service.schedulePublish({ actorId, projectId, pageId: approved.page.id, expectedLockVersion: approved.revision.lockVersion, publishAt });
    await service.publishScheduled({ projectId, pageId: approved.page.id, expectedScheduledRevisionId: approved.revision.id, expectedScheduledPublishAt: publishAt, expectedScheduledById: actorId, expectedLockVersion: approved.revision.lockVersion, now: dueAt });
    await service.unpublish({ actorId, projectId, pageId: approved.page.id, expectedPublishedRevisionId: approved.revision.id });
    for (const audit of store.auditLogs) {
      assert.equal('content' in audit.metadata, false);
      assert.equal(JSON.stringify(audit.metadata).includes('heading-1'), false);
    }
  });
});
