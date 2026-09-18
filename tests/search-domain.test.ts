import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  extractCanonicalText,
  stripHtmlToPlainText,
  normalizeSearchText,
  SearchService,
  InMemorySearchIndexAdapter,
  generateSearchDocumentsFromPages,
  SearchError,
  SEARCH_INDEX_VERSION,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  SEARCH_MAX_QUERY_LENGTH,
  PageWithPublishedRevision,
} from '../lib/domain/search';

function createMockPage(overrides: Partial<PageWithPublishedRevision> = {}): PageWithPublishedRevision {
  const id = overrides.id || 'page-1';
  const publishedRevId =
    overrides.publishedRevisionId !== undefined
      ? overrides.publishedRevisionId
      : (overrides.publishedRevision?.id ?? 'rev-1');
  const slug = overrides.publishedRevision?.slug ?? 'test-slug';
  const visibility = overrides.publishedRevision?.visibility ?? 'PUBLIC';
  const status = overrides.publishedRevision?.status ?? 'PUBLISHED';
  const content = overrides.publishedRevision?.content ?? {
    version: 1,
    schemaVersion: '1.0.0',
    blocks: [
      {
        id: 'b-1',
        type: 'paragraph',
        order: 0,
        data: { text: 'Ukázkový text odstavce.' },
      },
    ],
  };

  const publishedRev = publishedRevId
    ? {
        id: publishedRevId,
        pageId: id,
        revisionNumber: 1,
        status,
        title: overrides.publishedRevision?.title ?? 'Testovací stránka',
        slug,
        locale: 'cs',
        description: overrides.publishedRevision?.description ?? 'Popis stránky',
        visibility,
        content,
        seo: overrides.publishedRevision?.seo ?? {
          metaTitle: 'SEO Titulek',
          metaDescription: 'SEO Popis',
          noIndex: false,
        },
        navigation: {},
        schemaVersion: '1.0.0',
        ...(overrides.publishedRevision || {}),
      }
    : null;

  return {
    id,
    projectId: overrides.projectId || 'proj-1',
    key: overrides.key || `key-${id}`,
    parentId: overrides.parentId ?? null,
    sortOrder: overrides.sortOrder ?? 0,
    draftRevisionId: overrides.draftRevisionId ?? null,
    publishedRevisionId: publishedRevId,
    publishedRevision: publishedRev,
    ...overrides,
  };
}

