import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import {
  setAuthenticatedUserForTesting,
  setContentLifecycleServiceForTesting,
} from '../lib/domain/pages-api';
import { POST as createPageRoute } from '../app/api/admin/projects/[projectId]/pages/route';
import { PATCH as updateDraftRoute } from '../app/api/admin/projects/[projectId]/pages/[pageId]/draft/route';
import { POST as submitReviewRoute } from '../app/api/admin/projects/[projectId]/pages/[pageId]/actions/submit-review/route';
import { POST as requestChangesRoute } from '../app/api/admin/projects/[projectId]/pages/[pageId]/actions/request-changes/route';
import { POST as approveRoute } from '../app/api/admin/projects/[projectId]/pages/[pageId]/actions/approve/route';
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

class FakeContentLifecycleStore implements ContentLifecycleStore {
  pages = new Map<string, LifecyclePage>();
  revisions = new Map<string, LifecyclePageRevision>();
  auditLogs: RecordLifecycleAuditParams[] = [];

  private cloneState() {
    return {
      pages: new Map(
        Array.from(this.pages.entries()).map(([k, v]) => [k, { ...v }])
      ),
      revisions: new Map(
        Array.from(this.revisions.entries()).map(([k, v]) => [
          k,
          { ...v, seo: { ...v.seo }, navigation: { ...v.navigation } },
        ])
      ),
      auditLogs: [...this.auditLogs],
    };
  }

