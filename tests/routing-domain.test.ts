import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { RoutingService, RoutingError, PageWithPublishedRevision } from '../lib/domain/routing/service';
import { RedirectService } from '../lib/domain/redirects/service';
import { prisma } from '../lib/db';
import { RedirectType } from '@prisma/client';

function createMockPage(overrides: Partial<PageWithPublishedRevision> = {}): PageWithPublishedRevision {
  const id = overrides.id || 'page-1';
  const publishedRevId =
    overrides.publishedRevisionId !== undefined
      ? overrides.publishedRevisionId
      : (overrides.publishedRevision?.id ?? 'rev-1');
  const slug = overrides.publishedRevision?.slug ?? 'page-slug';
  const visibility = overrides.publishedRevision?.visibility ?? 'PUBLIC';
  const status = overrides.publishedRevision?.status ?? 'PUBLISHED';
  const content = overrides.publishedRevision?.content ?? { version: 1, schemaVersion: '1.0', blocks: [] };

  const publishedRev = publishedRevId ? {
    id: publishedRevId,
    pageId: id,
    revisionNumber: 1,
    status,
    title: 'Test Page',
    slug,
    locale: 'cs',
    description: null,
    visibility,
    content,
    seo: { metaTitle: 'Test SEO', metaDescription: 'Desc', canonicalUrl: `/${slug}`, noIndex: false },
    navigation: {},
    schemaVersion: '1.0.0',
    ...(overrides.publishedRevision || {})
  } : null;

  return {
    id,
    projectId: overrides.projectId || 'proj-test',
    key: overrides.key || `key-${id}`,
    parentId: overrides.parentId ?? null,
    sortOrder: overrides.sortOrder ?? 0,
    draftRevisionId: overrides.draftRevisionId ?? null,
    publishedRevisionId: publishedRevId,
    publishedRevision: publishedRev,
    ...overrides,
  };
}

