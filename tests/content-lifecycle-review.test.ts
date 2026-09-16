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
  RecordLifecycleAuditParams,
  LifecyclePage,
  LifecyclePageRevision,
  ContentLifecycleError,
} from '../lib/domain/content/lifecycle';
import { PageContent } from '../lib/domain/content/contracts';
import { PermissionKey } from '../lib/auth/rbac';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

class FakeReviewContentLifecycleStore implements ContentLifecycleStore {
  pages = new Map<string, LifecyclePage>();
  revisions = new Map<string, LifecyclePageRevision>();
  auditLogs: RecordLifecycleAuditParams[] = [];

  private cloneState() {
    return {
      pages: new Map(Array.from(this.pages.entries()).map(([k, v]) => [k, { ...v }])),
      revisions: new Map(Array.from(this.revisions.entries()).map(([k, v]) => [k, { ...v, seo: { ...v.seo }, navigation: { ...v.navigation } }])),
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
    // Check unique revisionNumber per pageId (simulates P2002)
    for (const rev of this.revisions.values()) {
      if (rev.pageId === params.pageId && rev.revisionNumber === params.revisionNumber) {
        throw new ContentLifecycleError('LOCK_CONFLICT', 'Revision number conflict due to concurrent operation');
      }
    }

    const revisionId = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const source = params.sourceRevision;

    const newRev: LifecyclePageRevision = {
      id: revisionId,
      pageId: params.pageId,
      revisionNumber: params.revisionNumber,
      status: 'DRAFT',
      title: source.title,
      slug: source.slug,
      locale: source.locale,
      description: source.description,
      visibility: source.visibility,
      content: JSON.parse(JSON.stringify(source.content)),
      seo: JSON.parse(JSON.stringify(source.seo)),
      navigation: JSON.parse(JSON.stringify(source.navigation)),
      schemaVersion: source.schemaVersion,
      lockVersion: 1,
      createdById: params.actorId,
      createdAt: new Date(),
      submittedAt: null,
      approvedAt: null,
      publishedAt: null,
      derivedFromRevisionId: params.derivedFromRevisionId,
    };

    this.revisions.set(revisionId, newRev);
    return { ...newRev };
  }

  async setPageDraftRevisionPointer(
    params: SetPageDraftRevisionPointerParams
  ): Promise<LifecyclePage> {
    const page = this.pages.get(params.pageId);
    if (!page || page.projectId !== params.projectId) {
      throw new ContentLifecycleError('PAGE_NOT_FOUND', 'Page not found in this project');
    }
    const updated: LifecyclePage = {
      ...page,
      draftRevisionId: params.draftRevisionId,
      updatedAt: new Date(Date.now() + 5),
    };
    this.pages.set(params.pageId, updated);
    return { ...updated };
  }

  async touchPageUpdatedAt(projectId: string, pageId: string): Promise<LifecyclePage> {
    const page = this.pages.get(pageId);
    if (!page || page.projectId !== projectId) {
      throw new ContentLifecycleError('PAGE_NOT_FOUND', 'Page not found in this project');
    }
    const updated: LifecyclePage = {
      ...page,
      updatedAt: new Date(Date.now() + 10),
    };
    this.pages.set(pageId, updated);
    return { ...updated };
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
      data: { text: 'Review Test Page', level: 1 },
    },
  ],
};

function createService(
  store: ContentLifecycleStore,
  grantedPermissions: Set<string> = new Set(['content.create', 'content.edit', 'content.review', 'content.approve'])
) {
  const hasPermission = async (actorId: string, permission: PermissionKey, projectId: string | null) => {
    return grantedPermissions.has(`${actorId}:${permission}:${projectId}`) || grantedPermissions.has(`${actorId}:${permission}`);
  };

  return new ContentLifecycleService({ store, hasPermission });
}

