import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import {
  setAuthenticatedUserForTesting,
  setContentLifecycleServiceForTesting,
} from '../lib/domain/pages-api';
import { POST as publishRoute } from '../app/api/admin/projects/[projectId]/pages/[pageId]/actions/publish/route';
import { POST as rollbackRoute } from '../app/api/admin/projects/[projectId]/pages/[pageId]/actions/rollback/route';
import { POST as reopenDraftRoute } from '../app/api/admin/projects/[projectId]/pages/[pageId]/actions/reopen-draft/route';
import {
  ContentLifecycleService,
  ContentLifecycleStore,
  CreatePageWithDraftParams,
  UpdateDraftRevisionAtomicParams,
  TransitionRevisionStatusAtomicParams,
  ClaimRevisionLockAtomicParams,
  CreateDraftRevisionFromSourceParams,
  SetPageDraftRevisionPointerParams,
  CreatePublishedReleaseParams,
  CreateReleaseItemParams,
  SetPublishedPagePointersAtomicParams,
  PublishedReleaseLineage,
  CreateRollbackReleaseParams,
  SetRollbackPublishedPointerAtomicParams,
  SetDraftFromPublishedPointerAtomicParams,
  RecordLifecycleAuditParams,
  LifecyclePage,
  LifecyclePageRevision,
  LifecycleContentRelease,
  LifecycleContentReleaseItem,
  ContentLifecycleError,
} from '../lib/domain/content/lifecycle';
import { PageContent } from '../lib/domain/content/contracts';
import { PermissionKey } from '../lib/auth/rbac';

class FakePublishContentLifecycleStore implements ContentLifecycleStore {
  pages = new Map<string, LifecyclePage>();
  revisions = new Map<string, LifecyclePageRevision>();
  releases = new Map<string, LifecycleContentRelease>();
  releaseItems: LifecycleContentReleaseItem[] = [];
  auditLogs: RecordLifecycleAuditParams[] = [];

  private cloneState() {
    return {
      pages: new Map(Array.from(this.pages.entries()).map(([k, v]) => [k, { ...v }])),
      revisions: new Map(
        Array.from(this.revisions.entries()).map(([k, v]) => [
          k,
          { ...v, seo: { ...v.seo }, navigation: { ...v.navigation } },
        ])
      ),
      releases: new Map(Array.from(this.releases.entries()).map(([k, v]) => [k, { ...v }])),
      releaseItems: [...this.releaseItems.map((i) => ({ ...i }))],
      auditLogs: [...this.auditLogs],
    };
  }

  async transaction<T>(fn: (txStore: ContentLifecycleStore) => Promise<T>): Promise<T> {
    const snapshot = this.cloneState();
    try {
      return await fn(this);
    } catch (err) {
      this.pages = snapshot.pages;
      this.revisions = snapshot.revisions;
      this.releases = snapshot.releases;
      this.releaseItems = snapshot.releaseItems;
      this.auditLogs = snapshot.auditLogs;
      throw err;
    }
  }

  async findPageById(projectId: string, pageId: string): Promise<LifecyclePage | null> {
    const page = this.pages.get(pageId);
    if (!page || page.projectId !== projectId) return null;
    return { ...page };
  }

