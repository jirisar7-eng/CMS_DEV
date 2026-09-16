import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createAdminPagesClient,
  PagesApiClientError,
} from '../lib/domain/pages-client';

describe('Admin Pages Browser Client', () => {
  const originalFetch = global.fetch;
  let lastFetchUrl: string | null = null;
  let lastFetchInit: RequestInit | null = null;
  let fetchResponse: {
    ok: boolean;
    status: number;
    jsonBody?: any;
    rawText?: string;
  } = { ok: true, status: 200, jsonBody: { data: {} } };

  beforeEach(() => {
    lastFetchUrl = null;
    lastFetchInit = null;
    fetchResponse = { ok: true, status: 200, jsonBody: { data: {} } };

    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      lastFetchUrl = String(input);
      lastFetchInit = init ?? null;

      const bodyText =
        fetchResponse.rawText !== undefined
          ? fetchResponse.rawText
          : JSON.stringify(fetchResponse.jsonBody);

      return new Response(bodyText, {
        status: fetchResponse.status,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('PROJECT CONTEXT & VALIDATION', () => {
    it('requires explicit projectId and succeeds for valid ID', () => {
      const client = createAdminPagesClient('project-alpha');
      assert.equal(client.projectId, 'project-alpha');
    });

    it('rejects blank, missing, or empty projectId', () => {
      assert.throws(
        () => (createAdminPagesClient as any)(),
        (err: any) => err instanceof PagesApiClientError && err.code === 'INVALID_PROJECT_CONTEXT'
      );
      assert.throws(
        () => createAdminPagesClient(''),
        (err: any) => err instanceof PagesApiClientError && err.code === 'INVALID_PROJECT_CONTEXT'
      );
      assert.throws(
        () => createAdminPagesClient('   '),
        (err: any) => err instanceof PagesApiClientError && err.code === 'INVALID_PROJECT_CONTEXT'
      );
    });

    it('rejects unsafe projectId with control chars or angle brackets', () => {
      assert.throws(
        () => createAdminPagesClient('proj<ect>'),
        (err: any) => err instanceof PagesApiClientError && err.code === 'INVALID_PROJECT_CONTEXT'
      );
      assert.throws(
        () => createAdminPagesClient('proj\x00ect'),
        (err: any) => err instanceof PagesApiClientError && err.code === 'INVALID_PROJECT_CONTEXT'
      );
    });

    it('encodes projectId safely in URL paths', async () => {
      const client = createAdminPagesClient('project/special name');
      fetchResponse = { ok: true, status: 200, jsonBody: { data: [] } };
      await client.getPages();
      assert.ok(lastFetchUrl?.includes('/api/admin/projects/project%2Fspecial%20name/pages'));
    });
  });

  describe('PAGE ID VALIDATION', () => {
    it('rejects invalid or unsafe pageId on operations', async () => {
      const client = createAdminPagesClient('proj-1');
      await assert.rejects(
        async () => client.getPageById(''),
        (err: any) => err instanceof PagesApiClientError && err.code === 'INVALID_PAGE_ID'
      );
      await assert.rejects(
        async () => client.getPageById('page<script>'),
        (err: any) => err instanceof PagesApiClientError && err.code === 'INVALID_PAGE_ID'
      );
      await assert.rejects(
        async () => client.getPageById('page\n123'),
        (err: any) => err instanceof PagesApiClientError && err.code === 'INVALID_PAGE_ID'
      );
    });
  });

  describe('READ METHODS', () => {
    it('getPages calls correct endpoint with no-store and unwrap data', async () => {
      const mockPages = [
        { id: 'page-1', title: 'Home', slug: 'home', status: 'Publikováno' },
      ];
      fetchResponse = { ok: true, status: 200, jsonBody: { data: mockPages } };

      const client = createAdminPagesClient('proj-1');
      const pages = await client.getPages();

      assert.equal(lastFetchUrl, '/api/admin/projects/proj-1/pages');
      assert.equal(lastFetchInit?.method, 'GET');
      assert.equal(lastFetchInit?.cache, 'no-store');
      assert.equal(lastFetchInit?.credentials, 'same-origin');
      assert.deepEqual(pages, mockPages);
    });

    it('getPages encodes criteria correctly in query parameters', async () => {
      fetchResponse = { ok: true, status: 200, jsonBody: { data: [] } };
      const client = createAdminPagesClient('proj-1');

      await client.getPages({
        searchQuery: 'about us & more',
        status: 'Koncept',
        sortBy: 'title',
        sortDirection: 'asc',
      });

      assert.ok(lastFetchUrl?.includes('/api/admin/projects/proj-1/pages?'));
      const parsedUrl = new URL(lastFetchUrl!, 'http://localhost');
      assert.equal(parsedUrl.searchParams.get('search'), 'about us & more');
      assert.equal(parsedUrl.searchParams.get('status'), 'Koncept');
      assert.equal(parsedUrl.searchParams.get('sortBy'), 'title');
      assert.equal(parsedUrl.searchParams.get('sortDirection'), 'asc');
    });

    it('getPageTree uses view=tree and returns unwrapped tree', async () => {
      const mockTree = [
        { id: 'p1', title: 'Root', level: 0, children: [] },
      ];
      fetchResponse = { ok: true, status: 200, jsonBody: { data: mockTree } };

      const client = createAdminPagesClient('proj-1');
      const tree = await client.getPageTree();

      assert.equal(lastFetchUrl, '/api/admin/projects/proj-1/pages?view=tree');
      assert.deepEqual(tree, mockTree);
    });

    it('getPageById preserves both page and lifecycle metadata', async () => {
      const mockDetail = {
        page: {
          id: 'p-1',
          title: 'Page 1',
          slug: 'p-1',
          status: 'Koncept',
          description: 'Desc',
        },
        lifecycle: {
          activeRevisionId: 'rev-1',
          revisionNumber: 1,
          lockVersion: 1,
          status: 'DRAFT',
          draftRevisionId: 'rev-1',
          publishedRevisionId: null,
        },
      };
      fetchResponse = { ok: true, status: 200, jsonBody: { data: mockDetail } };

      const client = createAdminPagesClient('proj-1');
      const result = await client.getPageById('p-1');

      assert.equal(lastFetchUrl, '/api/admin/projects/proj-1/pages/p-1');
      assert.deepEqual(result.page, mockDetail.page);
      assert.deepEqual(result.lifecycle, mockDetail.lifecycle);
    });
  });

  describe('CREATE DRAFT', () => {
    it('creates page draft with generated UUID key, maps visibility, and omits forbidden fields', async () => {
      const mockMutationResult = {
        pageId: 'page-123',
        revisionId: 'rev-1',
        revisionNumber: 1,
        lockVersion: 1,
        status: 'DRAFT',
      };
      fetchResponse = { ok: true, status: 201, jsonBody: { data: mockMutationResult } };

      const client = createAdminPagesClient('proj-1');
      const result = await client.createPageDraft({
        title: 'New Article',
        slug: 'new-article',
        visibility: 'Veřejná',
        description: 'An article description',
        content: {
          version: 1,
          schemaVersion: '1.0',
          blocks: [
            {
              id: 'b-1',
              type: 'paragraph',
              order: 0,
              data: { text: 'Hello' },
            },
          ],
        },
      });

      assert.equal(lastFetchUrl, '/api/admin/projects/proj-1/pages');
      assert.equal(lastFetchInit?.method, 'POST');
      assert.equal(lastFetchInit?.cache, 'no-store');
      assert.equal(lastFetchInit?.credentials, 'same-origin');

      const sentBody = JSON.parse(lastFetchInit?.body as string);
      assert.ok(typeof sentBody.key === 'string' && sentBody.key.startsWith('page_'));
      // UUID format check (length >= 36)
      assert.ok(sentBody.key.length >= 41);
      assert.equal(sentBody.title, 'New Article');
      assert.equal(sentBody.slug, 'new-article');
      assert.equal(sentBody.visibility, 'PUBLIC');
      assert.equal(sentBody.description, 'An article description');
      assert.equal(sentBody.status, undefined, 'Client must NOT send status');
      assert.equal(sentBody.actorId, undefined, 'Client must NOT send actorId');
      assert.equal(sentBody.projectId, undefined, 'Client must NOT send projectId in body');
      assert.deepEqual(result, mockMutationResult);
    });
  });

  describe('UPDATE DRAFT', () => {
    it('sends PATCH with expectedLockVersion forwarded exactly and supported fields only', async () => {
      const mockMutationResult = {
        pageId: 'page-123',
        revisionId: 'rev-1',
        revisionNumber: 1,
        lockVersion: 2,
        status: 'DRAFT',
      };
      fetchResponse = { ok: true, status: 200, jsonBody: { data: mockMutationResult } };

      const client = createAdminPagesClient('proj-1');
      const result = await client.updateDraft('page-123', 1, {
        title: 'Updated Title',
        visibility: 'Chráněná heslem',
        content: {
          version: 1,
          schemaVersion: '1.0',
          blocks: [],
        },
      });

      assert.equal(lastFetchUrl, '/api/admin/projects/proj-1/pages/page-123/draft');
      assert.equal(lastFetchInit?.method, 'PATCH');
      assert.equal(lastFetchInit?.cache, 'no-store');

      const sentBody = JSON.parse(lastFetchInit?.body as string);
      assert.equal(sentBody.expectedLockVersion, 1);
      assert.equal(sentBody.title, 'Updated Title');
      assert.equal(sentBody.visibility, 'PASSWORD_PROTECTED');
      assert.equal(sentBody.status, undefined, 'Must not send status');
      assert.equal(sentBody.parentId, undefined, 'Must not send parentId');
      assert.equal(sentBody.seo, undefined, 'Must not send seo');
      assert.equal(sentBody.navigation, undefined, 'Must not send navigation');
      assert.deepEqual(result, mockMutationResult);
    });
  });

  describe('EXPLICIT LIFECYCLE ACTIONS', () => {
    it('submitForReview calls correct route with expectedLockVersion', async () => {
      fetchResponse = {
        ok: true,
        status: 200,
        jsonBody: {
          data: {
            pageId: 'p-1',
            revisionId: 'r-1',
            revisionNumber: 1,
            lockVersion: 2,
            status: 'IN_REVIEW',
          },
        },
      };

      const client = createAdminPagesClient('proj-1');
      const result = await client.submitForReview('p-1', 1);

      assert.equal(lastFetchUrl, '/api/admin/projects/proj-1/pages/p-1/actions/submit-review');
      assert.equal(lastFetchInit?.method, 'POST');
      assert.deepEqual(JSON.parse(lastFetchInit?.body as string), { expectedLockVersion: 1 });
      assert.equal(result.status, 'IN_REVIEW');
    });

    it('requestChanges calls correct route with expectedLockVersion', async () => {
      fetchResponse = {
        ok: true,
        status: 200,
        jsonBody: {
          data: {
            pageId: 'p-1',
            reviewRevisionId: 'r-1',
            draft: {
              revisionId: 'r-2',
              revisionNumber: 2,
              lockVersion: 1,
              status: 'DRAFT',
              derivedFromRevisionId: 'r-1',
            },
          },
        },
      };

      const client = createAdminPagesClient('proj-1');
      const result = await client.requestChanges('p-1', 2);

      assert.equal(lastFetchUrl, '/api/admin/projects/proj-1/pages/p-1/actions/request-changes');
      assert.equal(lastFetchInit?.method, 'POST');
      assert.deepEqual(JSON.parse(lastFetchInit?.body as string), { expectedLockVersion: 2 });
      assert.equal(result.draft.status, 'DRAFT');
    });

    it('approveReview calls correct route with expectedLockVersion', async () => {
      fetchResponse = {
        ok: true,
        status: 200,
        jsonBody: {
          data: {
            pageId: 'p-1',
            revisionId: 'r-1',
            revisionNumber: 1,
            lockVersion: 3,
            status: 'APPROVED',
          },
        },
      };

      const client = createAdminPagesClient('proj-1');
      const result = await client.approveReview('p-1', 2);

      assert.equal(lastFetchUrl, '/api/admin/projects/proj-1/pages/p-1/actions/approve');
      assert.equal(lastFetchInit?.method, 'POST');
      assert.deepEqual(JSON.parse(lastFetchInit?.body as string), { expectedLockVersion: 2 });
      assert.equal(result.status, 'APPROVED');
    });

    it('publishApproved calls correct route with expectedLockVersion', async () => {
      fetchResponse = {
        ok: true,
        status: 200,
        jsonBody: {
          data: {
            pageId: 'p-1',
            revisionId: 'r-1',
            revisionNumber: 1,
            lockVersion: 4,
            status: 'PUBLISHED',
            releaseId: 'rel-1',
          },
        },
      };

      const client = createAdminPagesClient('proj-1');
      const result = await client.publishApproved('p-1', 3);

      assert.equal(lastFetchUrl, '/api/admin/projects/proj-1/pages/p-1/actions/publish');
      assert.equal(lastFetchInit?.method, 'POST');
      assert.deepEqual(JSON.parse(lastFetchInit?.body as string), { expectedLockVersion: 3 });
      assert.equal(result.status, 'PUBLISHED');
      assert.equal(result.releaseId, 'rel-1');
    });

    it('rollbackPublished calls correct route with expectedPublishedRevisionId', async () => {
      fetchResponse = {
        ok: true,
        status: 200,
        jsonBody: {
          data: {
            pageId: 'p-1',
            fromRevisionId: 'r-2',
            restoredRevisionId: 'r-1',
            restoredRevisionNumber: 1,
            status: 'PUBLISHED',
            rollbackReleaseId: 'rel-2',
          },
        },
      };

      const client = createAdminPagesClient('proj-1');
      const result = await client.rollbackPublished('p-1', 'r-2');

      assert.equal(lastFetchUrl, '/api/admin/projects/proj-1/pages/p-1/actions/rollback');
      assert.equal(lastFetchInit?.method, 'POST');
      assert.deepEqual(JSON.parse(lastFetchInit?.body as string), {
        expectedPublishedRevisionId: 'r-2',
      });
      assert.equal(result.restoredRevisionId, 'r-1');
    });

    it('reopenDraft calls correct route with expectedPublishedRevisionId', async () => {
      fetchResponse = {
        ok: true,
        status: 200,
        jsonBody: {
          data: {
            pageId: 'p-1',
            publishedRevisionId: 'r-1',
            draft: {
              revisionId: 'r-2',
              revisionNumber: 2,
              lockVersion: 1,
              status: 'DRAFT',
              derivedFromRevisionId: 'r-1',
            },
          },
        },
      };

      const client = createAdminPagesClient('proj-1');
      const result = await client.reopenDraft('p-1', 'r-1');

      assert.equal(lastFetchUrl, '/api/admin/projects/proj-1/pages/p-1/actions/reopen-draft');
      assert.equal(lastFetchInit?.method, 'POST');
      assert.deepEqual(JSON.parse(lastFetchInit?.body as string), {
        expectedPublishedRevisionId: 'r-1',
      });
      assert.equal(result.draft.status, 'DRAFT');
    });
  });

  describe('HTTP & ERROR PARSING', () => {
    it('surfaces 401 UNAUTHENTICATED as typed error', async () => {
      fetchResponse = {
        ok: false,
        status: 401,
        jsonBody: { error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } },
      };

      const client = createAdminPagesClient('proj-1');
      await assert.rejects(
        async () => client.getPages(),
        (err: any) =>
          err instanceof PagesApiClientError &&
          err.code === 'UNAUTHENTICATED' &&
          err.status === 401
      );
    });

    it('surfaces 403 FORBIDDEN as typed error', async () => {
      fetchResponse = {
        ok: false,
        status: 403,
        jsonBody: { error: { code: 'FORBIDDEN', message: 'Forbidden' } },
      };

      const client = createAdminPagesClient('proj-1');
      await assert.rejects(
        async () => client.getPageById('p-1'),
        (err: any) =>
          err instanceof PagesApiClientError &&
          err.code === 'FORBIDDEN' &&
          err.status === 403
      );
    });

    it('surfaces 404 PAGE_NOT_FOUND as typed error', async () => {
      fetchResponse = {
        ok: false,
        status: 404,
        jsonBody: { error: { code: 'PAGE_NOT_FOUND', message: 'Page not found' } },
      };

      const client = createAdminPagesClient('proj-1');
      await assert.rejects(
        async () => client.getPageById('nonexistent'),
        (err: any) =>
          err instanceof PagesApiClientError &&
          err.code === 'PAGE_NOT_FOUND' &&
          err.status === 404
      );
    });

    it('preserves 409 LOCK_CONFLICT unchanged as typed error', async () => {
      fetchResponse = {
        ok: false,
        status: 409,
        jsonBody: {
          error: {
            code: 'LOCK_CONFLICT',
            message: 'Lock conflict: resource has been modified',
          },
        },
      };

      const client = createAdminPagesClient('proj-1');
      await assert.rejects(
        async () => client.updateDraft('p-1', 1, { title: 'New' }),
        (err: any) =>
          err instanceof PagesApiClientError &&
          err.code === 'LOCK_CONFLICT' &&
          err.status === 409
      );
    });

    it('preserves 409 ACTIVE_DRAFT_EXISTS as typed error', async () => {
      fetchResponse = {
        ok: false,
        status: 409,
        jsonBody: {
          error: {
            code: 'ACTIVE_DRAFT_EXISTS',
            message: 'Active draft already exists',
          },
        },
      };

      const client = createAdminPagesClient('proj-1');
      await assert.rejects(
        async () => client.reopenDraft('p-1', 'rev-pub'),
        (err: any) =>
          err instanceof PagesApiClientError &&
          err.code === 'ACTIVE_DRAFT_EXISTS' &&
          err.status === 409
      );
    });

    it('preserves 415 UNSUPPORTED_MEDIA_TYPE as typed error', async () => {
      fetchResponse = {
        ok: false,
        status: 415,
        jsonBody: {
          error: {
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: 'Content-Type must be application/json',
          },
        },
      };

      const client = createAdminPagesClient('proj-1');
      await assert.rejects(
        async () => client.submitForReview('p-1', 1),
        (err: any) =>
          err instanceof PagesApiClientError &&
          err.code === 'UNSUPPORTED_MEDIA_TYPE' &&
          err.status === 415
      );
    });

    it('handles malformed non-JSON response with INVALID_API_RESPONSE', async () => {
      fetchResponse = {
        ok: false,
        status: 502,
        rawText: '<html>Bad Gateway</html>',
      };

      const client = createAdminPagesClient('proj-1');
      await assert.rejects(
        async () => client.getPages(),
        (err: any) =>
          err instanceof PagesApiClientError &&
          err.code === 'INVALID_API_RESPONSE' &&
          err.status === 502
      );
    });

    it('handles network fetch errors with NETWORK_ERROR', async () => {
      global.fetch = async () => {
        throw new Error('Connection refused');
      };

      const client = createAdminPagesClient('proj-1');
      await assert.rejects(
        async () => client.getPages(),
        (err: any) =>
          err instanceof PagesApiClientError &&
          err.code === 'NETWORK_ERROR' &&
          err.message.includes('Connection refused')
      );
    });
  });

  describe('SOURCE & ARCHITECTURE INVARIANTS', () => {
    const clientDir = path.join(__dirname, '../lib/domain/pages-client');
    const files = fs.readdirSync(clientDir).filter((f) => f.endsWith('.ts'));

    it('contains ZERO references to forbidden server modules, fixtures or repositories', () => {
      for (const file of files) {
        const content = fs.readFileSync(path.join(clientDir, file), 'utf8');

        assert.doesNotMatch(content, /pagesFixture/i, `Forbidden pagesFixture in ${file}`);
        assert.doesNotMatch(content, /pagesRepository/i, `Forbidden pagesRepository in ${file}`);
        assert.doesNotMatch(content, /@prisma\/client/i, `Forbidden Prisma in ${file}`);
        assert.doesNotMatch(content, /@\/lib\/db/i, `Forbidden lib/db in ${file}`);
        assert.doesNotMatch(content, /server-only/i, `Forbidden server-only in ${file}`);
        assert.doesNotMatch(content, /lib\/auth/i, `Forbidden lib/auth in ${file}`);
        assert.doesNotMatch(content, /pages-persistence/i, `Forbidden pages-persistence in ${file}`);
        assert.doesNotMatch(content, /content\/lifecycle/i, `Forbidden lifecycle in ${file}`);
        assert.doesNotMatch(content, /setStatus/i, `Forbidden generic setStatus in ${file}`);
        assert.doesNotMatch(content, /CMS_DEV/i, `Forbidden hardcoded CMS_DEV in ${file}`);
      }
    });

    it('does not export an implicit project singleton', () => {
      const indexContent = fs.readFileSync(path.join(clientDir, 'index.ts'), 'utf8');
      assert.doesNotMatch(indexContent, /adminPagesClient\s*=/i);
      assert.doesNotMatch(indexContent, /export\s+const\s+adminPagesClient/i);
    });
  });
});
