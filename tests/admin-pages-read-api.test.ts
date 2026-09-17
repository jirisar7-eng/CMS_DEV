import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import {
  setAdminPagesServiceForTesting,
  setAuthenticatedUserForTesting,
  handleApiError,
} from '../lib/domain/pages-api';
import { GET as getPagesRoute } from '../app/api/admin/projects/[projectId]/pages/route';
import { GET as getPageDetailRoute } from '../app/api/admin/projects/[projectId]/pages/[pageId]/route';
import { AdminPagesService } from '../lib/domain/pages-persistence/service';
import type { AdminPagesReadStore } from '../lib/domain/pages-persistence/store';
import type {
  PersistencePage,
  PersistencePageRevision,
  PersistenceAuditLog,
  PersistenceUser,
} from '../lib/domain/pages-persistence/types';
import { AdminPagesPersistenceError } from '../lib/domain/pages-persistence/types';

class FakeStore implements AdminPagesReadStore {
  public pages: PersistencePage[] = [];
  public revisions: PersistencePageRevision[] = [];
  public auditLogs: PersistenceAuditLog[] = [];
  public users: Map<string, PersistenceUser> = new Map();

  async listProjectPages(projectId: string): Promise<PersistencePage[]> {
    return this.pages.filter((p) => p.projectId === projectId);
  }

  async getProjectPage(
    projectId: string,
    pageId: string
  ): Promise<PersistencePage | null> {
    const page = this.pages.find((p) => p.projectId === projectId && p.id === pageId);
    return page || null;
  }

  async listPageRevisions(pageId: string): Promise<PersistencePageRevision[]> {
    return this.revisions.filter((r) => r.pageId === pageId);
  }

  async getProjectRevision(
    pageId: string,
    revisionId: string
  ): Promise<PersistencePageRevision | null> {
    const rev = this.revisions.find(
      (r) => r.pageId === pageId && r.id === revisionId
    );
    return rev || null;
  }

  async listPageAuditEvents(
    projectId: string,
    pageId: string
  ): Promise<PersistenceAuditLog[]> {
    return this.auditLogs.filter(
      (a) => a.scopeId === projectId && a.resourceId === pageId
    );
  }

  async getUsersByIds(
    userIds: string[]
  ): Promise<Map<string, PersistenceUser>> {
    const result = new Map<string, PersistenceUser>();
    for (const id of userIds) {
      const u = this.users.get(id);
      if (u) result.set(id, u);
    }
    return result;
  }
}

const canonicalSampleContent = {
  version: 1,
  schemaVersion: '1.0.0',
  blocks: [
    {
      id: 'block-1',
      type: 'heading',
      order: 0,
      data: { text: 'Nadpis', level: 1 },
    },
    {
      id: 'block-2',
      type: 'paragraph',
      order: 1,
      data: { text: 'Text odstavce' },
    },
  ],
};

function createSampleRevision(
  overrides: Partial<PersistencePageRevision> = {}
): PersistencePageRevision {
  return {
    id: 'rev-1',
    pageId: 'page-1',
    revisionNumber: 1,
    lockVersion: 1,
    status: 'DRAFT',
    title: 'Domů',
    slug: 'domu',
    locale: 'cs',
    description: 'Úvodní stránka webu',
    visibility: 'PUBLIC',
    content: canonicalSampleContent,
    seo: {
      metaTitle: 'Domovská stránka',
      metaDescription: 'Úvodní stránka webu',
      canonicalUrl: null,
      noIndex: false,
      ogImage: null,
    },
    navigation: {
      showInMainNavigation: true,
      showInFooter: false,
      order: 1,
      label: 'Domů',
    },
    schemaVersion: '1.0.0',
    createdById: 'user-admin',
    createdAt: new Date('2026-03-01T10:00:00Z'),
    submittedAt: null,
    approvedAt: null,
    publishedAt: null,
    derivedFromRevisionId: null,
    ...overrides,
  };
}