  async createPageWithDraft(
    params: CreatePageWithDraftParams
  ): Promise<{ page: LifecyclePage; revision: LifecyclePageRevision }> {
    for (const p of this.pages.values()) {
      if (p.projectId === params.projectId && p.key === params.key) {
        throw new ContentLifecycleError('KEY_CONFLICT', `Key '${params.key}' already exists in project`);
      }
    }

    const pageId = `page_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const revisionId = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date();

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
      content: params.content,
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
      createdAt: now,
      updatedAt: now,
    };

    this.pages.set(pageId, page);
    this.revisions.set(revisionId, revision);
    return { page: { ...page }, revision: { ...revision } };
  }

  async findRevisionById(revisionId: string): Promise<LifecyclePageRevision | null> {
    const revision = this.revisions.get(revisionId);
    if (!revision) return null;
    return { ...revision };
  }

  async updateDraftRevisionAtomic(
    params: UpdateDraftRevisionAtomicParams
  ): Promise<{ updated: boolean; revision?: LifecyclePageRevision }> {
    const rev = this.revisions.get(params.revisionId);
    if (!rev || rev.pageId !== params.pageId || rev.lockVersion !== params.expectedLockVersion) {
      return { updated: false };
    }
    const updated: LifecyclePageRevision = {
      ...rev,
      ...params.data,
      content: params.data.content ?? rev.content,
      lockVersion: rev.lockVersion + 1,
    };
    this.revisions.set(params.revisionId, updated);
    return { updated: true, revision: { ...updated } };
  }

  async transitionRevisionStatusAtomic(
    params: TransitionRevisionStatusAtomicParams
  ): Promise<{ updated: boolean; revision?: LifecyclePageRevision }> {
    const rev = this.revisions.get(params.revisionId);
    if (
      !rev ||
      rev.pageId !== params.pageId ||
      rev.status !== params.expectedStatus ||
      rev.lockVersion !== params.expectedLockVersion
    ) {
      return { updated: false };
    }

    const updated: LifecyclePageRevision = {
      ...rev,
      status: params.targetStatus,
      lockVersion: rev.lockVersion + 1,
      submittedAt: params.submittedAt !== undefined ? params.submittedAt : rev.submittedAt,
      approvedAt: params.approvedAt !== undefined ? params.approvedAt : rev.approvedAt,
      publishedAt: params.publishedAt !== undefined ? params.publishedAt : rev.publishedAt,
    };
    this.revisions.set(params.revisionId, updated);
    return { updated: true, revision: { ...updated } };
  }

  async claimRevisionLockAtomic(
    params: ClaimRevisionLockAtomicParams
  ): Promise<{ updated: boolean; revision?: LifecyclePageRevision }> {
    const rev = this.revisions.get(params.revisionId);
    if (
      !rev ||
      rev.pageId !== params.pageId ||
      rev.status !== params.expectedStatus ||
      rev.lockVersion !== params.expectedLockVersion
    ) {
      return { updated: false };
    }
    const updated: LifecyclePageRevision = {
      ...rev,
      lockVersion: rev.lockVersion + 1,
    };
    this.revisions.set(params.revisionId, updated);
    return { updated: true, revision: { ...updated } };
  }

  async getNextRevisionNumber(pageId: string): Promise<number> {
    let max = 0;
    for (const rev of this.revisions.values()) {
      if (rev.pageId === pageId && rev.revisionNumber > max) {
        max = rev.revisionNumber;
      }
    }
    return max + 1;
  }

  async createDraftRevisionFromSource(
    params: CreateDraftRevisionFromSourceParams
  ): Promise<LifecyclePageRevision> {
    const id = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const src = params.sourceRevision;
    const rev: LifecyclePageRevision = {
      id,
      pageId: params.pageId,
      revisionNumber: params.revisionNumber,
      status: 'DRAFT',
      title: src.title,
      slug: src.slug,
      locale: src.locale,
      description: src.description,
      visibility: src.visibility,
      content: JSON.parse(JSON.stringify(src.content)),
      seo: { ...src.seo },
      navigation: { ...src.navigation },
      schemaVersion: src.schemaVersion,
      lockVersion: 1,
      createdById: params.actorId,
      createdAt: new Date(),
      submittedAt: null,
      approvedAt: null,
      publishedAt: null,
      derivedFromRevisionId: params.derivedFromRevisionId,
    };
    this.revisions.set(id, rev);
    return { ...rev };
  }

  async setPageDraftRevisionPointer(
    params: SetPageDraftRevisionPointerParams
  ): Promise<LifecyclePage> {
    const page = this.pages.get(params.pageId);
    if (!page || page.projectId !== params.projectId) {
      throw new ContentLifecycleError('PAGE_NOT_FOUND', 'Page not found');
    }
    const updated: LifecyclePage = {
      ...page,
      draftRevisionId: params.draftRevisionId,
      updatedAt: new Date(),
    };
    this.pages.set(params.pageId, updated);
    return { ...updated };
  }

  async touchPageUpdatedAt(projectId: string, pageId: string): Promise<LifecyclePage> {
    const page = this.pages.get(pageId);
    if (!page || page.projectId !== projectId) {
      throw new ContentLifecycleError('PAGE_NOT_FOUND', 'Page not found');
    }
    const updated: LifecyclePage = {
      ...page,
      updatedAt: new Date(),
    };
    this.pages.set(pageId, updated);
    return { ...updated };
  }

  async createPublishedRelease(
    params: CreatePublishedReleaseParams
  ): Promise<LifecycleContentRelease> {
    const id = `rel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const release: LifecycleContentRelease = {
      id,
      projectId: params.projectId,
      status: params.status,
      createdById: params.createdById,
      createdAt: new Date(),
      publishedAt: params.publishedAt,
      rolledBackAt: null,
    };
    this.releases.set(id, release);
    return { ...release };
  }

  async createReleaseItem(
    params: CreateReleaseItemParams
  ): Promise<LifecycleContentReleaseItem> {
    const item: LifecycleContentReleaseItem = {
      releaseId: params.releaseId,
      pageId: params.pageId,
      revisionId: params.revisionId,
      previousRevisionId: params.previousRevisionId,
    };
    this.releaseItems.push(item);
    return { ...item };
  }

  async setPublishedPagePointersAtomic(
    params: SetPublishedPagePointersAtomicParams
  ): Promise<{ updated: boolean; page?: LifecyclePage }> {
    const page = this.pages.get(params.pageId);
    if (
      !page ||
      page.projectId !== params.projectId ||
      page.draftRevisionId !== params.expectedDraftRevisionId ||
      page.publishedRevisionId !== params.expectedPreviousPublishedRevisionId
    ) {
      return { updated: false };
    }
    const updated: LifecyclePage = {
      ...page,
      publishedRevisionId: params.newPublishedRevisionId,
      draftRevisionId: null,
      updatedAt: params.updatedAt ?? new Date(),
    };
    this.pages.set(params.pageId, updated);
    return { updated: true, page: { ...updated } };
  }

