// @ts-nocheck
import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import Module from 'node:module';

// 1. Mock classes for Next.js server runtime
class MockNextResponse {
  status: number;
  headers: Map<string, string>;
  private _body: any;

  constructor(body: any, init?: { status?: number; headers?: Record<string, string> }) {
    this._body = body;
    this.status = init?.status ?? 200;
    this.headers = new Map(Object.entries(init?.headers || {}));
  }

  static json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
    return new MockNextResponse(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  }

  async json() {
    return typeof this._body === 'string' ? JSON.parse(this._body) : this._body;
  }

  async text() {
    return typeof this._body === 'string' ? this._body : JSON.stringify(this._body);
  }
}

class MockNextRequest extends Request {
  nextUrl: URL;
  constructor(input: string | URL, init?: RequestInit) {
    super(input, init);
    this.nextUrl = new URL(typeof input === 'string' ? input : input.toString());
  }
}

// 2. Mock state and dependencies
let mockCurrentUser: { id: string; email: string; displayName: string | null; status: string } | null = null;
let mockPermissionsGranted: Set<string> = new Set();
let mockActiveProject: { id: string; key: string; status: string } | null = null;

const mockPrisma = {
  project: {
    findFirst: mock.fn(async (args: any) => {
      if (!mockActiveProject) return null;
      const match = args?.where?.OR?.some(
        (cond: any) => cond.id === mockActiveProject?.id || cond.key === mockActiveProject?.key
      );
      if (match && args?.where?.status === mockActiveProject?.status) {
        return { id: mockActiveProject.id, key: mockActiveProject.key, status: mockActiveProject.status };
      }
      return null;
    }),
    findUnique: mock.fn(async (args: any) => {
      if (mockActiveProject && args?.where?.id === mockActiveProject.id) {
        return { id: mockActiveProject.id, key: mockActiveProject.key, status: mockActiveProject.status };
      }
      return null;
    }),
  },
  page: {
    findMany: mock.fn(async () => []),
  },
  searchDocument: {
    deleteMany: mock.fn(async () => ({ count: 0 })),
    createMany: mock.fn(async () => ({ count: 0 })),
    findMany: mock.fn(async () => []),
    count: mock.fn(async () => 0),
  },
  $transaction: mock.fn(async (cb: any) => cb(mockPrisma)),
};

const mockGetSession = mock.fn(async () => {
  if (!mockCurrentUser) return { session: null, user: null };
  return {
    session: { id: 'sess-1', userId: mockCurrentUser.id, expiresAt: new Date(Date.now() + 86400000) },
    user: mockCurrentUser,
  };
});

const mockHasPermission = mock.fn(async (userId: string, permissionKey: string, projectId?: string | null) => {
  if (!mockCurrentUser || mockCurrentUser.id !== userId) return false;
  return (
    mockPermissionsGranted.has(`${permissionKey}:${projectId || '*'}`) ||
    mockPermissionsGranted.has(permissionKey)
  );
});

const mockGetActiveProjectContext = mock.fn(async (requestedProjectId?: string | null) => {
  if (!requestedProjectId) {
    return { status: 'PROJECT_NOT_SELECTED', projectId: null };
  }
  if (!mockCurrentUser || mockCurrentUser.status !== 'ACTIVE') {
    return { status: 'PROJECT_FORBIDDEN', projectId: null };
  }
  if (!mockActiveProject || mockActiveProject.id !== requestedProjectId) {
    return { status: 'PROJECT_NOT_FOUND', projectId: null };
  }
  if (mockActiveProject.status !== 'ACTIVE') {
    return { status: 'PROJECT_INACTIVE', projectId: null };
  }
  // Check access
  const canAccessAdmin = mockPermissionsGranted.has('admin.access') || mockPermissionsGranted.has(`admin.access:${mockActiveProject.id}`);
  const canViewProject = mockPermissionsGranted.has('projects.view') || mockPermissionsGranted.has(`projects.view:${mockActiveProject.id}`);
  if (!canAccessAdmin && !canViewProject) {
    return { status: 'PROJECT_FORBIDDEN', projectId: null };
  }
  return { status: 'PROJECT_VALID', projectId: mockActiveProject.id, userId: mockCurrentUser.id };
});