function createSamplePage(
  overrides: Partial<PersistencePage> = {}
): PersistencePage {
  const rev = createSampleRevision();
  return {
    id: 'page-1',
    projectId: 'proj-alpha',
    key: 'home-page',
    parentId: null,
    sortOrder: 10,
    draftRevisionId: rev.id,
    publishedRevisionId: null,
    draftRevision: rev,
    publishedRevision: null,
    createdAt: new Date('2026-03-01T10:00:00Z'),
    updatedAt: new Date('2026-03-01T10:00:00Z'),
    ...overrides,
  };
}

describe('SYN-CONTENT-002B1: Admin Pages Server Read API', () => {
  let fakeStore: FakeStore;
  let service: AdminPagesService;
  let permissionMap: Map<string, boolean>;

  beforeEach(() => {
    setAuthenticatedUserForTesting({
      id: 'user-admin',
      email: 'admin@example.com',
      displayName: 'Admin',
      status: 'ACTIVE',
    });
    fakeStore = new FakeStore();
    permissionMap = new Map();
    // Default: grant all permissions to user-admin on proj-alpha
    permissionMap.set('user-admin:content.view:proj-alpha', true);
    permissionMap.set('user-admin:content.edit:proj-alpha', true);
    permissionMap.set('user-admin:content.publish:proj-alpha', true);
    permissionMap.set('user-admin:content.review:proj-alpha', true);
    permissionMap.set('user-admin:content.approve:proj-alpha', true);
    permissionMap.set('user-admin:content.rollback:proj-alpha', true);

    service = new AdminPagesService(
      fakeStore,
      async (actorId, permission, projectId) => {
        const key = `${actorId}:${permission}:${projectId}`;
        return permissionMap.get(key) ?? false;
      }
    );
    setAdminPagesServiceForTesting(service);
  });

  describe('1. AUTHENTICATION & ACTOR IDENTITY', () => {
    it('returns 401 UNAUTHENTICATED when session is missing', async () => {
      setAuthenticatedUserForTesting(null);
      const req = new NextRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages'
      );
      const res = await getPagesRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 401);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'UNAUTHENTICATED');
      assert.strictEqual(res.headers.get('cache-control'), 'no-store');
    });

    it('returns 401 UNAUTHENTICATED when user is inactive', async () => {
      setAuthenticatedUserForTesting({
        id: 'user-disabled',
        email: 'disabled@example.com',
        displayName: 'Disabled',
        status: 'DISABLED',
      });
      const req = new NextRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages'
      );
      const res = await getPagesRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 401);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'UNAUTHENTICATED');
    });

    it('actor is derived strictly from server session; client actorId in query is ignored', async () => {
      // Attacker tries to pretend to be someone else via query param
      const req = new NextRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages?actorId=user-superadmin&userId=user-superadmin'
      );
      let checkedActorId: string | null = null;
      service = new AdminPagesService(
        fakeStore,
        async (actorId, permission, projectId) => {
          checkedActorId = actorId;
          return true;
        }
      );
      setAdminPagesServiceForTesting(service);

      const res = await getPagesRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(
        checkedActorId,
        'user-admin',
        'Actor ID passed to service must be the session user ID, not the query param'
      );
    });

    it('returns 403 FORBIDDEN when actor lacks content.view permission', async () => {
      permissionMap.set('user-admin:content.view:proj-alpha', false);
      const req = new NextRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages'
      );
      const res = await getPagesRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 403);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'FORBIDDEN');
      assert.strictEqual(res.headers.get('cache-control'), 'no-store');
    });
  });

  describe('2. PROJECT BOUNDARIES & ISOLATION', () => {
    it('projectId route parameter correctly reaches the service', async () => {
      let passedProjectId: string | null = null;
      service = new AdminPagesService(
        fakeStore,
        async (actorId, permission, projectId) => {
          passedProjectId = projectId;
          return true;
        }
      );
      setAdminPagesServiceForTesting(service);

      const req = new NextRequest(
        'http://localhost/api/admin/projects/custom-project-123/pages'
      );
      const res = await getPagesRoute(req, {
        params: Promise.resolve({ projectId: 'custom-project-123' }),
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(passedProjectId, 'custom-project-123');
    });

    it('cross-project access: page in project A accessed via project B returns 404 PAGE_NOT_FOUND', async () => {
      permissionMap.set('user-admin:content.view:proj-beta', true);
      const rev = createSampleRevision({ id: 'rev-alpha', pageId: 'page-alpha' });
      const page = createSamplePage({
        id: 'page-alpha',
        projectId: 'proj-alpha',
        draftRevisionId: 'rev-alpha',
        draftRevision: rev,
      });
      fakeStore.pages = [page];
      fakeStore.revisions = [rev];

      const req = new NextRequest(
        'http://localhost/api/admin/projects/proj-beta/pages/page-alpha'
      );
      const res = await getPageDetailRoute(req, {
        params: Promise.resolve({
          projectId: 'proj-beta',
          pageId: 'page-alpha',
        }),
      });

      assert.strictEqual(res.status, 404);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'PAGE_NOT_FOUND');
      // Must not reveal existence in another project
      assert.strictEqual(body.error.message, 'Page not found');
    });

    it('blank or invalid projectId returns 400 INVALID_INPUT', async () => {
      const invalidProjects = ['', '   ', 'project<script>', 'a'.repeat(200)];
      for (const proj of invalidProjects) {
        const req = new NextRequest(
          `http://localhost/api/admin/projects/${encodeURIComponent(proj)}/pages`
        );
        const res = await getPagesRoute(req, {
          params: Promise.resolve({ projectId: proj }),
        });
        assert.strictEqual(res.status, 400, `Expected 400 for projectId: "${proj}"`);
        const body = await res.json();
        assert.strictEqual(body.error.code, 'INVALID_INPUT');
      }
    });
  });

  describe('3. LIST ENDPOINT', () => {
    beforeEach(() => {
      const rev1 = createSampleRevision({
        id: 'rev-1',
        pageId: 'page-1',
        title: 'Domů',
        slug: 'domu',
        status: 'DRAFT',
      });
      const page1 = createSamplePage({
        id: 'page-1',
        sortOrder: 10,
        draftRevisionId: 'rev-1',
        draftRevision: rev1,
      });

      const rev2 = createSampleRevision({
        id: 'rev-2',
        pageId: 'page-2',
        title: 'O nás',
        slug: 'o-nas',
        status: 'APPROVED',
      });
      const page2 = createSamplePage({
        id: 'page-2',
        parentId: 'page-1',
        sortOrder: 20,
        draftRevisionId: 'rev-2',
        draftRevision: rev2,
      });

      fakeStore.pages = [page1, page2];
      fakeStore.revisions = [rev1, rev2];
    });

    it('returns list response shape with PageSummary[] and no-store header', async () => {
      const req = new NextRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages?view=list'
      );
      const res = await getPagesRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('cache-control'), 'no-store');
      assert.strictEqual(
        res.headers.get('content-type'),
        'application/json'
      );

      const body = await res.json();
      assert.ok(Array.isArray(body.data));
      assert.strictEqual(body.data.length, 2);
      assert.strictEqual(body.data[0].id, 'page-1');
      assert.strictEqual(body.data[0].title, 'Domů');
      assert.strictEqual(body.data[0].path, '/domu');
    });

    it('returns tree response shape with PageTreeNode[] when view=tree', async () => {
      const req = new NextRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages?view=tree'
      );
      const res = await getPagesRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 200);

      const body = await res.json();
      assert.ok(Array.isArray(body.data));
      // Root node page-1 has page-2 as child
      assert.strictEqual(body.data.length, 1);
      assert.strictEqual(body.data[0].id, 'page-1');
      assert.strictEqual(body.data[0].children.length, 1);
      assert.strictEqual(body.data[0].children[0].id, 'page-2');
    });

    it('rejects unknown view parameter with 400 INVALID_INPUT', async () => {
      const req = new NextRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages?view=invalid_view'
      );
      const res = await getPagesRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'INVALID_INPUT');
    });

    it('rejects unknown status filter with 400 INVALID_INPUT', async () => {
      const req = new NextRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages?status=invalid_status'
      );
      const res = await getPagesRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'INVALID_INPUT');
    });

    it('rejects unknown sortBy parameter with 400 INVALID_INPUT', async () => {
      const req = new NextRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages?sortBy=unsupported'
      );
      const res = await getPagesRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'INVALID_INPUT');
    });

    it('rejects unknown sortDirection with 400 INVALID_INPUT', async () => {
      const req = new NextRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages?sortDirection=diagonal'
      );
      const res = await getPagesRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'INVALID_INPUT');
    });

    it('supports valid query filters and sorting', async () => {
      const req = new NextRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages?search=nas&status=APPROVED&sortBy=title&sortDirection=asc'
      );
      const res = await getPagesRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.data.length, 1);
      assert.strictEqual(body.data[0].id, 'page-2');
    });
  });

  describe('4. DETAIL ENDPOINT & LIFECYCLE METADATA', () => {
    it('returns PageDetail and AdminPageLifecycleState with no-store header', async () => {
      const rev = createSampleRevision({
        id: 'rev-3',
        pageId: 'page-detail-1',
        revisionNumber: 3,
        lockVersion: 7,
        status: 'DRAFT',
      });
      const page = createSamplePage({
        id: 'page-detail-1',
        draftRevisionId: 'rev-3',
        draftRevision: rev,
        publishedRevisionId: 'rev-pub-prev',
      });
      fakeStore.pages = [page];
      fakeStore.revisions = [rev];

      const req = new NextRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages/page-detail-1'
      );
      const res = await getPageDetailRoute(req, {
        params: Promise.resolve({
          projectId: 'proj-alpha',
          pageId: 'page-detail-1',
        }),
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('cache-control'), 'no-store');

      const body = await res.json();
      assert.ok(body.data);
      assert.ok(body.data.page);
      assert.ok(body.data.lifecycle);

      // Verify PageDetail
      assert.strictEqual(body.data.page.id, 'page-detail-1');
      assert.strictEqual(body.data.page.title, 'Domů');

      // Verify concurrency lifecycle metadata
      assert.strictEqual(body.data.lifecycle.activeRevisionId, 'rev-3');
      assert.strictEqual(body.data.lifecycle.revisionNumber, 3);
      assert.strictEqual(body.data.lifecycle.lockVersion, 7);
      assert.strictEqual(body.data.lifecycle.status, 'DRAFT');
      assert.strictEqual(body.data.lifecycle.draftRevisionId, 'rev-3');
      assert.strictEqual(
        body.data.lifecycle.publishedRevisionId,
        'rev-pub-prev'
      );
    });

    it('returns 404 PAGE_NOT_FOUND for non-existent page', async () => {
      const req = new NextRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages/non-existent-page'
      );
      const res = await getPageDetailRoute(req, {
        params: Promise.resolve({
          projectId: 'proj-alpha',
          pageId: 'non-existent-page',
        }),
      });
      assert.strictEqual(res.status, 404);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'PAGE_NOT_FOUND');
    });

    it('blank or invalid pageId returns 400 INVALID_INPUT', async () => {
      const invalidPageIds = ['', '   ', 'page<bad>', 'x'.repeat(200)];
      for (const pid of invalidPageIds) {
        const req = new NextRequest(
          `http://localhost/api/admin/projects/proj-alpha/pages/${encodeURIComponent(pid)}`
        );
        const res = await getPageDetailRoute(req, {
          params: Promise.resolve({
            projectId: 'proj-alpha',
            pageId: pid,
          }),
        });
        assert.strictEqual(res.status, 400);
        const body = await res.json();
        assert.strictEqual(body.error.code, 'INVALID_INPUT');
      }
    });
  });

  describe('5. CAPABILITY SEMANTICS (canEdit & canPublish)', () => {
    async function getPageCapabilitiesForStatus(status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED') {
      const rev = createSampleRevision({
        id: `rev-${status}`,
        pageId: `page-${status}`,
        status,
      });
      const page = createSamplePage({
        id: `page-${status}`,
        draftRevisionId: status === 'PUBLISHED' ? null : rev.id,
        draftRevision: status === 'PUBLISHED' ? null : rev,
        publishedRevisionId: status === 'PUBLISHED' ? rev.id : null,
        publishedRevision: status === 'PUBLISHED' ? rev : null,
      });
      fakeStore.pages = [page];
      fakeStore.revisions = [rev];

      const req = new NextRequest(
        `http://localhost/api/admin/projects/proj-alpha/pages/page-${status}`
      );
      const res = await getPageDetailRoute(req, {
        params: Promise.resolve({
          projectId: 'proj-alpha',
          pageId: `page-${status}`,
        }),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      return body.data.page.capabilities;
    }

    it('DRAFT: canEdit === true (with content.edit), canPublish === false', async () => {
      const caps = await getPageCapabilitiesForStatus('DRAFT');
      assert.strictEqual(caps.canEdit, true, 'DRAFT must be editable');
      assert.strictEqual(caps.canPublish, false, 'DRAFT must not be publishable directly');
      assert.strictEqual(caps.canSave, true);
      assert.strictEqual(caps.canSubmitReview, true);
      assert.strictEqual(caps.canReview, false);
      assert.strictEqual(caps.canApprove, false);
      assert.strictEqual(caps.canRollback, false);
      assert.strictEqual(caps.canReopenDraft, false);
    });

    it('IN_REVIEW: canEdit === false, canPublish === false', async () => {
      const caps = await getPageCapabilitiesForStatus('IN_REVIEW');
      assert.strictEqual(caps.canEdit, false, 'IN_REVIEW cannot be edited directly');
      assert.strictEqual(caps.canPublish, false, 'IN_REVIEW must not be publishable');
      assert.strictEqual(caps.canSave, false);
      assert.strictEqual(caps.canSubmitReview, false);
      assert.strictEqual(caps.canReview, true);
      assert.strictEqual(caps.canApprove, true);
      assert.strictEqual(caps.canRollback, false);
      assert.strictEqual(caps.canReopenDraft, false);
    });

    it('APPROVED: canEdit === false, canPublish === true (with content.publish)', async () => {
      const caps = await getPageCapabilitiesForStatus('APPROVED');
      assert.strictEqual(caps.canEdit, false, 'APPROVED cannot be edited directly');
      assert.strictEqual(caps.canPublish, true, 'APPROVED must be publishable by publisher');
      assert.strictEqual(caps.canSave, false);
      assert.strictEqual(caps.canSubmitReview, false);
      assert.strictEqual(caps.canReview, false);
      assert.strictEqual(caps.canApprove, false);
      assert.strictEqual(caps.canRollback, false);
      assert.strictEqual(caps.canReopenDraft, false);
    });

    it('PUBLISHED: canEdit === false, canPublish === false', async () => {
      const caps = await getPageCapabilitiesForStatus('PUBLISHED');
      assert.strictEqual(caps.canEdit, false, 'PUBLISHED cannot be edited without draft');
      assert.strictEqual(caps.canPublish, false, 'PUBLISHED cannot be published again directly');
      assert.strictEqual(caps.canSave, false);
      assert.strictEqual(caps.canSubmitReview, false);
      assert.strictEqual(caps.canReview, false);
      assert.strictEqual(caps.canApprove, false);
      assert.strictEqual(caps.canRollback, true);
      assert.strictEqual(caps.canReopenDraft, true);
    });
  });

  describe('6. SAFE API ERROR MAPPING', () => {
    it('maps known AdminPagesPersistenceErrors correctly', () => {
      const cases: [string, number][] = [
        ['INVALID_INPUT', 400],
        ['FORBIDDEN', 403],
        ['PAGE_NOT_FOUND', 404],
        ['PAGE_STATE_INVALID', 409],
        ['POINTER_INTEGRITY_VIOLATION', 409],
        ['HIERARCHY_INTEGRITY_VIOLATION', 409],
        ['CONTENT_INTEGRITY_VIOLATION', 409],
        ['DATABASE_UNAVAILABLE', 503],
      ];

      for (const [code, expectedStatus] of cases) {
        const err = new AdminPagesPersistenceError(code as any, 'Detailed test error');
        const res = handleApiError(err);
        assert.strictEqual(res.status, expectedStatus);
        assert.strictEqual(res.headers.get('cache-control'), 'no-store');
      }
    });

    it('DATABASE_UNAVAILABLE returns 503', async () => {
      service = new AdminPagesService(
        fakeStore,
        async () => {
          throw new AdminPagesPersistenceError('DATABASE_UNAVAILABLE', 'Prisma connection failed');
        }
      );
      setAdminPagesServiceForTesting(service);

      const req = new NextRequest(
        'http://localhost/api/admin/projects/proj-alpha/pages'
      );
      const res = await getPagesRoute(req, {
        params: Promise.resolve({ projectId: 'proj-alpha' }),
      });
      assert.strictEqual(res.status, 503);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'DATABASE_UNAVAILABLE');
    });

    it('unexpected errors map to sanitized 500 INTERNAL_ERROR without leaking raw details', () => {
      const rawError = new Error('FATAL Prisma error: SELECT * FROM secret_table WHERE pass=123');
      const res = handleApiError(rawError);
      assert.strictEqual(res.status, 500);
      assert.strictEqual(res.headers.get('cache-control'), 'no-store');

      const json = JSON.stringify((res as any).body || {});
      assert.strictEqual(json.includes('secret_table'), false);
      assert.strictEqual(json.includes('SELECT'), false);
    });
  });

  describe('7. SOURCE ASSERTIONS', () => {
    const listRouteSource = fs.readFileSync(
      path.join(
        process.cwd(),
        'app/api/admin/projects/[projectId]/pages/route.ts'
      ),
      'utf-8'
    );
    const detailRouteSource = fs.readFileSync(
      path.join(
        process.cwd(),
        'app/api/admin/projects/[projectId]/pages/[pageId]/route.ts'
      ),
      'utf-8'
    );
    const pagesApiIndexSource = fs.readFileSync(
      path.join(process.cwd(), 'lib/domain/pages-api/index.ts'),
      'utf-8'
    );

    it('routes call requireAuthenticatedUser', () => {
      assert.ok(
        listRouteSource.includes('requireAuthenticatedUser'),
        'List route must call requireAuthenticatedUser'
      );
      assert.ok(
        detailRouteSource.includes('requireAuthenticatedUser'),
        'Detail route must call requireAuthenticatedUser'
      );
    });

    it('no route reads actorId from request', () => {
      assert.strictEqual(
        listRouteSource.includes('searchParams.get(\'actorId\')'),
        false
      );
      assert.strictEqual(
        listRouteSource.includes('searchParams.get("actorId")'),
        false
      );
      assert.strictEqual(
        detailRouteSource.includes('searchParams.get(\'actorId\')'),
        false
      );
      assert.strictEqual(
        detailRouteSource.includes('searchParams.get("actorId")'),
        false
      );
    });

    it('no fixture import in API routes or pages-api', () => {
      assert.strictEqual(
        listRouteSource.includes('pagesFixture'),
        false,
        'List route must not import pagesFixture'
      );
      assert.strictEqual(
        detailRouteSource.includes('pagesFixture'),
        false,
        'Detail route must not import pagesFixture'
      );
      assert.strictEqual(
        pagesApiIndexSource.includes('pagesFixture'),
        false,
        'pages-api must not import pagesFixture'
      );
    });

    it('no Prisma direct use in route.ts', () => {
      assert.strictEqual(
        listRouteSource.includes('prisma'),
        false,
        'List route must not import prisma'
      );
      assert.strictEqual(
        detailRouteSource.includes('prisma'),
        false,
        'Detail route must not import prisma'
      );
    });

    it('no write HTTP methods exported in route files', () => {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const regex = new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b`);
        assert.strictEqual(
          regex.test(listRouteSource),
          false,
          `List route must not export ${method}`
        );
        assert.strictEqual(
          regex.test(detailRouteSource),
          false,
          `Detail route must not export ${method}`
        );
      }
    });
  });
});
