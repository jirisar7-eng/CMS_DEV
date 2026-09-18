import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { BrokenLinkValidator, extractLinksFromContent } from '../lib/domain/routing/broken-links';
import { PageWithPublishedRevision } from '../lib/domain/routing/service';
import { prisma } from '../lib/db';

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

describe('Broken Link Validator (SYN-WEB-002 Phase 5B)', () => {
  const projectId = 'proj-link-test';

  beforeEach(() => {
    (prisma as any).page = {
      findMany: mock.fn(async () => []),
      findFirst: mock.fn(async () => null),
    };
    (prisma as any).redirectRule = {
      findFirst: mock.fn(async () => null),
      findMany: mock.fn(async () => []),
    };
  });

  afterEach(() => {
    if ((prisma as any).page?.findMany?.mock) (prisma as any).page.findMany.mock.resetCalls();
    if ((prisma as any).redirectRule?.findFirst?.mock) (prisma as any).redirectRule.findFirst.mock.resetCalls();
  });

  describe('extractLinksFromContent', () => {
    it('extracts links from direct string paths, anchor tags, markdown links, and block properties', () => {
      const content = {
        version: 1,
        schemaVersion: '1.0',
        blocks: [
          {
            id: 'b1',
            type: 'paragraph',
            data: {
              html: '<p>Visit <a href="/about">About Us</a> and <a href="https://external.example.com">External</a></p>',
            }
          },
          {
            id: 'b2',
            type: 'text',
            data: {
              markdown: 'Check [our products](/products) and [docs](https://docs.example.com)',
            }
          },
          {
            id: 'b3',
            type: 'button',
            data: {
              label: 'Contact',
              url: '/contact-us',
            }
          }
        ]
      };

      const links = extractLinksFromContent(content);
      assert.ok(links.includes('/about'));
      assert.ok(links.includes('/products'));
      assert.ok(links.includes('/contact-us'));
      assert.ok(links.includes('https://external.example.com'));
      assert.ok(links.includes('https://docs.example.com'));
    });

    it('returns empty array on empty or invalid content without executing content', () => {
      assert.deepStrictEqual(extractLinksFromContent(null), []);
      assert.deepStrictEqual(extractLinksFromContent({}), []);
      assert.deepStrictEqual(extractLinksFromContent({ blocks: 'not-an-array' }), []);
    });
  });

  describe('validatePages scenarios', () => {
    it('valid internal published link produces no broken link findings', async () => {
      const homePage = createMockPage({
        id: 'home',
        projectId,
        parentId: null,
        publishedRevision: {
          id: 'rev-home',
          pageId: 'home',
          revisionNumber: 1,
          status: 'PUBLISHED',
          title: 'Home',
          slug: '',
          locale: 'cs',
          description: null,
          visibility: 'PUBLIC',
          content: {
            version: 1,
            schemaVersion: '1.0',
            blocks: [
              {
                id: 'b1',
                type: 'paragraph',
                data: { html: '<a href="/about">Go to about</a>' }
              }
            ]
          },
          seo: null,
          navigation: null,
          schemaVersion: '1.0.0'
        }
      });

      const aboutPage = createMockPage({
        id: 'about',
        projectId,
        parentId: null,
        publishedRevision: {
          id: 'rev-about',
          pageId: 'about',
          revisionNumber: 1,
          status: 'PUBLISHED',
          title: 'About',
          slug: 'about',
          locale: 'cs',
          description: null,
          visibility: 'PUBLIC',
          content: { version: 1, schemaVersion: '1.0', blocks: [] },
          seo: null,
          navigation: null,
          schemaVersion: '1.0.0'
        }
      });

      const findings = await BrokenLinkValidator.validatePages(projectId, [homePage, aboutPage]);
      assert.strictEqual(findings.length, 0);
    });

    it('missing internal route is flagged with TARGET_NOT_FOUND', async () => {
      const page = createMockPage({
        id: 'home',
        projectId,
        parentId: null,
        publishedRevision: {
          id: 'rev-home',
          pageId: 'home',
          revisionNumber: 1,
          status: 'PUBLISHED',
          title: 'Home',
          slug: '',
          locale: 'cs',
          description: null,
          visibility: 'PUBLIC',
          content: {
            version: 1,
            schemaVersion: '1.0',
            blocks: [
              {
                id: 'b1',
                type: 'button',
                data: { url: '/non-existent-page' }
              }
            ]
          },
          seo: null,
          navigation: null,
          schemaVersion: '1.0.0'
        }
      });

      const findings = await BrokenLinkValidator.validatePages(projectId, [page]);
      assert.strictEqual(findings.length, 1);
      assert.strictEqual(findings[0].reason, 'TARGET_NOT_FOUND');
      assert.strictEqual(findings[0].href, '/non-existent-page');
      assert.strictEqual(findings[0].sourcePath, '/');
    });

    it('reserved route link is flagged with RESERVED_ROUTE', async () => {
      const page = createMockPage({
        id: 'home',
        projectId,
        parentId: null,
        publishedRevision: {
          id: 'rev-home',
          pageId: 'home',
          revisionNumber: 1,
          status: 'PUBLISHED',
          title: 'Home',
          slug: '',
          locale: 'cs',
          description: null,
          visibility: 'PUBLIC',
          content: {
            version: 1,
            schemaVersion: '1.0',
            blocks: [
              {
                id: 'b1',
                type: 'paragraph',
                data: { html: '<a href="/admin/settings">Admin Console</a>' }
              }
            ]
          },
          seo: null,
          navigation: null,
          schemaVersion: '1.0.0'
        }
      });

      const findings = await BrokenLinkValidator.validatePages(projectId, [page]);
      assert.strictEqual(findings.length, 1);
      assert.strictEqual(findings[0].reason, 'RESERVED_ROUTE');
      assert.strictEqual(findings[0].href, '/admin/settings');
    });

    it('duplicate route conflict link is flagged with DUPLICATE_ROUTE', async () => {
      // Two pages with the same slug '/clash'
      const page1 = createMockPage({ id: 'p1', projectId, parentId: null, publishedRevision: { id: 'r1', pageId: 'p1', revisionNumber: 1, status: 'PUBLISHED', title: 'Clash 1', slug: 'clash', locale: 'cs', description: null, visibility: 'PUBLIC', content: { version: 1, schemaVersion: '1.0', blocks: [] }, seo: null, navigation: null, schemaVersion: '1.0.0' } });
      const page2 = createMockPage({ id: 'p2', projectId, parentId: null, publishedRevision: { id: 'r2', pageId: 'p2', revisionNumber: 1, status: 'PUBLISHED', title: 'Clash 2', slug: 'clash', locale: 'cs', description: null, visibility: 'PUBLIC', content: { version: 1, schemaVersion: '1.0', blocks: [] }, seo: null, navigation: null, schemaVersion: '1.0.0' } });

      const callerPage = createMockPage({
        id: 'caller',
        projectId,
        parentId: null,
        publishedRevision: {
          id: 'r-caller',
          pageId: 'caller',
          revisionNumber: 1,
          status: 'PUBLISHED',
          title: 'Caller',
          slug: 'caller',
          locale: 'cs',
          description: null,
          visibility: 'PUBLIC',
          content: {
            version: 1,
            schemaVersion: '1.0',
            blocks: [
              {
                id: 'b1',
                type: 'paragraph',
                data: { html: '<a href="/clash">Go to duplicate path</a>' }
              }
            ]
          },
          seo: null,
          navigation: null,
          schemaVersion: '1.0.0'
        }
      });

      const findings = await BrokenLinkValidator.validatePages(projectId, [page1, page2, callerPage]);
      assert.strictEqual(findings.length, 1);
      assert.strictEqual(findings[0].reason, 'DUPLICATE_ROUTE');
      assert.strictEqual(findings[0].href, '/clash');
    });

    it('valid redirect to published route produces no findings', async () => {
      const callerPage = createMockPage({
        id: 'caller',
        projectId,
        parentId: null,
        publishedRevision: {
          id: 'r-caller',
          pageId: 'caller',
          revisionNumber: 1,
          status: 'PUBLISHED',
          title: 'Caller',
          slug: 'caller',
          locale: 'cs',
          description: null,
          visibility: 'PUBLIC',
          content: {
            version: 1,
            schemaVersion: '1.0',
            blocks: [
              {
                id: 'b1',
                type: 'paragraph',
                data: { html: '<a href="/old-url">Old Link</a>' }
              }
            ]
          },
          seo: null,
          navigation: null,
          schemaVersion: '1.0.0'
        }
      });

      const targetPage = createMockPage({
        id: 'target',
        projectId,
        parentId: null,
        publishedRevision: {
          id: 'r-target',
          pageId: 'target',
          revisionNumber: 1,
          status: 'PUBLISHED',
          title: 'Target',
          slug: 'new-url',
          locale: 'cs',
          description: null,
          visibility: 'PUBLIC',
          content: { version: 1, schemaVersion: '1.0', blocks: [] },
          seo: null,
          navigation: null,
          schemaVersion: '1.0.0'
        }
      });

      // Mock redirect rule in DB: /old-url -> /new-url
      (prisma.redirectRule.findFirst as any).mock.mockImplementation(async (args: any) => {
        if (args.where.projectId === projectId && args.where.sourcePath === '/old-url') {
          return { id: 'rule-1', targetPath: '/new-url', type: 'MOVED_PERMANENTLY', active: true };
        }
        return null;
      });

      const findings = await BrokenLinkValidator.validatePages(projectId, [callerPage, targetPage]);
      assert.strictEqual(findings.length, 0);
    });

    it('redirect to missing route is flagged with TARGET_NOT_FOUND', async () => {
      const callerPage = createMockPage({
        id: 'caller',
        projectId,
        parentId: null,
        publishedRevision: {
          id: 'r-caller',
          pageId: 'caller',
          revisionNumber: 1,
          status: 'PUBLISHED',
          title: 'Caller',
          slug: 'caller',
          locale: 'cs',
          description: null,
          visibility: 'PUBLIC',
          content: {
            version: 1,
            schemaVersion: '1.0',
            blocks: [
              {
                id: 'b1',
                type: 'paragraph',
                data: { html: '<a href="/legacy-path">Legacy</a>' }
              }
            ]
          },
          seo: null,
          navigation: null,
          schemaVersion: '1.0.0'
        }
      });

      // Mock redirect rule pointing to non-existent route
      (prisma.redirectRule.findFirst as any).mock.mockImplementation(async (args: any) => {
        if (args.where.projectId === projectId && args.where.sourcePath === '/legacy-path') {
          return { id: 'rule-legacy', targetPath: '/does-not-exist', type: 'MOVED_PERMANENTLY', active: true };
        }
        return null;
      });

      const findings = await BrokenLinkValidator.validatePages(projectId, [callerPage]);
      assert.strictEqual(findings.length, 1);
      assert.strictEqual(findings[0].reason, 'TARGET_NOT_FOUND');
      assert.strictEqual(findings[0].href, '/legacy-path');
      assert.strictEqual(findings[0].details?.redirectTarget, '/does-not-exist');
    });

    it('redirect cycle or loop is flagged with REDIRECT_CYCLE', async () => {
      const callerPage = createMockPage({
        id: 'caller',
        projectId,
        parentId: null,
        publishedRevision: {
          id: 'r-caller',
          pageId: 'caller',
          revisionNumber: 1,
          status: 'PUBLISHED',
          title: 'Caller',
          slug: 'caller',
          locale: 'cs',
          description: null,
          visibility: 'PUBLIC',
          content: {
            version: 1,
            schemaVersion: '1.0',
            blocks: [
              {
                id: 'b1',
                type: 'paragraph',
                data: { html: '<a href="/cycle-a">Cycle Start</a>' }
              }
            ]
          },
          seo: null,
          navigation: null,
          schemaVersion: '1.0.0'
        }
      });

      // Rules: /cycle-a -> /cycle-b, /cycle-b -> /cycle-a
      const rules: Record<string, string> = {
        '/cycle-a': '/cycle-b',
        '/cycle-b': '/cycle-a',
      };
      (prisma.redirectRule.findFirst as any).mock.mockImplementation(async (args: any) => {
        if (args.where.projectId === projectId && rules[args.where.sourcePath]) {
          return { id: 'rule-cycle', targetPath: rules[args.where.sourcePath], type: 'FOUND', active: true };
        }
        return null;
      });

      const findings = await BrokenLinkValidator.validatePages(projectId, [callerPage]);
      assert.strictEqual(findings.length, 1);
      assert.strictEqual(findings[0].reason, 'REDIRECT_CYCLE');
      assert.strictEqual(findings[0].href, '/cycle-a');
    });

    it('external http/https, mailto, tel, and anchor links are ignored', async () => {
      const page = createMockPage({
        id: 'page-with-externals',
        projectId,
        parentId: null,
        publishedRevision: {
          id: 'r-ext',
          pageId: 'page-with-externals',
          revisionNumber: 1,
          status: 'PUBLISHED',
          title: 'Externals',
          slug: 'externals',
          locale: 'cs',
          description: null,
          visibility: 'PUBLIC',
          content: {
            version: 1,
            schemaVersion: '1.0',
            blocks: [
              {
                id: 'b1',
                type: 'paragraph',
                data: {
                  html: `
                    <a href="https://example.com/api">External HTTPS</a>
                    <a href="http://test.org">External HTTP</a>
                    <a href="mailto:support@example.com">Email Us</a>
                    <a href="tel:+420123456789">Call Us</a>
                    <a href="#section-top">Jump to Top</a>
                  `
                }
              }
            ]
          },
          seo: null,
          navigation: null,
          schemaVersion: '1.0.0'
        }
      });

      const findings = await BrokenLinkValidator.validatePages(projectId, [page]);
      assert.strictEqual(findings.length, 0, 'Must ignore external links and not flag them as broken');
    });

    it('protected and internal destination treated as non-public route', async () => {
      const callerPage = createMockPage({
        id: 'caller',
        projectId,
        parentId: null,
        publishedRevision: {
          id: 'r-caller',
          pageId: 'caller',
          revisionNumber: 1,
          status: 'PUBLISHED',
          title: 'Caller',
          slug: 'caller',
          locale: 'cs',
          description: null,
          visibility: 'PUBLIC',
          content: {
            version: 1,
            schemaVersion: '1.0',
            blocks: [
              {
                id: 'b1',
                type: 'paragraph',
                data: { html: '<a href="/internal-portal">Secret Internal</a>' }
              }
            ]
          },
          seo: null,
          navigation: null,
          schemaVersion: '1.0.0'
        }
      });

      const internalPage = createMockPage({
        id: 'internal',
        projectId,
        parentId: null,
        publishedRevision: {
          id: 'r-int',
          pageId: 'internal',
          revisionNumber: 1,
          status: 'PUBLISHED',
          title: 'Internal Portal',
          slug: 'internal-portal',
          locale: 'cs',
          description: null,
          visibility: 'INTERNAL',
          content: { version: 1, schemaVersion: '1.0', blocks: [] },
          seo: null,
          navigation: null,
          schemaVersion: '1.0.0'
        }
      });

      const findings = await BrokenLinkValidator.validatePages(projectId, [callerPage, internalPage]);
      assert.strictEqual(findings.length, 1);
      assert.strictEqual(findings[0].reason, 'NON_PUBLIC_ROUTE');
      assert.strictEqual(findings[0].href, '/internal-portal');
    });

    it('strict project isolation: links pointing to other project pages or redirects are treated as TARGET_NOT_FOUND', async () => {
      const pageInProject1 = createMockPage({
        id: 'p1-home',
        projectId: 'project-1',
        parentId: null,
        publishedRevision: {
          id: 'r1-home',
          pageId: 'p1-home',
          revisionNumber: 1,
          status: 'PUBLISHED',
          title: 'Proj 1 Home',
          slug: 'home',
          locale: 'cs',
          description: null,
          visibility: 'PUBLIC',
          content: {
            version: 1,
            schemaVersion: '1.0',
            blocks: [
              {
                id: 'b1',
                type: 'paragraph',
                data: { html: '<a href="/proj2-only">Cross Project Link</a>' }
              }
            ]
          },
          seo: null,
          navigation: null,
          schemaVersion: '1.0.0'
        }
      });

      // Mock redirect rule existing ONLY in project-2, NOT in project-1
      (prisma.redirectRule.findFirst as any).mock.mockImplementation(async (args: any) => {
        if (args.where.projectId === 'project-2' && args.where.sourcePath === '/proj2-only') {
          return { id: 'p2-rule', targetPath: '/proj2-target', type: 'MOVED_PERMANENTLY', active: true };
        }
        return null;
      });

      // Validating project-1 should NOT see project-2's rules or pages
      const findings = await BrokenLinkValidator.validatePages('project-1', [pageInProject1]);
      assert.strictEqual(findings.length, 1);
      assert.strictEqual(findings[0].reason, 'TARGET_NOT_FOUND');
      assert.strictEqual(findings[0].href, '/proj2-only');
    });
  });
});