describe('SYN-SEARCH-001 Search Domain Foundation', () => {
  describe('1. Safe Canonical Content Text Extractor (Allowlist)', () => {
    it('extracts searchable text only from allowlisted block fields', () => {
      const content = {
        version: 1,
        schemaVersion: '1.0.0',
        blocks: [
          {
            id: 'h1',
            type: 'heading',
            order: 0,
            data: { text: 'Hlavní nadpis', level: 1, align: 'center' },
          },
          {
            id: 'p1',
            type: 'paragraph',
            order: 1,
            data: { text: 'První odstavec textu.', size: 'base' },
          },
          {
            id: 'rt1',
            type: 'rich_text',
            order: 2,
            data: {
              html: '<p>Formátovaný <strong>tučný</strong> text a <a href="https://example.com/secret">odkaz</a> &amp; citace.</p>',
            },
          },
          {
            id: 'img1',
            type: 'image',
            order: 3,
            data: {
              url: 'https://cdn.example.com/photo.jpg',
              alt: 'Popis obrázku pro čtečky',
              caption: 'Titulek pod fotografií',
              aspectRatio: '16:9',
            },
          },
          {
            id: 'call1',
            type: 'callout',
            order: 4,
            data: {
              title: 'Důležité upozornění',
              text: 'Nezapomeňte na bezpečnost.',
              tone: 'warning',
            },
          },
          {
            id: 'q1',
            type: 'quote',
            order: 5,
            data: {
              quote: 'Svoboda a odpovědnost.',
              author: 'Václav Havel',
              citation: 'Letní přemítání',
            },
          },
          {
            id: 'btn1',
            type: 'button',
            order: 6,
            data: {
              label: 'Klikněte pro více informací',
              url: 'https://externi-cil.cz',
              variant: 'primary',
            },
          },
          {
            id: 'div1',
            type: 'divider',
            order: 7,
            data: { style: 'solid', spacing: 'md' },
          },
        ],
      };

      const extracted = extractCanonicalText(content);

      // Verifies presence of allowlisted textual content
      assert(extracted.includes('Hlavní nadpis'), 'heading text should be extracted');
      assert(extracted.includes('První odstavec textu.'), 'paragraph text should be extracted');
      assert(extracted.includes('Formátovaný tučný text a odkaz & citace.'), 'rich_text html should be stripped and decoded');
      assert(extracted.includes('Popis obrázku pro čtečky'), 'image alt should be extracted');
      assert(extracted.includes('Titulek pod fotografií'), 'image caption should be extracted');
      assert(extracted.includes('Důležité upozornění'), 'callout title should be extracted');
      assert(extracted.includes('Nezapomeňte na bezpečnost.'), 'callout text should be extracted');
      assert(extracted.includes('Svoboda a odpovědnost.'), 'quote text should be extracted');
      assert(extracted.includes('Václav Havel'), 'quote author should be extracted');
      assert(extracted.includes('Letní přemítání'), 'quote citation should be extracted');
      assert(extracted.includes('Klikněte pro více informací'), 'button label should be extracted');

      // Verifies technical and URL fields are strictly NOT indexed
      assert(!extracted.includes('https://cdn.example.com/photo.jpg'), 'image URL must not be indexed');
      assert(!extracted.includes('https://example.com/secret'), 'rich text link URL must not be indexed');
      assert(!extracted.includes('https://externi-cil.cz'), 'button target URL must not be indexed');
      assert(!extracted.includes('16:9'), 'technical aspect ratio must not be indexed');
      assert(!extracted.includes('warning'), 'callout tone must not be indexed');
      assert(!extracted.includes('primary'), 'button variant must not be indexed');
      assert(!extracted.includes('h1'), 'block id must not be indexed');
    });

    it('recurses through validated children blocks in structural containers', () => {
      const content = {
        version: 1,
        schemaVersion: '1.0.0',
        blocks: [
          {
            id: 'col-1',
            type: 'columns',
            order: 0,
            data: { layout: '1-1' },
            children: [
              {
                id: 'child-1',
                type: 'paragraph',
                order: 0,
                data: { text: 'Text v levém sloupci.' },
              },
              {
                id: 'child-2',
                type: 'paragraph',
                order: 1,
                data: { text: 'Text v pravém sloupci.' },
              },
            ],
          },
        ],
      };

      const extracted = extractCanonicalText(content);
      assert(extracted.includes('Text v levém sloupci.'));
      assert(extracted.includes('Text v pravém sloupci.'));
      assert(!extracted.includes('1-1'), 'column layout metadata must not be indexed');
    });
  });

  describe('2. Unknown and Private Field Exclusion', () => {
    it('strictly excludes unknown fields, internal metadata, and secrets from extraction', () => {
      const maliciousOrLeakedContent = {
        version: 1,
        schemaVersion: '1.0.0',
        blocks: [
          {
            id: 'b-vuln',
            type: 'paragraph',
            order: 0,
            data: {
              text: 'Veřejný text',
              secretApiKey: 'sk_live_SECRET_DO_NOT_INDEX_9999',
              internalAuditLog: 'Citlivé interní poznámky auditora',
              databasePassword: 'super_secret_db_pass_123',
              privateNotes: 'Tajná poznámka redakce',
              technicalState: {
                serverIp: '192.168.1.100',
                authHeader: 'Bearer eyJhbGciOi...',
              },
            },
          },
          {
            id: 'b-unknown-type',
            type: 'arbitrary_custom_unregistered_block',
            order: 1,
            data: {
              injectedField: 'Tento text nesmí projít',
              rawSql: 'SELECT * FROM users;',
            },
          },
        ],
      };

      const extracted = extractCanonicalText(maliciousOrLeakedContent);

      assert.strictEqual(extracted, 'Veřejný text');
      assert(!extracted.includes('sk_live_SECRET_DO_NOT_INDEX_9999'));
      assert(!extracted.includes('Citlivé interní poznámky'));
      assert(!extracted.includes('super_secret_db_pass_123'));
      assert(!extracted.includes('192.168.1.100'));
      assert(!extracted.includes('eyJhbGciOi'));
      assert(!extracted.includes('Tento text nesmí projít'));
      assert(!extracted.includes('SELECT * FROM users'));
    });
  });

  describe('3. Module Embed Parameter Exclusion', () => {
    it('exposes only fallbackText from module_embed and strictly omits parameters and IDs', () => {
      const moduleContent = {
        version: 1,
        schemaVersion: '1.0.0',
        blocks: [
          {
            id: 'mod-1',
            type: 'module_embed',
            order: 0,
            data: {
              moduleId: 'contact_form',
              schemaVersion: 'v1.2.0',
              parameters: {
                apiKey: 'secret_module_token_xyz',
                endpointUrl: 'https://internal-api.cluster.local/submit',
                recipientEmail: 'private-recipient@synthesis.cz',
                maxUploadBytes: 10485760,
                internalDebugMode: true,
              },
              fallbackText: 'Pro kontaktování redakce použijte prosím telefonní linku.',
            },
          },
        ],
      };

      const extracted = extractCanonicalText(moduleContent);

      assert(
        extracted.includes('Pro kontaktování redakce použijte prosím telefonní linku.'),
        'fallbackText must be indexed'
      );
      assert(!extracted.includes('contact_form'), 'moduleId must not be indexed');
      assert(!extracted.includes('v1.2.0'), 'schemaVersion must not be indexed');
      assert(!extracted.includes('secret_module_token_xyz'), 'parameters.apiKey must not be indexed');
      assert(!extracted.includes('internal-api.cluster.local'), 'parameters.endpointUrl must not be indexed');
      assert(!extracted.includes('private-recipient@synthesis.cz'), 'parameters.recipientEmail must not be indexed');
      assert(!extracted.includes('10485760'), 'numeric parameter must not be indexed');
    });
  });

  describe('4. Project Isolation Contract', () => {
    it('strictly isolates search queries and documents by projectId', async () => {
      const adapter = new InMemorySearchIndexAdapter();
      const service = new SearchService(adapter);

      // Populate Project A
      await adapter.replaceProjectIndex('proj-alpha', [
        {
          projectId: 'proj-alpha',
          pageId: 'page-a',
          revisionId: 'rev-a',
          path: '/o-nas',
          title: 'O nás - Projekt Alpha',
          description: 'Popis projektu Alpha',
          locale: 'cs',
          bodyText: 'Společnost Alpha vyrábí inovativní solární panely.',
          indexVersion: SEARCH_INDEX_VERSION,
        },
      ]);

      // Populate Project B with identical keyword
      await adapter.replaceProjectIndex('proj-beta', [
        {
          projectId: 'proj-beta',
          pageId: 'page-b',
          revisionId: 'rev-b',
          path: '/o-nas',
          title: 'O nás - Projekt Beta',
          description: 'Popis projektu Beta',
          locale: 'cs',
          bodyText: 'Společnost Beta nabízí konkurenční solární řešení.',
          indexVersion: SEARCH_INDEX_VERSION,
        },
      ]);

      // Search Alpha
      const resultAlpha = await service.search({
        projectId: 'proj-alpha',
        query: 'solární',
      });

      assert.strictEqual(resultAlpha.total, 1);
      assert.strictEqual(resultAlpha.items[0].pageId, 'page-a');
      assert.strictEqual(resultAlpha.items[0].title, 'O nás - Projekt Alpha');

      // Search Beta
      const resultBeta = await service.search({
        projectId: 'proj-beta',
        query: 'solární',
      });

      assert.strictEqual(resultBeta.total, 1);
      assert.strictEqual(resultBeta.items[0].pageId, 'page-b');
      assert.strictEqual(resultBeta.items[0].title, 'O nás - Projekt Beta');

      // Non-existent project search
      const resultGamma = await service.search({
        projectId: 'proj-gamma',
        query: 'solární',
      });
      assert.strictEqual(resultGamma.total, 0);
      assert.strictEqual(resultGamma.items.length, 0);
    });

    it('rejects cross-project document indexing attempts', async () => {
      const adapter = new InMemorySearchIndexAdapter();

      await assert.rejects(
        adapter.replaceProjectIndex('proj-alpha', [
          {
            projectId: 'proj-FOREIGN',
            pageId: 'page-evil',
            revisionId: 'rev-evil',
            path: '/hack',
            title: 'Cross Project Leak',
            description: null,
            locale: 'cs',
            bodyText: 'Data',
            indexVersion: SEARCH_INDEX_VERSION,
          },
        ]),
        (err: unknown) => {
          assert(err instanceof SearchError);
          assert.strictEqual(err.code, 'ADAPTER_ERROR');
          return true;
        }
      );
    });

    it('rejects search requests missing projectId', async () => {
      const service = new SearchService(new InMemorySearchIndexAdapter());

      await assert.rejects(
        service.search({ projectId: '', query: 'test' }),
        (err: unknown) => {
          assert(err instanceof SearchError);
          assert.strictEqual(err.code, 'INVALID_PROJECT_ID');
          return true;
        }
      );

      await assert.rejects(
        service.search({ projectId: '   ', query: 'test' }),
        (err: unknown) => {
          assert(err instanceof SearchError);
          assert.strictEqual(err.code, 'INVALID_PROJECT_ID');
          return true;
        }
      );
    });
  });

  describe('5. Empty and Invalid Query Rejection', () => {
    it('rejects empty, whitespace-only, or invalid search queries', async () => {
      const service = new SearchService(new InMemorySearchIndexAdapter());

      const invalidQueries = ['', '   ', '\t\n', null as unknown as string, undefined as unknown as string];

      for (const q of invalidQueries) {
        await assert.rejects(
          service.search({ projectId: 'proj-1', query: q }),
          (err: unknown) => {
            assert(err instanceof SearchError);
            assert.strictEqual(err.code, 'INVALID_QUERY');
            return true;
          },
          `Expected query "${q}" to be rejected`
        );
      }
    });
  });

  describe('6. Max Query Length', () => {
    it('accepts queries up to SEARCH_MAX_QUERY_LENGTH and rejects longer queries', async () => {
      const service = new SearchService(new InMemorySearchIndexAdapter());

      const validQuery = 'a'.repeat(SEARCH_MAX_QUERY_LENGTH);
      const invalidQuery = 'a'.repeat(SEARCH_MAX_QUERY_LENGTH + 1);

      // 200 chars should not throw
      const res = await service.search({ projectId: 'proj-1', query: validQuery });
      assert.strictEqual(res.query, validQuery);

      // 201 chars should fail
      await assert.rejects(
        service.search({ projectId: 'proj-1', query: invalidQuery }),
        (err: unknown) => {
          assert(err instanceof SearchError);
          assert.strictEqual(err.code, 'QUERY_TOO_LONG');
          return true;
        }
      );
    });
  });

  describe('7. Bounded Pagination', () => {
    it('enforces default limit, maximum limit cap, and bounds offset safely', async () => {
      const adapter = new InMemorySearchIndexAdapter();
      const service = new SearchService(adapter);

      // Create 60 items
      const docs = Array.from({ length: 60 }, (_, i) => ({
        projectId: 'proj-page',
        pageId: `page-${i}`,
        revisionId: `rev-${i}`,
        path: `/clanek-${i}`,
        title: `Článek ${i}`,
        description: `Popis ${i}`,
        locale: 'cs',
        bodyText: `Obsah testovacího článku číslo ${i} pro vyhledávání.`,
        indexVersion: SEARCH_INDEX_VERSION,
      }));

      await adapter.replaceProjectIndex('proj-page', docs);

      // 1. Default limit is 20
      const defaultRes = await service.search({ projectId: 'proj-page', query: 'článku' });
      assert.strictEqual(defaultRes.total, 60);
      assert.strictEqual(defaultRes.limit, SEARCH_DEFAULT_LIMIT);
      assert.strictEqual(defaultRes.offset, 0);
      assert.strictEqual(defaultRes.items.length, 20);

      // 2. Max limit cap at 50 even if 100 requested
      const cappedRes = await service.search({ projectId: 'proj-page', query: 'článku', limit: 100 });
      assert.strictEqual(cappedRes.limit, SEARCH_MAX_LIMIT);
      assert.strictEqual(cappedRes.items.length, 50);

      // 3. Offset slicing
      const pagedRes = await service.search({ projectId: 'proj-page', query: 'článku', limit: 10, offset: 20 });
      assert.strictEqual(pagedRes.offset, 20);
      assert.strictEqual(pagedRes.limit, 10);
      assert.strictEqual(pagedRes.items.length, 10);

      // 4. Invalid pagination parameters rejection
      await assert.rejects(
        service.search({ projectId: 'proj-page', query: 'článku', limit: -5 }),
        (err: unknown) => {
          assert(err instanceof SearchError);
          assert.strictEqual(err.code, 'INVALID_PAGINATION');
          return true;
        }
      );

      await assert.rejects(
        service.search({ projectId: 'proj-page', query: 'článku', offset: -1 }),
        (err: unknown) => {
          assert(err instanceof SearchError);
          assert.strictEqual(err.code, 'INVALID_PAGINATION');
          return true;
        }
      );

      await assert.rejects(
        service.search({ projectId: 'proj-page', query: 'článku', limit: 3.5 as unknown as number }),
        (err: unknown) => {
          assert(err instanceof SearchError);
          assert.strictEqual(err.code, 'INVALID_PAGINATION');
          return true;
        }
      );
    });
  });

  describe('8. PUBLIC Content Included in Search Index', () => {
    it('indexes published pages with PUBLIC visibility and canonical paths', () => {
      const pages: PageWithPublishedRevision[] = [
        createMockPage({
          id: 'page-pub-1',
          publishedRevisionId: 'rev-pub-1',
          publishedRevision: {
            id: 'rev-pub-1',
            pageId: 'page-pub-1',
            revisionNumber: 1,
            status: 'PUBLISHED',
            title: 'Úvodní stránka',
            slug: '',
            locale: 'cs',
            description: 'Vítejte na našem webu',
            visibility: 'PUBLIC',
            content: {
              version: 1,
              schemaVersion: '1.0.0',
              blocks: [
                {
                  id: 'b1',
                  type: 'heading',
                  order: 0,
                  data: { text: 'Vítejte v redakčním systému Synthesis' },
                },
              ],
            },
            seo: { metaTitle: 'Úvod', noIndex: false },
            navigation: {},
            schemaVersion: '1.0.0',
          },
        }),
        createMockPage({
          id: 'page-pub-2',
          publishedRevisionId: 'rev-pub-2',
          publishedRevision: {
            id: 'rev-pub-2',
            pageId: 'page-pub-2',
            revisionNumber: 1,
            status: 'PUBLISHED',
            title: 'Služby a reference',
            slug: 'sluzby',
            locale: 'cs',
            description: 'Přehled našich služeb',
            visibility: 'PUBLIC',
            content: {
              version: 1,
              schemaVersion: '1.0.0',
              blocks: [
                {
                  id: 'b2',
                  type: 'paragraph',
                  order: 0,
                  data: { text: 'Nabízíme komplexní webové poradenství.' },
                },
              ],
            },
            seo: { metaTitle: 'Služby', noIndex: false },
            navigation: {},
            schemaVersion: '1.0.0',
          },
        }),
      ];

      const docs = generateSearchDocumentsFromPages('proj-1', pages);

      assert.strictEqual(docs.length, 2);
      assert.strictEqual(docs[0].path, '/');
      assert.strictEqual(docs[0].title, 'Úvodní stránka');
      assert(docs[0].bodyText.includes('Vítejte v redakčním systému Synthesis'));

      assert.strictEqual(docs[1].path, '/sluzby');
      assert.strictEqual(docs[1].title, 'Služby a reference');
      assert(docs[1].bodyText.includes('Nabízíme komplexní webové poradenství.'));
    });
  });

  describe('9. UNLISTED, INTERNAL, and PASSWORD_PROTECTED Content Excluded', () => {
    it('strictly excludes UNLISTED, INTERNAL, and PASSWORD_PROTECTED pages from the public search index', () => {
      const pages: PageWithPublishedRevision[] = [
        createMockPage({
          id: 'page-public',
          publishedRevisionId: 'rev-public',
          publishedRevision: {
            id: 'rev-public',
            pageId: 'page-public',
            revisionNumber: 1,
            status: 'PUBLISHED',
            title: 'Veřejný článek',
            slug: 'verejny',
            locale: 'cs',
            description: 'Veřejně dohledatelný',
            visibility: 'PUBLIC',
            content: {
              version: 1,
              schemaVersion: '1.0.0',
              blocks: [{ id: 'b1', type: 'paragraph', order: 0, data: { text: 'Veřejný obsah' } }],
            },
            seo: { noIndex: false },
            navigation: {},
            schemaVersion: '1.0.0',
          },
        }),
        createMockPage({
          id: 'page-unlisted',
          publishedRevisionId: 'rev-unlisted',
          publishedRevision: {
            id: 'rev-unlisted',
            pageId: 'page-unlisted',
            revisionNumber: 1,
            status: 'PUBLISHED',
            title: 'Skrytý článek pro přímý odkaz',
            slug: 'nezarazeny',
            locale: 'cs',
            description: 'Neměl by být v hledání',
            visibility: 'UNLISTED',
            content: {
              version: 1,
              schemaVersion: '1.0.0',
              blocks: [{ id: 'b2', type: 'paragraph', order: 0, data: { text: 'Unlisted tajný text' } }],
            },
            seo: { noIndex: false },
            navigation: {},
            schemaVersion: '1.0.0',
          },
        }),
        createMockPage({
          id: 'page-internal',
          publishedRevisionId: 'rev-internal',
          publishedRevision: {
            id: 'rev-internal',
            pageId: 'page-internal',
            revisionNumber: 1,
            status: 'PUBLISHED',
            title: 'Interní směrnice',
            slug: 'smernice',
            locale: 'cs',
            description: 'Pouze pro zaměstnance',
            visibility: 'INTERNAL',
            content: {
              version: 1,
              schemaVersion: '1.0.0',
              blocks: [{ id: 'b3', type: 'paragraph', order: 0, data: { text: 'Interní data' } }],
            },
            seo: { noIndex: false },
            navigation: {},
            schemaVersion: '1.0.0',
          },
        }),
        createMockPage({
          id: 'page-pwd',
          publishedRevisionId: 'rev-pwd',
          publishedRevision: {
            id: 'rev-pwd',
            pageId: 'page-pwd',
            revisionNumber: 1,
            status: 'PUBLISHED',
            title: 'Zaheslovaná sekce',
            slug: 'heslo',
            locale: 'cs',
            description: 'Chráněno heslem',
            visibility: 'PASSWORD_PROTECTED',
            content: {
              version: 1,
              schemaVersion: '1.0.0',
              blocks: [{ id: 'b4', type: 'paragraph', order: 0, data: { text: 'Chráněná data' } }],
            },
            seo: { noIndex: false },
            navigation: {},
            schemaVersion: '1.0.0',
          },
        }),
      ];

      const docs = generateSearchDocumentsFromPages('proj-1', pages);

      // Only the PUBLIC page must be in the index
      assert.strictEqual(docs.length, 1);
      assert.strictEqual(docs[0].pageId, 'page-public');
      assert.strictEqual(docs[0].title, 'Veřejný článek');

      // None of the non-public pages can be in the index
      assert(!docs.some(d => d.pageId === 'page-unlisted'));
      assert(!docs.some(d => d.pageId === 'page-internal'));
      assert(!docs.some(d => d.pageId === 'page-pwd'));
    });
  });

  describe('10. SEO noindex and Unpublished Content Excluded', () => {
    it('excludes pages with seo.noIndex === true or missing published revision', () => {
      const pages: PageWithPublishedRevision[] = [
        createMockPage({
          id: 'page-indexed',
          publishedRevisionId: 'rev-indexed',
          publishedRevision: {
            id: 'rev-indexed',
            pageId: 'page-indexed',
            revisionNumber: 1,
            status: 'PUBLISHED',
            title: 'Indexovaný článek',
            slug: 'indexovano',
            locale: 'cs',
            description: 'SEO povoleno',
            visibility: 'PUBLIC',
            content: {
              version: 1,
              schemaVersion: '1.0.0',
              blocks: [{ id: 'b1', type: 'paragraph', order: 0, data: { text: 'Hledatelný text' } }],
            },
            seo: { noIndex: false },
            navigation: {},
            schemaVersion: '1.0.0',
          },
        }),
        createMockPage({
          id: 'page-noindex',
          publishedRevisionId: 'rev-noindex',
          publishedRevision: {
            id: 'rev-noindex',
            pageId: 'page-noindex',
            revisionNumber: 1,
            status: 'PUBLISHED',
            title: 'Neindexovaný článek',
            slug: 'neindexovat',
            locale: 'cs',
            description: 'Zakázáno v SEO',
            visibility: 'PUBLIC',
            content: {
              version: 1,
              schemaVersion: '1.0.0',
              blocks: [{ id: 'b2', type: 'paragraph', order: 0, data: { text: 'Zakázaný text' } }],
            },
            seo: { noIndex: true },
            navigation: {},
            schemaVersion: '1.0.0',
          },
        }),
        createMockPage({
          id: 'page-draft-only',
          publishedRevisionId: null,
          draftRevisionId: 'rev-draft-1',
          publishedRevision: null,
        }),
        createMockPage({
          id: 'page-unapproved-status',
          publishedRevisionId: 'rev-in-review',
          publishedRevision: {
            id: 'rev-in-review',
            pageId: 'page-unapproved-status',
            revisionNumber: 1,
            status: 'IN_REVIEW',
            title: 'Rozpracovaná revize',
            slug: 'rozpracovano',
            locale: 'cs',
            description: null,
            visibility: 'PUBLIC',
            content: { version: 1, schemaVersion: '1.0.0', blocks: [] },
            seo: { noIndex: false },
            navigation: {},
            schemaVersion: '1.0.0',
          },
        }),
      ];

      const docs = generateSearchDocumentsFromPages('proj-1', pages);

      assert.strictEqual(docs.length, 1);
      assert.strictEqual(docs[0].pageId, 'page-indexed');
      assert(!docs.some(d => d.pageId === 'page-noindex'));
      assert(!docs.some(d => d.pageId === 'page-draft-only'));
      assert(!docs.some(d => d.pageId === 'page-unapproved-status'));
    });

    it('respects FORCE_NOINDEX environment flag', () => {
      const originalEnv = process.env.FORCE_NOINDEX;
      try {
        process.env.FORCE_NOINDEX = 'true';

        const pages: PageWithPublishedRevision[] = [
          createMockPage({
            id: 'page-1',
            publishedRevisionId: 'rev-1',
            publishedRevision: {
              id: 'rev-1',
              pageId: 'page-1',
              revisionNumber: 1,
              status: 'PUBLISHED',
              title: 'Stránka 1',
              slug: 'stranka-1',
              locale: 'cs',
              description: null,
              visibility: 'PUBLIC',
              content: { version: 1, schemaVersion: '1.0.0', blocks: [] },
              seo: { noIndex: false },
              navigation: {},
              schemaVersion: '1.0.0',
            },
          }),
        ];

        const docs = generateSearchDocumentsFromPages('proj-1', pages);
        assert.strictEqual(docs.length, 0, 'All documents must be excluded when FORCE_NOINDEX is active');
      } finally {
        process.env.FORCE_NOINDEX = originalEnv;
      }
    });
  });

  describe('11. Canonical RoutingService Map Contract (Keyed by /path)', () => {
    it('correctly maps route.pageId and route.path from RoutingService resolvableRoutes Map', () => {
      const page1 = createMockPage({
        id: 'page-abc-123',
        publishedRevisionId: 'rev-abc-123',
        publishedRevision: {
          id: 'rev-abc-123',
          pageId: 'page-abc-123',
          revisionNumber: 1,
          status: 'PUBLISHED',
          title: 'Kanonická routa test',
          slug: 'novinka',
          locale: 'cs',
          description: 'Popis testu',
          visibility: 'PUBLIC',
          content: {
            version: 1,
            schemaVersion: '1.0.0',
            blocks: [{ id: 'b1', type: 'paragraph', order: 0, data: { text: 'Obsah článku' } }],
          },
          seo: { noIndex: false },
          navigation: {},
          schemaVersion: '1.0.0',
        },
      });

      const page2 = createMockPage({
        id: 'page-xyz-789',
        publishedRevisionId: 'rev-xyz-789',
        publishedRevision: {
          id: 'rev-xyz-789',
          pageId: 'page-xyz-789',
          revisionNumber: 1,
          status: 'PUBLISHED',
          title: 'Druhá stránka',
          slug: 'o-nas',
          locale: 'cs',
          description: null,
          visibility: 'PUBLIC',
          content: {
            version: 1,
            schemaVersion: '1.0.0',
            blocks: [{ id: 'b2', type: 'paragraph', order: 0, data: { text: 'O nás text' } }],
          },
          seo: { noIndex: false },
          navigation: {},
          schemaVersion: '1.0.0',
        },
      });

      // Canonical RoutingService returns Map<path, DerivedPublishedRoute>
      // The keys of the map are the canonical URL paths (e.g. '/blog/novinka'), NOT pageIds!
      const mockResolvableRoutes = new Map<string, { pageId: string; path: string }>([
        ['/blog/novinka', { pageId: 'page-abc-123', path: '/blog/novinka' }],
        ['/spolecnost/o-nas', { pageId: 'page-xyz-789', path: '/spolecnost/o-nas' }],
      ]);

      const mockRoutingService = {
        derivePublishedRoutesFromPages(_projectId: string, _pages: PageWithPublishedRevision[]) {
          return {
            resolvableRoutes: mockResolvableRoutes,
          };
        },
      };

      const docs = generateSearchDocumentsFromPages('proj-1', [page1, page2], {
        routingService: mockRoutingService,
      });

      assert.strictEqual(docs.length, 2);

      const doc1 = docs.find(d => d.pageId === 'page-abc-123');
      assert(doc1, 'Document for page-abc-123 must be generated');
      assert.strictEqual(doc1.path, '/blog/novinka');
      assert.strictEqual(doc1.title, 'Kanonická routa test');

      const doc2 = docs.find(d => d.pageId === 'page-xyz-789');
      assert(doc2, 'Document for page-xyz-789 must be generated');
      assert.strictEqual(doc2.path, '/spolecnost/o-nas');
    });
  });

  describe('12. Canonical Content Validation in Rebuild (Fail-Closed)', () => {
    it('fails closed and excludes pages with invalid canonical PageContent from search index', () => {
      const validPage = createMockPage({
        id: 'page-valid',
        publishedRevisionId: 'rev-valid',
        publishedRevision: {
          id: 'rev-valid',
          pageId: 'page-valid',
          revisionNumber: 1,
          status: 'PUBLISHED',
          title: 'Platná stránka',
          slug: 'platna',
          locale: 'cs',
          description: 'Validní',
          visibility: 'PUBLIC',
          content: {
            version: 1,
            schemaVersion: '1.0.0',
            blocks: [{ id: 'b1', type: 'paragraph', order: 0, data: { text: 'Validní odstavec' } }],
          },
          seo: { noIndex: false },
          navigation: {},
          schemaVersion: '1.0.0',
        },
      });

      const invalidPages = [
        // 1. Missing / non-object content
        createMockPage({
          id: 'page-invalid-null',
          publishedRevision: { content: null } as unknown as any,
        }),
        // 2. String content (e.g. raw markdown not canonical blocks)
        createMockPage({
          id: 'page-invalid-string',
          publishedRevision: { content: '# Raw Markdown String' } as unknown as any,
        }),
        // 3. Invalid version
        createMockPage({
          id: 'page-invalid-version',
          publishedRevision: {
            content: { version: -1, schemaVersion: '1.0.0', blocks: [] },
          } as unknown as any,
        }),
        // 4. Missing schemaVersion
        createMockPage({
          id: 'page-invalid-schema',
          publishedRevision: {
            content: { version: 1, schemaVersion: '', blocks: [] },
          } as unknown as any,
        }),
        // 5. Blocks is not an array
        createMockPage({
          id: 'page-invalid-blocks-type',
          publishedRevision: {
            content: { version: 1, schemaVersion: '1.0.0', blocks: 'invalid' },
          } as unknown as any,
        }),
        // 6. Unknown / unapproved block type
        createMockPage({
          id: 'page-invalid-block-type',
          publishedRevision: {
            content: {
              version: 1,
              schemaVersion: '1.0.0',
              blocks: [{ id: 'b-bad', type: 'unauthorized_script_block', order: 0, data: {} }],
            },
          } as unknown as any,
        }),
      ];

      const allPages = [validPage, ...invalidPages];
      const docs = generateSearchDocumentsFromPages('proj-1', allPages);

      assert.strictEqual(docs.length, 1, 'Only the valid canonical page should be indexed');
      assert.strictEqual(docs[0].pageId, 'page-valid');
      assert.strictEqual(docs[0].path, '/platna');
    });
  });
});
