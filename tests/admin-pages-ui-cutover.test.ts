import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createAdminPagesClient,
  PagesApiClientError,
} from '../lib/domain/pages-client';
import {
  normalizeAdminProjectId,
  withAdminProjectContext,
} from '../lib/domain/pages-client/project-context';
import {
  calculateCapabilities,
  ActorPermissions,
} from '../lib/domain/pages-persistence/mappers';
import type { PersistencePageRevision } from '../lib/domain/pages-persistence/types';
import { PageCapabilities } from '../lib/domain/pages';

describe('Admin Pages UI Cutover & Project Context Verification', () => {
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

  describe('1. PROJECT CONTEXT UTILITY', () => {
    it('normalizes valid project IDs correctly', () => {
      assert.equal(normalizeAdminProjectId('tata-ma-pravo'), 'tata-ma-pravo');
      assert.equal(normalizeAdminProjectId('  proj-123  '), 'proj-123');
      assert.equal(normalizeAdminProjectId('cms_project_1'), 'cms_project_1');
    });

    it('rejects empty, whitespace, null, or invalid project IDs', () => {
      assert.equal(normalizeAdminProjectId(null), null);
      assert.equal(normalizeAdminProjectId(undefined), null);
      assert.equal(normalizeAdminProjectId(''), null);
      assert.equal(normalizeAdminProjectId('   '), null);
      assert.equal(normalizeAdminProjectId('proj<script>'), null);
      assert.equal(normalizeAdminProjectId('proj\x00ect'), null);
    });

    it('appends ?projectId to plain paths', () => {
      assert.equal(
        withAdminProjectContext('/admin/pages', 'proj-1'),
        '/admin/pages?projectId=proj-1'
      );
      assert.equal(
        withAdminProjectContext('/admin/pages/create', 'proj-1'),
        '/admin/pages/create?projectId=proj-1'
      );
    });

    it('preserves existing query parameters when adding projectId', () => {
      assert.equal(
        withAdminProjectContext('/preview/site?path=%2Fkontakt', 'proj-1'),
        '/preview/site?path=%2Fkontakt&projectId=proj-1'
      );
      assert.equal(
        withAdminProjectContext('/admin/pages?tab=drafts', 'proj-alpha'),
        '/admin/pages?tab=drafts&projectId=proj-alpha'
      );
    });

    it('returns original path untouched if projectId is null or invalid', () => {
      assert.equal(withAdminProjectContext('/admin/pages', null), '/admin/pages');
      assert.equal(withAdminProjectContext('/admin/pages', ''), '/admin/pages');
      assert.equal(withAdminProjectContext('/admin/pages', '   '), '/admin/pages');
      assert.equal(withAdminProjectContext('/admin/pages', 'proj<bad>'), '/admin/pages');
    });
  });

  describe('2. UI CLIENT CUTOVER & HEADERS', () => {
    it('fails closed when creating client with missing or invalid project ID', () => {
      assert.throws(
        () => (createAdminPagesClient as any)(),
        (err: any) => err instanceof PagesApiClientError && err.code === 'INVALID_PROJECT_CONTEXT'
      );
      assert.throws(
        () => createAdminPagesClient(''),
        (err: any) => err instanceof PagesApiClientError && err.code === 'INVALID_PROJECT_CONTEXT'
      );
    });

    it('sends URL project path and same-origin credentials on all requests', async () => {
      const client = createAdminPagesClient('proj-99');
      fetchResponse = {
        ok: true,
        status: 200,
        jsonBody: { data: [] },
      };

      await client.getPages();

      assert.equal(lastFetchUrl, '/api/admin/projects/proj-99/pages');
      assert.equal(lastFetchInit?.credentials, 'same-origin');
      assert.equal(lastFetchInit?.cache, 'no-store');
    });

    it('optimistic locking sends expectedLockVersion in updateDraft payload', async () => {
      const client = createAdminPagesClient('proj-99');
      fetchResponse = {
        ok: true,
        status: 200,
        jsonBody: {
          data: {
            pageId: 'page-1',
            revisionId: 'rev-2',
            revisionNumber: 2,
            lockVersion: 3,
            status: 'Koncept',
          },
        },
      };

      const res = await client.updateDraft('page-1', 2, {
        title: 'Updated Title',
      });

      assert.equal(res.lockVersion, 3);
      assert.ok(lastFetchUrl?.endsWith('/pages/page-1/draft'));
      const parsedBody = JSON.parse(String(lastFetchInit?.body));
      assert.equal(parsedBody.expectedLockVersion, 2);
      assert.equal(parsedBody.title, 'Updated Title');
    });

    it('lock conflict (409) throws typed PagesApiClientError with code LOCK_CONFLICT', async () => {
      const client = createAdminPagesClient('proj-99');
      fetchResponse = {
        ok: false,
        status: 409,
        jsonBody: {
          error: {
            code: 'LOCK_CONFLICT',
            message: 'Stránka byla mezitím změněna jiným požadavkem.',
          },
        },
      };

      await assert.rejects(
        async () => client.updateDraft('page-1', 1, { title: 'Test' }),
        (err: any) =>
          err instanceof PagesApiClientError &&
          err.code === 'LOCK_CONFLICT' &&
          err.status === 409
      );
    });
  });

  describe('3. LIFECYCLE ACTIONS API CUTOVER', () => {
    it('review submit sends correct expectedLockVersion to /actions/submit-review', async () => {
      const client = createAdminPagesClient('proj-alpha');
      fetchResponse = {
        ok: true,
        status: 200,
        jsonBody: {
          data: {
            pageId: 'page-1',
            status: 'Ke kontrole',
            lockVersion: 4,
          },
        },
      };

      const res = await client.submitForReview('page-1', 3);
      assert.equal(res.status, 'Ke kontrole');
      assert.ok(lastFetchUrl?.endsWith('/pages/page-1/actions/submit-review'));
      const parsedBody = JSON.parse(String(lastFetchInit?.body));
      assert.equal(parsedBody.expectedLockVersion, 3);
    });

    it('review approve sends correct expectedLockVersion to /actions/approve', async () => {
      const client = createAdminPagesClient('proj-alpha');
      fetchResponse = {
        ok: true,
        status: 200,
        jsonBody: {
          data: {
            pageId: 'page-1',
            status: 'Schváleno',
            lockVersion: 5,
          },
        },
      };

      const res = await client.approveReview('page-1', 4);
      assert.equal(res.status, 'Schváleno');
      assert.ok(lastFetchUrl?.endsWith('/pages/page-1/actions/approve'));
      const parsedBody = JSON.parse(String(lastFetchInit?.body));
      assert.equal(parsedBody.expectedLockVersion, 4);
    });

    it('request changes sends correct expectedLockVersion to /actions/request-changes', async () => {
      const client = createAdminPagesClient('proj-alpha');
      fetchResponse = {
        ok: true,
        status: 200,
        jsonBody: {
          data: {
            pageId: 'page-1',
            reviewRevisionId: 'rev-review-1',
            draft: {
              revisionId: 'rev-draft-1',
              revisionNumber: 1,
              lockVersion: 5,
              status: 'DRAFT',
            },
          },
        },
      };

      const res = await client.requestChanges('page-1', 4);
      assert.equal(res.draft.status, 'DRAFT');
      assert.ok(lastFetchUrl?.endsWith('/pages/page-1/actions/request-changes'));
      const parsedBody = JSON.parse(String(lastFetchInit?.body));
      assert.equal(parsedBody.expectedLockVersion, 4);
    });

    it('publish sends correct expectedLockVersion to /actions/publish', async () => {
      const client = createAdminPagesClient('proj-alpha');
      fetchResponse = {
        ok: true,
        status: 200,
        jsonBody: {
          data: {
            pageId: 'page-1',
            status: 'Publikováno',
            lockVersion: 6,
            publishedRevisionId: 'rev-published-1',
          },
        },
      };

      const res = await client.publishApproved('page-1', 5);
      assert.equal(res.status, 'Publikováno');
      assert.ok(lastFetchUrl?.endsWith('/pages/page-1/actions/publish'));
      const parsedBody = JSON.parse(String(lastFetchInit?.body));
      assert.equal(parsedBody.expectedLockVersion, 5);
    });

    it('reopen draft sends expectedPublishedRevisionId to /actions/reopen-draft', async () => {
      const client = createAdminPagesClient('proj-alpha');
      fetchResponse = {
        ok: true,
        status: 200,
        jsonBody: {
          data: {
            pageId: 'page-1',
            publishedRevisionId: 'rev-published-1',
            draft: {
              revisionId: 'rev-draft-new',
              revisionNumber: 2,
              lockVersion: 7,
              status: 'DRAFT',
              derivedFromRevisionId: 'rev-published-1',
            },
          },
        },
      };

      const res = await client.reopenDraft('page-1', 'rev-published-1');
      assert.equal(res.draft.status, 'DRAFT');
      assert.ok(lastFetchUrl?.endsWith('/pages/page-1/actions/reopen-draft'));
      const parsedBody = JSON.parse(String(lastFetchInit?.body));
      assert.equal(parsedBody.expectedPublishedRevisionId, 'rev-published-1');
    });

    it('rollback sends expectedPublishedRevisionId to /actions/rollback', async () => {
      const client = createAdminPagesClient('proj-alpha');
      fetchResponse = {
        ok: true,
        status: 200,
        jsonBody: {
          data: {
            pageId: 'page-1',
            status: 'Publikováno',
            lockVersion: 8,
            publishedRevisionId: 'rev-target-1',
          },
        },
      };

      const res = await client.rollbackPublished('page-1', 'rev-target-1');
      assert.equal(res.status, 'Publikováno');
      assert.ok(lastFetchUrl?.endsWith('/pages/page-1/actions/rollback'));
      const parsedBody = JSON.parse(String(lastFetchInit?.body));
      assert.equal(parsedBody.expectedPublishedRevisionId, 'rev-target-1');
    });
  });

  describe('4. CAPABILITY MODEL & UI ZERO-FIXTURE INVARIANT', () => {
    it('correctly maps record states and permissions to PageCapabilities', () => {
      const mockRevisionDraft = {
        id: 'rev-1',
        pageId: 'p-1',
        revisionNumber: 1,
        status: 'DRAFT',
        title: 'Title',
        slug: 'slug',
        locale: 'cs',
        description: null,
        visibility: 'PUBLIC',
        content: {},
        seo: {},
        navigation: {},
        schemaVersion: '1.0',
        lockVersion: 1,
        createdById: 'u-1',
        createdAt: new Date(),
        submittedAt: null,
        approvedAt: null,
        publishedAt: null,
        derivedFromRevisionId: null,
      } as PersistencePageRevision;

      const adminPerms: ActorPermissions = {
        canView: true,
        canEdit: true,
        canPublish: true,
        canReview: true,
        canApprove: true,
        canRollback: true,
      };

      const authorPerms: ActorPermissions = {
        canView: true,
        canEdit: true,
        canPublish: false,
        canReview: false,
        canApprove: false,
        canRollback: false,
      };

      const adminCaps = calculateCapabilities(adminPerms, mockRevisionDraft);
      assert.equal(adminCaps.canEdit, true);
      assert.equal(adminCaps.canSubmitReview, true);
      assert.equal(adminCaps.canReview, false); // cannot review draft, only in_review
      assert.equal(adminCaps.canApprove, false);
      assert.equal(adminCaps.canPublish, false); // cannot publish directly from draft without approved

      const authorCaps = calculateCapabilities(authorPerms, mockRevisionDraft);
      assert.equal(authorCaps.canEdit, true);
      assert.equal(authorCaps.canSubmitReview, true);
      assert.equal(authorCaps.canPublish, false);
      assert.equal(authorCaps.canReview, false);

      const mockRevisionInReview: PersistencePageRevision = {
        ...mockRevisionDraft,
        status: 'IN_REVIEW',
      };

      const reviewerCaps = calculateCapabilities(adminPerms, mockRevisionInReview);
      assert.equal(reviewerCaps.canReview, true);
      assert.equal(reviewerCaps.canApprove, true);
      assert.equal(reviewerCaps.canSubmitReview, false);

      const mockRevisionApproved: PersistencePageRevision = {
        ...mockRevisionDraft,
        status: 'APPROVED',
      };

      const publisherCaps = calculateCapabilities(adminPerms, mockRevisionApproved);
      assert.equal(publisherCaps.canPublish, true);
      assert.equal(publisherCaps.canReview, false);
      assert.equal(publisherCaps.canApprove, false);

      const mockRevisionPublished: PersistencePageRevision = {
        ...mockRevisionDraft,
        status: 'PUBLISHED',
      };

      const rollbackCaps = calculateCapabilities(adminPerms, mockRevisionPublished);
      assert.equal(rollbackCaps.canRollback, true);
      assert.equal(rollbackCaps.canReopenDraft, true);
      assert.equal(rollbackCaps.canEdit, false);
    });

    it('guarantees runtime admin components have ZERO references to pagesRepository or pagesFixture', () => {
      const adminPagesDir = path.resolve(__dirname, '../components/admin/pages');
      const adminComposerDir = path.resolve(__dirname, '../components/admin/composer');
      const appAdminPagesDir = path.resolve(__dirname, '../app/admin/pages');

      const dirsToScan = [adminPagesDir, adminComposerDir, appAdminPagesDir];

      for (const dir of dirsToScan) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir, { recursive: true }) as string[];
        for (const file of files) {
          if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
          const fullPath = path.join(dir, file);
          const content = fs.readFileSync(fullPath, 'utf8');

          assert.ok(
            !content.includes('pagesRepository'),
            `Forbidden reference to pagesRepository found in runtime component: ${fullPath}`
          );
          assert.ok(
            !content.includes('pagesFixture'),
            `Forbidden reference to pagesFixture found in runtime component: ${fullPath}`
          );
        }
      }
    });
  });
});
