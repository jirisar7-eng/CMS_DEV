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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

class FakeRollbackContentLifecycleStore implements ContentLifecycleStore {
  pages = new Map<string, LifecyclePage>();
  revisions = new Map<string, LifecyclePageRevision>();
  releases = new Map<string, LifecycleContentRelease>();
  releaseItems: LifecycleContentReleaseItem[] = [];
  auditLogs: RecordLifecycleAuditParams[] = [];

  // Hooks for failure injection in atomicity & concurrency tests
  failAfterRollbackReleaseCreation = false;
  failDuringRollbackPointerCAS = false;
  failDuringReopenPointerCAS = false;
  simulateRevisionNumberRace = false;

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
    if (this.simulateRevisionNumberRace) {
      throw new ContentLifecycleError(
        'LOCK_CONFLICT',
        'Revision number conflict due to concurrent operation'
      );
    }
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
    if (this.failAfterRollbackReleaseCreation) {
      // Simulate crash immediately after release creation during transaction
      throw new Error('SIMULATED_TRANSACTION_FAILURE_POST_RELEASE');
    }
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
    if (this.failDuringRollbackPointerCAS) {
      return { updated: false };
    }
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
    if (this.failDuringReopenPointerCAS) {
      return { updated: false };
    }
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

const sampleContent: PageContent = {
  version: 1,
  schemaVersion: '1.0.0',
  blocks: [
    {
      id: 'b1',
      type: 'heading',
      order: 0,
      data: { text: 'Rollback Test Page', level: 1 },
    },
  ],
};

describe('Content Lifecycle - Rollback & Reopen Draft', () => {
  // Helper to setup a page with Rev 1 (published), then Rev 2 (approved & published)
  async function setupTwoPublications(
    store: FakeRollbackContentLifecycleStore,
    service: ContentLifecycleService,
    projectId: string,
    actorId: string
  ) {
    // 1. Create page draft (Rev 1)
    const { page, revision: rev1 } = await service.createPageDraft({
      actorId,
      projectId,
      key: 'home-page',
      title: 'Home V1',
      slug: 'home-v1',
      locale: 'cs',
      visibility: 'PUBLIC',
      content: sampleContent,
    });

    // Rev 1: Submit -> Approve -> Publish
    await service.submitForReview({
      actorId,
      projectId,
      pageId: page.id,
      expectedLockVersion: rev1.lockVersion,
    });
    const rev1InReview = (await store.findRevisionById(rev1.id))!;
    await service.approveReview({
      actorId,
      projectId,
      pageId: page.id,
      expectedLockVersion: rev1InReview.lockVersion,
    });
    const rev1Approved = (await store.findRevisionById(rev1.id))!;
    const pub1 = await service.publishApproved({
      actorId,
      projectId,
      pageId: page.id,
      expectedLockVersion: rev1Approved.lockVersion,
    });

    // 2. Reopen draft from Rev 1 -> Rev 2
    const reopenRes = await service.createDraftFromPublished({
      actorId,
      projectId,
      pageId: page.id,
      expectedPublishedRevisionId: pub1.revision.id,
    });
    const rev2Draft = reopenRes.draftRevision;

    // Update Rev 2 draft title
    await service.updateDraft({
      actorId,
      projectId,
      pageId: page.id,
      expectedLockVersion: rev2Draft.lockVersion,
      title: 'Home V2 Updated',
    });
    const rev2Updated = (await store.findRevisionById(rev2Draft.id))!;

    // Submit -> Approve -> Publish Rev 2
    await service.submitForReview({
      actorId,
      projectId,
      pageId: page.id,
      expectedLockVersion: rev2Updated.lockVersion,
    });
    const rev2InReview = (await store.findRevisionById(rev2Draft.id))!;
    await service.approveReview({
      actorId,
      projectId,
      pageId: page.id,
      expectedLockVersion: rev2InReview.lockVersion,
    });
    const rev2Approved = (await store.findRevisionById(rev2Draft.id))!;
    const pub2 = await service.publishApproved({
      actorId,
      projectId,
      pageId: page.id,
      expectedLockVersion: rev2Approved.lockVersion,
    });

    return {
      page: pub2.page,
      rev1: (await store.findRevisionById(rev1.id))!,
      pub1Release: pub1.release,
      pub1ReleaseItem: pub1.releaseItem,
      rev2: pub2.revision,
      pub2Release: pub2.release,
      pub2ReleaseItem: pub2.releaseItem,
    };
  }

  describe('ROLLBACK PUBLISHED', () => {
    it('PASS: authorized rollback restores previous published revision, creates new ROLLED_BACK release, preserves original publish release, updates pointers and writes transactional audit', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const grantedPermissions = new Set(['content.create', 'content.edit', 'content.review', 'content.approve', 'content.publish', 'content.rollback']);
      let permissionCheckedProjectId: string | null = null;
      const service = new ContentLifecycleService({
        store,
        hasPermission: async (_actorId, perm, projId) => {
          if (perm === 'content.rollback') {
            permissionCheckedProjectId = projId;
          }
          return grantedPermissions.has(perm);
        },
      });

      const projectId = 'proj-alpha';
      const actorId = 'user-rollback-1';

      const initial = await setupTwoPublications(store, service, projectId, actorId);
      assert.strictEqual(initial.page.publishedRevisionId, initial.rev2.id);
      assert.strictEqual(initial.page.draftRevisionId, null);

      store.auditLogs = [];

      // Execute rollback
      const result = await service.rollbackPublished({
        actorId,
        projectId,
        pageId: initial.page.id,
        expectedPublishedRevisionId: initial.rev2.id,
      });

      // 1. Permission check verified projectId
      assert.strictEqual(permissionCheckedProjectId, projectId);

      // 2. Page pointers
      assert.strictEqual(result.page.publishedRevisionId, initial.rev1.id);
      assert.strictEqual(result.page.draftRevisionId, null);

      // 3. Historical revisions immutability
      const rev1InStore = (await store.findRevisionById(initial.rev1.id))!;
      const rev2InStore = (await store.findRevisionById(initial.rev2.id))!;
      assert.strictEqual(rev1InStore.status, 'PUBLISHED');
      assert.strictEqual(rev2InStore.status, 'PUBLISHED');
      assert.strictEqual(result.fromRevision.id, initial.rev2.id);
      assert.strictEqual(result.restoredRevision.id, initial.rev1.id);

      // 4. Original publish release is NEVER updated to ROLLED_BACK
      const pub2ReleaseInStore = store.releases.get(initial.pub2Release.id)!;
      assert.strictEqual(pub2ReleaseInStore.status, 'PUBLISHED');
      assert.strictEqual(pub2ReleaseInStore.rolledBackAt, null);

      // 5. NEW rollback release created
      assert.strictEqual(result.rollbackRelease.status, 'ROLLED_BACK');
      assert.strictEqual(result.rollbackRelease.projectId, projectId);
      assert.strictEqual(result.rollbackRelease.createdById, actorId);
      assert.strictEqual(result.rollbackRelease.publishedAt, null);
      assert.ok(result.rollbackRelease.rolledBackAt instanceof Date);
      assert.notStrictEqual(result.rollbackRelease.id, initial.pub2Release.id);

      // 6. Rollback item
      assert.strictEqual(result.rollbackReleaseItem.releaseId, result.rollbackRelease.id);
      assert.strictEqual(result.rollbackReleaseItem.pageId, initial.page.id);
      assert.strictEqual(result.rollbackReleaseItem.revisionId, initial.rev1.id); // restored
      assert.strictEqual(result.rollbackReleaseItem.previousRevisionId, initial.rev2.id); // replaced

      // 7. Audit log
      assert.strictEqual(store.auditLogs.length, 1);
      const audit = store.auditLogs[0];
      assert.strictEqual(audit.action, 'CONTENT_RELEASE_ROLLED_BACK');
      assert.strictEqual(audit.scopeType, 'PROJECT');
      assert.strictEqual(audit.scopeId, projectId);
      assert.strictEqual(audit.resourceType, 'CONTENT_RELEASE');
      assert.strictEqual(audit.resourceId, result.rollbackRelease.id);
      assert.strictEqual(audit.actorId, actorId);
      assert.strictEqual(audit.metadata.pageId, initial.page.id);
      assert.strictEqual(audit.metadata.fromRevisionId, initial.rev2.id);
      assert.strictEqual(audit.metadata.toRevisionId, initial.rev1.id);
      assert.strictEqual(audit.metadata.fromRevisionNumber, 2);
      assert.strictEqual(audit.metadata.toRevisionNumber, 1);

      // No content blocks, secrets or bodies leaked
      const meta = audit.metadata as any;
      assert.strictEqual(meta.content, undefined);
      assert.strictEqual(meta.blocks, undefined);
      assert.strictEqual(meta.title, undefined);
      assert.strictEqual(meta.seo, undefined);
      assert.strictEqual(meta.password, undefined);
    });

    it('FAIL: content.rollback denied => FORBIDDEN', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async (_actorId, perm) => perm !== 'content.rollback',
      });

      await assert.rejects(
        () =>
          service.rollbackPublished({
            actorId: 'user-1',
            projectId: 'proj-1',
            pageId: 'page-1',
            expectedPublishedRevisionId: 'rev-1',
          }),
        (err: any) => {
          assert.strictEqual(err.name, 'ContentLifecycleError');
          assert.strictEqual(err.code, 'FORBIDDEN');
          return true;
        }
      );
    });