  async findPublishedReleaseLineage(
    projectId: string,
    pageId: string,
    revisionId: string
  ): Promise<PublishedReleaseLineage[]> {
    const results: PublishedReleaseLineage[] = [];
    for (const item of this.releaseItems) {
      if (item.pageId === pageId && item.revisionId === revisionId) {
        const release = this.releases.get(item.releaseId);
        if (release && release.projectId === projectId && release.status === 'PUBLISHED') {
          results.push({
            release: { ...release },
            item: { ...item },
          });
        }
      }
    }
    return results;
  }

  async createRollbackRelease(
    params: CreateRollbackReleaseParams
  ): Promise<LifecycleContentRelease> {
    const id = `rel_rollback_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const release: LifecycleContentRelease = {
      id,
      projectId: params.projectId,
      status: 'ROLLED_BACK',
      createdById: params.createdById,
      createdAt: new Date(),
      publishedAt: null,
      rolledBackAt: params.rolledBackAt,
    };
    this.releases.set(id, release);
    return { ...release };
  }

  async setRollbackPublishedPointerAtomic(
    params: SetRollbackPublishedPointerAtomicParams
  ): Promise<{ updated: boolean; page?: LifecyclePage }> {
    const page = this.pages.get(params.pageId);
    if (
      !page ||
      page.projectId !== params.projectId ||
      page.draftRevisionId !== null ||
      page.publishedRevisionId !== params.expectedPublishedRevisionId
    ) {
      return { updated: false };
    }
    const updated: LifecyclePage = {
      ...page,
      publishedRevisionId: params.targetPublishedRevisionId,
      draftRevisionId: null,
      updatedAt: params.updatedAt,
    };
    this.pages.set(params.pageId, updated);
    return { updated: true, page: { ...updated } };
  }

  async setDraftFromPublishedPointerAtomic(
    params: SetDraftFromPublishedPointerAtomicParams
  ): Promise<{ updated: boolean; page?: LifecyclePage }> {
    const page = this.pages.get(params.pageId);
    if (
      !page ||
      page.projectId !== params.projectId ||
      page.draftRevisionId !== null ||
      page.publishedRevisionId !== params.expectedPublishedRevisionId
    ) {
      return { updated: false };
    }
    const updated: LifecyclePage = {
      ...page,
      draftRevisionId: params.newDraftRevisionId,
      updatedAt: params.updatedAt ?? new Date(),
    };
    this.pages.set(params.pageId, updated);
    return { updated: true, page: { ...updated } };
  }

  async recordAudit(params: RecordLifecycleAuditParams): Promise<void> {
    this.auditLogs.push(params);
  }
}

const DEFAULT_CONTENT: PageContent = {
  version: 1,
  schemaVersion: '1.0.0',
  blocks: [
    {
      id: 'block-1',
      type: 'heading',
      order: 0,
      data: { text: 'Test Nadpis', level: 1 },
    },
  ],
};

function createMockRequest(
  url: string,
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
    rawBody?: string;
  } = {}
): NextRequest {
  const { method = 'POST', body, headers = {}, rawBody } = options;
  const headerMap = new Headers();
  headerMap.set('host', 'localhost:3000');
  headerMap.set('origin', 'http://localhost:3000');
  if (body !== undefined || rawBody !== undefined) {
    headerMap.set('content-type', 'application/json');
  }
  for (const [k, v] of Object.entries(headers)) {
    if (v === '') {
      headerMap.delete(k);
    } else {
      headerMap.set(k, v);
    }
  }

  let reqBody: string | undefined;
  if (rawBody !== undefined) {
    reqBody = rawBody;
  } else if (body !== undefined) {
    reqBody = typeof body === 'string' ? body : JSON.stringify(body);
  }

  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    headers: headerMap,
    body: reqBody,
  });
}

describe('Admin Pages Publish, Rollback, and Reopen-Draft Write API', () => {
  let store: FakePublishContentLifecycleStore;
  let service: ContentLifecycleService;
  let userPermissions: Map<string, Set<PermissionKey>>;

  beforeEach(() => {
    store = new FakePublishContentLifecycleStore();
    userPermissions = new Map();

    const hasPermission = async (
      userId: string,
      permission: PermissionKey,
      _projectId: string | null
    ): Promise<boolean> => {
      const perms = userPermissions.get(userId);
      return perms?.has(permission) ?? false;
    };

    service = new ContentLifecycleService({ store, hasPermission });
    setContentLifecycleServiceForTesting(service);
    setAuthenticatedUserForTesting({
      id: 'usr_admin',
      email: 'admin@example.com',
      displayName: 'Admin',
      status: 'ACTIVE',
    });
    userPermissions.set(
      'usr_admin',
      new Set([
        'content.create',
        'content.edit',
        'content.review',
        'content.approve',
        'content.publish',
        'content.rollback',
      ])
    );
  });

  // Helper to create page with draft, move to review, approve
  async function seedApprovedPage(projectId: string = 'proj_1') {
    const { page, revision: draftRev } = await service.createPageDraft({
      actorId: 'usr_admin',
      projectId,
      key: `page-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: 'Approved Page Title',
      slug: 'approved-page',
      locale: 'cs',
      visibility: 'PUBLIC',
      content: DEFAULT_CONTENT,
    });

    const { revision: inReviewRev } = await service.submitForReview({
      actorId: 'usr_admin',
      projectId,
      pageId: page.id,
      expectedLockVersion: draftRev.lockVersion,
    });

    const { page: approvedPage, revision: approvedRev } = await service.approveReview({
      actorId: 'usr_admin',
      projectId,
      pageId: page.id,
      expectedLockVersion: inReviewRev.lockVersion,
    });

    return { page: approvedPage, revision: approvedRev };
  }

  // Helper to seed published page (1st publication)
  async function seedPublishedPage(projectId: string = 'proj_1') {
    const { page, revision: approvedRev } = await seedApprovedPage(projectId);
    const pubResult = await service.publishApproved({
      actorId: 'usr_admin',
      projectId,
      pageId: page.id,
      expectedLockVersion: approvedRev.lockVersion,
    });
    return {
      page: pubResult.page,
      publishedRevision: pubResult.revision,
      release: pubResult.release,
    };
  }

  // Helper to seed published page with 2 versions (ready for rollback)
  async function seedPublishedPageWithTwoRevisions(projectId: string = 'proj_1') {
    const { page, publishedRevision: rev1, release: rel1 } = await seedPublishedPage(projectId);

    // Reopen draft
    const { draftRevision: rev2Draft } = await service.createDraftFromPublished({
      actorId: 'usr_admin',
      projectId,
      pageId: page.id,
      expectedPublishedRevisionId: rev1.id,
    });

    // Update draft
    const { revision: rev2Updated } = await service.updateDraft({
      actorId: 'usr_admin',
      projectId,
      pageId: page.id,
      expectedLockVersion: rev2Draft.lockVersion,
      title: 'Rev 2 Title',
    });

    // Submit review
    const { revision: rev2InReview } = await service.submitForReview({
      actorId: 'usr_admin',
      projectId,
      pageId: page.id,
      expectedLockVersion: rev2Updated.lockVersion,
    });

    // Approve
    const { revision: rev2Approved } = await service.approveReview({
      actorId: 'usr_admin',
      projectId,
      pageId: page.id,
      expectedLockVersion: rev2InReview.lockVersion,
    });

    // Publish rev 2
    const pub2Result = await service.publishApproved({
      actorId: 'usr_admin',
      projectId,
      pageId: page.id,
      expectedLockVersion: rev2Approved.lockVersion,
    });

    return {
      page: pub2Result.page,
      rev1,
      rel1,
      rev2: pub2Result.revision,
      rel2: pub2Result.release,
    };
  }

  describe('PUBLISH Action Endpoint', () => {
    it('successfully publishes an APPROVED revision and returns minimal DTO', async () => {
      const { page, revision } = await seedApprovedPage('proj_1');

      const req = createMockRequest(
        `http://localhost:3000/api/admin/projects/proj_1/pages/${page.id}/actions/publish`,
        { body: { expectedLockVersion: revision.lockVersion } }
      );
      const res = await publishRoute(req, {
        params: Promise.resolve({ projectId: 'proj_1', pageId: page.id }),
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('cache-control'), 'no-store');
      const body = await res.json();
      assert.ok(body.data);
      assert.strictEqual(body.data.pageId, page.id);
      assert.strictEqual(body.data.revisionId, revision.id);
      assert.strictEqual(body.data.revisionNumber, revision.revisionNumber);
      assert.strictEqual(body.data.status, 'PUBLISHED');
      assert.strictEqual(body.data.lockVersion, revision.lockVersion + 1);
      assert.ok(typeof body.data.releaseId === 'string' && body.data.releaseId.length > 0);

      // Verify page in store has publishedRevisionId set and draftRevisionId cleared
      const storedPage = await store.findPageById('proj_1', page.id);
      assert.strictEqual(storedPage?.publishedRevisionId, revision.id);
      assert.strictEqual(storedPage?.draftRevisionId, null);
    });

    it('forwards expectedLockVersion exactly and rejects stale lock with 409', async () => {
      const { page, revision } = await seedApprovedPage('proj_1');

      const req = createMockRequest(
        `http://localhost:3000/api/admin/projects/proj_1/pages/${page.id}/actions/publish`,
        { body: { expectedLockVersion: revision.lockVersion + 99 } }
      );
      const res = await publishRoute(req, {
        params: Promise.resolve({ projectId: 'proj_1', pageId: page.id }),
      });

      assert.strictEqual(res.status, 409);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'LOCK_CONFLICT');
    });

    it('rejects publishing a page in DRAFT status with 409', async () => {
      const { page, revision: draftRev } = await service.createPageDraft({
        actorId: 'usr_admin',
        projectId: 'proj_1',
        key: 'draft-page-key',
        title: 'Draft Page',
        slug: 'draft-page',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: DEFAULT_CONTENT,
      });

      const req = createMockRequest(
        `http://localhost:3000/api/admin/projects/proj_1/pages/${page.id}/actions/publish`,
        { body: { expectedLockVersion: draftRev.lockVersion } }
      );
      const res = await publishRoute(req, {
        params: Promise.resolve({ projectId: 'proj_1', pageId: page.id }),
      });

      assert.strictEqual(res.status, 409);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'STATE_TRANSITION_INVALID');
    });

    it('returns 403 when user lacks content.publish permission', async () => {
      const { page, revision } = await seedApprovedPage('proj_1');

      setAuthenticatedUserForTesting({
        id: 'usr_editor',
        email: 'editor@example.com',
        displayName: 'Editor',
        status: 'ACTIVE',
      });
      userPermissions.set('usr_editor', new Set(['content.create', 'content.edit']));

      const req = createMockRequest(
        `http://localhost:3000/api/admin/projects/proj_1/pages/${page.id}/actions/publish`,
        { body: { expectedLockVersion: revision.lockVersion } }
      );
      const res = await publishRoute(req, {
        params: Promise.resolve({ projectId: 'proj_1', pageId: page.id }),
      });

      assert.strictEqual(res.status, 403);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'FORBIDDEN');
    });

    it('returns 404 when page does not exist in project', async () => {
      const req = createMockRequest(
        `http://localhost:3000/api/admin/projects/proj_1/pages/non_existent_page/actions/publish`,
        { body: { expectedLockVersion: 1 } }
      );
      const res = await publishRoute(req, {
        params: Promise.resolve({ projectId: 'proj_1', pageId: 'non_existent_page' }),
      });

      assert.strictEqual(res.status, 404);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'PAGE_NOT_FOUND');
    });
  });

  describe('ROLLBACK Action Endpoint', () => {
    it('successfully rolls back a published page to previous version and returns minimal DTO', async () => {
      const { page, rev1, rev2 } = await seedPublishedPageWithTwoRevisions('proj_1');

      const req = createMockRequest(
        `http://localhost:3000/api/admin/projects/proj_1/pages/${page.id}/actions/rollback`,
        { body: { expectedPublishedRevisionId: rev2.id } }
      );
      const res = await rollbackRoute(req, {
        params: Promise.resolve({ projectId: 'proj_1', pageId: page.id }),
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('cache-control'), 'no-store');
      const body = await res.json();
      assert.ok(body.data);
      assert.strictEqual(body.data.pageId, page.id);
      assert.strictEqual(body.data.fromRevisionId, rev2.id);
      assert.strictEqual(body.data.restoredRevisionId, rev1.id);
      assert.strictEqual(body.data.restoredRevisionNumber, rev1.revisionNumber);
      assert.strictEqual(body.data.status, 'PUBLISHED');
      assert.ok(typeof body.data.rollbackReleaseId === 'string');

      // Verify page in store points to rev1 as published
      const storedPage = await store.findPageById('proj_1', page.id);
      assert.strictEqual(storedPage?.publishedRevisionId, rev1.id);
      assert.strictEqual(storedPage?.draftRevisionId, null);
    });

    it('forwards expectedPublishedRevisionId exactly and rejects stale/mismatched revision with 409', async () => {
      const { page, rev1 } = await seedPublishedPageWithTwoRevisions('proj_1');

      // Send rev1 instead of rev2 as expectedPublishedRevisionId
      const req = createMockRequest(
        `http://localhost:3000/api/admin/projects/proj_1/pages/${page.id}/actions/rollback`,
        { body: { expectedPublishedRevisionId: rev1.id } }
      );
      const res = await rollbackRoute(req, {
        params: Promise.resolve({ projectId: 'proj_1', pageId: page.id }),
      });

      assert.strictEqual(res.status, 409);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'LOCK_CONFLICT');
    });

    it('rejects rollback when page has only 1 published revision (ROLLBACK_NOT_AVAILABLE) with 409', async () => {
      const { page, publishedRevision } = await seedPublishedPage('proj_1');

      const req = createMockRequest(
        `http://localhost:3000/api/admin/projects/proj_1/pages/${page.id}/actions/rollback`,
        { body: { expectedPublishedRevisionId: publishedRevision.id } }
      );
      const res = await rollbackRoute(req, {
        params: Promise.resolve({ projectId: 'proj_1', pageId: page.id }),
      });

      assert.strictEqual(res.status, 409);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'ROLLBACK_NOT_AVAILABLE');
    });

    it('rejects rollback when page has no published revision with 409', async () => {
      const { page } = await seedApprovedPage('proj_1');

      const req = createMockRequest(
        `http://localhost:3000/api/admin/projects/proj_1/pages/${page.id}/actions/rollback`,
        { body: { expectedPublishedRevisionId: 'rev_fake' } }
      );
      const res = await rollbackRoute(req, {
        params: Promise.resolve({ projectId: 'proj_1', pageId: page.id }),
      });

      assert.strictEqual(res.status, 409);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'ACTIVE_DRAFT_EXISTS');
    });

    it('rejects rollback when active draft exists (ACTIVE_DRAFT_EXISTS) with 409', async () => {
      const { page, rev2 } = await seedPublishedPageWithTwoRevisions('proj_1');
      // Create a draft
      await service.createDraftFromPublished({
        actorId: 'usr_admin',
        projectId: 'proj_1',
        pageId: page.id,
        expectedPublishedRevisionId: rev2.id,
      });

      const req = createMockRequest(
        `http://localhost:3000/api/admin/projects/proj_1/pages/${page.id}/actions/rollback`,
        { body: { expectedPublishedRevisionId: rev2.id } }
      );
      const res = await rollbackRoute(req, {
        params: Promise.resolve({ projectId: 'proj_1', pageId: page.id }),
      });

      assert.strictEqual(res.status, 409);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'ACTIVE_DRAFT_EXISTS');
    });

    it('returns 403 when user lacks content.rollback permission', async () => {
      const { page, rev2 } = await seedPublishedPageWithTwoRevisions('proj_1');

      setAuthenticatedUserForTesting({
        id: 'usr_publisher',
        email: 'pub@example.com',
        displayName: 'Publisher',
        status: 'ACTIVE',
      });
      userPermissions.set('usr_publisher', new Set(['content.publish']));

      const req = createMockRequest(
        `http://localhost:3000/api/admin/projects/proj_1/pages/${page.id}/actions/rollback`,
        { body: { expectedPublishedRevisionId: rev2.id } }
      );
      const res = await rollbackRoute(req, {
        params: Promise.resolve({ projectId: 'proj_1', pageId: page.id }),
      });

      assert.strictEqual(res.status, 403);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'FORBIDDEN');
    });
  });

  describe('REOPEN DRAFT Action Endpoint', () => {
    it('successfully creates new draft from published revision and returns minimal DTO', async () => {
      const { page, publishedRevision } = await seedPublishedPage('proj_1');

      const req = createMockRequest(
        `http://localhost:3000/api/admin/projects/proj_1/pages/${page.id}/actions/reopen-draft`,
        { body: { expectedPublishedRevisionId: publishedRevision.id } }
      );
      const res = await reopenDraftRoute(req, {
        params: Promise.resolve({ projectId: 'proj_1', pageId: page.id }),
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('cache-control'), 'no-store');
      const body = await res.json();
      assert.ok(body.data);
      assert.strictEqual(body.data.pageId, page.id);
      assert.strictEqual(body.data.publishedRevisionId, publishedRevision.id);
      assert.ok(body.data.draft);
      assert.ok(typeof body.data.draft.revisionId === 'string');
      assert.notStrictEqual(body.data.draft.revisionId, publishedRevision.id);
      assert.strictEqual(body.data.draft.revisionNumber, publishedRevision.revisionNumber + 1);
      assert.strictEqual(body.data.draft.status, 'DRAFT');
      assert.strictEqual(body.data.draft.lockVersion, 1);
      assert.strictEqual(body.data.draft.derivedFromRevisionId, publishedRevision.id);

      // Verify published revision in store remains intact and active draft pointer is set
      const storedPage = await store.findPageById('proj_1', page.id);
      assert.strictEqual(storedPage?.publishedRevisionId, publishedRevision.id);
      assert.strictEqual(storedPage?.draftRevisionId, body.data.draft.revisionId);

      const pubRevInStore = await store.findRevisionById(publishedRevision.id);
      assert.strictEqual(pubRevInStore?.status, 'PUBLISHED');
    });

    it('rejects reopening draft when active draft already exists with 409', async () => {
      const { page, publishedRevision } = await seedPublishedPage('proj_1');

      // Create draft first
      await service.createDraftFromPublished({
        actorId: 'usr_admin',
        projectId: 'proj_1',
        pageId: page.id,
        expectedPublishedRevisionId: publishedRevision.id,
      });

      // Try to reopen draft again
      const req = createMockRequest(
        `http://localhost:3000/api/admin/projects/proj_1/pages/${page.id}/actions/reopen-draft`,
        { body: { expectedPublishedRevisionId: publishedRevision.id } }
      );
      const res = await reopenDraftRoute(req, {
        params: Promise.resolve({ projectId: 'proj_1', pageId: page.id }),
      });

      assert.strictEqual(res.status, 409);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'ACTIVE_DRAFT_EXISTS');
    });

    it('rejects reopening draft with mismatched expectedPublishedRevisionId with 409', async () => {
      const { page } = await seedPublishedPage('proj_1');

      const req = createMockRequest(
        `http://localhost:3000/api/admin/projects/proj_1/pages/${page.id}/actions/reopen-draft`,
        { body: { expectedPublishedRevisionId: 'rev_stale_nonexistent' } }
      );
      const res = await reopenDraftRoute(req, {
        params: Promise.resolve({ projectId: 'proj_1', pageId: page.id }),
      });

      assert.strictEqual(res.status, 409);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'LOCK_CONFLICT');
    });

    it('returns 403 when user lacks content.edit permission', async () => {
      const { page, publishedRevision } = await seedPublishedPage('proj_1');

      setAuthenticatedUserForTesting({
        id: 'usr_viewer',
        email: 'view@example.com',
        displayName: 'Viewer',
        status: 'ACTIVE',
      });
      userPermissions.set('usr_viewer', new Set([]));

      const req = createMockRequest(
        `http://localhost:3000/api/admin/projects/proj_1/pages/${page.id}/actions/reopen-draft`,
        { body: { expectedPublishedRevisionId: publishedRevision.id } }
      );
      const res = await reopenDraftRoute(req, {
        params: Promise.resolve({ projectId: 'proj_1', pageId: page.id }),
      });

      assert.strictEqual(res.status, 403);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'FORBIDDEN');
    });
  });

  describe('SECURITY and Boundary Protection', () => {
    it('returns 401 when unauthenticated across all 3 endpoints', async () => {
      setAuthenticatedUserForTesting(null);

      const endpoints = [
        { route: publishRoute, name: 'publish', body: { expectedLockVersion: 1 } },
        { route: rollbackRoute, name: 'rollback', body: { expectedPublishedRevisionId: 'rev_1' } },
        { route: reopenDraftRoute, name: 'reopen-draft', body: { expectedPublishedRevisionId: 'rev_1' } },
      ];

      for (const ep of endpoints) {
        const req = createMockRequest(
          `http://localhost:3000/api/admin/projects/proj_1/pages/page_1/actions/${ep.name}`,
          { body: ep.body }
        );
        const res = await ep.route(req, {
          params: Promise.resolve({ projectId: 'proj_1', pageId: 'page_1' }),
        });
        assert.strictEqual(res.status, 401, `Expected 401 for ${ep.name}`);
        const data = await res.json();
        assert.strictEqual(data.error.code, 'UNAUTHENTICATED');
      }
    });

    it('rejects actorId / userId / role / permissions body injection on publish', async () => {
      const injectedKeys = ['actorId', 'userId', 'role', 'permissions', 'projectId', 'pageId', 'status'];
      for (const key of injectedKeys) {
        const req = createMockRequest(
          `http://localhost:3000/api/admin/projects/proj_1/pages/page_1/actions/publish`,
          { body: { expectedLockVersion: 1, [key]: 'attacker' } }
        );
        const res = await publishRoute(req, {
          params: Promise.resolve({ projectId: 'proj_1', pageId: 'page_1' }),
        });
        assert.strictEqual(res.status, 400, `Expected 400 for injected key ${key}`);
        const data = await res.json();
        assert.strictEqual(data.error.code, 'INVALID_INPUT');
      }
    });

    it('rejects actorId / userId / role / permissions body injection on rollback and reopen-draft', async () => {
      const injectedKeys = [
        'actorId',
        'userId',
        'role',
        'permissions',
        'projectId',
        'pageId',
        'status',
        'revisionId',
        'publishedRevisionId',
        'draftRevisionId',
        'expectedLockVersion',
      ];
      for (const key of injectedKeys) {
        const req1 = createMockRequest(
          `http://localhost:3000/api/admin/projects/proj_1/pages/page_1/actions/rollback`,
          { body: { expectedPublishedRevisionId: 'rev_1', [key]: 'attacker' } }
        );
        const res1 = await rollbackRoute(req1, {
          params: Promise.resolve({ projectId: 'proj_1', pageId: 'page_1' }),
        });
        assert.strictEqual(res1.status, 400, `Expected 400 for rollback injected key ${key}`);

        const req2 = createMockRequest(
          `http://localhost:3000/api/admin/projects/proj_1/pages/page_1/actions/reopen-draft`,
          { body: { expectedPublishedRevisionId: 'rev_1', [key]: 'attacker' } }
        );
        const res2 = await reopenDraftRoute(req2, {
          params: Promise.resolve({ projectId: 'proj_1', pageId: 'page_1' }),
        });
        assert.strictEqual(res2.status, 400, `Expected 400 for reopen-draft injected key ${key}`);
      }
    });

    it('rejects cross-site CSRF requests with 403 CSRF_REJECTED', async () => {
      const endpoints = [
        { route: publishRoute, name: 'publish', body: { expectedLockVersion: 1 } },
        { route: rollbackRoute, name: 'rollback', body: { expectedPublishedRevisionId: 'rev_1' } },
        { route: reopenDraftRoute, name: 'reopen-draft', body: { expectedPublishedRevisionId: 'rev_1' } },
      ];

      for (const ep of endpoints) {
        const req = createMockRequest(
          `http://localhost:3000/api/admin/projects/proj_1/pages/page_1/actions/${ep.name}`,
          {
            body: ep.body,
            headers: {
              origin: 'https://evil-hacker.com',
              'sec-fetch-site': 'cross-site',
            },
          }
        );
        const res = await ep.route(req, {
          params: Promise.resolve({ projectId: 'proj_1', pageId: 'page_1' }),
        });
        assert.strictEqual(res.status, 403, `Expected 403 for ${ep.name}`);
        const data = await res.json();
        assert.strictEqual(data.error.code, 'CSRF_REJECTED');
      }
    });

    it('rejects non-application/json content type with 415', async () => {
      const req = createMockRequest(
        `http://localhost:3000/api/admin/projects/proj_1/pages/page_1/actions/publish`,
        {
          body: { expectedLockVersion: 1 },
          headers: { 'content-type': 'text/plain' },
        }
      );
      const res = await publishRoute(req, {
        params: Promise.resolve({ projectId: 'proj_1', pageId: 'page_1' }),
      });
      assert.strictEqual(res.status, 415);
      const data = await res.json();
      assert.strictEqual(data.error.code, 'UNSUPPORTED_MEDIA_TYPE');
    });

    it('rejects invalid JSON syntax with 400', async () => {
      const req = createMockRequest(
        `http://localhost:3000/api/admin/projects/proj_1/pages/page_1/actions/publish`,
        { rawBody: '{ broken json' }
      );
      const res = await publishRoute(req, {
        params: Promise.resolve({ projectId: 'proj_1', pageId: 'page_1' }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.code, 'INVALID_INPUT');
    });

    it('rejects array or primitive body with 400', async () => {
      const req1 = createMockRequest(
        `http://localhost:3000/api/admin/projects/proj_1/pages/page_1/actions/publish`,
        { rawBody: '[1, 2, 3]' }
      );
      const res1 = await publishRoute(req1, {
        params: Promise.resolve({ projectId: 'proj_1', pageId: 'page_1' }),
      });
      assert.strictEqual(res1.status, 400);

      const req2 = createMockRequest(
        `http://localhost:3000/api/admin/projects/proj_1/pages/page_1/actions/rollback`,
        { rawBody: '"string body"' }
      );
      const res2 = await rollbackRoute(req2, {
        params: Promise.resolve({ projectId: 'proj_1', pageId: 'page_1' }),
      });
      assert.strictEqual(res2.status, 400);
    });

    it('rejects oversized payload (> 2 MiB) with 400', async () => {
      const bigString = 'x'.repeat(2 * 1024 * 1024 + 100);
      const req = createMockRequest(
        `http://localhost:3000/api/admin/projects/proj_1/pages/page_1/actions/publish`,
        { rawBody: bigString }
      );
      const res = await publishRoute(req, {
        params: Promise.resolve({ projectId: 'proj_1', pageId: 'page_1' }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.code, 'INVALID_INPUT');
    });

    it('does not leak internal database / stack errors', async () => {
      // Force an unexpected error inside service
      const brokenService = {
        publishApproved: async () => {
          throw new Error('FATAL: raw database stack trace /var/secret/prisma.sock');
        },
      } as unknown as ContentLifecycleService;
      setContentLifecycleServiceForTesting(brokenService);

      const req = createMockRequest(
        `http://localhost:3000/api/admin/projects/proj_1/pages/page_1/actions/publish`,
        { body: { expectedLockVersion: 1 } }
      );
      const res = await publishRoute(req, {
        params: Promise.resolve({ projectId: 'proj_1', pageId: 'page_1' }),
      });
      assert.strictEqual(res.status, 500);
      const data = await res.json();
      assert.strictEqual(data.error.code, 'INTERNAL_ERROR');
      assert.strictEqual(data.error.message, 'An unexpected error occurred');
      assert.ok(!JSON.stringify(data).includes('prisma.sock'));
      assert.ok(!JSON.stringify(data).includes('FATAL'));
    });
  });

  describe('STATIC INVARIANTS & Architecture Rules', () => {
    it('verifies route files do not import Prisma directly', () => {
      const routePaths = [
        'app/api/admin/projects/[projectId]/pages/[pageId]/actions/publish/route.ts',
        'app/api/admin/projects/[projectId]/pages/[pageId]/actions/rollback/route.ts',
        'app/api/admin/projects/[projectId]/pages/[pageId]/actions/reopen-draft/route.ts',
      ];

      for (const relPath of routePaths) {
        const fullPath = path.join(process.cwd(), relPath);
        const content = fs.readFileSync(fullPath, 'utf8');
        assert.ok(
          !content.includes('@prisma/client'),
          `Route ${relPath} must not import @prisma/client`
        );
        assert.ok(
          !content.includes('prisma'),
          `Route ${relPath} must not reference prisma directly`
        );
      }
    });

    it('verifies route files do not import pagesFixture', () => {
      const routePaths = [
        'app/api/admin/projects/[projectId]/pages/[pageId]/actions/publish/route.ts',
        'app/api/admin/projects/[projectId]/pages/[pageId]/actions/rollback/route.ts',
        'app/api/admin/projects/[projectId]/pages/[pageId]/actions/reopen-draft/route.ts',
      ];

      for (const relPath of routePaths) {
        const fullPath = path.join(process.cwd(), relPath);
        const content = fs.readFileSync(fullPath, 'utf8');
        assert.ok(
          !content.includes('pagesFixture'),
          `Route ${relPath} must not import pagesFixture`
        );
      }
    });

    it('verifies route files only implement POST methods (no PUT, DELETE, PATCH, or generic status)', () => {
      const routePaths = [
        'app/api/admin/projects/[projectId]/pages/[pageId]/actions/publish/route.ts',
        'app/api/admin/projects/[projectId]/pages/[pageId]/actions/rollback/route.ts',
        'app/api/admin/projects/[projectId]/pages/[pageId]/actions/reopen-draft/route.ts',
      ];

      for (const relPath of routePaths) {
        const fullPath = path.join(process.cwd(), relPath);
        const content = fs.readFileSync(fullPath, 'utf8');
        assert.ok(content.includes('export async function POST'), `Route ${relPath} must export POST`);
        assert.ok(!content.includes('export async function PUT'), `Route ${relPath} must not export PUT`);
        assert.ok(!content.includes('export async function DELETE'), `Route ${relPath} must not export DELETE`);
        assert.ok(!content.includes('export async function PATCH'), `Route ${relPath} must not export PATCH`);
      }
    });
  });
});