describe('Routing Domain Service (SYN-WEB-002)', () => {
  const projectId = 'proj-routing-test';

  beforeEach(() => {
    (prisma as any).page = {
      findMany: mock.fn(async () => []),
      findFirst: mock.fn(async () => null),
    };
    (prisma as any).redirectRule = {
      findFirst: mock.fn(async () => null),
      findMany: mock.fn(async () => []),
    };
    (prisma as any).projectSeoSettings = { findUnique: mock.fn(async () => null) };
  });

  afterEach(() => {
    if ((prisma as any).page?.findMany?.mock) (prisma as any).page.findMany.mock.resetCalls();
    if ((prisma as any).page?.findFirst?.mock) (prisma as any).page.findFirst.mock.resetCalls();
    if ((prisma as any).redirectRule?.findFirst?.mock) (prisma as any).redirectRule.findFirst.mock.resetCalls();
    if ((prisma as any).redirectRule?.findMany?.mock) (prisma as any).redirectRule.findMany.mock.resetCalls();
  });

  it('root published route resolves cleanly', () => {
    const rootPage = createMockPage({
      id: 'root-1',
      projectId,
      parentId: null,
      publishedRevision: {
        id: 'rev-root',
        pageId: 'root-1',
        revisionNumber: 1,
        status: 'PUBLISHED',
        title: 'Home',
        slug: '',
        locale: 'cs',
        description: null,
        visibility: 'PUBLIC',
        content: { version: 1, schemaVersion: '1.0', blocks: [] },
        seo: null,
        navigation: null,
        schemaVersion: '1.0.0'
      }
    });

    const result = RoutingService.derivePublishedRoutesFromPages(projectId, [rootPage]);
    assert.strictEqual(result.resolvableRoutes.size, 1);
    assert.ok(result.resolvableRoutes.has('/'));
    assert.strictEqual(result.resolvableRoutes.get('/')?.pageId, 'root-1');
  });

  it('nested route hierarchy derives correct full paths', () => {
    const p1 = createMockPage({ id: 'p1', projectId, parentId: null, publishedRevision: { id: 'r1', pageId: 'p1', revisionNumber: 1, status: 'PUBLISHED', title: 'Docs', slug: 'docs', locale: 'cs', description: null, visibility: 'PUBLIC', content: { version: 1, schemaVersion: '1.0', blocks: [] }, seo: null, navigation: null, schemaVersion: '1.0.0' } });
    const p2 = createMockPage({ id: 'p2', projectId, parentId: 'p1', publishedRevision: { id: 'r2', pageId: 'p2', revisionNumber: 1, status: 'PUBLISHED', title: 'API', slug: 'api-guide', locale: 'cs', description: null, visibility: 'PUBLIC', content: { version: 1, schemaVersion: '1.0', blocks: [] }, seo: null, navigation: null, schemaVersion: '1.0.0' } });
    const p3 = createMockPage({ id: 'p3', projectId, parentId: 'p2', publishedRevision: { id: 'r3', pageId: 'p3', revisionNumber: 1, status: 'PUBLISHED', title: 'Auth', slug: 'auth-tokens', locale: 'cs', description: null, visibility: 'PUBLIC', content: { version: 1, schemaVersion: '1.0', blocks: [] }, seo: null, navigation: null, schemaVersion: '1.0.0' } });

    const result = RoutingService.derivePublishedRoutesFromPages(projectId, [p1, p2, p3]);
    assert.ok(result.resolvableRoutes.has('/docs'));
    assert.ok(result.resolvableRoutes.has('/docs/api-guide'));
    assert.ok(result.resolvableRoutes.has('/docs/api-guide/auth-tokens'));
  });

  it('publishedRevisionId is the live authority and draftRevisionId never becomes public authority', () => {
    const pageWithDraft = createMockPage({
      id: 'p1',
      projectId,
      publishedRevisionId: 'rev-published',
      draftRevisionId: 'rev-draft-new',
      publishedRevision: {
        id: 'rev-published',
        pageId: 'p1',
        revisionNumber: 1,
        status: 'PUBLISHED',
        title: 'Live Published Title',
        slug: 'live-page',
        locale: 'cs',
        description: null,
        visibility: 'PUBLIC',
        content: { version: 1, schemaVersion: '1.0', blocks: [] },
        seo: null,
        navigation: null,
        schemaVersion: '1.0.0'
      }
    });

    const result = RoutingService.derivePublishedRoutesFromPages(projectId, [pageWithDraft]);
    assert.ok(result.resolvableRoutes.has('/live-page'));
    assert.strictEqual(result.resolvableRoutes.get('/live-page')?.publishedRevisionId, 'rev-published');

    // Page with only draftRevisionId and no publishedRevisionId must not resolve
    const draftOnlyPage = createMockPage({
      id: 'p2',
      projectId,
      publishedRevisionId: null,
      draftRevisionId: 'rev-draft-only',
      publishedRevision: null
    });

    const draftResult = RoutingService.derivePublishedRoutesFromPages(projectId, [draftOnlyPage]);
    assert.strictEqual(draftResult.resolvableRoutes.size, 0);
  });

  it('invalid published pointer fails closed', () => {
    // Missing publishedRevision object
    const missingRevPage = createMockPage({
      id: 'p1',
      projectId,
      publishedRevisionId: 'rev-1',
      publishedRevision: null
    });
    assert.throws(
      () => RoutingService.derivePublishedRoutesFromPages(projectId, [missingRevPage]),
      (err: any) => err instanceof RoutingError && err.code === 'POINTER_INTEGRITY_VIOLATION'
    );

    // Mismatched revision id
    const mismatchIdPage = createMockPage({
      id: 'p2',
      projectId,
      publishedRevisionId: 'rev-expected',
      publishedRevision: {
        id: 'rev-different',
        pageId: 'p2',
        revisionNumber: 1,
        status: 'PUBLISHED',
        title: 'Title',
        slug: 'test',
        locale: 'cs',
        description: null,
        visibility: 'PUBLIC',
        content: { version: 1, schemaVersion: '1.0', blocks: [] },
        seo: null,
        navigation: null,
        schemaVersion: '1.0.0'
      }
    });
    assert.throws(
      () => RoutingService.derivePublishedRoutesFromPages(projectId, [mismatchIdPage]),
      (err: any) => err instanceof RoutingError && err.code === 'POINTER_INTEGRITY_VIOLATION'
    );

    // Mismatched pageId in revision
    const mismatchPageId = createMockPage({
      id: 'p3',
      projectId,
      publishedRevisionId: 'rev-3',
      publishedRevision: {
        id: 'rev-3',
        pageId: 'other-page-id',
        revisionNumber: 1,
        status: 'PUBLISHED',
        title: 'Title',
        slug: 'test',
        locale: 'cs',
        description: null,
        visibility: 'PUBLIC',
        content: { version: 1, schemaVersion: '1.0', blocks: [] },
        seo: null,
        navigation: null,
        schemaVersion: '1.0.0'
      }
    });
    assert.throws(
      () => RoutingService.derivePublishedRoutesFromPages(projectId, [mismatchPageId]),
      (err: any) => err instanceof RoutingError && err.code === 'POINTER_INTEGRITY_VIOLATION'
    );
  });

  it('non-PUBLISHED pointed revision fails closed', () => {
    const draftStatusPage = createMockPage({
      id: 'p1',
      projectId,
      publishedRevisionId: 'rev-1',
      publishedRevision: {
        id: 'rev-1',
        pageId: 'p1',
        revisionNumber: 1,
        status: 'DRAFT',
        title: 'Draft',
        slug: 'draft-slug',
        locale: 'cs',
        description: null,
        visibility: 'PUBLIC',
        content: { version: 1, schemaVersion: '1.0', blocks: [] },
        seo: null,
        navigation: null,
        schemaVersion: '1.0.0'
      }
    });

    assert.throws(
      () => RoutingService.derivePublishedRoutesFromPages(projectId, [draftStatusPage]),
      (err: any) => err instanceof RoutingError && err.code === 'POINTER_INTEGRITY_VIOLATION'
    );
  });

  it('PUBLIC and UNLISTED resolve; INTERNAL and PASSWORD_PROTECTED do not resolve', () => {
    const publicPage = createMockPage({ id: 'pub', projectId, publishedRevision: { id: 'r-pub', pageId: 'pub', revisionNumber: 1, status: 'PUBLISHED', title: 'Public', slug: 'pub-page', locale: 'cs', description: null, visibility: 'PUBLIC', content: { version: 1, schemaVersion: '1.0', blocks: [] }, seo: null, navigation: null, schemaVersion: '1.0.0' } });
    const unlistedPage = createMockPage({ id: 'unl', projectId, publishedRevision: { id: 'r-unl', pageId: 'unl', revisionNumber: 1, status: 'PUBLISHED', title: 'Unlisted', slug: 'unl-page', locale: 'cs', description: null, visibility: 'UNLISTED', content: { version: 1, schemaVersion: '1.0', blocks: [] }, seo: null, navigation: null, schemaVersion: '1.0.0' } });
    const internalPage = createMockPage({ id: 'int', projectId, publishedRevision: { id: 'r-int', pageId: 'int', revisionNumber: 1, status: 'PUBLISHED', title: 'Internal', slug: 'int-page', locale: 'cs', description: null, visibility: 'INTERNAL', content: { version: 1, schemaVersion: '1.0', blocks: [] }, seo: null, navigation: null, schemaVersion: '1.0.0' } });
    const pwPage = createMockPage({ id: 'pw', projectId, publishedRevision: { id: 'r-pw', pageId: 'pw', revisionNumber: 1, status: 'PUBLISHED', title: 'Password', slug: 'pw-page', locale: 'cs', description: null, visibility: 'PASSWORD_PROTECTED', content: { version: 1, schemaVersion: '1.0', blocks: [] }, seo: null, navigation: null, schemaVersion: '1.0.0' } });

    const result = RoutingService.derivePublishedRoutesFromPages(projectId, [publicPage, unlistedPage, internalPage, pwPage]);

    assert.ok(result.resolvableRoutes.has('/pub-page'));
    assert.ok(result.resolvableRoutes.has('/unl-page'));
    assert.ok(!result.resolvableRoutes.has('/int-page'));
    assert.ok(!result.resolvableRoutes.has('/pw-page'));
  });

  it('child under non-public ancestor does not resolve publicly', () => {
    const parentInternal = createMockPage({ id: 'parent-int', projectId, parentId: null, publishedRevision: { id: 'r-p', pageId: 'parent-int', revisionNumber: 1, status: 'PUBLISHED', title: 'Internal Parent', slug: 'internal-area', locale: 'cs', description: null, visibility: 'INTERNAL', content: { version: 1, schemaVersion: '1.0', blocks: [] }, seo: null, navigation: null, schemaVersion: '1.0.0' } });
    const childPublic = createMockPage({ id: 'child-pub', projectId, parentId: 'parent-int', publishedRevision: { id: 'r-c', pageId: 'child-pub', revisionNumber: 1, status: 'PUBLISHED', title: 'Public Child', slug: 'sub-feature', locale: 'cs', description: null, visibility: 'PUBLIC', content: { version: 1, schemaVersion: '1.0', blocks: [] }, seo: null, navigation: null, schemaVersion: '1.0.0' } });

    const result = RoutingService.derivePublishedRoutesFromPages(projectId, [parentInternal, childPublic]);
    assert.ok(!result.resolvableRoutes.has('/internal-area'));
    assert.ok(!result.resolvableRoutes.has('/internal-area/sub-feature'));
  });

  it('missing parent fails closed', () => {
    const orphanChild = createMockPage({
      id: 'child-orphan',
      projectId,
      parentId: 'missing-parent-id',
      publishedRevision: {
        id: 'r-orphan',
        pageId: 'child-orphan',
        revisionNumber: 1,
        status: 'PUBLISHED',
        title: 'Orphan',
        slug: 'orphan',
        locale: 'cs',
        description: null,
        visibility: 'PUBLIC',
        content: { version: 1, schemaVersion: '1.0', blocks: [] },
        seo: null,
        navigation: null,
        schemaVersion: '1.0.0'
      }
    });

    assert.throws(
      () => RoutingService.derivePublishedRoutesFromPages(projectId, [orphanChild]),
      (err: any) => err instanceof RoutingError && err.code === 'PARENT_NOT_FOUND'
    );
  });

  it('cross-project parent fails closed', () => {
    const parentOtherProject = createMockPage({
      id: 'parent-foreign',
      projectId: 'other-project',
      parentId: null,
      publishedRevision: {
        id: 'r-fp',
        pageId: 'parent-foreign',
        revisionNumber: 1,
        status: 'PUBLISHED',
        title: 'Foreign Parent',
        slug: 'foreign',
        locale: 'cs',
        description: null,
        visibility: 'PUBLIC',
        content: { version: 1, schemaVersion: '1.0', blocks: [] },
        seo: null,
        navigation: null,
        schemaVersion: '1.0.0'
      }
    });

    const childInProject = createMockPage({
      id: 'child-local',
      projectId,
      parentId: 'parent-foreign',
      publishedRevision: {
        id: 'r-cl',
        pageId: 'child-local',
        revisionNumber: 1,
        status: 'PUBLISHED',
        title: 'Local Child',
        slug: 'child',
        locale: 'cs',
        description: null,
        visibility: 'PUBLIC',
        content: { version: 1, schemaVersion: '1.0', blocks: [] },
        seo: null,
        navigation: null,
        schemaVersion: '1.0.0'
      }
    });

    assert.throws(
      () => RoutingService.derivePublishedRoutesFromPages(projectId, [parentOtherProject, childInProject]),
      (err: any) => err instanceof RoutingError && err.code === 'CROSS_PROJECT_PARENT'
    );
  });

  it('hierarchy cycle fails closed', () => {
    const pageA = createMockPage({ id: 'pageA', projectId, parentId: 'pageB', publishedRevision: { id: 'rA', pageId: 'pageA', revisionNumber: 1, status: 'PUBLISHED', title: 'A', slug: 'a', locale: 'cs', description: null, visibility: 'PUBLIC', content: { version: 1, schemaVersion: '1.0', blocks: [] }, seo: null, navigation: null, schemaVersion: '1.0.0' } });
    const pageB = createMockPage({ id: 'pageB', projectId, parentId: 'pageA', publishedRevision: { id: 'rB', pageId: 'pageB', revisionNumber: 1, status: 'PUBLISHED', title: 'B', slug: 'b', locale: 'cs', description: null, visibility: 'PUBLIC', content: { version: 1, schemaVersion: '1.0', blocks: [] }, seo: null, navigation: null, schemaVersion: '1.0.0' } });

    assert.throws(
      () => RoutingService.derivePublishedRoutesFromPages(projectId, [pageA, pageB]),
      (err: any) => err instanceof RoutingError && err.code === 'HIERARCHY_CYCLE_DETECTED'
    );
  });

  it('maximum hierarchy depth enforcement (depth > 32 throws)', () => {
    const pages: PageWithPublishedRevision[] = [];
    for (let i = 0; i <= 34; i++) {
      pages.push(
        createMockPage({
          id: `p-${i}`,
          projectId,
          parentId: i === 0 ? null : `p-${i - 1}`,
          publishedRevision: {
            id: `r-${i}`,
            pageId: `p-${i}`,
            revisionNumber: 1,
            status: 'PUBLISHED',
            title: `Page ${i}`,
            slug: `level-${i}`,
            locale: 'cs',
            description: null,
            visibility: 'PUBLIC',
            content: { version: 1, schemaVersion: '1.0', blocks: [] },
            seo: null,
            navigation: null,
            schemaVersion: '1.0.0'
          }
        })
      );
    }

    assert.throws(
      () => RoutingService.derivePublishedRoutesFromPages(projectId, pages),
      (err: any) => err instanceof RoutingError && err.code === 'HIERARCHY_DEPTH_EXCEEDED'
    );
  });

  it('duplicate published path fails closed', () => {
    const page1 = createMockPage({ id: 'p1', projectId, parentId: null, publishedRevision: { id: 'r1', pageId: 'p1', revisionNumber: 1, status: 'PUBLISHED', title: 'First About', slug: 'about', locale: 'cs', description: null, visibility: 'PUBLIC', content: { version: 1, schemaVersion: '1.0', blocks: [] }, seo: null, navigation: null, schemaVersion: '1.0.0' } });
    const page2 = createMockPage({ id: 'p2', projectId, parentId: null, publishedRevision: { id: 'r2', pageId: 'p2', revisionNumber: 1, status: 'PUBLISHED', title: 'Second About', slug: 'about', locale: 'cs', description: null, visibility: 'PUBLIC', content: { version: 1, schemaVersion: '1.0', blocks: [] }, seo: null, navigation: null, schemaVersion: '1.0.0' } });

    const result = RoutingService.derivePublishedRoutesFromPages(projectId, [page1, page2]);
    assert.ok(result.duplicatePaths.has('/about'));
    assert.ok(!result.resolvableRoutes.has('/about'));
  });

  it('reserved /admin, /api, /_next paths do not resolve publicly', () => {
    const adminPage = createMockPage({ id: 'p-adm', projectId, parentId: null, publishedRevision: { id: 'r-adm', pageId: 'p-adm', revisionNumber: 1, status: 'PUBLISHED', title: 'Admin', slug: 'admin', locale: 'cs', description: null, visibility: 'PUBLIC', content: { version: 1, schemaVersion: '1.0', blocks: [] }, seo: null, navigation: null, schemaVersion: '1.0.0' } });
    const apiPage = createMockPage({ id: 'p-api', projectId, parentId: null, publishedRevision: { id: 'r-api', pageId: 'p-api', revisionNumber: 1, status: 'PUBLISHED', title: 'API', slug: 'api', locale: 'cs', description: null, visibility: 'PUBLIC', content: { version: 1, schemaVersion: '1.0', blocks: [] }, seo: null, navigation: null, schemaVersion: '1.0.0' } });
    const nextSub = createMockPage({ id: 'p-nxt', projectId, parentId: null, publishedRevision: { id: 'r-nxt', pageId: 'p-nxt', revisionNumber: 1, status: 'PUBLISHED', title: 'Next Static', slug: '_next', locale: 'cs', description: null, visibility: 'PUBLIC', content: { version: 1, schemaVersion: '1.0', blocks: [] }, seo: null, navigation: null, schemaVersion: '1.0.0' } });

    const result = RoutingService.derivePublishedRoutesFromPages(projectId, [adminPage, apiPage, nextSub]);
    assert.ok(!result.resolvableRoutes.has('/admin'));
    assert.ok(!result.resolvableRoutes.has('/api'));
    assert.ok(!result.resolvableRoutes.has('/_next'));
  });

  it('query and fragment do not change pathname lookup in resolvePublishedRoute', async () => {
    const page = createMockPage({
      id: 'target-page',
      projectId,
      parentId: null,
      publishedRevision: {
        id: 'rev-target',
        pageId: 'target-page',
        revisionNumber: 1,
        status: 'PUBLISHED',
        title: 'Target Page',
        slug: 'target',
        locale: 'cs',
        description: 'Test description',
        visibility: 'PUBLIC',
        content: { version: 1, schemaVersion: '1.0', blocks: [] },
        seo: { metaTitle: 'SEO Title', metaDescription: 'Desc', canonicalUrl: '/target', noIndex: false },
        navigation: {},
        schemaVersion: '1.0.0'
      }
    });

    (prisma.page.findMany as any).mock.mockImplementation(async () => [page]);

    const res1 = await RoutingService.resolvePublishedRoute(projectId, '/target');
    const res2 = await RoutingService.resolvePublishedRoute(projectId, '/target?tracking=1&source=google#anchor');

    assert.ok(res1 !== null);
    assert.ok(res2 !== null);
    assert.strictEqual(res1?.path, '/target');
    assert.strictEqual(res2?.path, '/target');
    assert.strictEqual(res1?.pageId, res2?.pageId);
  });

  it('fail-closed: resolvePublishedRoute returns null when page content validation fails', async () => {
    const pageWithCorruptedContent = createMockPage({
      id: 'bad-content-page',
      projectId,
      parentId: null,
      publishedRevision: {
        id: 'rev-bad-content',
        pageId: 'bad-content-page',
        revisionNumber: 1,
        status: 'PUBLISHED',
        title: 'Bad Content',
        slug: 'bad-content',
        locale: 'cs',
        description: null,
        visibility: 'PUBLIC',
        content: {
          version: 1,
          schemaVersion: '1.0',
          blocks: [
            {
              id: 'block-1',
              type: 'invalid_type_not_allowed', // Invalid block type
              order: 0,
              data: {}
            }
          ]
        },
        seo: null,
        navigation: null,
        schemaVersion: '1.0.0'
      }
    });

    (prisma.page.findMany as any).mock.mockImplementation(async () => [pageWithCorruptedContent]);

    const resolved = await RoutingService.resolvePublishedRoute(projectId, '/bad-content');
    assert.strictEqual(resolved, null, 'Must fail closed and return null on invalid content');
  });

  it('fail-closed: resolvePublishedRoute returns null when SEO resolution fails on invalid canonical URL', async () => {
    const pageWithInvalidSeo = createMockPage({
      id: 'bad-seo-page',
      projectId,
      parentId: null,
      publishedRevision: {
        id: 'rev-bad-seo',
        pageId: 'bad-seo-page',
        revisionNumber: 1,
        status: 'PUBLISHED',
        title: 'Bad SEO',
        slug: 'bad-seo',
        locale: 'cs',
        description: null,
        visibility: 'PUBLIC',
        content: { version: 1, schemaVersion: '1.0', blocks: [] },
        seo: {
          canonicalUrl: 'javascript:alert(1)', // Unsafe canonical URL
        },
        navigation: null,
        schemaVersion: '1.0.0'
      }
    });

    (prisma.page.findMany as any).mock.mockImplementation(async () => [pageWithInvalidSeo]);

    const resolved = await RoutingService.resolvePublishedRoute(projectId, '/bad-seo');
    assert.strictEqual(resolved, null, 'Must fail closed and return null on invalid SEO');
  });

  describe('RedirectService integrations with routing', () => {
    it('preserves first redirect type across redirect chains', async () => {
      const rules: Record<string, { target: string; type: RedirectType }> = {
        '/start': { target: '/middle', type: 'MOVED_PERMANENTLY' },
        '/middle': { target: '/final', type: 'FOUND' },
      };

      (prisma.redirectRule.findFirst as any).mock.mockImplementation(async (args: any) => {
        const found = rules[args.where.sourcePath];
        if (found && args.where.projectId === projectId) {
          return { targetPath: found.target, type: found.type, active: true };
        }
        return null;
      });

      const res = await RedirectService.resolveRedirect(projectId, '/start');
      assert.strictEqual(res.targetPath, '/final');
      assert.strictEqual(res.type, 'MOVED_PERMANENTLY');
    });

    it('malformed stored target fails closed', async () => {
      (prisma.redirectRule.findFirst as any).mock.mockImplementation(async (args: any) => {
        if (args.where.sourcePath === '/broken') {
          return { targetPath: '/invalid\\backslash\\path', type: 'MOVED_PERMANENTLY', active: true };
        }
        return null;
      });

      const res = await RedirectService.resolveRedirect(projectId, '/broken');
      assert.strictEqual(res.targetPath, null);
      assert.strictEqual(res.type, null);
    });

    it('reserved stored target fails closed', async () => {
      (prisma.redirectRule.findFirst as any).mock.mockImplementation(async (args: any) => {
        if (args.where.sourcePath === '/legacy-admin') {
          return { targetPath: '/admin/dashboard', type: 'MOVED_PERMANENTLY', active: true };
        }
        return null;
      });

      const res = await RedirectService.resolveRedirect(projectId, '/legacy-admin');
      assert.strictEqual(res.targetPath, null);
      assert.strictEqual(res.type, null);
    });
  });
});