  async transaction<T>(
    fn: (txStore: ContentLifecycleStore) => Promise<T>
  ): Promise<T> {
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

  async findPageById(
    projectId: string,
    pageId: string
  ): Promise<LifecyclePage | null> {
    const page = this.pages.get(pageId);
    if (!page || page.projectId !== projectId) return null;
    return { ...page };
  }

  async createPageWithDraft(
    params: CreatePageWithDraftParams
  ): Promise<{ page: LifecyclePage; revision: LifecyclePageRevision }> {
    for (const p of this.pages.values()) {
      if (p.projectId === params.projectId && p.key === params.key) {
        throw new ContentLifecycleError(
          'KEY_CONFLICT',
          `Key '${params.key}' already exists in project`
        );
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

  async findRevisionById(
    revisionId: string
  ): Promise<LifecyclePageRevision | null> {
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
      description:
        params.data.description !== undefined
          ? params.data.description
          : rev.description,
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
      submittedAt:
        params.submittedAt !== undefined ? params.submittedAt : rev.submittedAt,
      approvedAt:
        params.approvedAt !== undefined ? params.approvedAt : rev.approvedAt,
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
    for (const rev of this.revisions.values()) {
      if (
        rev.pageId === params.pageId &&
        rev.revisionNumber === params.revisionNumber
      ) {
        throw new ContentLifecycleError(
          'LOCK_CONFLICT',
          'Revision number conflict'
        );
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
      throw new ContentLifecycleError(
        'PAGE_NOT_FOUND',
        'Page not found in this project'
      );
    }
    const updated: LifecyclePage = {
      ...page,
      draftRevisionId: params.draftRevisionId,
      updatedAt: new Date(Date.now() + 5),
    };
    this.pages.set(params.pageId, updated);
    return { ...updated };
  }

  async touchPageUpdatedAt(
    projectId: string,
    pageId: string
  ): Promise<LifecyclePage> {
    const page = this.pages.get(pageId);
    if (!page || page.projectId !== projectId) {
      throw new ContentLifecycleError(
        'PAGE_NOT_FOUND',
        'Page not found in this project'
      );
    }
    const updated: LifecyclePage = {
      ...page,
      updatedAt: new Date(Date.now() + 10),
    };
    this.pages.set(pageId, updated);
    return { ...updated };
  }

  async createPublishedRelease(): Promise<any> {
    throw new Error('Not implemented');
  }

  async createReleaseItem(): Promise<any> {
    throw new Error('Not implemented');
  }

  async setPublishedPagePointersAtomic(): Promise<{
    updated: boolean;
    page?: LifecyclePage;
  }> {
    throw new Error('Not implemented');
  }

  async recordAudit(params: RecordLifecycleAuditParams): Promise<void> {
    this.auditLogs.push(params);
  }
}

const canonicalSampleContent: PageContent = {
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

function createJsonPostRequest(
  url: string,
  body: unknown,
  origin: string = 'http://localhost'
): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function createJsonPatchRequest(
  url: string,
  body: unknown,
  origin: string = 'http://localhost'
): NextRequest {
  return new NextRequest(url, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      origin,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('SYN-CONTENT-002B2A: Admin Pages Server Write API', () => {
  let fakeStore: FakeContentLifecycleStore;
  let service: ContentLifecycleService;
  let permissionMap: Map<string, boolean>;

  beforeEach(() => {
    setAuthenticatedUserForTesting({
      id: 'user-editor',
      email: 'editor@example.com',
      displayName: 'Editor',
      status: 'ACTIVE',
    });
    fakeStore = new FakeContentLifecycleStore();
    permissionMap = new Map();
    permissionMap.set('user-editor:content.view:proj-alpha', true);
    permissionMap.set('user-editor:content.create:proj-alpha', true);
    permissionMap.set('user-editor:content.edit:proj-alpha', true);
    permissionMap.set('user-editor:content.review:proj-alpha', true);
    permissionMap.set('user-editor:content.approve:proj-alpha', true);
    permissionMap.set('user-editor:content.publish:proj-alpha', true);

    service = new ContentLifecycleService({
      store: fakeStore,
      hasPermission: async (actorId, permission, projectId) => {
        const key = `${actorId}:${permission}:${projectId}`;
        return permissionMap.get(key) ?? false;
      },
    });
    setContentLifecycleServiceForTesting(service);
  });

  describe('1. AUTHENTICATION & ACTOR IDENTITY', () => {
    it('returns 401 UNAUTHENTICATED when session is missing', async () => {
      setAuthenticatedUserForTesting(null);
      const req = createJsonPostRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages',
        {
          key: 'test-page',
          title: 'Test',
          slug: 'test',
          locale: 'cs',
          visibility: 'PUBLIC',
          content: canonicalSampleContent,
        }
      );
      const res = await createPageRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 401);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'UNAUTHENTICATED');
      assert.strictEqual(res.headers.get('cache-control'), 'no-store');
    });

    it('returns 401 UNAUTHENTICATED when session user is inactive', async () => {
      setAuthenticatedUserForTesting({
        id: 'user-disabled',
        email: 'disabled@example.com',
        displayName: 'Disabled',
        status: 'DISABLED',
      });
      const req = createJsonPostRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages',
        {
          key: 'test-page',
          title: 'Test',
          slug: 'test',
          locale: 'cs',
          visibility: 'PUBLIC',
          content: canonicalSampleContent,
        }
      );
      const res = await createPageRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 401);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'UNAUTHENTICATED');
    });

    it('rejects forbidden identity fields in body', async () => {
      const req = createJsonPostRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages',
        {
          key: 'test-page',
          title: 'Test',
          slug: 'test',
          locale: 'cs',
          visibility: 'PUBLIC',
          content: canonicalSampleContent,
          actorId: 'user-other',
        }
      );
      const res = await createPageRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'INVALID_INPUT');
    });

    it('returns 403 FORBIDDEN when user lacks content.create permission for create', async () => {
      permissionMap.set('user-editor:content.create:proj-alpha', false);
      const req = createJsonPostRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages',
        {
          key: 'test-page',
          title: 'Test',
          slug: 'test',
          locale: 'cs',
          visibility: 'PUBLIC',
          content: canonicalSampleContent,
        }
      );
      const res = await createPageRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 403);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'FORBIDDEN');
      assert.strictEqual(res.headers.get('cache-control'), 'no-store');
    });

