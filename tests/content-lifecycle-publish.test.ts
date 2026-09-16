import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
  RecordLifecycleAuditParams,
  LifecyclePage,
  LifecyclePageRevision,
  LifecycleContentRelease,
  LifecycleContentReleaseItem,
  ContentLifecycleError,
} from '../lib/domain/content/lifecycle';
import { PageContent } from '../lib/domain/content/contracts';
import { PermissionKey } from '../lib/auth/rbac';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

class FakePublishContentLifecycleStore implements ContentLifecycleStore {
  pages = new Map<string, LifecyclePage>();
  revisions = new Map<string, LifecyclePageRevision>();
  releases = new Map<string, LifecycleContentRelease>();
  releaseItems: LifecycleContentReleaseItem[] = [];
  auditLogs: RecordLifecycleAuditParams[] = [];

  // Hooks for failure injection in atomicity tests
  failAfterRevisionTransition = false;
  failAfterReleaseCreation = false;
  failDuringPointerCAS = false;

  private cloneState() {
    return {
      pages: new Map(Array.from(this.pages.entries()).map(([k, v]) => [k, { ...v }])),
      revisions: new Map(Array.from(this.revisions.entries()).map(([k, v]) => [k, { ...v, seo: { ...v.seo }, navigation: { ...v.navigation } }])),
      releases: new Map(Array.from(this.releases.entries()).map(([k, v]) => [k, { ...v }])),
      releaseItems: [...this.releaseItems.map(i => ({ ...i }))],
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
    const rev = this.revisions.get(revisionId);
    if (!rev) return null;
    return { ...rev, seo: { ...rev.seo }, navigation: { ...rev.navigation } };
  }

  async updateDraftRevisionAtomic(
    params: UpdateDraftRevisionAtomicParams
  ): Promise<{ updated: boolean; revision?: LifecyclePageRevision }> {
    const rev = this.revisions.get(params.revisionId);
    if (
      !rev ||
      rev.pageId !== params.pageId ||
      rev.status !== 'DRAFT' ||
      rev.lockVersion !== params.expectedLockVersion
    ) {
      return { updated: false };
    }

    const updated: LifecyclePageRevision = {
      ...rev,
      title: params.data.title ?? rev.title,
      slug: params.data.slug ?? rev.slug,
      locale: params.data.locale ?? rev.locale,
      description: params.data.description !== undefined ? params.data.description : rev.description,
      visibility: params.data.visibility ?? rev.visibility,
      content: params.data.content ?? rev.content,
      schemaVersion: params.data.schemaVersion ?? rev.schemaVersion,
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

    if (this.failAfterRevisionTransition) {
      throw new Error('SIMULATED_FAILURE_AFTER_REVISION_TRANSITION');
    }

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
    const source = params.sourceRevision;
    const revisionId = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newDraft: LifecyclePageRevision = {
      id: revisionId,
      pageId: params.pageId,
      revisionNumber: params.revisionNumber,
      status: 'DRAFT',
      title: source.title,
      slug: source.slug,
      locale: source.locale,
      description: source.description,
      visibility: source.visibility,
      content: source.content,
      seo: { ...source.seo },
      navigation: { ...source.navigation },
      schemaVersion: source.schemaVersion,
      lockVersion: 1,
      createdById: params.actorId,
      createdAt: new Date(),
      submittedAt: null,
      approvedAt: null,
      publishedAt: null,
      derivedFromRevisionId: params.derivedFromRevisionId,
    };

    this.revisions.set(revisionId, newDraft);
    return { ...newDraft };
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
    const releaseId = `rel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const release: LifecycleContentRelease = {
      id: releaseId,
      projectId: params.projectId,
      status: params.status,
      createdById: params.createdById,
      createdAt: new Date(),
      publishedAt: params.publishedAt,
      rolledBackAt: null,
    };

    this.releases.set(releaseId, release);

    if (this.failAfterReleaseCreation) {
      throw new Error('SIMULATED_FAILURE_AFTER_RELEASE_CREATION');
    }

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
    if (this.failDuringPointerCAS) {
      throw new Error('SIMULATED_FAILURE_DURING_POINTER_CAS');
    }

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

  async recordAudit(params: RecordLifecycleAuditParams): Promise<void> {
    this.auditLogs.push(params);
  }
}

const sampleContent: PageContent = {
  version: 1,
  schemaVersion: '1.0.0',
  blocks: [
    {
      id: 'b1',
      type: 'heading',
      order: 0,
      data: { text: 'Publish Test Page', level: 1 },
    },
  ],
};

function setupTestEnvironment() {
  const store = new FakePublishContentLifecycleStore();
  const permissionsGranted = new Set<string>();
  const permissionChecks: Array<{ actorId: string; permission: PermissionKey; projectId: string | null }> = [];

  const hasPermission = async (
    actorId: string,
    permission: PermissionKey,
    projectId: string | null
  ) => {
    permissionChecks.push({ actorId, permission, projectId });
    return permissionsGranted.has(`${actorId}:${permission}:${projectId}`);
  };

  const service = new ContentLifecycleService({ store, hasPermission });

  const grant = (actorId: string, permission: PermissionKey, projectId: string) => {
    permissionsGranted.add(`${actorId}:${permission}:${projectId}`);
  };

  return { store, service, grant, permissionChecks };
}

describe('SYN-CONTENT-001B3A: publishApproved', () => {
  it('successfully publishes an approved page revision (first publish, previousRevisionId = null)', async () => {
    const { store, service, grant, permissionChecks } = setupTestEnvironment();
    const actorId = 'publisher_1';
    const projectId = 'proj_alpha';

    grant(actorId, 'content.create', projectId);
    grant(actorId, 'content.edit', projectId);
    grant(actorId, 'content.approve', projectId);
    grant(actorId, 'content.publish', projectId);

    // 1. Create page draft
    const draft = await service.createPageDraft({
      actorId,
      projectId,
      key: 'home',
      title: 'Home Page',
      slug: 'home',
      locale: 'cs',
      visibility: 'PUBLIC',
      content: sampleContent,
    });

    // 2. Submit for review
    const inReview = await service.submitForReview({
      actorId,
      projectId,
      pageId: draft.page.id,
      expectedLockVersion: draft.revision.lockVersion,
    });

    // 3. Approve review
    const approved = await service.approveReview({
      actorId,
      projectId,
      pageId: inReview.page.id,
      expectedLockVersion: inReview.revision.lockVersion,
    });

    assert.equal(approved.revision.status, 'APPROVED');
    assert.equal(approved.revision.lockVersion, 3);
    assert.ok(approved.revision.submittedAt);
    assert.ok(approved.revision.approvedAt);

    // 4. Publish approved
    const result = await service.publishApproved({
      actorId,
      projectId,
      pageId: approved.page.id,
      expectedLockVersion: approved.revision.lockVersion,
    });

    // Verify Page
    assert.equal(result.page.publishedRevisionId, approved.revision.id);
    assert.equal(result.page.draftRevisionId, null);

    // Verify Revision
    assert.equal(result.revision.status, 'PUBLISHED');
    assert.equal(result.revision.lockVersion, 4);
    assert.ok(result.revision.publishedAt);
    assert.equal(result.revision.approvedAt?.getTime(), approved.revision.approvedAt?.getTime());
    assert.equal(result.revision.submittedAt?.getTime(), approved.revision.submittedAt?.getTime());
    assert.deepEqual(result.revision.content, sampleContent);

    // Verify ContentRelease
    assert.equal(result.release.projectId, projectId);
    assert.equal(result.release.status, 'PUBLISHED');
    assert.equal(result.release.createdById, actorId);
    assert.equal(result.release.rolledBackAt, null);
    assert.equal(result.release.publishedAt?.getTime(), result.revision.publishedAt?.getTime());

    // Verify ContentReleaseItem
    assert.equal(result.releaseItem.releaseId, result.release.id);
    assert.equal(result.releaseItem.pageId, result.page.id);
    assert.equal(result.releaseItem.revisionId, result.revision.id);
    assert.equal(result.releaseItem.previousRevisionId, null);

    // Verify Audit
    const publishAudits = store.auditLogs.filter(a => a.action === 'CONTENT_RELEASE_PUBLISHED');
    assert.equal(publishAudits.length, 1);
    const audit = publishAudits[0];
    assert.equal(audit.scopeType, 'PROJECT');
    assert.equal(audit.scopeId, projectId);
    assert.equal(audit.resourceType, 'CONTENT_RELEASE');
    assert.equal(audit.resourceId, result.release.id);
    assert.equal(audit.actorId, actorId);
    assert.deepEqual(audit.metadata, {
      pageId: result.page.id,
      releaseId: result.release.id,
      revisionId: result.revision.id,
      revisionNumber: result.revision.revisionNumber,
      previousRevisionId: null,
      lockVersion: 4,
      fromStatus: 'APPROVED',
      toStatus: 'PUBLISHED',
    });

    // Verify permission check checked projectId
    const publishCheck = permissionChecks.find(c => c.permission === 'content.publish');
    assert.ok(publishCheck);
    assert.equal(publishCheck.actorId, actorId);
    assert.equal(publishCheck.projectId, projectId);
  });

  it('successfully publishes subsequent revision capturing previous published revision id', async () => {
    const { store, service, grant } = setupTestEnvironment();
    const actorId = 'publisher_1';
    const projectId = 'proj_alpha';

    grant(actorId, 'content.create', projectId);
    grant(actorId, 'content.edit', projectId);
    grant(actorId, 'content.approve', projectId);
    grant(actorId, 'content.publish', projectId);

    // First publish
    const d1 = await service.createPageDraft({
      actorId,
      projectId,
      key: 'about',
      title: 'About Us',
      slug: 'about',
      locale: 'cs',
      visibility: 'PUBLIC',
      content: sampleContent,
    });
    const r1 = await service.submitForReview({
      actorId,
      projectId,
      pageId: d1.page.id,
      expectedLockVersion: d1.revision.lockVersion,
    });
    const a1 = await service.approveReview({
      actorId,
      projectId,
      pageId: r1.page.id,
      expectedLockVersion: r1.revision.lockVersion,
    });
    const pub1 = await service.publishApproved({
      actorId,
      projectId,
      pageId: a1.page.id,
      expectedLockVersion: a1.revision.lockVersion,
    });
    assert.equal(pub1.releaseItem.previousRevisionId, null);
    assert.equal(pub1.page.publishedRevisionId, pub1.revision.id);

    // Setup simulated second revision in approved state (as if reopened in B3B)
    const rev2Id = 'rev_2nd_approved';
    const rev2: LifecyclePageRevision = {
      id: rev2Id,
      pageId: pub1.page.id,
      revisionNumber: 2,
      status: 'APPROVED',
      title: 'About Us v2',
      slug: 'about',
      locale: 'cs',
      description: null,
      visibility: 'PUBLIC',
      content: sampleContent,
      seo: {},
      navigation: {},
      schemaVersion: '1.0.0',
      lockVersion: 3,
      createdById: actorId,
      createdAt: new Date(),
      submittedAt: new Date(),
      approvedAt: new Date(),
      publishedAt: null,
      derivedFromRevisionId: pub1.revision.id,
    };
    store.revisions.set(rev2Id, rev2);

    // Set page.draftRevisionId = rev2Id (while keeping page.publishedRevisionId = pub1.revision.id)
    const pageWithDraft2: LifecyclePage = {
      ...pub1.page,
      draftRevisionId: rev2Id,
    };
    store.pages.set(pub1.page.id, pageWithDraft2);

    // Second publish
    const pub2 = await service.publishApproved({
      actorId,
      projectId,
      pageId: pub1.page.id,
      expectedLockVersion: rev2.lockVersion,
    });

    assert.equal(pub2.page.publishedRevisionId, rev2Id);
    assert.equal(pub2.page.draftRevisionId, null);
    assert.equal(pub2.releaseItem.previousRevisionId, pub1.revision.id);
    assert.equal(pub2.releaseItem.revisionId, rev2Id);

    // Verify audit recorded previousRevisionId
    const publishAudits = store.auditLogs.filter(a => a.action === 'CONTENT_RELEASE_PUBLISHED');
    assert.equal(publishAudits.length, 2);
    assert.equal(publishAudits[1].metadata.previousRevisionId, pub1.revision.id);
  });

  it('rejects publish when content.publish is denied (FORBIDDEN)', async () => {
    const { service } = setupTestEnvironment();
    await assert.rejects(
      async () => {
        await service.publishApproved({
          actorId: 'unauthorized_user',
          projectId: 'proj_alpha',
          pageId: 'page_1',
          expectedLockVersion: 1,
        });
      },
      (err: any) => {
        assert(err instanceof ContentLifecycleError);
        assert.equal(err.code, 'FORBIDDEN');
        return true;
      }
    );
  });

  it('rejects blank actorId, projectId, pageId or invalid expectedLockVersion (INVALID_INPUT)', async () => {
    const { service } = setupTestEnvironment();

    await assert.rejects(
      () => service.publishApproved({ actorId: '', projectId: 'p1', pageId: 'pg1', expectedLockVersion: 1 }),
      (err: any) => err instanceof ContentLifecycleError && err.code === 'INVALID_INPUT'
    );
    await assert.rejects(
      () => service.publishApproved({ actorId: 'a1', projectId: '   ', pageId: 'pg1', expectedLockVersion: 1 }),
      (err: any) => err instanceof ContentLifecycleError && err.code === 'INVALID_INPUT'
    );
    await assert.rejects(
      () => service.publishApproved({ actorId: 'a1', projectId: 'p1', pageId: '', expectedLockVersion: 1 }),
      (err: any) => err instanceof ContentLifecycleError && err.code === 'INVALID_INPUT'
    );
    await assert.rejects(
      () => service.publishApproved({ actorId: 'a1', projectId: 'p1', pageId: 'pg1', expectedLockVersion: 0 }),
      (err: any) => err instanceof ContentLifecycleError && err.code === 'INVALID_INPUT'
    );
    await assert.rejects(
      () => service.publishApproved({ actorId: 'a1', projectId: 'p1', pageId: 'pg1', expectedLockVersion: -1 }),
      (err: any) => err instanceof ContentLifecycleError && err.code === 'INVALID_INPUT'
    );
    await assert.rejects(
      () => service.publishApproved({ actorId: 'a1', projectId: 'p1', pageId: 'pg1', expectedLockVersion: 1.5 }),
      (err: any) => err instanceof ContentLifecycleError && err.code === 'INVALID_INPUT'
    );
  });

  it('hides cross-project page with PAGE_NOT_FOUND', async () => {
    const { store, service, grant } = setupTestEnvironment();
    const actorId = 'publisher_1';
    grant(actorId, 'content.publish', 'proj_beta');

    // Page exists in proj_alpha
    const pageId = 'page_cross_test';
    store.pages.set(pageId, {
      id: pageId,
      projectId: 'proj_alpha',
      key: 'secret',
      parentId: null,
      sortOrder: 0,
      draftRevisionId: 'rev_1',
      publishedRevisionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await assert.rejects(
      () => service.publishApproved({
        actorId,
        projectId: 'proj_beta', // Different project!
        pageId,
        expectedLockVersion: 1,
      }),
      (err: any) => {
        assert(err instanceof ContentLifecycleError);
        assert.equal(err.code, 'PAGE_NOT_FOUND');
        return true;
      }
    );
  });

  it('rejects publish when page has no active draft revision pointer (NO_DRAFT)', async () => {
    const { store, service, grant } = setupTestEnvironment();
    const actorId = 'publisher_1';
    const projectId = 'proj_alpha';
    grant(actorId, 'content.publish', projectId);

    const pageId = 'page_no_draft';
    store.pages.set(pageId, {
      id: pageId,
      projectId,
      key: 'no-draft',
      parentId: null,
      sortOrder: 0,
      draftRevisionId: null,
      publishedRevisionId: 'rev_published',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await assert.rejects(
      () => service.publishApproved({
        actorId,
        projectId,
        pageId,
        expectedLockVersion: 1,
      }),
      (err: any) => {
        assert(err instanceof ContentLifecycleError);
        assert.equal(err.code, 'NO_DRAFT');
        return true;
      }
    );
  });

  it('rejects publish when active draft pointer references revision of another page (POINTER_INTEGRITY_VIOLATION)', async () => {
    const { store, service, grant } = setupTestEnvironment();
    const actorId = 'publisher_1';
    const projectId = 'proj_alpha';
    grant(actorId, 'content.publish', projectId);

    const revWrongPage: LifecyclePageRevision = {
      id: 'rev_other_page',
      pageId: 'page_other', // Mismatched pageId!
      revisionNumber: 1,
      status: 'APPROVED',
      title: 'Wrong Page',
      slug: 'wrong',
      locale: 'cs',
      description: null,
      visibility: 'PUBLIC',
      content: sampleContent,
      seo: {},
      navigation: {},
      schemaVersion: '1.0.0',
      lockVersion: 1,
      createdById: actorId,
      createdAt: new Date(),
      submittedAt: new Date(),
      approvedAt: new Date(),
      publishedAt: null,
      derivedFromRevisionId: null,
    };
    store.revisions.set(revWrongPage.id, revWrongPage);

    const pageId = 'page_target';
    store.pages.set(pageId, {
      id: pageId,
      projectId,
      key: 'target',
      parentId: null,
      sortOrder: 0,
      draftRevisionId: revWrongPage.id,
      publishedRevisionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await assert.rejects(
      () => service.publishApproved({
        actorId,
        projectId,
        pageId,
        expectedLockVersion: 1,
      }),
      (err: any) => {
        assert(err instanceof ContentLifecycleError);
        assert.equal(err.code, 'POINTER_INTEGRITY_VIOLATION');
        return true;
      }
    );
  });

  it('rejects publish when previous published pointer is invalid (POINTER_INTEGRITY_VIOLATION)', async () => {
    const { store, service, grant } = setupTestEnvironment();
    const actorId = 'publisher_1';
    const projectId = 'proj_alpha';
    grant(actorId, 'content.publish', projectId);

    const activeRev: LifecyclePageRevision = {
      id: 'rev_active_app',
      pageId: 'page_prev_invalid',
      revisionNumber: 2,
      status: 'APPROVED',
      title: 'Title',
      slug: 'slug',
      locale: 'cs',
      description: null,
      visibility: 'PUBLIC',
      content: sampleContent,
      seo: {},
      navigation: {},
      schemaVersion: '1.0.0',
      lockVersion: 1,
      createdById: actorId,
      createdAt: new Date(),
      submittedAt: new Date(),
      approvedAt: new Date(),
      publishedAt: null,
      derivedFromRevisionId: null,
    };
    store.revisions.set(activeRev.id, activeRev);

    // Case A: previous published pointer references missing revision
    const pageIdA = 'page_prev_invalid';
    store.pages.set(pageIdA, {
      id: pageIdA,
      projectId,
      key: 'prev-invalid-a',
      parentId: null,
      sortOrder: 0,
      draftRevisionId: activeRev.id,
      publishedRevisionId: 'rev_nonexistent',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await assert.rejects(
      () => service.publishApproved({
        actorId,
        projectId,
        pageId: pageIdA,
        expectedLockVersion: 1,
      }),
      (err: any) => {
        assert(err instanceof ContentLifecycleError);
        assert.equal(err.code, 'POINTER_INTEGRITY_VIOLATION');
        return true;
      }
    );

    // Case B: previous published pointer references a revision with status !== PUBLISHED
    const prevRevNotPublished: LifecyclePageRevision = {
      ...activeRev,
      id: 'rev_prev_not_pub',
      revisionNumber: 1,
      status: 'APPROVED', // Should be PUBLISHED!
    };
    store.revisions.set(prevRevNotPublished.id, prevRevNotPublished);

    store.pages.set(pageIdA, {
      id: pageIdA,
      projectId,
      key: 'prev-invalid-b',
      parentId: null,
      sortOrder: 0,
      draftRevisionId: activeRev.id,
      publishedRevisionId: prevRevNotPublished.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await assert.rejects(
      () => service.publishApproved({
        actorId,
        projectId,
        pageId: pageIdA,
        expectedLockVersion: 1,
      }),
      (err: any) => {
        assert(err instanceof ContentLifecycleError);
        assert.equal(err.code, 'POINTER_INTEGRITY_VIOLATION');
        return true;
      }
    );
  });

  it('rejects publishing non-approved revisions (DRAFT, IN_REVIEW, PUBLISHED -> STATE_TRANSITION_INVALID)', async () => {
    const { store, service, grant } = setupTestEnvironment();
    const actorId = 'publisher_1';
    const projectId = 'proj_alpha';
    grant(actorId, 'content.create', projectId);
    grant(actorId, 'content.edit', projectId);
    grant(actorId, 'content.publish', projectId);

    // DRAFT status
    const draft = await service.createPageDraft({
      actorId,
      projectId,
      key: 'p1',
      title: 'Draft page',
      slug: 'p1',
      locale: 'cs',
      visibility: 'PUBLIC',
      content: sampleContent,
    });

    await assert.rejects(
      () => service.publishApproved({
        actorId,
        projectId,
        pageId: draft.page.id,
        expectedLockVersion: draft.revision.lockVersion,
      }),
      (err: any) => {
        assert(err instanceof ContentLifecycleError);
        assert.equal(err.code, 'STATE_TRANSITION_INVALID');
        return true;
      }
    );

    // IN_REVIEW status
    const inReview = await service.submitForReview({
      actorId,
      projectId,
      pageId: draft.page.id,
      expectedLockVersion: draft.revision.lockVersion,
    });

    await assert.rejects(
      () => service.publishApproved({
        actorId,
        projectId,
        pageId: inReview.page.id,
        expectedLockVersion: inReview.revision.lockVersion,
      }),
      (err: any) => {
        assert(err instanceof ContentLifecycleError);
        assert.equal(err.code, 'STATE_TRANSITION_INVALID');
        return true;
      }
    );

    // Manually set status to PUBLISHED on draft pointer
    const publishedRev: LifecyclePageRevision = {
      ...inReview.revision,
      status: 'PUBLISHED',
      lockVersion: 3,
    };
    store.revisions.set(publishedRev.id, publishedRev);

    await assert.rejects(
      () => service.publishApproved({
        actorId,
        projectId,
        pageId: inReview.page.id,
        expectedLockVersion: 3,
      }),
      (err: any) => {
        assert(err instanceof ContentLifecycleError);
        assert.equal(err.code, 'STATE_TRANSITION_INVALID');
        return true;
      }
    );
  });

  it('rejects publish when expectedLockVersion does not match (LOCK_CONFLICT)', async () => {
    const { service, grant } = setupTestEnvironment();
    const actorId = 'publisher_1';
    const projectId = 'proj_alpha';
    grant(actorId, 'content.create', projectId);
    grant(actorId, 'content.edit', projectId);
    grant(actorId, 'content.approve', projectId);
    grant(actorId, 'content.publish', projectId);

    const draft = await service.createPageDraft({
      actorId,
      projectId,
      key: 'stale-test',
      title: 'Stale Lock Test',
      slug: 'stale',
      locale: 'cs',
      visibility: 'PUBLIC',
      content: sampleContent,
    });
    const inReview = await service.submitForReview({
      actorId,
      projectId,
      pageId: draft.page.id,
      expectedLockVersion: draft.revision.lockVersion,
    });
    const approved = await service.approveReview({
      actorId,
      projectId,
      pageId: inReview.page.id,
      expectedLockVersion: inReview.revision.lockVersion,
    });

    // Provide stale lockVersion (e.g. 1 instead of 3)
    await assert.rejects(
      () => service.publishApproved({
        actorId,
        projectId,
        pageId: approved.page.id,
        expectedLockVersion: 1, // Stale!
      }),
      (err: any) => {
        assert(err instanceof ContentLifecycleError);
        assert.equal(err.code, 'LOCK_CONFLICT');
        return true;
      }
    );
  });

  it('rejects publish when page pointers change concurrently during CAS (LOCK_CONFLICT)', async () => {
    const { store, service, grant } = setupTestEnvironment();
    const actorId = 'publisher_1';
    const projectId = 'proj_alpha';
    grant(actorId, 'content.create', projectId);
    grant(actorId, 'content.edit', projectId);
    grant(actorId, 'content.approve', projectId);
    grant(actorId, 'content.publish', projectId);

    const draft = await service.createPageDraft({
      actorId,
      projectId,
      key: 'cas-test',
      title: 'CAS Conflict Test',
      slug: 'cas',
      locale: 'cs',
      visibility: 'PUBLIC',
      content: sampleContent,
    });
    const inReview = await service.submitForReview({
      actorId,
      projectId,
      pageId: draft.page.id,
      expectedLockVersion: draft.revision.lockVersion,
    });
    const approved = await service.approveReview({
      actorId,
      projectId,
      pageId: inReview.page.id,
      expectedLockVersion: inReview.revision.lockVersion,
    });

    // Override setPublishedPagePointersAtomic to simulate concurrent modification
    store.setPublishedPagePointersAtomic = async () => ({ updated: false });

    await assert.rejects(
      () => service.publishApproved({
        actorId,
        projectId,
        pageId: approved.page.id,
        expectedLockVersion: approved.revision.lockVersion,
      }),
      (err: any) => {
        assert(err instanceof ContentLifecycleError);
        assert.equal(err.code, 'LOCK_CONFLICT');
        return true;
      }
    );
  });

  describe('Transactional Atomicity', () => {
    it('rolls back revision transition if failure occurs immediately after revision transition', async () => {
      const { store, service, grant } = setupTestEnvironment();
      const actorId = 'publisher_1';
      const projectId = 'proj_alpha';
      grant(actorId, 'content.create', projectId);
      grant(actorId, 'content.edit', projectId);
      grant(actorId, 'content.approve', projectId);
      grant(actorId, 'content.publish', projectId);

      const draft = await service.createPageDraft({
        actorId,
        projectId,
        key: 'atomicity-1',
        title: 'Atomicity Test 1',
        slug: 'at1',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: sampleContent,
      });
      const inReview = await service.submitForReview({
        actorId,
        projectId,
        pageId: draft.page.id,
        expectedLockVersion: draft.revision.lockVersion,
      });
      const approved = await service.approveReview({
        actorId,
        projectId,
        pageId: inReview.page.id,
        expectedLockVersion: inReview.revision.lockVersion,
      });

      // Inject failure right after revision transition
      store.failAfterRevisionTransition = true;

      await assert.rejects(
        () => service.publishApproved({
          actorId,
          projectId,
          pageId: approved.page.id,
          expectedLockVersion: approved.revision.lockVersion,
        }),
        (err: any) => err.message === 'SIMULATED_FAILURE_AFTER_REVISION_TRANSITION'
      );

      // Verify rollback: revision remains APPROVED with original lockVersion
      const currentRev = store.revisions.get(approved.revision.id);
      assert.ok(currentRev);
      assert.equal(currentRev.status, 'APPROVED');
      assert.equal(currentRev.lockVersion, approved.revision.lockVersion);
      assert.equal(currentRev.publishedAt, null);

      // No releases or release items
      assert.equal(store.releases.size, 0);
      assert.equal(store.releaseItems.length, 0);

      // Page pointers intact
      const currentPage = store.pages.get(approved.page.id);
      assert.equal(currentPage?.draftRevisionId, approved.revision.id);
      assert.equal(currentPage?.publishedRevisionId, null);

      // No publish audit recorded
      const publishAudits = store.auditLogs.filter(a => a.action === 'CONTENT_RELEASE_PUBLISHED');
      assert.equal(publishAudits.length, 0);
    });

    it('rolls back revision and release if failure occurs after release creation', async () => {
      const { store, service, grant } = setupTestEnvironment();
      const actorId = 'publisher_1';
      const projectId = 'proj_alpha';
      grant(actorId, 'content.create', projectId);
      grant(actorId, 'content.edit', projectId);
      grant(actorId, 'content.approve', projectId);
      grant(actorId, 'content.publish', projectId);

      const draft = await service.createPageDraft({
        actorId,
        projectId,
        key: 'atomicity-2',
        title: 'Atomicity Test 2',
        slug: 'at2',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: sampleContent,
      });
      const inReview = await service.submitForReview({
        actorId,
        projectId,
        pageId: draft.page.id,
        expectedLockVersion: draft.revision.lockVersion,
      });
      const approved = await service.approveReview({
        actorId,
        projectId,
        pageId: inReview.page.id,
        expectedLockVersion: inReview.revision.lockVersion,
      });

      // Inject failure after release creation
      store.failAfterReleaseCreation = true;

      await assert.rejects(
        () => service.publishApproved({
          actorId,
          projectId,
          pageId: approved.page.id,
          expectedLockVersion: approved.revision.lockVersion,
        }),
        (err: any) => err.message === 'SIMULATED_FAILURE_AFTER_RELEASE_CREATION'
      );

      // Verify complete rollback
      const currentRev = store.revisions.get(approved.revision.id);
      assert.equal(currentRev?.status, 'APPROVED');
      assert.equal(currentRev?.lockVersion, approved.revision.lockVersion);
      assert.equal(store.releases.size, 0);
      assert.equal(store.releaseItems.length, 0);
      assert.equal(store.pages.get(approved.page.id)?.draftRevisionId, approved.revision.id);
      assert.equal(store.pages.get(approved.page.id)?.publishedRevisionId, null);
    });

    it('rolls back completely if failure occurs during page pointer CAS', async () => {
      const { store, service, grant } = setupTestEnvironment();
      const actorId = 'publisher_1';
      const projectId = 'proj_alpha';
      grant(actorId, 'content.create', projectId);
      grant(actorId, 'content.edit', projectId);
      grant(actorId, 'content.approve', projectId);
      grant(actorId, 'content.publish', projectId);

      const draft = await service.createPageDraft({
        actorId,
        projectId,
        key: 'atomicity-3',
        title: 'Atomicity Test 3',
        slug: 'at3',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: sampleContent,
      });
      const inReview = await service.submitForReview({
        actorId,
        projectId,
        pageId: draft.page.id,
        expectedLockVersion: draft.revision.lockVersion,
      });
      const approved = await service.approveReview({
        actorId,
        projectId,
        pageId: inReview.page.id,
        expectedLockVersion: inReview.revision.lockVersion,
      });

      // Inject failure during pointer CAS
      store.failDuringPointerCAS = true;

      await assert.rejects(
        () => service.publishApproved({
          actorId,
          projectId,
          pageId: approved.page.id,
          expectedLockVersion: approved.revision.lockVersion,
        }),
        (err: any) => err.message === 'SIMULATED_FAILURE_DURING_POINTER_CAS'
      );

      // Verify complete rollback
      const currentRev = store.revisions.get(approved.revision.id);
      assert.equal(currentRev?.status, 'APPROVED');
      assert.equal(currentRev?.lockVersion, approved.revision.lockVersion);
      assert.equal(store.releases.size, 0);
      assert.equal(store.releaseItems.length, 0);
      assert.equal(store.pages.get(approved.page.id)?.draftRevisionId, approved.revision.id);
      assert.equal(store.pages.get(approved.page.id)?.publishedRevisionId, null);
    });
  });

  describe('Audit Integrity and Safety', () => {
    it('audit metadata does not contain sensitive content, body, blocks, seo, or navigation', async () => {
      const { store, service, grant } = setupTestEnvironment();
      const actorId = 'publisher_1';
      const projectId = 'proj_alpha';
      grant(actorId, 'content.create', projectId);
      grant(actorId, 'content.edit', projectId);
      grant(actorId, 'content.approve', projectId);
      grant(actorId, 'content.publish', projectId);

      const draft = await service.createPageDraft({
        actorId,
        projectId,
        key: 'audit-leak-test',
        title: 'Audit Leak Test',
        slug: 'audit-leak',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: sampleContent,
      });
      const inReview = await service.submitForReview({
        actorId,
        projectId,
        pageId: draft.page.id,
        expectedLockVersion: draft.revision.lockVersion,
      });
      const approved = await service.approveReview({
        actorId,
        projectId,
        pageId: inReview.page.id,
        expectedLockVersion: inReview.revision.lockVersion,
      });
      await service.publishApproved({
        actorId,
        projectId,
        pageId: approved.page.id,
        expectedLockVersion: approved.revision.lockVersion,
      });

      const publishAudit = store.auditLogs.find(a => a.action === 'CONTENT_RELEASE_PUBLISHED');
      assert.ok(publishAudit);

      const meta = publishAudit.metadata;
      assert.equal(meta.content, undefined);
      assert.equal(meta.blocks, undefined);
      assert.equal(meta.body, undefined);
      assert.equal(meta.description, undefined);
      assert.equal(meta.seo, undefined);
      assert.equal(meta.navigation, undefined);
      assert.equal(meta.password, undefined);
      assert.equal(meta.token, undefined);
      assert.equal(meta.secret, undefined);
    });
  });

  describe('Immutability after publish', () => {
    it('prevents updateDraft, submitForReview, and approveReview on published revision', async () => {
      const { service, grant } = setupTestEnvironment();
      const actorId = 'publisher_1';
      const projectId = 'proj_alpha';
      grant(actorId, 'content.create', projectId);
      grant(actorId, 'content.edit', projectId);
      grant(actorId, 'content.approve', projectId);
      grant(actorId, 'content.publish', projectId);

      const draft = await service.createPageDraft({
        actorId,
        projectId,
        key: 'immutable-test',
        title: 'Immutable Test',
        slug: 'immutable',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: sampleContent,
      });
      const inReview = await service.submitForReview({
        actorId,
        projectId,
        pageId: draft.page.id,
        expectedLockVersion: draft.revision.lockVersion,
      });
      const approved = await service.approveReview({
        actorId,
        projectId,
        pageId: inReview.page.id,
        expectedLockVersion: inReview.revision.lockVersion,
      });
      const pub = await service.publishApproved({
        actorId,
        projectId,
        pageId: approved.page.id,
        expectedLockVersion: approved.revision.lockVersion,
      });

      assert.equal(pub.page.draftRevisionId, null);

      // updateDraft must fail (NO_DRAFT)
      await assert.rejects(
        () => service.updateDraft({
          actorId,
          projectId,
          pageId: pub.page.id,
          expectedLockVersion: pub.revision.lockVersion,
          title: 'Tampered Title',
        }),
        (err: any) => err instanceof ContentLifecycleError && err.code === 'NO_DRAFT'
      );

      // submitForReview must fail (NO_DRAFT)
      await assert.rejects(
        () => service.submitForReview({
          actorId,
          projectId,
          pageId: pub.page.id,
          expectedLockVersion: pub.revision.lockVersion,
        }),
        (err: any) => err instanceof ContentLifecycleError && err.code === 'NO_DRAFT'
      );

      // approveReview must fail (NO_DRAFT)
      await assert.rejects(
        () => service.approveReview({
          actorId,
          projectId,
          pageId: pub.page.id,
          expectedLockVersion: pub.revision.lockVersion,
        }),
        (err: any) => err instanceof ContentLifecycleError && err.code === 'NO_DRAFT'
      );
    });
  });

  describe('Production-Source Assertions', () => {
    it('verifies production Prisma adapter implements Page pointer mutation conditional on pageId, projectId, expected draftRevisionId, and expected previous publishedRevisionId', () => {
      const prismaStoreFile = readFileSync(
        join(process.cwd(), 'lib/domain/content/lifecycle/prisma-store.ts'),
        'utf8'
      );

      assert.ok(
        prismaStoreFile.includes('setPublishedPagePointersAtomic'),
        'Prisma store must implement setPublishedPagePointersAtomic'
      );

      // Verify the where clause in setPublishedPagePointersAtomic
      const methodIndex = prismaStoreFile.indexOf('setPublishedPagePointersAtomic(');
      assert.ok(methodIndex !== -1, 'setPublishedPagePointersAtomic must exist');
      const methodBody = prismaStoreFile.slice(methodIndex, methodIndex + 900);

      assert.ok(
        methodBody.includes('id: params.pageId'),
        'Must filter by id: params.pageId'
      );
      assert.ok(
        methodBody.includes('projectId: params.projectId'),
        'Must filter by projectId: params.projectId'
      );
      assert.ok(
        methodBody.includes('draftRevisionId: params.expectedDraftRevisionId'),
        'Must filter by draftRevisionId: params.expectedDraftRevisionId'
      );
      assert.ok(
        methodBody.includes('publishedRevisionId: params.expectedPreviousPublishedRevisionId'),
        'Must filter by publishedRevisionId: params.expectedPreviousPublishedRevisionId'
      );
      assert.ok(
        methodBody.includes('publishedRevisionId: params.newPublishedRevisionId'),
        'Must set publishedRevisionId to new revision id'
      );
      assert.ok(
        methodBody.includes('draftRevisionId: null'),
        'Must set draftRevisionId to null'
      );
    });
  });
});