// 3. Module interception
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === 'next/server') {
    return { NextResponse: MockNextResponse, NextRequest: MockNextRequest };
  }
  if (id === 'next/headers') {
    return {
      cookies: async () => ({
        get: () => undefined,
      }),
    };
  }
  if (id === '@/lib/db') {
    return { prisma: mockPrisma };
  }
  if (id === '@/lib/auth/session') {
    return { getSession: mockGetSession };
  }
  if (id === '@/lib/auth/rbac') {
    return { hasPermission: mockHasPermission };
  }
  if (id === '@/lib/domain/pages-client/server-context') {
    return { getActiveProjectContext: mockGetActiveProjectContext };
  }
  return originalRequire.apply(this, arguments as any);
};

// 4. Import API route handlers dynamically after hooking require
const { GET: publicSearchGET } = require('../app/api/public/search/route');
const {
  GET: adminSearchGET,
  POST: adminSearchPOST,
} = require('../app/api/admin/projects/[projectId]/search/route');
const { SEARCH_INDEX_VERSION } = require('../lib/domain/search');

describe('SYN-SEARCH-001 Public & Admin Search API Integration', () => {
  const testProjectId = 'proj-search-test-1';

  beforeEach(() => {
    mockCurrentUser = null;
    mockPermissionsGranted.clear();
    mockActiveProject = { id: testProjectId, key: 'test-site', status: 'ACTIVE' };

    mockPrisma.project.findFirst.mock.resetCalls();
    mockPrisma.project.findUnique.mock.resetCalls();
    mockPrisma.page.findMany.mock.resetCalls();
    mockPrisma.searchDocument.deleteMany.mock.resetCalls();
    mockPrisma.searchDocument.createMany.mock.resetCalls();
    mockPrisma.searchDocument.findMany.mock.resetCalls();
    mockPrisma.searchDocument.count.mock.resetCalls();
    mockPrisma.$transaction.mock.resetCalls();
    mockGetSession.mock.resetCalls();
    mockHasPermission.mock.resetCalls();
    mockGetActiveProjectContext.mock.resetCalls();
  });

  // =========================================================================
  // 1. PUBLIC SEARCH API
  // =========================================================================
  describe('1. Public Search API (GET /api/public/search)', () => {
    it('fails closed (404 PROJECT_NOT_FOUND) when public project context is missing or null', async () => {
      const req = new Request('https://example.com/api/public/search?q=test');
      const res = await publicSearchGET(req);

      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert.strictEqual(data.error, 'PROJECT_NOT_FOUND');
    });

    it('fails closed (404 PROJECT_NOT_FOUND) when requested project is INACTIVE or non-existent in DB', async () => {
      mockActiveProject = null; // project does not exist

      const req = new Request(`https://example.com/api/public/search?projectId=${testProjectId}&q=test`);
      const res = await publicSearchGET(req);

      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert.strictEqual(data.error, 'PROJECT_NOT_FOUND');
    });

    it('rejects missing or empty query q with 400 INVALID_QUERY', async () => {
      const emptyQueries = ['', '   ', '\t\n'];
      for (const q of emptyQueries) {
        const req = new Request(`https://example.com/api/public/search?projectId=${testProjectId}&q=${encodeURIComponent(q)}`);
        const res = await publicSearchGET(req);

        assert.strictEqual(res.status, 400);
        const data = await res.json();
        assert.strictEqual(data.error, 'INVALID_QUERY');
      }

      const noQueryReq = new Request(`https://example.com/api/public/search?projectId=${testProjectId}`);
      const noQueryRes = await publicSearchGET(noQueryReq);
      assert.strictEqual(noQueryRes.status, 400);
    });

    it('rejects queries exceeding SEARCH_MAX_QUERY_LENGTH (200 chars) with 400 QUERY_TOO_LONG', async () => {
      const longQuery = 'x'.repeat(205);
      const req = new Request(`https://example.com/api/public/search?projectId=${testProjectId}&q=${encodeURIComponent(longQuery)}`);
      const res = await publicSearchGET(req);

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error, 'QUERY_TOO_LONG');
    });

    it('rejects invalid limit or offset parameters with 400 INVALID_PAGINATION', async () => {
      const invalidUrls = [
        `https://example.com/api/public/search?projectId=${testProjectId}&q=test&limit=-5`,
        `https://example.com/api/public/search?projectId=${testProjectId}&q=test&limit=notanumber`,
        `https://example.com/api/public/search?projectId=${testProjectId}&q=test&offset=-1`,
        `https://example.com/api/public/search?projectId=${testProjectId}&q=test&offset=invalid`,
      ];

      for (const url of invalidUrls) {
        const req = new Request(url);
        const res = await publicSearchGET(req);

        assert.strictEqual(res.status, 400);
        const data = await res.json();
        assert.strictEqual(data.error, 'INVALID_PAGINATION');
      }
    });

    it('executes search against PrismaSearchIndexAdapter and returns sanitized public result', async () => {
      const mockDocs = [
        {
          id: 'internal-id-1',
          projectId: testProjectId,
          pageId: 'page-101',
          revisionId: 'rev-202',
          path: '/kontakt',
          title: 'Kontaktní informace',
          description: 'Náš kontakt a adresa',
          locale: 'cs',
          bodyText: 'SOUKROMÝ NEVEŘEJNÝ TEXT A METADATA',
          indexVersion: 1,
          indexedAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.searchDocument.count.mock.mockImplementation(async () => 1);
      mockPrisma.searchDocument.findMany.mock.mockImplementation(async () => mockDocs);

      const req = new Request(`https://example.com/api/public/search?projectId=${testProjectId}&q=kontakt&limit=10&offset=0`);
      const res = await publicSearchGET(req);

      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.strictEqual(data.total, 1);
      assert.strictEqual(data.limit, 10);
      assert.strictEqual(data.offset, 0);
      assert.strictEqual(data.query, 'kontakt');
      assert.strictEqual(data.items.length, 1);

      const item = data.items[0];
      assert.strictEqual(item.path, '/kontakt');
      assert.strictEqual(item.title, 'Kontaktní informace');
      assert.strictEqual(item.description, 'Náš kontakt a adresa');
      assert.strictEqual(item.locale, 'cs');

      // CRITICAL: Public API must strictly omit internal IDs, bodyText, database IDs, and timestamps
      assert.strictEqual((item as any).pageId, undefined, 'pageId must be omitted from public response');
      assert.strictEqual((item as any).revisionId, undefined, 'revisionId must be omitted from public response');
      assert.strictEqual((item as any).bodyText, undefined, 'bodyText must be omitted from public response');
      assert.strictEqual((item as any).id, undefined, 'id must be omitted from public response');
      assert.strictEqual((item as any).indexVersion, undefined, 'indexVersion must be omitted from public response');
      assert.strictEqual((item as any).indexedAt, undefined, 'indexedAt must be omitted from public response');
      assert.strictEqual((item as any).updatedAt, undefined, 'updatedAt must be omitted from public response');
      assert.strictEqual((item as any).projectId, undefined, 'projectId must be omitted from public response');
    });

    it('regression: public search response strictly omits pageId, revisionId, bodyText, indexVersion, indexedAt and updatedAt', async () => {
      const mockDocs = [
        {
          id: 'internal-id-999',
          projectId: testProjectId,
          pageId: 'secret-page-id-999',
          revisionId: 'secret-rev-id-888',
          path: '/o-nas',
          title: 'O nás',
          description: 'Popis společnosti',
          locale: 'cs',
          bodyText: 'Citlivý vnitřní obsah, který nesmí uniknout do JSON odpovědi',
          indexVersion: 1,
          indexedAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-02T00:00:00Z'),
        },
      ];

      mockPrisma.searchDocument.count.mock.mockImplementation(async () => 1);
      mockPrisma.searchDocument.findMany.mock.mockImplementation(async () => mockDocs);

      const req = new Request(`https://example.com/api/public/search?projectId=${testProjectId}&q=spolecnosti`);
      const res = await publicSearchGET(req);

      assert.strictEqual(res.status, 200);
      const jsonText = await res.text();
      const data = JSON.parse(jsonText);

      // Verify JSON payload text does NOT contain any internal identifiers or fields
      assert.strictEqual(jsonText.includes('secret-page-id-999'), false, 'Response payload must not contain pageId');
      assert.strictEqual(jsonText.includes('secret-rev-id-888'), false, 'Response payload must not contain revisionId');
      assert.strictEqual(jsonText.includes('internal-id-999'), false, 'Response payload must not contain DB id');
      assert.strictEqual(jsonText.includes('Citlivý vnitřní obsah'), false, 'Response payload must not contain bodyText');
      assert.strictEqual(jsonText.includes('indexVersion'), false, 'Response payload must not contain indexVersion key');
      assert.strictEqual(jsonText.includes('indexedAt'), false, 'Response payload must not contain indexedAt key');
      assert.strictEqual(jsonText.includes('updatedAt'), false, 'Response payload must not contain updatedAt key');

      // Verify item keys in parsed object
      const itemKeys = Object.keys(data.items[0]);
      assert.deepStrictEqual(itemKeys.sort(), ['description', 'locale', 'path', 'title'].sort());
    });

    it('handles database/adapter failure with 503 SEARCH_UNAVAILABLE without leaking internal error details', async () => {
      mockPrisma.searchDocument.count.mock.mockImplementation(async () => {
        throw new Error('Database cluster connection timeout: host=db-internal.private port=5432');
      });

      const req = new Request(`https://example.com/api/public/search?projectId=${testProjectId}&q=test`);
      const res = await publicSearchGET(req);

      assert.strictEqual(res.status, 503);
      const data = await res.json();
      assert.strictEqual(data.error, 'SEARCH_UNAVAILABLE');
      assert.strictEqual(data.message, 'Search service is temporarily unavailable');
      assert.strictEqual(JSON.stringify(data).includes('5432'), false);
    });
  });

  // =========================================================================
  // 2. ADMIN SEARCH API
  // =========================================================================
  describe('2. Admin Search API (app/api/admin/projects/[projectId]/search/route.ts)', () => {
    const routeContext = { params: Promise.resolve({ projectId: testProjectId }) };

    it('GET: rejects unauthenticated requests with 401 UNAUTHENTICATED', async () => {
      mockCurrentUser = null;

      const req = new MockNextRequest(`https://example.com/api/admin/projects/${testProjectId}/search`);
      const res = await adminSearchGET(req, routeContext);

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error, 'UNAUTHENTICATED');
    });

    it('GET: rejects user without search.read_admin permission with 403 UNAUTHORIZED', async () => {
      mockCurrentUser = { id: 'usr-admin-1', email: 'admin@example.com', displayName: 'Admin', status: 'ACTIVE' };
      mockPermissionsGranted.clear();
      mockPermissionsGranted.add('admin.access');
      mockPermissionsGranted.add('projects.view');
      // search.read_admin NOT granted

      const req = new MockNextRequest(`https://example.com/api/admin/projects/${testProjectId}/search`);
      const res = await adminSearchGET(req, routeContext);

      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.error, 'UNAUTHORIZED');
    });

    it('GET: returns 200 with indexedDocuments and indexVersion when search.read_admin is granted', async () => {
      mockCurrentUser = { id: 'usr-admin-1', email: 'admin@example.com', displayName: 'Admin', status: 'ACTIVE' };
      mockPermissionsGranted.clear();
      mockPermissionsGranted.add('admin.access');
      mockPermissionsGranted.add('projects.view');
      mockPermissionsGranted.add('search.read_admin');

      mockPrisma.searchDocument.count.mock.mockImplementation(async (args: any) => {
        if (args?.where?.projectId === testProjectId) {
          return 17;
        }
        return 0;
      });

      const req = new MockNextRequest(`https://example.com/api/admin/projects/${testProjectId}/search`);
      const res = await adminSearchGET(req, routeContext);

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.projectId, testProjectId);
      assert.strictEqual(data.indexedDocuments, 17);
      assert.strictEqual(data.indexVersion, SEARCH_INDEX_VERSION);
    });

    it('POST: rejects unauthenticated requests with 401 UNAUTHENTICATED', async () => {
      mockCurrentUser = null;

      const req = new MockNextRequest(`https://example.com/api/admin/projects/${testProjectId}/search`, {
        method: 'POST',
      });
      const res = await adminSearchPOST(req, routeContext);

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error, 'UNAUTHENTICATED');
    });

    it('POST: rejects user without search.reindex permission with 403 UNAUTHORIZED', async () => {
      mockCurrentUser = { id: 'usr-admin-1', email: 'admin@example.com', displayName: 'Admin', status: 'ACTIVE' };
      mockPermissionsGranted.clear();
      mockPermissionsGranted.add('admin.access');
      mockPermissionsGranted.add('projects.view');
      mockPermissionsGranted.add('search.read_admin'); // Has read, but NOT reindex

      const req = new MockNextRequest(`https://example.com/api/admin/projects/${testProjectId}/search`, {
        method: 'POST',
      });
      const res = await adminSearchPOST(req, routeContext);

      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.error, 'UNAUTHORIZED');
    });

    it('POST: reindexes only pages belonging to projectId and respects canonical validation and visibility', async () => {
      mockCurrentUser = { id: 'usr-admin-1', email: 'admin@example.com', displayName: 'Admin', status: 'ACTIVE' };
      mockPermissionsGranted.clear();
      mockPermissionsGranted.add('admin.access');
      mockPermissionsGranted.add('projects.view');
      mockPermissionsGranted.add('search.reindex');

      const mockPages = [
        // 1. Valid public page -> MUST be indexed
        {
          id: 'page-pub-1',
          projectId: testProjectId,
          slug: 'sluzby',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          sortOrder: 0,
          publishedRevisionId: 'rev-pub-1',
          publishedRevision: {
            id: 'rev-pub-1',
            pageId: 'page-pub-1',
            revisionNumber: 1,
            status: 'PUBLISHED',
            title: 'Naše služby',
            slug: 'sluzby',
            locale: 'cs',
            description: 'Přehled služeb',
            visibility: 'PUBLIC',
            content: {
              version: 1,
              schemaVersion: '1.0.0',
              blocks: [{ id: 'b1', type: 'paragraph', order: 0, data: { text: 'Nabídka služeb a konzultací' } }],
            },
            seo: { noIndex: false },
            navigation: {},
            schemaVersion: '1.0.0',
          },
        },
        // 2. Draft / unpublished page -> MUST be excluded
        {
          id: 'page-draft-only',
          projectId: testProjectId,
          slug: 'koncept',
          status: 'DRAFT',
          visibility: 'PUBLIC',
          sortOrder: 1,
          publishedRevisionId: null,
          publishedRevision: null,
        },
        // 3. Internal visibility page -> MUST be excluded
        {
          id: 'page-internal',
          projectId: testProjectId,
          slug: 'interni',
          status: 'PUBLISHED',
          visibility: 'INTERNAL',
          sortOrder: 2,
          publishedRevisionId: 'rev-internal',
          publishedRevision: {
            id: 'rev-internal',
            pageId: 'page-internal',
            revisionNumber: 1,
            status: 'PUBLISHED',
            title: 'Interní',
            slug: 'interni',
            locale: 'cs',
            description: null,
            visibility: 'INTERNAL',
            content: {
              version: 1,
              schemaVersion: '1.0.0',
              blocks: [{ id: 'b2', type: 'paragraph', order: 0, data: { text: 'Interní směrnice' } }],
            },
            seo: { noIndex: false },
            navigation: {},
            schemaVersion: '1.0.0',
          },
        },
      ];

      mockPrisma.page.findMany.mock.mockImplementation(async (args: any) => {
        assert.strictEqual(args.where.projectId, testProjectId, 'findMany MUST query strictly for this projectId');
        return mockPages;
      });

      let capturedDeleteWhere: any = null;
      let capturedCreatedDocs: any[] = [];

      mockPrisma.searchDocument.deleteMany.mock.mockImplementation(async (args: any) => {
        capturedDeleteWhere = args.where;
        return { count: 1 };
      });

      mockPrisma.searchDocument.createMany.mock.mockImplementation(async (args: any) => {
        capturedCreatedDocs = args.data;
        return { count: args.data.length };
      });

      const req = new MockNextRequest(`https://example.com/api/admin/projects/${testProjectId}/search`, {
        method: 'POST',
      });
      const res = await adminSearchPOST(req, routeContext);

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.projectId, testProjectId);
      assert.strictEqual(data.indexedCount, 1, 'Only 1 public page indexed');

      assert.strictEqual(capturedDeleteWhere.projectId, testProjectId);
      assert.strictEqual(capturedCreatedDocs.length, 1);
      assert.strictEqual(capturedCreatedDocs[0].pageId, 'page-pub-1');
      assert.strictEqual(capturedCreatedDocs[0].path, '/sluzby');
    });

    it('POST: returns 503 SEARCH_UNAVAILABLE when database/adapter fails during index replacement', async () => {
      mockCurrentUser = { id: 'usr-admin-1', email: 'admin@example.com', displayName: 'Admin', status: 'ACTIVE' };
      mockPermissionsGranted.clear();
      mockPermissionsGranted.add('admin.access');
      mockPermissionsGranted.add('projects.view');
      mockPermissionsGranted.add('search.reindex');

      mockPrisma.page.findMany.mock.mockImplementation(async () => []);
      mockPrisma.searchDocument.deleteMany.mock.mockImplementation(async () => {
        throw new Error('Connection closed by DB server unexpectedly');
      });

      const req = new MockNextRequest(`https://example.com/api/admin/projects/${testProjectId}/search`, {
        method: 'POST',
      });
      const res = await adminSearchPOST(req, routeContext);

      assert.strictEqual(res.status, 503);
      const data = await res.json();
      assert.strictEqual(data.error, 'SEARCH_UNAVAILABLE');
      assert.strictEqual(data.message, 'Search service is temporarily unavailable');
      assert.strictEqual(JSON.stringify(data).includes('unexpectedly'), false);
    });
  });
});