    it('returns 403 FORBIDDEN when user lacks content.approve permission for approve', async () => {
      // First create page and submit for review
      const createRes = await service.createPageDraft({
        actorId: 'user-editor',
        projectId: 'proj-alpha',
        key: 'approve-test',
        title: 'Approve Test',
        slug: 'approve-test',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: canonicalSampleContent,
      });
      await service.submitForReview({
        actorId: 'user-editor',
        projectId: 'proj-alpha',
        pageId: createRes.page.id,
        expectedLockVersion: 1,
      });

      // Remove approve permission
      permissionMap.set('user-editor:content.approve:proj-alpha', false);

      const req = createJsonPostRequest(
        `http://localhost/api/admin/projects/proj-alpha/pages/${createRes.page.id}/actions/approve`,
        {
          expectedLockVersion: 2,
        }
      );
      const res = await approveRoute(req, {
        params: Promise.resolve({
          projectId: 'proj-alpha',
          pageId: createRes.page.id,
        }),
      });
      assert.strictEqual(res.status, 403);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'FORBIDDEN');
    });
  });

  describe('2. PROJECT BOUNDARIES & ISOLATION', () => {
    it('projectId from route param is strictly passed to service', async () => {
      const req = createJsonPostRequest(
        'http://localhost/api/admin/projects/custom-proj-999/pages',
        {
          key: 'page-999',
          title: 'Page 999',
          slug: 'page-999',
          locale: 'cs',
          visibility: 'PUBLIC',
          content: canonicalSampleContent,
        }
      );
      permissionMap.set('user-editor:content.create:custom-proj-999', true);
      const res = await createPageRoute(req, {
        params: Promise.resolve({ projectId: 'custom-proj-999' }),
      });
      assert.strictEqual(res.status, 201);
      const body = await res.json();
      assert.strictEqual(body.data.status, 'DRAFT');

      const savedPage = fakeStore.pages.get(body.data.pageId);
      assert.ok(savedPage);
      assert.strictEqual(savedPage.projectId, 'custom-proj-999');
    });

    it('cross-project update fails with 404', async () => {
      const createRes = await service.createPageDraft({
        actorId: 'user-editor',
        projectId: 'proj-alpha',
        key: 'cross-test',
        title: 'Cross Test',
        slug: 'cross-test',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: canonicalSampleContent,
      });

      permissionMap.set('user-editor:content.edit:proj-beta', true);
      const req = createJsonPatchRequest(
        `http://localhost/api/admin/projects/proj-beta/pages/${createRes.page.id}/draft`,
        {
          expectedLockVersion: 1,
          title: 'Hacked Title',
        }
      );
      const res = await updateDraftRoute(req, {
        params: Promise.resolve({
          projectId: 'proj-beta',
          pageId: createRes.page.id,
        }),
      });
      assert.strictEqual(res.status, 404);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'PAGE_NOT_FOUND');
    });

    it('invalid or blank projectId returns 400 INVALID_INPUT', async () => {
      const invalidProjects = ['', '   ', 'proj<script>', 'a'.repeat(200)];
      for (const p of invalidProjects) {
        const req = createJsonPostRequest(
          `http://localhost/api/admin/projects/${encodeURIComponent(p)}/pages`,
          {
            key: 'p-1',
            title: 'T-1',
            slug: 't-1',
            locale: 'cs',
            visibility: 'PUBLIC',
            content: canonicalSampleContent,
          }
        );
        const res = await createPageRoute(req, {
          params: Promise.resolve({ projectId: p }),
        });
        assert.strictEqual(res.status, 400);
        const body = await res.json();
        assert.strictEqual(body.error.code, 'INVALID_INPUT');
      }
    });
  });

  describe('3. CSRF & SAME-ORIGIN PROTECTION', () => {
    it('accepts request when Origin matches request URL origin', async () => {
      const req = new NextRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://localhost',
          },
          body: JSON.stringify({
            key: 'csrf-pass',
            title: 'CSRF Pass',
            slug: 'csrf-pass',
            locale: 'cs',
            visibility: 'PUBLIC',
            content: canonicalSampleContent,
          }),
        }
      );
      const res = await createPageRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 201);
    });

    it('rejects cross-site origin with 403 CSRF_REJECTED', async () => {
      const req = new NextRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://evil-attacker.com',
          },
          body: JSON.stringify({
            key: 'csrf-fail',
            title: 'CSRF Fail',
            slug: 'csrf-fail',
            locale: 'cs',
            visibility: 'PUBLIC',
            content: canonicalSampleContent,
          }),
        }
      );
      const res = await createPageRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 403);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'CSRF_REJECTED');
    });

    it('rejects missing Origin with sec-fetch-site: cross-site', async () => {
      const req = new NextRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'sec-fetch-site': 'cross-site',
          },
          body: JSON.stringify({
            key: 'sec-cross',
            title: 'Sec Cross',
            slug: 'sec-cross',
            locale: 'cs',
            visibility: 'PUBLIC',
            content: canonicalSampleContent,
          }),
        }
      );
      const res = await createPageRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 403);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'CSRF_REJECTED');
    });

    it('accepts missing Origin with sec-fetch-site: same-origin', async () => {
      const req = new NextRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'sec-fetch-site': 'same-origin',
          },
          body: JSON.stringify({
            key: 'sec-same-origin',
            title: 'Sec Same Origin',
            slug: 'sec-same-origin',
            locale: 'cs',
            visibility: 'PUBLIC',
            content: canonicalSampleContent,
          }),
        }
      );
      const res = await createPageRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 201);
    });
  });

  describe('4. CONTENT-TYPE & BODY VALIDATION', () => {
    it('returns 415 UNSUPPORTED_MEDIA_TYPE when Content-Type is not application/json', async () => {
      const req = new NextRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages',
        {
          method: 'POST',
          headers: {
            'content-type': 'text/plain',
            origin: 'http://localhost',
          },
          body: 'not a json',
        }
      );
      const res = await createPageRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 415);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
      assert.strictEqual(res.headers.get('cache-control'), 'no-store');
    });

    it('returns 400 INVALID_INPUT for malformed JSON syntax', async () => {
      const req = new NextRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://localhost',
          },
          body: '{ invalid json syntax',
        }
      );
      const res = await createPageRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'INVALID_INPUT');
    });

    it('returns 400 INVALID_INPUT when body is array or null or primitive', async () => {
      for (const invalidBody of [[], null, 'just a string', 12345]) {
        const req = createJsonPostRequest(
          'http://localhost/api/admin/projects/proj-alpha/pages',
          invalidBody
        );
        const res = await createPageRoute(req, {
          params: Promise.resolve({ projectId: 'proj-alpha' }),
        });
        assert.strictEqual(res.status, 400);
        const body = await res.json();
        assert.strictEqual(body.error.code, 'INVALID_INPUT');
      }
    });

    it('rejects payloads larger than 2MB with 400 INVALID_INPUT', async () => {
      const largePayload = {
        key: 'large-page',
        title: 'Large Page',
        slug: 'large-page',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: {
          version: 1,
          schemaVersion: '1.0.0',
          blocks: [
            {
              id: 'huge-block',
              type: 'paragraph',
              order: 0,
              data: { text: 'A'.repeat(2.5 * 1024 * 1024) },
            },
          ],
        },
      };
      const req = createJsonPostRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages',
        largePayload
      );
      const res = await createPageRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'INVALID_INPUT');
    });
  });

  describe('5. CREATE PAGE DRAFT (POST /api/admin/projects/[projectId]/pages)', () => {
    it('creates page and initial DRAFT revision, returning 201 with exact shape and no-store', async () => {
      const req = createJsonPostRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages',
        {
          key: 'o-nas',
          title: 'O nás',
          slug: 'o-nas',
          locale: 'cs',
          visibility: 'PUBLIC',
          content: canonicalSampleContent,
        }
      );
      const res = await createPageRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.headers.get('cache-control'), 'no-store');
      assert.strictEqual(res.headers.get('content-type'), 'application/json');

      const body = await res.json();
      assert.ok(body.data);
      assert.ok(body.data.pageId);
      assert.ok(body.data.revisionId);
      assert.strictEqual(body.data.revisionNumber, 1);
      assert.strictEqual(body.data.lockVersion, 1);
      assert.strictEqual(body.data.status, 'DRAFT');
    });

    it('returns 409 KEY_CONFLICT when creating page with duplicate key in same project', async () => {
      await service.createPageDraft({
        actorId: 'user-editor',
        projectId: 'proj-alpha',
        key: 'existing-key',
        title: 'Existing',
        slug: 'existing',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: canonicalSampleContent,
      });

      const req = createJsonPostRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages',
        {
          key: 'existing-key',
          title: 'Duplicate Key Attempt',
          slug: 'duplicate-slug',
          locale: 'cs',
          visibility: 'PUBLIC',
          content: canonicalSampleContent,
        }
      );
      const res = await createPageRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 409);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'KEY_CONFLICT');
    });

    it('returns 404 when non-existent parentId is provided', async () => {
      const req = createJsonPostRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages',
        {
          key: 'sub-page',
          title: 'Sub Page',
          slug: 'sub-page',
          locale: 'cs',
          visibility: 'PUBLIC',
          content: canonicalSampleContent,
          parentId: 'non-existent-parent',
        }
      );
      const res = await createPageRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 404);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'PARENT_SCOPE_VIOLATION');
    });
  });

  describe('6. UPDATE DRAFT (PATCH /api/admin/projects/[projectId]/pages/[pageId]/draft)', () => {
    it('updates draft revision with valid expectedLockVersion and returns 200 with incremented lockVersion', async () => {
      const createRes = await service.createPageDraft({
        actorId: 'user-editor',
        projectId: 'proj-alpha',
        key: 'update-me',
        title: 'Original Title',
        slug: 'original-slug',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: canonicalSampleContent,
      });

      const req = createJsonPatchRequest(
        `http://localhost/api/admin/projects/proj-alpha/pages/${createRes.page.id}/draft`,
        {
          expectedLockVersion: 1,
          title: 'Updated Title',
          description: 'Updated Description',
        }
      );
      const res = await updateDraftRoute(req, {
        params: Promise.resolve({
          projectId: 'proj-alpha',
          pageId: createRes.page.id,
        }),
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('cache-control'), 'no-store');

      const body = await res.json();
      assert.strictEqual(body.data.pageId, createRes.page.id);
      assert.strictEqual(body.data.revisionId, createRes.revision.id);
      assert.strictEqual(body.data.revisionNumber, 1);
      assert.strictEqual(body.data.lockVersion, 2);
      assert.strictEqual(body.data.status, 'DRAFT');

      const updatedRev = fakeStore.revisions.get(createRes.revision.id);
      assert.strictEqual(updatedRev?.title, 'Updated Title');
      assert.strictEqual(updatedRev?.description, 'Updated Description');
    });

    it('returns 409 LOCK_CONFLICT when expectedLockVersion does not match current lockVersion', async () => {
      const createRes = await service.createPageDraft({
        actorId: 'user-editor',
        projectId: 'proj-alpha',
        key: 'conflict-page',
        title: 'Conflict Page',
        slug: 'conflict-page',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: canonicalSampleContent,
      });

      const req = createJsonPatchRequest(
        `http://localhost/api/admin/projects/proj-alpha/pages/${createRes.page.id}/draft`,
        {
          expectedLockVersion: 99, // Stale/wrong lockVersion
          title: 'Stale Update',
        }
      );
      const res = await updateDraftRoute(req, {
        params: Promise.resolve({
          projectId: 'proj-alpha',
          pageId: createRes.page.id,
        }),
      });
      assert.strictEqual(res.status, 409);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'LOCK_CONFLICT');
    });

    it('rejects direct status modification via PATCH (e.g. status: PUBLISHED) with 400 INVALID_INPUT', async () => {
      const createRes = await service.createPageDraft({
        actorId: 'user-editor',
        projectId: 'proj-alpha',
        key: 'no-direct-status',
        title: 'No Direct Status',
        slug: 'no-direct-status',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: canonicalSampleContent,
      });

      const req = createJsonPatchRequest(
        `http://localhost/api/admin/projects/proj-alpha/pages/${createRes.page.id}/draft`,
        {
          expectedLockVersion: 1,
          status: 'PUBLISHED',
        }
      );
      const res = await updateDraftRoute(req, {
        params: Promise.resolve({
          projectId: 'proj-alpha',
          pageId: createRes.page.id,
        }),
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'INVALID_INPUT');
    });

    it('returns 400 INVALID_INPUT when no mutable fields are provided', async () => {
      const createRes = await service.createPageDraft({
        actorId: 'user-editor',
        projectId: 'proj-alpha',
        key: 'empty-update',
        title: 'Empty Update',
        slug: 'empty-update',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: canonicalSampleContent,
      });

      const req = createJsonPatchRequest(
        `http://localhost/api/admin/projects/proj-alpha/pages/${createRes.page.id}/draft`,
        {
          expectedLockVersion: 1,
        }
      );
      const res = await updateDraftRoute(req, {
        params: Promise.resolve({
          projectId: 'proj-alpha',
          pageId: createRes.page.id,
        }),
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'INVALID_INPUT');
    });
  });

  describe('7. SUBMIT FOR REVIEW (POST .../actions/submit-review)', () => {
    it('submits draft for review and returns 200 with status: IN_REVIEW', async () => {
      const createRes = await service.createPageDraft({
        actorId: 'user-editor',
        projectId: 'proj-alpha',
        key: 'submit-page',
        title: 'Submit Page',
        slug: 'submit-page',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: canonicalSampleContent,
      });

      const req = createJsonPostRequest(
        `http://localhost/api/admin/projects/proj-alpha/pages/${createRes.page.id}/actions/submit-review`,
        {
          expectedLockVersion: 1,
        }
      );
      const res = await submitReviewRoute(req, {
        params: Promise.resolve({
          projectId: 'proj-alpha',
          pageId: createRes.page.id,
        }),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.data.status, 'IN_REVIEW');
      assert.strictEqual(body.data.lockVersion, 2);
    });

    it('returns 409 LOCK_CONFLICT on stale expectedLockVersion', async () => {
      const createRes = await service.createPageDraft({
        actorId: 'user-editor',
        projectId: 'proj-alpha',
        key: 'submit-lock',
        title: 'Submit Lock',
        slug: 'submit-lock',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: canonicalSampleContent,
      });

      const req = createJsonPostRequest(
        `http://localhost/api/admin/projects/proj-alpha/pages/${createRes.page.id}/actions/submit-review`,
        {
          expectedLockVersion: 99,
        }
      );
      const res = await submitReviewRoute(req, {
        params: Promise.resolve({
          projectId: 'proj-alpha',
          pageId: createRes.page.id,
        }),
      });
      assert.strictEqual(res.status, 409);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'LOCK_CONFLICT');
    });
  });

  describe('8. REQUEST CHANGES (POST .../actions/request-changes)', () => {
    it('creates new DRAFT from IN_REVIEW and returns 200 with reviewRevisionId and new draft', async () => {
      const createRes = await service.createPageDraft({
        actorId: 'user-editor',
        projectId: 'proj-alpha',
        key: 'req-changes-page',
        title: 'Request Changes Page',
        slug: 'req-changes-page',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: canonicalSampleContent,
      });
      await service.submitForReview({
        actorId: 'user-editor',
        projectId: 'proj-alpha',
        pageId: createRes.page.id,
        expectedLockVersion: 1,
      });

      const req = createJsonPostRequest(
        `http://localhost/api/admin/projects/proj-alpha/pages/${createRes.page.id}/actions/request-changes`,
        {
          expectedLockVersion: 2,
        }
      );
      const res = await requestChangesRoute(req, {
        params: Promise.resolve({
          projectId: 'proj-alpha',
          pageId: createRes.page.id,
        }),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.data.pageId, createRes.page.id);
      assert.strictEqual(body.data.reviewRevisionId, createRes.revision.id);
      assert.ok(body.data.draft);
      assert.strictEqual(body.data.draft.revisionNumber, 2);
      assert.strictEqual(body.data.draft.lockVersion, 1);
      assert.strictEqual(body.data.draft.status, 'DRAFT');
      assert.strictEqual(
        body.data.draft.derivedFromRevisionId,
        createRes.revision.id
      );
    });

    it('returns 409 STATE_TRANSITION_INVALID when called on DRAFT status', async () => {
      const createRes = await service.createPageDraft({
        actorId: 'user-editor',
        projectId: 'proj-alpha',
        key: 'draft-req-fail',
        title: 'Draft Req Fail',
        slug: 'draft-req-fail',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: canonicalSampleContent,
      });

      const req = createJsonPostRequest(
        `http://localhost/api/admin/projects/proj-alpha/pages/${createRes.page.id}/actions/request-changes`,
        {
          expectedLockVersion: 1,
        }
      );
      const res = await requestChangesRoute(req, {
        params: Promise.resolve({
          projectId: 'proj-alpha',
          pageId: createRes.page.id,
        }),
      });
      assert.strictEqual(res.status, 409);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'STATE_TRANSITION_INVALID');
    });
  });

  describe('9. APPROVE (POST .../actions/approve)', () => {
    it('approves IN_REVIEW page and returns 200 with status: APPROVED', async () => {
      const createRes = await service.createPageDraft({
        actorId: 'user-editor',
        projectId: 'proj-alpha',
        key: 'approve-page',
        title: 'Approve Page',
        slug: 'approve-page',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: canonicalSampleContent,
      });
      await service.submitForReview({
        actorId: 'user-editor',
        projectId: 'proj-alpha',
        pageId: createRes.page.id,
        expectedLockVersion: 1,
      });

      const req = createJsonPostRequest(
        `http://localhost/api/admin/projects/proj-alpha/pages/${createRes.page.id}/actions/approve`,
        {
          expectedLockVersion: 2,
        }
      );
      const res = await approveRoute(req, {
        params: Promise.resolve({
          projectId: 'proj-alpha',
          pageId: createRes.page.id,
        }),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.data.status, 'APPROVED');
      assert.strictEqual(body.data.lockVersion, 3);
    });

    it('returns 409 STATE_TRANSITION_INVALID when called on DRAFT status', async () => {
      const createRes = await service.createPageDraft({
        actorId: 'user-editor',
        projectId: 'proj-alpha',
        key: 'draft-approve-fail',
        title: 'Draft Approve Fail',
        slug: 'draft-approve-fail',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: canonicalSampleContent,
      });

      const req = createJsonPostRequest(
        `http://localhost/api/admin/projects/proj-alpha/pages/${createRes.page.id}/actions/approve`,
        {
          expectedLockVersion: 1,
        }
      );
      const res = await approveRoute(req, {
        params: Promise.resolve({
          projectId: 'proj-alpha',
          pageId: createRes.page.id,
        }),
      });
      assert.strictEqual(res.status, 409);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'STATE_TRANSITION_INVALID');
    });
  });

  describe('10. FULL PRE-PUBLICATION LIFECYCLE WALKTHROUGH', () => {
    it('executes full roundtrip: Create -> Update -> Submit -> RequestChanges -> Update -> Submit -> Approve', async () => {
      // Step 1: Create Page (Rev 1, lock 1, status: DRAFT)
      const createReq = createJsonPostRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages',
        {
          key: 'lifecycle-journey',
          title: 'Journey V1',
          slug: 'journey',
          locale: 'cs',
          visibility: 'PUBLIC',
          content: canonicalSampleContent,
        }
      );
      const createRes = await createPageRoute(createReq, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(createRes.status, 201);
      const createData = (await createRes.json()).data;
      assert.strictEqual(createData.revisionNumber, 1);
      assert.strictEqual(createData.lockVersion, 1);
      assert.strictEqual(createData.status, 'DRAFT');

      const pageId = createData.pageId;

      // Step 2: Update Draft (Rev 1, lock 2, status: DRAFT)
      const update1Req = createJsonPatchRequest(
        `http://localhost/api/admin/projects/proj-alpha/pages/${pageId}/draft`,
        {
          expectedLockVersion: 1,
          title: 'Journey V1 Edited',
        }
      );
      const update1Res = await updateDraftRoute(update1Req, {
        params: Promise.resolve({ projectId: 'proj-alpha', pageId }),
      });
      assert.strictEqual(update1Res.status, 200);
      const update1Data = (await update1Res.json()).data;
      assert.strictEqual(update1Data.lockVersion, 2);
      assert.strictEqual(update1Data.status, 'DRAFT');

      // Step 3: Submit for Review (Rev 1, lock 3, status: IN_REVIEW)
      const submit1Req = createJsonPostRequest(
        `http://localhost/api/admin/projects/proj-alpha/pages/${pageId}/actions/submit-review`,
        {
          expectedLockVersion: 2,
        }
      );
      const submit1Res = await submitReviewRoute(submit1Req, {
        params: Promise.resolve({ projectId: 'proj-alpha', pageId }),
      });
      assert.strictEqual(submit1Res.status, 200);
      const submit1Data = (await submit1Res.json()).data;
      assert.strictEqual(submit1Data.lockVersion, 3);
      assert.strictEqual(submit1Data.status, 'IN_REVIEW');

      // Step 4: Request Changes (Rev 1 IN_REVIEW locked at 4, Rev 2 DRAFT created at lock 1)
      const reqChangesReq = createJsonPostRequest(
        `http://localhost/api/admin/projects/proj-alpha/pages/${pageId}/actions/request-changes`,
        {
          expectedLockVersion: 3,
        }
      );
      const reqChangesRes = await requestChangesRoute(reqChangesReq, {
        params: Promise.resolve({ projectId: 'proj-alpha', pageId }),
      });
      assert.strictEqual(reqChangesRes.status, 200);
      const reqChangesData = (await reqChangesRes.json()).data;
      assert.strictEqual(reqChangesData.draft.revisionNumber, 2);
      assert.strictEqual(reqChangesData.draft.lockVersion, 1);
      assert.strictEqual(reqChangesData.draft.status, 'DRAFT');

      // Step 5: Update Draft 2 (Rev 2, lock 2, status: DRAFT)
      const update2Req = createJsonPatchRequest(
        `http://localhost/api/admin/projects/proj-alpha/pages/${pageId}/draft`,
        {
          expectedLockVersion: 1,
          title: 'Journey V2 Fixed',
        }
      );
      const update2Res = await updateDraftRoute(update2Req, {
        params: Promise.resolve({ projectId: 'proj-alpha', pageId }),
      });
      assert.strictEqual(update2Res.status, 200);
      const update2Data = (await update2Res.json()).data;
      assert.strictEqual(update2Data.revisionNumber, 2);
      assert.strictEqual(update2Data.lockVersion, 2);
      assert.strictEqual(update2Data.status, 'DRAFT');

      // Step 6: Submit Draft 2 for Review (Rev 2, lock 3, status: IN_REVIEW)
      const submit2Req = createJsonPostRequest(
        `http://localhost/api/admin/projects/proj-alpha/pages/${pageId}/actions/submit-review`,
        {
          expectedLockVersion: 2,
        }
      );
      const submit2Res = await submitReviewRoute(submit2Req, {
        params: Promise.resolve({ projectId: 'proj-alpha', pageId }),
      });
      assert.strictEqual(submit2Res.status, 200);
      const submit2Data = (await submit2Res.json()).data;
      assert.strictEqual(submit2Data.lockVersion, 3);
      assert.strictEqual(submit2Data.status, 'IN_REVIEW');

      // Step 7: Approve Rev 2 (Rev 2, lock 4, status: APPROVED)
      const approveReq = createJsonPostRequest(
        `http://localhost/api/admin/projects/proj-alpha/pages/${pageId}/actions/approve`,
        {
          expectedLockVersion: 3,
        }
      );
      const approveRes = await approveRoute(approveReq, {
        params: Promise.resolve({ projectId: 'proj-alpha', pageId }),
      });
      assert.strictEqual(approveRes.status, 200);
      const approveData = (await approveRes.json()).data;
      assert.strictEqual(approveData.revisionNumber, 2);
      assert.strictEqual(approveData.lockVersion, 4);
      assert.strictEqual(approveData.status, 'APPROVED');
    });
  });

  describe('11. STATIC & ARCHITECTURAL INVARIANTS', () => {
    const routeFiles = [
      'app/api/admin/projects/[projectId]/pages/route.ts',
      'app/api/admin/projects/[projectId]/pages/[pageId]/draft/route.ts',
      'app/api/admin/projects/[projectId]/pages/[pageId]/actions/submit-review/route.ts',
      'app/api/admin/projects/[projectId]/pages/[pageId]/actions/request-changes/route.ts',
      'app/api/admin/projects/[projectId]/pages/[pageId]/actions/approve/route.ts',
    ];

    it('no forbidden HTTP methods (PUT, DELETE) exported in any write route', () => {
      for (const relPath of routeFiles) {
        const content = fs.readFileSync(
          path.join(process.cwd(), relPath),
          'utf-8'
        );
        for (const method of ['PUT', 'DELETE']) {
          const regex = new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b`);
          assert.strictEqual(
            regex.test(content),
            false,
            `${relPath} must not export ${method}`
          );
        }
      }
    });

    it('all routes call requireAuthenticatedUser and validateMutationOrigin', () => {
      for (const relPath of routeFiles) {
        const content = fs.readFileSync(
          path.join(process.cwd(), relPath),
          'utf-8'
        );
        assert.ok(
          content.includes('requireAuthenticatedUser'),
          `${relPath} must call requireAuthenticatedUser`
        );
        if (relPath.includes('draft') || relPath.includes('actions')) {
          assert.ok(
            content.includes('validateMutationOrigin'),
            `${relPath} must call validateMutationOrigin`
          );
        }
      }
    });

    it('no direct prisma or pagesFixture imports in write route files', () => {
      for (const relPath of routeFiles) {
        const content = fs.readFileSync(
          path.join(process.cwd(), relPath),
          'utf-8'
        );
        assert.strictEqual(
          content.includes('prisma'),
          false,
          `${relPath} must not import prisma directly`
        );
        assert.strictEqual(
          content.includes('pagesFixture'),
          false,
          `${relPath} must not import pagesFixture`
        );
      }
    });
  });
});