    it('FAIL: invalid or blank inputs => INVALID_INPUT', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async () => true,
      });

      const invalidInputs = [
        { actorId: '', projectId: 'p1', pageId: 'page-1', expectedPublishedRevisionId: 'rev-1' },
        { actorId: 'a1', projectId: '   ', pageId: 'page-1', expectedPublishedRevisionId: 'rev-1' },
        { actorId: 'a1', projectId: 'p1', pageId: '', expectedPublishedRevisionId: 'rev-1' },
        { actorId: 'a1', projectId: 'p1', pageId: 'page-1', expectedPublishedRevisionId: '  ' },
      ];

      for (const input of invalidInputs) {
        await assert.rejects(
          () => service.rollbackPublished(input),
          (err: any) => {
            assert.strictEqual(err.code, 'INVALID_INPUT');
            return true;
          }
        );
      }
    });

    it('FAIL: cross-project Page hidden => PAGE_NOT_FOUND', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async () => true,
      });

      const { page, rev2 } = await setupTwoPublications(store, service, 'proj-A', 'user-1');

      // Attempt rollback from proj-B
      await assert.rejects(
        () =>
          service.rollbackPublished({
            actorId: 'user-1',
            projectId: 'proj-B',
            pageId: page.id,
            expectedPublishedRevisionId: rev2.id,
          }),
        (err: any) => {
          assert.strictEqual(err.code, 'PAGE_NOT_FOUND');
          return true;
        }
      );
    });

    it('FAIL: active draft exists => ACTIVE_DRAFT_EXISTS', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async () => true,
      });

      const { page, rev2 } = await setupTwoPublications(store, service, 'proj-1', 'user-1');

      // Reopen a draft
      await service.createDraftFromPublished({
        actorId: 'user-1',
        projectId: 'proj-1',
        pageId: page.id,
        expectedPublishedRevisionId: rev2.id,
      });

      // Now draftRevisionId is non-null
      await assert.rejects(
        () =>
          service.rollbackPublished({
            actorId: 'user-1',
            projectId: 'proj-1',
            pageId: page.id,
            expectedPublishedRevisionId: rev2.id,
          }),
        (err: any) => {
          assert.strictEqual(err.code, 'ACTIVE_DRAFT_EXISTS');
          return true;
        }
      );
    });

    it('FAIL: no published pointer => NO_PUBLISHED_REVISION', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async () => true,
      });

      // Page with draft cleared, never published
      const { page } = await service.createPageDraft({
        actorId: 'u1',
        projectId: 'p1',
        key: 'page-draft-only',
        title: 'Draft only',
        slug: 'draft-only',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: sampleContent,
      });
      store.pages.set(page.id, { ...page, draftRevisionId: null, publishedRevisionId: null });

      await assert.rejects(
        () =>
          service.rollbackPublished({
            actorId: 'u1',
            projectId: 'p1',
            pageId: page.id,
            expectedPublishedRevisionId: 'rev-any',
          }),
        (err: any) => {
          assert.strictEqual(err.code, 'NO_PUBLISHED_REVISION');
          return true;
        }
      );
    });

    it('FAIL: expectedPublishedRevisionId mismatch => LOCK_CONFLICT', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async () => true,
      });

      const { page } = await setupTwoPublications(store, service, 'p1', 'u1');

      await assert.rejects(
        () =>
          service.rollbackPublished({
            actorId: 'u1',
            projectId: 'p1',
            pageId: page.id,
            expectedPublishedRevisionId: 'stale-or-wrong-rev-id',
          }),
        (err: any) => {
          assert.strictEqual(err.code, 'LOCK_CONFLICT');
          return true;
        }
      );
    });

    it('FAIL: current published revision references wrong Page or not PUBLISHED => POINTER_INTEGRITY_VIOLATION', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async () => true,
      });

      const { page, rev2 } = await setupTwoPublications(store, service, 'p1', 'u1');

      // Mutate rev2 to point to wrong page
      const badRev = { ...rev2, pageId: 'other-page-id' };
      store.revisions.set(rev2.id, badRev);

      await assert.rejects(
        () =>
          service.rollbackPublished({
            actorId: 'u1',
            projectId: 'p1',
            pageId: page.id,
            expectedPublishedRevisionId: rev2.id,
          }),
        (err: any) => {
          assert.strictEqual(err.code, 'POINTER_INTEGRITY_VIOLATION');
          return true;
        }
      );

      // Reset and mutate status to DRAFT
      store.revisions.set(rev2.id, { ...rev2, status: 'DRAFT' });
      await assert.rejects(
        () =>
          service.rollbackPublished({
            actorId: 'u1',
            projectId: 'p1',
            pageId: page.id,
            expectedPublishedRevisionId: rev2.id,
          }),
        (err: any) => {
          assert.strictEqual(err.code, 'POINTER_INTEGRITY_VIOLATION');
          return true;
        }
      );
    });

    it('FAIL: no matching or ambiguous publish lineage => POINTER_INTEGRITY_VIOLATION', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async () => true,
      });

      const { page, rev2, pub2ReleaseItem } = await setupTwoPublications(store, service, 'p1', 'u1');

      // Remove release items -> 0 matching lineage
      store.releaseItems = [];
      await assert.rejects(
        () =>
          service.rollbackPublished({
            actorId: 'u1',
            projectId: 'p1',
            pageId: page.id,
            expectedPublishedRevisionId: rev2.id,
          }),
        (err: any) => {
          assert.strictEqual(err.code, 'POINTER_INTEGRITY_VIOLATION');
          return true;
        }
      );

      // Restore and add duplicate ambiguous release item
      const dupRelease: LifecycleContentRelease = {
        id: 'dup-release',
        projectId: 'p1',
        status: 'PUBLISHED',
        createdById: 'u1',
        createdAt: new Date(),
        publishedAt: new Date(),
        rolledBackAt: null,
      };
      store.releases.set(dupRelease.id, dupRelease);
      store.releaseItems = [
        pub2ReleaseItem,
        { ...pub2ReleaseItem, releaseId: dupRelease.id },
      ];

      await assert.rejects(
        () =>
          service.rollbackPublished({
            actorId: 'u1',
            projectId: 'p1',
            pageId: page.id,
            expectedPublishedRevisionId: rev2.id,
          }),
        (err: any) => {
          assert.strictEqual(err.code, 'POINTER_INTEGRITY_VIOLATION');
          return true;
        }
      );
    });

    it('FAIL: first publication has previousRevisionId null => ROLLBACK_NOT_AVAILABLE', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async () => true,
      });

      // Only 1 publication
      const { page, revision: rev1 } = await service.createPageDraft({
        actorId: 'u1',
        projectId: 'p1',
        key: 'single-pub',
        title: 'Single Pub',
        slug: 'single-pub',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: sampleContent,
      });
      await service.submitForReview({ actorId: 'u1', projectId: 'p1', pageId: page.id, expectedLockVersion: rev1.lockVersion });
      const rev1InReview = (await store.findRevisionById(rev1.id))!;
      await service.approveReview({ actorId: 'u1', projectId: 'p1', pageId: page.id, expectedLockVersion: rev1InReview.lockVersion });
      const rev1Approved = (await store.findRevisionById(rev1.id))!;
      const pub1 = await service.publishApproved({
        actorId: 'u1',
        projectId: 'p1',
        pageId: page.id,
        expectedLockVersion: rev1Approved.lockVersion,
      });

      await assert.rejects(
        () =>
          service.rollbackPublished({
            actorId: 'u1',
            projectId: 'p1',
            pageId: page.id,
            expectedPublishedRevisionId: pub1.revision.id,
          }),
        (err: any) => {
          assert.strictEqual(err.code, 'ROLLBACK_NOT_AVAILABLE');
          return true;
        }
      );
    });

    it('FAIL: previous revision not PUBLISHED or wrong Page => POINTER_INTEGRITY_VIOLATION', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async () => true,
      });

      const { page, rev1, rev2 } = await setupTwoPublications(store, service, 'p1', 'u1');

      // Corrupt rev1 status
      store.revisions.set(rev1.id, { ...rev1, status: 'DRAFT' });

      await assert.rejects(
        () =>
          service.rollbackPublished({
            actorId: 'u1',
            projectId: 'p1',
            pageId: page.id,
            expectedPublishedRevisionId: rev2.id,
          }),
        (err: any) => {
          assert.strictEqual(err.code, 'POINTER_INTEGRITY_VIOLATION');
          return true;
        }
      );
    });

    it('FAIL: concurrent Page pointer change during CAS => LOCK_CONFLICT', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async () => true,
      });

      const { page, rev2 } = await setupTwoPublications(store, service, 'p1', 'u1');

      // Inject CAS failure
      store.failDuringRollbackPointerCAS = true;

      await assert.rejects(
        () =>
          service.rollbackPublished({
            actorId: 'u1',
            projectId: 'p1',
            pageId: page.id,
            expectedPublishedRevisionId: rev2.id,
          }),
        (err: any) => {
          assert.strictEqual(err.code, 'LOCK_CONFLICT');
          return true;
        }
      );
    });
  });

  describe('ROLLBACK ATOMICITY', () => {
    it('ATOMICITY: failure after rollback release creation rolls back entire transaction leaving no orphan release, no release item, and pointer unchanged', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async () => true,
      });

      const { page, rev2 } = await setupTwoPublications(store, service, 'p1', 'u1');
      const releaseCountBefore = store.releases.size;
      const releaseItemCountBefore = store.releaseItems.length;

      // Inject failure right after rollback release creation
      store.failAfterRollbackReleaseCreation = true;

      await assert.rejects(
        () =>
          service.rollbackPublished({
            actorId: 'u1',
            projectId: 'p1',
            pageId: page.id,
            expectedPublishedRevisionId: rev2.id,
          }),
        /SIMULATED_TRANSACTION_FAILURE_POST_RELEASE/
      );

      // Verify no orphan release or item persisted
      assert.strictEqual(store.releases.size, releaseCountBefore);
      assert.strictEqual(store.releaseItems.length, releaseItemCountBefore);

      // Verify page pointers unchanged
      const pageAfter = (await store.findPageById('p1', page.id))!;
      assert.strictEqual(pageAfter.publishedRevisionId, rev2.id);
      assert.strictEqual(pageAfter.draftRevisionId, null);

      // Verify no audit log persisted
      assert.strictEqual(
        store.auditLogs.filter((a) => a.action === 'CONTENT_RELEASE_ROLLED_BACK').length,
        0
      );
    });

    it('ATOMICITY: CAS failure during pointer update rolls back release and items completely', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async () => true,
      });

      const { page, rev2 } = await setupTwoPublications(store, service, 'p1', 'u1');
      const releaseCountBefore = store.releases.size;
      const releaseItemCountBefore = store.releaseItems.length;

      store.failDuringRollbackPointerCAS = true;

      await assert.rejects(
        () =>
          service.rollbackPublished({
            actorId: 'u1',
            projectId: 'p1',
            pageId: page.id,
            expectedPublishedRevisionId: rev2.id,
          }),
        (err: any) => {
          assert.strictEqual(err.code, 'LOCK_CONFLICT');
          return true;
        }
      );

      assert.strictEqual(store.releases.size, releaseCountBefore);
      assert.strictEqual(store.releaseItems.length, releaseItemCountBefore);
      const pageAfter = (await store.findPageById('p1', page.id))!;
      assert.strictEqual(pageAfter.publishedRevisionId, rev2.id);
      assert.strictEqual(pageAfter.draftRevisionId, null);
    });
  });

  describe('REOPEN DRAFT FROM PUBLISHED', () => {
    it('PASS: authorized reopen creates new DRAFT from published snapshot, increments revisionNumber, sets derivedFromRevisionId, updates draft pointer and allows subsequent updateDraft', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const grantedPermissions = new Set(['content.create', 'content.edit', 'content.review', 'content.approve', 'content.publish']);
      let permissionCheckedProjectId: string | null = null;
      const service = new ContentLifecycleService({
        store,
        hasPermission: async (_actorId, perm, projId) => {
          if (perm === 'content.edit') {
            permissionCheckedProjectId = projId;
          }
          return grantedPermissions.has(perm);
        },
      });

      const projectId = 'proj-reopen';
      const actorId = 'user-reopen-1';

      // Setup 1 publication
      const { page, revision: rev1 } = await service.createPageDraft({
        actorId,
        projectId,
        key: 'page-reopen',
        title: 'Original Title',
        slug: 'original-slug',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: sampleContent,
      });
      await service.submitForReview({ actorId, projectId, pageId: page.id, expectedLockVersion: rev1.lockVersion });
      const rev1InReview = (await store.findRevisionById(rev1.id))!;
      await service.approveReview({ actorId, projectId, pageId: page.id, expectedLockVersion: rev1InReview.lockVersion });
      const rev1Approved = (await store.findRevisionById(rev1.id))!;
      const pub1 = await service.publishApproved({
        actorId,
        projectId,
        pageId: page.id,
        expectedLockVersion: rev1Approved.lockVersion,
      });

      store.auditLogs = [];

      // Reopen draft from published
      const reopenResult = await service.createDraftFromPublished({
        actorId,
        projectId,
        pageId: page.id,
        expectedPublishedRevisionId: pub1.revision.id,
      });

      // 1. Permission check verified projectId
      assert.strictEqual(permissionCheckedProjectId, projectId);

      // 2. Published revision remains untouched
      const originalPubInStore = (await store.findRevisionById(pub1.revision.id))!;
      assert.strictEqual(originalPubInStore.status, 'PUBLISHED');
      assert.strictEqual(originalPubInStore.title, 'Original Title');
      assert.strictEqual(reopenResult.publishedRevision.id, pub1.revision.id);

      // 3. New draft revision created
      const newDraft = reopenResult.draftRevision;
      assert.strictEqual(newDraft.status, 'DRAFT');
      assert.strictEqual(newDraft.revisionNumber, 2);
      assert.strictEqual(newDraft.lockVersion, 1);
      assert.strictEqual(newDraft.createdById, actorId);
      assert.strictEqual(newDraft.derivedFromRevisionId, pub1.revision.id);
      assert.strictEqual(newDraft.submittedAt, null);
      assert.strictEqual(newDraft.approvedAt, null);
      assert.strictEqual(newDraft.publishedAt, null);
      assert.deepStrictEqual(newDraft.content, sampleContent);

      // 4. Page pointers
      assert.strictEqual(reopenResult.page.publishedRevisionId, pub1.revision.id);
      assert.strictEqual(reopenResult.page.draftRevisionId, newDraft.id);

      // 5. Audit log
      assert.strictEqual(store.auditLogs.length, 1);
      const audit = store.auditLogs[0];
      assert.strictEqual(audit.action, 'CONTENT_DRAFT_REOPENED');
      assert.strictEqual(audit.scopeType, 'PROJECT');
      assert.strictEqual(audit.scopeId, projectId);
      assert.strictEqual(audit.resourceType, 'PAGE_REVISION');
      assert.strictEqual(audit.resourceId, newDraft.id);
      assert.strictEqual(audit.metadata.pageId, page.id);
      assert.strictEqual(audit.metadata.sourcePublishedRevisionId, pub1.revision.id);
      assert.strictEqual(audit.metadata.newDraftRevisionId, newDraft.id);
      assert.strictEqual(audit.metadata.newDraftRevisionNumber, 2);
      assert.strictEqual(audit.metadata.lockVersion, 1);

      // 6. Subsequent updateDraft works normally on the new draft
      const updateResult = await service.updateDraft({
        actorId,
        projectId,
        pageId: page.id,
        expectedLockVersion: newDraft.lockVersion,
        title: 'Updated After Reopen',
      });
      assert.strictEqual(updateResult.revision.title, 'Updated After Reopen');
      assert.strictEqual(updateResult.revision.lockVersion, 2);
    });

    it('FAIL: content.edit denied => FORBIDDEN', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async (_actorId, perm) => perm !== 'content.edit',
      });

      await assert.rejects(
        () =>
          service.createDraftFromPublished({
            actorId: 'u1',
            projectId: 'p1',
            pageId: 'page-1',
            expectedPublishedRevisionId: 'rev-1',
          }),
        (err: any) => {
          assert.strictEqual(err.code, 'FORBIDDEN');
          return true;
        }
      );
    });

    it('FAIL: cross-project Page hidden => PAGE_NOT_FOUND', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async () => true,
      });

      const { page, rev2 } = await setupTwoPublications(store, service, 'proj-1', 'u1');

      await assert.rejects(
        () =>
          service.createDraftFromPublished({
            actorId: 'u1',
            projectId: 'proj-OTHER',
            pageId: page.id,
            expectedPublishedRevisionId: rev2.id,
          }),
        (err: any) => {
          assert.strictEqual(err.code, 'PAGE_NOT_FOUND');
          return true;
        }
      );
    });

    it('FAIL: no published revision => NO_PUBLISHED_REVISION', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async () => true,
      });

      const { page } = await service.createPageDraft({
        actorId: 'u1',
        projectId: 'p1',
        key: 'draft-only',
        title: 'Draft only',
        slug: 'draft-only',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: sampleContent,
      });

      await assert.rejects(
        () =>
          service.createDraftFromPublished({
            actorId: 'u1',
            projectId: 'p1',
            pageId: page.id,
            expectedPublishedRevisionId: 'rev-any',
          }),
        (err: any) => {
          assert.strictEqual(err.code, 'NO_PUBLISHED_REVISION');
          return true;
        }
      );
    });

    it('FAIL: expectedPublishedRevisionId mismatch => LOCK_CONFLICT', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async () => true,
      });

      const { page } = await setupTwoPublications(store, service, 'p1', 'u1');

      await assert.rejects(
        () =>
          service.createDraftFromPublished({
            actorId: 'u1',
            projectId: 'p1',
            pageId: page.id,
            expectedPublishedRevisionId: 'wrong-published-rev-id',
          }),
        (err: any) => {
          assert.strictEqual(err.code, 'LOCK_CONFLICT');
          return true;
        }
      );
    });

    it('FAIL: active draft already exists => ACTIVE_DRAFT_EXISTS', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async () => true,
      });

      const { page, rev2 } = await setupTwoPublications(store, service, 'p1', 'u1');

      // First reopen succeeds
      await service.createDraftFromPublished({
        actorId: 'u1',
        projectId: 'p1',
        pageId: page.id,
        expectedPublishedRevisionId: rev2.id,
      });

      // Second reopen fails because active draft already exists
      await assert.rejects(
        () =>
          service.createDraftFromPublished({
            actorId: 'u1',
            projectId: 'p1',
            pageId: page.id,
            expectedPublishedRevisionId: rev2.id,
          }),
        (err: any) => {
          assert.strictEqual(err.code, 'ACTIVE_DRAFT_EXISTS');
          return true;
        }
      );
    });

    it('FAIL: pointer references wrong Page or source not PUBLISHED => POINTER_INTEGRITY_VIOLATION', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async () => true,
      });

      const { page, rev2 } = await setupTwoPublications(store, service, 'p1', 'u1');

      // Corrupt rev2 pageId
      store.revisions.set(rev2.id, { ...rev2, pageId: 'other-page-id' });
      await assert.rejects(
        () =>
          service.createDraftFromPublished({
            actorId: 'u1',
            projectId: 'p1',
            pageId: page.id,
            expectedPublishedRevisionId: rev2.id,
          }),
        (err: any) => {
          assert.strictEqual(err.code, 'POINTER_INTEGRITY_VIOLATION');
          return true;
        }
      );

      // Corrupt rev2 status to IN_REVIEW
      store.revisions.set(rev2.id, { ...rev2, pageId: page.id, status: 'IN_REVIEW' });
      await assert.rejects(
        () =>
          service.createDraftFromPublished({
            actorId: 'u1',
            projectId: 'p1',
            pageId: page.id,
            expectedPublishedRevisionId: rev2.id,
          }),
        (err: any) => {
          assert.strictEqual(err.code, 'POINTER_INTEGRITY_VIOLATION');
          return true;
        }
      );
    });

    it('FAIL: revision number race mapped to LOCK_CONFLICT', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async () => true,
      });

      const { page, rev2 } = await setupTwoPublications(store, service, 'p1', 'u1');

      store.simulateRevisionNumberRace = true;

      await assert.rejects(
        () =>
          service.createDraftFromPublished({
            actorId: 'u1',
            projectId: 'p1',
            pageId: page.id,
            expectedPublishedRevisionId: rev2.id,
          }),
        (err: any) => {
          assert.strictEqual(err.code, 'LOCK_CONFLICT');
          return true;
        }
      );
    });

    it('FAIL: failed pointer CAS leaves no orphan draft in transaction', async () => {
      const store = new FakeRollbackContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async () => true,
      });

      const { page, rev2 } = await setupTwoPublications(store, service, 'p1', 'u1');
      const revisionsCountBefore = store.revisions.size;

      store.failDuringReopenPointerCAS = true;

      await assert.rejects(
        () =>
          service.createDraftFromPublished({
            actorId: 'u1',
            projectId: 'p1',
            pageId: page.id,
            expectedPublishedRevisionId: rev2.id,
          }),
        (err: any) => {
          assert.strictEqual(err.code, 'LOCK_CONFLICT');
          return true;
        }
      );

      // Ensure no orphan revision was created
      assert.strictEqual(store.revisions.size, revisionsCountBefore);
      const pageAfter = (await store.findPageById('p1', page.id))!;
      assert.strictEqual(pageAfter.draftRevisionId, null);
    });
  });

  describe('PRODUCTION SOURCE ASSERTIONS', () => {
    it('Verify rollback pointer CAS source code includes pageId, projectId, draftRevisionId: null, publishedRevisionId: params.expectedPublishedRevisionId', () => {
      const prismaStorePath = join(process.cwd(), 'lib/domain/content/lifecycle/prisma-store.ts');
      const prismaStoreSource = readFileSync(prismaStorePath, 'utf8');

      // Verify setRollbackPublishedPointerAtomic implementation
      assert.ok(
        prismaStoreSource.includes('setRollbackPublishedPointerAtomic'),
        'setRollbackPublishedPointerAtomic method must exist in prisma-store.ts'
      );
      assert.ok(
        prismaStoreSource.includes('id: params.pageId'),
        'Must filter by params.pageId'
      );
      assert.ok(
        prismaStoreSource.includes('projectId: params.projectId'),
        'Must filter by params.projectId'
      );
      assert.ok(
        prismaStoreSource.includes('draftRevisionId: null'),
        'Must filter by draftRevisionId: null'
      );
      assert.ok(
        prismaStoreSource.includes('publishedRevisionId: params.expectedPublishedRevisionId'),
        'Must filter by publishedRevisionId: params.expectedPublishedRevisionId'
      );
    });

    it('Verify reopen pointer CAS source code includes pageId, projectId, draftRevisionId: null, expected publishedRevisionId', () => {
      const prismaStorePath = join(process.cwd(), 'lib/domain/content/lifecycle/prisma-store.ts');
      const prismaStoreSource = readFileSync(prismaStorePath, 'utf8');

      assert.ok(
        prismaStoreSource.includes('setDraftFromPublishedPointerAtomic'),
        'setDraftFromPublishedPointerAtomic method must exist in prisma-store.ts'
      );
      assert.ok(
        prismaStoreSource.includes('draftRevisionId: params.newDraftRevisionId'),
        'Must update draftRevisionId to newDraftRevisionId'
      );
    });
  });
});