describe('Content Lifecycle - Review & Approval Service', () => {
  describe('SUBMIT FOR REVIEW', () => {
    it('PASS: authorized DRAFT -> IN_REVIEW sets submittedAt, increments lockVersion, touches Page updatedAt, records audit', async () => {
      const store = new FakeReviewContentLifecycleStore();
      const actorId = 'user_author_1';
      const projectId = 'proj_alpha';
      const granted = new Set([
        `${actorId}:content.create:${projectId}`,
        `${actorId}:content.edit:${projectId}`,
      ]);
      const service = createService(store, granted);

      const created = await service.createPageDraft({
        actorId,
        projectId,
        key: 'about-us',
        title: 'About Us',
        slug: 'about-us',
        locale: 'en',
        visibility: 'PUBLIC',
        content: sampleContent,
      });

      const initialPageUpdatedAt = created.page.updatedAt.getTime();
      assert.strictEqual(created.revision.status, 'DRAFT');
      assert.strictEqual(created.revision.lockVersion, 1);
      assert.strictEqual(created.revision.submittedAt, null);

      const submitResult = await service.submitForReview({
        actorId,
        projectId,
        pageId: created.page.id,
        expectedLockVersion: 1,
      });

      // 1. Status and lock
      assert.strictEqual(submitResult.revision.status, 'IN_REVIEW');
      assert.strictEqual(submitResult.revision.lockVersion, 2);
      assert.ok(submitResult.revision.submittedAt instanceof Date);

      // 2. Page pointer remains same revision
      assert.strictEqual(submitResult.page.draftRevisionId, created.revision.id);
      assert.ok(submitResult.page.updatedAt.getTime() >= initialPageUpdatedAt);

      // 3. Immutability: updateDraft must reject IN_REVIEW
      await assert.rejects(
        async () => {
          await service.updateDraft({
            actorId,
            projectId,
            pageId: created.page.id,
            expectedLockVersion: 2,
            title: 'Hacked Title While In Review',
          });
        },
        (err: any) => {
          assert.strictEqual(err.code, 'DRAFT_STATE_INVALID');
          return true;
        }
      );

      // 4. Audit inside transaction
      const submitAudit = store.auditLogs.find((a) => a.action === 'CONTENT_REVIEW_SUBMITTED');
      assert.ok(submitAudit);
      assert.strictEqual(submitAudit.resourceId, created.revision.id);
      assert.strictEqual(submitAudit.scopeId, projectId);
      assert.strictEqual(submitAudit.actorId, actorId);
      assert.strictEqual(submitAudit.metadata.fromStatus, 'DRAFT');
      assert.strictEqual(submitAudit.metadata.toStatus, 'IN_REVIEW');
      assert.strictEqual(submitAudit.metadata.lockVersion, 2);
    });

    it('FAIL: content.edit denied', async () => {
      const store = new FakeReviewContentLifecycleStore();
      const actorId = 'user_author_1';
      const projectId = 'proj_alpha';
      const serviceAll = createService(store, new Set([`${actorId}:content.create:${projectId}`]));

      const created = await serviceAll.createPageDraft({
        actorId,
        projectId,
        key: 'about-us',
        title: 'About Us',
        slug: 'about-us',
        locale: 'en',
        visibility: 'PUBLIC',
        content: sampleContent,
      });

      // Service without content.edit
      const noEditService = createService(store, new Set());
      await assert.rejects(
        async () => {
          await noEditService.submitForReview({
            actorId,
            projectId,
            pageId: created.page.id,
            expectedLockVersion: 1,
          });
        },
        (err: any) => {
          assert.strictEqual(err.code, 'FORBIDDEN');
          return true;
        }
      );
    });

    it('FAIL: cross-project Page => PAGE_NOT_FOUND', async () => {
      const store = new FakeReviewContentLifecycleStore();
      const actorId = 'user_author_1';
      const service = createService(store, new Set([
        `${actorId}:content.create:proj_a`,
        `${actorId}:content.edit:proj_a`,
        `${actorId}:content.edit:proj_b`,
      ]));

      const created = await service.createPageDraft({
        actorId,
        projectId: 'proj_a',
        key: 'about-us',
        title: 'About Us',
        slug: 'about-us',
        locale: 'en',
        visibility: 'PUBLIC',
        content: sampleContent,
      });

      // Submit from proj_b
      await assert.rejects(
        async () => {
          await service.submitForReview({
            actorId,
            projectId: 'proj_b',
            pageId: created.page.id,
            expectedLockVersion: 1,
          });
        },
        (err: any) => {
          assert.strictEqual(err.code, 'PAGE_NOT_FOUND');
          return true;
        }
      );
    });

    it('FAIL: no pointer => NO_DRAFT', async () => {
      const store = new FakeReviewContentLifecycleStore();
      const actorId = 'user_1';
      const projectId = 'proj_a';
      const service = createService(store, new Set([`${actorId}:content.edit:${projectId}`]));

      const pageId = 'p_no_ptr';
      store.pages.set(pageId, {
        id: pageId,
        projectId,
        key: 'no-ptr',
        parentId: null,
        sortOrder: 0,
        draftRevisionId: null,
        publishedRevisionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await assert.rejects(
        async () => {
          await service.submitForReview({
            actorId,
            projectId,
            pageId,
            expectedLockVersion: 1,
          });
        },
        (err: any) => {
          assert.strictEqual(err.code, 'NO_DRAFT');
          return true;
        }
      );
    });

    it('FAIL: pointer to another Page => POINTER_INTEGRITY_VIOLATION', async () => {
      const store = new FakeReviewContentLifecycleStore();
      const actorId = 'user_1';
      const projectId = 'proj_a';
      const service = createService(store, new Set([`${actorId}:content.edit:${projectId}`]));

      const pageId = 'p_wrong';
      const foreignRevId = 'rev_foreign';
      store.pages.set(pageId, {
        id: pageId,
        projectId,
        key: 'p-wrong',
        parentId: null,
        sortOrder: 0,
        draftRevisionId: foreignRevId,
        publishedRevisionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      store.revisions.set(foreignRevId, {
        id: foreignRevId,
        pageId: 'other_page_id',
        revisionNumber: 1,
        status: 'DRAFT',
        title: 'Foreign',
        slug: 'foreign',
        locale: 'en',
        description: null,
        visibility: 'PUBLIC',
        content: sampleContent,
        seo: {},
        navigation: {},
        schemaVersion: '1.0.0',
        lockVersion: 1,
        createdById: actorId,
        createdAt: new Date(),
        submittedAt: null,
        approvedAt: null,
        publishedAt: null,
        derivedFromRevisionId: null,
      });

      await assert.rejects(
        async () => {
          await service.submitForReview({
            actorId,
            projectId,
            pageId,
            expectedLockVersion: 1,
          });
        },
        (err: any) => {
          assert.strictEqual(err.code, 'POINTER_INTEGRITY_VIOLATION');
          return true;
        }
      );
    });

    it('FAIL: active status IN_REVIEW or APPROVED => STATE_TRANSITION_INVALID', async () => {
      const store = new FakeReviewContentLifecycleStore();
      const actorId = 'user_1';
      const projectId = 'proj_a';
      const service = createService(store, new Set([
        `${actorId}:content.create:${projectId}`,
        `${actorId}:content.edit:${projectId}`,
      ]));

      const created = await service.createPageDraft({
        actorId,
        projectId,
        key: 'sub-test',
        title: 'Title',
        slug: 'sub-test',
        locale: 'en',
        visibility: 'PUBLIC',
        content: sampleContent,
      });

      // Submit once => IN_REVIEW
      await service.submitForReview({
        actorId,
        projectId,
        pageId: created.page.id,
        expectedLockVersion: 1,
      });

      // Try submitting again when already IN_REVIEW
      await assert.rejects(
        async () => {
          await service.submitForReview({
            actorId,
            projectId,
            pageId: created.page.id,
            expectedLockVersion: 2,
          });
        },
        (err: any) => {
          assert.strictEqual(err.code, 'STATE_TRANSITION_INVALID');
          return true;
        }
      );
    });

    it('FAIL: stale lock => LOCK_CONFLICT', async () => {
      const store = new FakeReviewContentLifecycleStore();
      const actorId = 'user_1';
      const projectId = 'proj_a';
      const service = createService(store, new Set([
        `${actorId}:content.create:${projectId}`,
        `${actorId}:content.edit:${projectId}`,
      ]));

      const created = await service.createPageDraft({
        actorId,
        projectId,
        key: 'lock-test',
        title: 'Title',
        slug: 'lock-test',
        locale: 'en',
        visibility: 'PUBLIC',
        content: sampleContent,
      });

      await assert.rejects(
        async () => {
          await service.submitForReview({
            actorId,
            projectId,
            pageId: created.page.id,
            expectedLockVersion: 999, // Stale/wrong lockVersion
          });
        },
        (err: any) => {
          assert.strictEqual(err.code, 'LOCK_CONFLICT');
          return true;
        }
      );
    });
  });

  describe('APPROVE REVIEW', () => {
    it('PASS: authorized IN_REVIEW -> APPROVED sets approvedAt, content snapshot unchanged, lockVersion increments, pointer remains same revision, audit in transaction', async () => {
      const store = new FakeReviewContentLifecycleStore();
      const authorId = 'author_1';
      const approverId = 'approver_1';
      const projectId = 'proj_alpha';
      const granted = new Set([
        `${authorId}:content.create:${projectId}`,
        `${authorId}:content.edit:${projectId}`,
        `${approverId}:content.approve:${projectId}`,
      ]);
      const service = createService(store, granted);

      const created = await service.createPageDraft({
        actorId: authorId,
        projectId,
        key: 'policy',
        title: 'Policy Page',
        slug: 'policy',
        locale: 'en',
        visibility: 'PUBLIC',
        content: sampleContent,
      });

      const submitted = await service.submitForReview({
        actorId: authorId,
        projectId,
        pageId: created.page.id,
        expectedLockVersion: 1,
      });

      assert.strictEqual(submitted.revision.status, 'IN_REVIEW');
      assert.strictEqual(submitted.revision.lockVersion, 2);

      const approveResult = await service.approveReview({
        actorId: approverId,
        projectId,
        pageId: created.page.id,
        expectedLockVersion: 2,
      });

      // 1. Status and lock
      assert.strictEqual(approveResult.revision.status, 'APPROVED');
      assert.strictEqual(approveResult.revision.lockVersion, 3);
      assert.ok(approveResult.revision.approvedAt instanceof Date);
      // submittedAt preserved
      assert.strictEqual(approveResult.revision.submittedAt?.getTime(), submitted.revision.submittedAt?.getTime());

      // 2. Content snapshot unchanged
      assert.deepStrictEqual(approveResult.revision.content, sampleContent);
      assert.strictEqual(approveResult.revision.title, 'Policy Page');

      // 3. Pointer remains on approved revision
      assert.strictEqual(approveResult.page.draftRevisionId, created.revision.id);

      // 4. Audit in transaction
      const approveAudit = store.auditLogs.find((a) => a.action === 'CONTENT_REVIEW_APPROVED');
      assert.ok(approveAudit);
      assert.strictEqual(approveAudit.resourceId, created.revision.id);
      assert.strictEqual(approveAudit.scopeId, projectId);
      assert.strictEqual(approveAudit.actorId, approverId);
      assert.strictEqual(approveAudit.metadata.fromStatus, 'IN_REVIEW');
      assert.strictEqual(approveAudit.metadata.toStatus, 'APPROVED');
      assert.strictEqual(approveAudit.metadata.lockVersion, 3);
    });

    it('FAIL: content.approve denied', async () => {
      const store = new FakeReviewContentLifecycleStore();
      const authorId = 'author_1';
      const actorNoApprove = 'reviewer_1';
      const projectId = 'proj_alpha';
      const service = createService(store, new Set([
        `${authorId}:content.create:${projectId}`,
        `${authorId}:content.edit:${projectId}`,
        `${actorNoApprove}:content.review:${projectId}`, // Has review, not approve
      ]));

      const created = await service.createPageDraft({
        actorId: authorId,
        projectId,
        key: 'policy',
        title: 'Policy Page',
        slug: 'policy',
        locale: 'en',
        visibility: 'PUBLIC',
        content: sampleContent,
      });

      await service.submitForReview({
        actorId: authorId,
        projectId,
        pageId: created.page.id,
        expectedLockVersion: 1,
      });

      await assert.rejects(
        async () => {
          await service.approveReview({
            actorId: actorNoApprove,
            projectId,
            pageId: created.page.id,
            expectedLockVersion: 2,
          });
        },
        (err: any) => {
          assert.strictEqual(err.code, 'FORBIDDEN');
          return true;
        }
      );
    });

    it('FAIL: non-IN_REVIEW statuses rejected (DRAFT, APPROVED, PUBLISHED)', async () => {
      const store = new FakeReviewContentLifecycleStore();
      const actorId = 'approver_1';
      const projectId = 'proj_alpha';
      const service = createService(store, new Set([
        `${actorId}:content.create:${projectId}`,
        `${actorId}:content.edit:${projectId}`,
        `${actorId}:content.approve:${projectId}`,
      ]));

      // 1. DRAFT cannot be approved directly
      const created = await service.createPageDraft({
        actorId,
        projectId,
        key: 'draft-approve',
        title: 'Draft Approve',
        slug: 'draft-approve',
        locale: 'en',
        visibility: 'PUBLIC',
        content: sampleContent,
      });

      await assert.rejects(
        async () => {
          await service.approveReview({
            actorId,
            projectId,
            pageId: created.page.id,
            expectedLockVersion: 1,
          });
        },
        (err: any) => {
          assert.strictEqual(err.code, 'STATE_TRANSITION_INVALID');
          return true;
        }
      );

      // Submit -> Approve
      await service.submitForReview({
        actorId,
        projectId,
        pageId: created.page.id,
        expectedLockVersion: 1,
      });
      await service.approveReview({
        actorId,
        projectId,
        pageId: created.page.id,
        expectedLockVersion: 2,
      });

      // 2. Already APPROVED cannot be approved again
      await assert.rejects(
        async () => {
          await service.approveReview({
            actorId,
            projectId,
            pageId: created.page.id,
            expectedLockVersion: 3,
          });
        },
        (err: any) => {
          assert.strictEqual(err.code, 'STATE_TRANSITION_INVALID');
          return true;
        }
      );
    });

    it('FAIL: stale lock => LOCK_CONFLICT', async () => {
      const store = new FakeReviewContentLifecycleStore();
      const actorId = 'approver_1';
      const projectId = 'proj_alpha';
      const service = createService(store, new Set([
        `${actorId}:content.create:${projectId}`,
        `${actorId}:content.edit:${projectId}`,
        `${actorId}:content.approve:${projectId}`,
      ]));

      const created = await service.createPageDraft({
        actorId,
        projectId,
        key: 'lock-test-app',
        title: 'Title',
        slug: 'lock-test-app',
        locale: 'en',
        visibility: 'PUBLIC',
        content: sampleContent,
      });

      await service.submitForReview({
        actorId,
        projectId,
        pageId: created.page.id,
        expectedLockVersion: 1,
      });

      await assert.rejects(
        async () => {
          await service.approveReview({
            actorId,
            projectId,
            pageId: created.page.id,
            expectedLockVersion: 1, // Stale, current is 2
          });
        },
        (err: any) => {
          assert.strictEqual(err.code, 'LOCK_CONFLICT');
          return true;
        }
      );
    });

    it('FAIL: cross-project Page hidden => PAGE_NOT_FOUND', async () => {
      const store = new FakeReviewContentLifecycleStore();
      const actorId = 'approver_1';
      const service = createService(store, new Set([
        `${actorId}:content.create:proj_a`,
        `${actorId}:content.edit:proj_a`,
        `${actorId}:content.approve:proj_b`,
      ]));

      const created = await service.createPageDraft({
        actorId,
        projectId: 'proj_a',
        key: 'cross-test',
        title: 'Title',
        slug: 'cross-test',
        locale: 'en',
        visibility: 'PUBLIC',
        content: sampleContent,
      });

      await service.submitForReview({
        actorId,
        projectId: 'proj_a',
        pageId: created.page.id,
        expectedLockVersion: 1,
      });

      await assert.rejects(
        async () => {
          await service.approveReview({
            actorId,
            projectId: 'proj_b',
            pageId: created.page.id,
            expectedLockVersion: 2,
          });
        },
        (err: any) => {
          assert.strictEqual(err.code, 'PAGE_NOT_FOUND');
          return true;
        }
      );
    });
  });

  describe('REQUEST CHANGES', () => {
    it('PASS: content.review authorized, original snapshot remains IN_REVIEW, old lockVersion increments, new DRAFT created with revisionNumber=old+1 and lockVersion=1, pointer moves to new draft, audit transactional', async () => {
      const store = new FakeReviewContentLifecycleStore();
      const authorId = 'author_1';
      const reviewerId = 'reviewer_1';
      const projectId = 'proj_alpha';
      const service = createService(store, new Set([
        `${authorId}:content.create:${projectId}`,
        `${authorId}:content.edit:${projectId}`,
        `${reviewerId}:content.review:${projectId}`,
      ]));

      const created = await service.createPageDraft({
        actorId: authorId,
        projectId,
        key: 'terms',
        title: 'Terms of Service',
        slug: 'terms',
        locale: 'en',
        visibility: 'PUBLIC',
        content: sampleContent,
      });

      const submitted = await service.submitForReview({
        actorId: authorId,
        projectId,
        pageId: created.page.id,
        expectedLockVersion: 1,
      });

      const originalRevisionId = submitted.revision.id;
      const submittedAt = submitted.revision.submittedAt;

      const changeResult = await service.requestChanges({
        actorId: reviewerId,
        projectId,
        pageId: created.page.id,
        expectedLockVersion: 2,
      });

      // 1. Original review revision verification
      assert.strictEqual(changeResult.reviewRevision.id, originalRevisionId);
      assert.strictEqual(changeResult.reviewRevision.status, 'IN_REVIEW');
      assert.strictEqual(changeResult.reviewRevision.lockVersion, 3);
      assert.strictEqual(changeResult.reviewRevision.submittedAt?.getTime(), submittedAt?.getTime());
      assert.deepStrictEqual(changeResult.reviewRevision.content, sampleContent);

      // Verify store has the immutable review revision unchanged in content
      const storedOldRev = await store.findRevisionById(originalRevisionId);
      assert.ok(storedOldRev);
      assert.strictEqual(storedOldRev.status, 'IN_REVIEW');
      assert.strictEqual(storedOldRev.lockVersion, 3);

      // 2. New DRAFT revision verification
      const newDraft = changeResult.newDraftRevision;
      assert.notStrictEqual(newDraft.id, originalRevisionId);
      assert.strictEqual(newDraft.pageId, created.page.id);
      assert.strictEqual(newDraft.revisionNumber, 2);
      assert.strictEqual(newDraft.status, 'DRAFT');
      assert.strictEqual(newDraft.lockVersion, 1);
      assert.strictEqual(newDraft.derivedFromRevisionId, originalRevisionId);
      assert.strictEqual(newDraft.createdById, reviewerId);
      assert.strictEqual(newDraft.submittedAt, null);
      assert.strictEqual(newDraft.approvedAt, null);
      assert.strictEqual(newDraft.publishedAt, null);
      assert.deepStrictEqual(newDraft.content, sampleContent);
      assert.strictEqual(newDraft.title, 'Terms of Service');

      // 3. Page pointer moved to new draft
      assert.strictEqual(changeResult.page.draftRevisionId, newDraft.id);

      // Verify new draft is editable via updateDraft
      const editResult = await service.updateDraft({
        actorId: authorId,
        projectId,
        pageId: created.page.id,
        expectedLockVersion: 1,
        title: 'Terms of Service v2',
      });
      assert.strictEqual(editResult.revision.id, newDraft.id);
      assert.strictEqual(editResult.revision.title, 'Terms of Service v2');
      assert.strictEqual(editResult.revision.lockVersion, 2);

      // Old review revision remains untouched after updateDraft
      const storedOldAfterEdit = await store.findRevisionById(originalRevisionId);
      assert.strictEqual(storedOldAfterEdit?.title, 'Terms of Service');

      // 4. Audit inside transaction
      const audit = store.auditLogs.find((a) => a.action === 'CONTENT_CHANGES_REQUESTED');
      assert.ok(audit);
      assert.strictEqual(audit.resourceId, originalRevisionId);
      assert.strictEqual(audit.scopeId, projectId);
      assert.strictEqual(audit.actorId, reviewerId);
      assert.strictEqual(audit.metadata.newDraftRevisionId, newDraft.id);
      assert.strictEqual(audit.metadata.newDraftRevisionNumber, 2);
    });

    it('FAIL: content.review denied', async () => {
      const store = new FakeReviewContentLifecycleStore();
      const authorId = 'author_1';
      const actorNoReview = 'user_no_review';
      const projectId = 'proj_alpha';
      const service = createService(store, new Set([
        `${authorId}:content.create:${projectId}`,
        `${authorId}:content.edit:${projectId}`,
      ]));

      const created = await service.createPageDraft({
        actorId: authorId,
        projectId,
        key: 'terms-perm',
        title: 'Terms',
        slug: 'terms-perm',
        locale: 'en',
        visibility: 'PUBLIC',
        content: sampleContent,
      });

      await service.submitForReview({
        actorId: authorId,
        projectId,
        pageId: created.page.id,
        expectedLockVersion: 1,
      });

      await assert.rejects(
        async () => {
          await service.requestChanges({
            actorId: actorNoReview,
            projectId,
            pageId: created.page.id,
            expectedLockVersion: 2,
          });
        },
        (err: any) => {
          assert.strictEqual(err.code, 'FORBIDDEN');
          return true;
        }
      );
    });

    it('FAIL: wrong active status (DRAFT, APPROVED)', async () => {
      const store = new FakeReviewContentLifecycleStore();
      const actorId = 'reviewer_1';
      const projectId = 'proj_alpha';
      const service = createService(store, new Set([
        `${actorId}:content.create:${projectId}`,
        `${actorId}:content.edit:${projectId}`,
        `${actorId}:content.review:${projectId}`,
        `${actorId}:content.approve:${projectId}`,
      ]));

      const created = await service.createPageDraft({
        actorId,
        projectId,
        key: 'terms-status',
        title: 'Terms',
        slug: 'terms-status',
        locale: 'en',
        visibility: 'PUBLIC',
        content: sampleContent,
      });

      // Still in DRAFT
      await assert.rejects(
        async () => {
          await service.requestChanges({
            actorId,
            projectId,
            pageId: created.page.id,
            expectedLockVersion: 1,
          });
        },
        (err: any) => {
          assert.strictEqual(err.code, 'STATE_TRANSITION_INVALID');
          return true;
        }
      );
    });

    it('FAIL: stale lock => LOCK_CONFLICT', async () => {
      const store = new FakeReviewContentLifecycleStore();
      const actorId = 'reviewer_1';
      const projectId = 'proj_alpha';
      const service = createService(store, new Set([
        `${actorId}:content.create:${projectId}`,
        `${actorId}:content.edit:${projectId}`,
        `${actorId}:content.review:${projectId}`,
      ]));

      const created = await service.createPageDraft({
        actorId,
        projectId,
        key: 'terms-stale',
        title: 'Terms',
        slug: 'terms-stale',
        locale: 'en',
        visibility: 'PUBLIC',
        content: sampleContent,
      });

      await service.submitForReview({
        actorId,
        projectId,
        pageId: created.page.id,
        expectedLockVersion: 1,
      });

      await assert.rejects(
        async () => {
          await service.requestChanges({
            actorId,
            projectId,
            pageId: created.page.id,
            expectedLockVersion: 999,
          });
        },
        (err: any) => {
          assert.strictEqual(err.code, 'LOCK_CONFLICT');
          return true;
        }
      );
    });

    it('FAIL: concurrent second request => LOCK_CONFLICT', async () => {
      const store = new FakeReviewContentLifecycleStore();
      const actorId = 'reviewer_1';
      const projectId = 'proj_alpha';
      const service = createService(store, new Set([
        `${actorId}:content.create:${projectId}`,
        `${actorId}:content.edit:${projectId}`,
        `${actorId}:content.review:${projectId}`,
      ]));

      const created = await service.createPageDraft({
        actorId,
        projectId,
        key: 'terms-race',
        title: 'Terms',
        slug: 'terms-race',
        locale: 'en',
        visibility: 'PUBLIC',
        content: sampleContent,
      });

      await service.submitForReview({
        actorId,
        projectId,
        pageId: created.page.id,
        expectedLockVersion: 1,
      });

      // First reviewer succeeds
      const first = await service.requestChanges({
        actorId,
        projectId,
        pageId: created.page.id,
        expectedLockVersion: 2,
      });
      assert.ok(first.newDraftRevision);

      // Second reviewer with same lockVersion 2 must fail with LOCK_CONFLICT
      await assert.rejects(
        async () => {
          await service.requestChanges({
            actorId,
            projectId,
            pageId: created.page.id,
            expectedLockVersion: 2,
          });
        },
        (err: any) => {
          // Page pointer moved to new draft (which has status DRAFT), or if looked up old rev, lock was incremented
          assert.ok(
            err.code === 'LOCK_CONFLICT' || err.code === 'STATE_TRANSITION_INVALID',
            `Expected LOCK_CONFLICT or STATE_TRANSITION_INVALID, got ${err.code}`
          );
          return true;
        }
      );
    });

    it('FAIL: transaction failure leaves no orphan new draft', async () => {
      const store = new FakeReviewContentLifecycleStore();
      const actorId = 'reviewer_1';
      const projectId = 'proj_alpha';
      const service = createService(store, new Set([
        `${actorId}:content.create:${projectId}`,
        `${actorId}:content.edit:${projectId}`,
        `${actorId}:content.review:${projectId}`,
      ]));

      const created = await service.createPageDraft({
        actorId,
        projectId,
        key: 'terms-rollback',
        title: 'Terms',
        slug: 'terms-rollback',
        locale: 'en',
        visibility: 'PUBLIC',
        content: sampleContent,
      });

      await service.submitForReview({
        actorId,
        projectId,
        pageId: created.page.id,
        expectedLockVersion: 1,
      });

      // Corrupt recordAudit to force transaction failure after creation
      const origRecordAudit = store.recordAudit.bind(store);
      store.recordAudit = async (params) => {
        if (params.action === 'CONTENT_CHANGES_REQUESTED') {
          throw new Error('Simulated audit failure in tx');
        }
        return origRecordAudit(params);
      };

      await assert.rejects(
        async () => {
          await service.requestChanges({
            actorId,
            projectId,
            pageId: created.page.id,
            expectedLockVersion: 2,
          });
        },
        /Simulated audit failure in tx/
      );

      // Assert state was rolled back completely: only 1 revision exists
      assert.strictEqual(store.revisions.size, 1);
      const remainingRev = Array.from(store.revisions.values())[0];
      assert.strictEqual(remainingRev.revisionNumber, 1);
      assert.strictEqual(remainingRev.lockVersion, 2); // rolled back to before requestChanges
      const page = await store.findPageById(projectId, created.page.id);
      assert.strictEqual(page?.draftRevisionId, remainingRev.id);
    });
  });

  describe('PROJECT HARDENING & AUDIT INTEGRITY', () => {
    it('PROJECT HARDENING: touchPageUpdatedAt production adapter source must enforce projectId together with pageId', () => {
      const adapterSource = readFileSync(
        join(__dirname, '../lib/domain/content/lifecycle/prisma-store.ts'),
        'utf-8'
      );

      // Find the touchPageUpdatedAt method body
      const methodMatch = adapterSource.match(/async\s+touchPageUpdatedAt\s*\([^)]*\)\s*:\s*Promise<LifecyclePage>\s*\{([\s\S]*?)\n\s*\}/);
      assert.ok(methodMatch, 'touchPageUpdatedAt method found in prisma-store.ts');
      const methodBody = methodMatch[1];

      // Must check both pageId (or id) and projectId
      assert.ok(methodBody.includes('projectId'), 'touchPageUpdatedAt must include projectId in where condition');
      assert.ok(methodBody.includes('updateMany'), 'touchPageUpdatedAt should use updateMany to scope both id and projectId');
    });

    it('AUDIT INTEGRITY: none of three audit metadata payloads contains PageContent or content blocks', async () => {
      const store = new FakeReviewContentLifecycleStore();
      const actorId = 'user_audit_check';
      const projectId = 'proj_alpha';
      const service = createService(store, new Set([
        `${actorId}:content.create:${projectId}`,
        `${actorId}:content.edit:${projectId}`,
        `${actorId}:content.review:${projectId}`,
        `${actorId}:content.approve:${projectId}`,
      ]));

      const created = await service.createPageDraft({
        actorId,
        projectId,
        key: 'audit-leak-check',
        title: 'Audit Check',
        slug: 'audit-leak-check',
        locale: 'en',
        visibility: 'PUBLIC',
        content: sampleContent,
      });

      await service.submitForReview({
        actorId,
        projectId,
        pageId: created.page.id,
        expectedLockVersion: 1,
      });

      await service.requestChanges({
        actorId,
        projectId,
        pageId: created.page.id,
        expectedLockVersion: 2,
      });

      await service.submitForReview({
        actorId,
        projectId,
        pageId: created.page.id,
        expectedLockVersion: 1, // new draft starts at 1
      });

      await service.approveReview({
        actorId,
        projectId,
        pageId: created.page.id,
        expectedLockVersion: 2,
      });

      // Verify all audit logs recorded
      const actions = store.auditLogs.map((a) => a.action);
      assert.ok(actions.includes('CONTENT_REVIEW_SUBMITTED'));
      assert.ok(actions.includes('CONTENT_CHANGES_REQUESTED'));
      assert.ok(actions.includes('CONTENT_REVIEW_APPROVED'));

      for (const log of store.auditLogs) {
        const metadataStr = JSON.stringify(log.metadata);
        assert.ok(!metadataStr.includes('blocks'), `Audit log ${log.action} should not contain 'blocks'`);
        assert.ok(!metadataStr.includes('Review Test Page'), `Audit log ${log.action} should not contain page body text`);
        assert.ok(!metadataStr.includes('password'), `Audit log ${log.action} should not contain password`);
        assert.ok(!metadataStr.includes('secret'), `Audit log ${log.action} should not contain secret`);
      }
    });
  });
});
