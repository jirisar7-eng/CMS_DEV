import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  AdminPagesService,
  AdminPagesReadStore,
  PrismaAdminPagesReadStore,
  AdminPagesPersistenceError,
  PersistencePage,
  PersistencePageRevision,
  PersistenceUser,
  PersistenceAuditLog,
} from '../lib/domain/pages-persistence';
import type { PageContent } from '../lib/domain/content/contracts';

// In-memory fake read store for deterministic unit testing
class FakeAdminPagesReadStore implements AdminPagesReadStore {
  pages: PersistencePage[] = [];
  revisions: PersistencePageRevision[] = [];
  users: Map<string, PersistenceUser> = new Map();
  auditLogs: PersistenceAuditLog[] = [];

  async listProjectPages(projectId: string): Promise<PersistencePage[]> {
    return this.pages.filter((p) => p.projectId === projectId);
  }

  async getProjectPage(
    projectId: string,
    pageId: string
  ): Promise<PersistencePage | null> {
    const p = this.pages.find((page) => page.id === pageId && page.projectId === projectId);
    return p || null;
  }

  async getProjectRevision(
    pageId: string,
    revisionId: string
  ): Promise<PersistencePageRevision | null> {
    const rev = this.revisions.find(
      (r) => r.id === revisionId && r.pageId === pageId
    );
    return rev || null;
  }

  async listPageRevisions(pageId: string): Promise<PersistencePageRevision[]> {
    return this.revisions
      .filter((r) => r.pageId === pageId)
      .sort((a, b) => b.revisionNumber - a.revisionNumber);
  }

  async getUsersByIds(userIds: string[]): Promise<Map<string, PersistenceUser>> {
    const map = new Map<string, PersistenceUser>();
    for (const id of userIds) {
      const u = this.users.get(id);
      if (u) map.set(id, u);
    }
    return map;
  }

  async listPageAuditEvents(
    projectId: string,
    pageId: string
  ): Promise<PersistenceAuditLog[]> {
    return this.auditLogs.filter((log) => {
      if (log.scopeType !== 'PROJECT' || log.scopeId !== projectId) return false;
      if (log.resourceId === pageId) return true;
      if (log.metadata && typeof log.metadata === 'object') {
        return (log.metadata as Record<string, unknown>).pageId === pageId;
      }
      return false;
    });
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

function createValidRevision(overrides: Partial<PersistencePageRevision> = {}): PersistencePageRevision {
  return {
    id: 'rev-1',
    pageId: 'page-1',
    revisionNumber: 1,
    status: 'DRAFT',
    title: 'Domovská stránka',
    slug: 'home',
    locale: 'cs',
    description: 'Popis stránky',
    visibility: 'PUBLIC',
    content: canonicalSampleContent,
    seo: { metaTitle: 'Domů', metaDescription: 'SEO popis' },
    navigation: { showInMainNavigation: true, order: 10 },
    schemaVersion: '1.0.0',
    lockVersion: 1,
    createdById: 'user-admin',
    createdAt: new Date('2026-01-01T10:00:00Z'),
    submittedAt: null,
    approvedAt: null,
    publishedAt: null,
    derivedFromRevisionId: null,
    ...overrides,
  };
}

function createValidPage(overrides: Partial<PersistencePage> = {}): PersistencePage {
  return {
    id: 'page-1',
    projectId: 'proj-alpha',
    key: 'home-page',
    parentId: null,
    sortOrder: 0,
    draftRevisionId: 'rev-1',
    publishedRevisionId: null,
    createdAt: new Date('2026-01-01T10:00:00Z'),
    updatedAt: new Date('2026-01-02T12:00:00Z'),
    ...overrides,
  };
}

describe('SYN-CONTENT-002: Admin Pages Persistence Adapter', () => {
  describe('AUTH & ISOLATION', () => {
    it('rejects actor without content.view (FORBIDDEN)', async () => {
      const store = new FakeAdminPagesReadStore();
      const service = new AdminPagesService(store, async () => false);

      await assert.rejects(
        () => service.getPages({ actorId: 'user-guest', projectId: 'proj-alpha' }),
        (err: any) => {
          assert.strictEqual(err.name, 'AdminPagesPersistenceError');
          assert.strictEqual(err.code, 'FORBIDDEN');
          return true;
        }
      );
    });

    it('rejects actor from project A attempting to read project B (FORBIDDEN)', async () => {
      const store = new FakeAdminPagesReadStore();
      // Actor has permission only for proj-alpha, not proj-beta
      const service = new AdminPagesService(
        store,
        async (actorId, perm, projId) => projId === 'proj-alpha'
      );

      await assert.rejects(
        () => service.getPages({ actorId: 'user-1', projectId: 'proj-beta' }),
        (err: any) => {
          assert.strictEqual(err.code, 'FORBIDDEN');
          return true;
        }
      );
    });

    it('rejects invalid/blank actorId and projectId (INVALID_INPUT)', async () => {
      const store = new FakeAdminPagesReadStore();
      const service = new AdminPagesService(store, async () => true);

      await assert.rejects(
        () => service.getPages({ actorId: '', projectId: 'proj-alpha' }),
        (err: any) => err.code === 'INVALID_INPUT'
      );

      await assert.rejects(
        () => service.getPages({ actorId: 'user-1', projectId: '   ' }),
        (err: any) => err.code === 'INVALID_INPUT'
      );

      await assert.rejects(
        () => service.getPageById({ actorId: 'user-1', projectId: 'proj-alpha', pageId: ' ' }),
        (err: any) => err.code === 'INVALID_INPUT'
      );
    });

    it('allows valid actor with content.view', async () => {
      const store = new FakeAdminPagesReadStore();
      const rev = createValidRevision();
      const page = createValidPage({ draftRevision: rev });
      store.pages = [page];
      store.revisions = [rev];

      const service = new AdminPagesService(store, async () => true);
      const pages = await service.getPages({ actorId: 'user-1', projectId: 'proj-alpha' });

      assert.strictEqual(pages.length, 1);
      assert.strictEqual(pages[0].id, 'page-1');
      assert.strictEqual(pages[0].title, 'Domovská stránka');
    });
  });

  describe('STATUS MAPPING', () => {
    const testCases: Array<{ dbStatus: string; expected: string }> = [
      { dbStatus: 'DRAFT', expected: 'Koncept' },
      { dbStatus: 'IN_REVIEW', expected: 'Ke kontrole' },
      { dbStatus: 'APPROVED', expected: 'Schváleno' },
      { dbStatus: 'PUBLISHED', expected: 'Publikováno' },
    ];

    for (const { dbStatus, expected } of testCases) {
      it(`maps ${dbStatus} -> ${expected}`, async () => {
        const store = new FakeAdminPagesReadStore();
        const rev = createValidRevision({ status: dbStatus });
        const page = createValidPage({ draftRevision: rev });
        store.pages = [page];
        store.revisions = [rev];

        const service = new AdminPagesService(store, async () => true);
        const pages = await service.getPages({ actorId: 'user-1', projectId: 'proj-alpha' });
        assert.strictEqual(pages[0].status, expected);
      });
    }

    it('rejects corrupt/unknown or fabricated status', async () => {
      const store = new FakeAdminPagesReadStore();
      const rev = createValidRevision({ status: 'SCHEDULED_FAKE' });
      const page = createValidPage({ draftRevision: rev });
      store.pages = [page];
      store.revisions = [rev];

      const service = new AdminPagesService(store, async () => true);
      await assert.rejects(
        () => service.getPages({ actorId: 'user-1', projectId: 'proj-alpha' }),
        (err: any) => err.code === 'PAGE_STATE_INVALID'
      );
    });
  });

  describe('POINTER INTEGRITY', () => {
    it('prefers draftRevisionId when both exist', async () => {
      const store = new FakeAdminPagesReadStore();
      const draftRev = createValidRevision({
        id: 'rev-draft',
        status: 'DRAFT',
        title: 'Draft Title',
      });
      const publishedRev = createValidRevision({
        id: 'rev-pub',
        status: 'PUBLISHED',
        title: 'Live Title',
      });
      const page = createValidPage({
        draftRevisionId: 'rev-draft',
        publishedRevisionId: 'rev-pub',
        draftRevision: draftRev,
        publishedRevision: publishedRev,
      });
      store.pages = [page];
      store.revisions = [draftRev, publishedRev];

      const service = new AdminPagesService(store, async () => true);
      const pages = await service.getPages({ actorId: 'user-1', projectId: 'proj-alpha' });

      assert.strictEqual(pages[0].title, 'Draft Title');
      assert.strictEqual(pages[0].status, 'Koncept');
    });

    it('uses publishedRevisionId when no draft exists', async () => {
      const store = new FakeAdminPagesReadStore();
      const publishedRev = createValidRevision({
        id: 'rev-pub',
        status: 'PUBLISHED',
        title: 'Live Title Only',
      });
      const page = createValidPage({
        draftRevisionId: null,
        publishedRevisionId: 'rev-pub',
        publishedRevision: publishedRev,
      });
      store.pages = [page];
      store.revisions = [publishedRev];

      const service = new AdminPagesService(store, async () => true);
      const pages = await service.getPages({ actorId: 'user-1', projectId: 'proj-alpha' });

      assert.strictEqual(pages[0].title, 'Live Title Only');
      assert.strictEqual(pages[0].status, 'Publikováno');
    });

    it('pointer targeting another page throws POINTER_INTEGRITY_VIOLATION', async () => {
      const store = new FakeAdminPagesReadStore();
      const foreignRev = createValidRevision({
        id: 'rev-foreign',
        pageId: 'page-OTHER', // Different page!
      });
      const page = createValidPage({
        draftRevisionId: 'rev-foreign',
        draftRevision: foreignRev,
      });
      store.pages = [page];
      store.revisions = [foreignRev];

      const service = new AdminPagesService(store, async () => true);
      await assert.rejects(
        () => service.getPages({ actorId: 'user-1', projectId: 'proj-alpha' }),
        (err: any) => err.code === 'POINTER_INTEGRITY_VIOLATION'
      );
    });

    it('page missing both pointers throws PAGE_STATE_INVALID', async () => {
      const store = new FakeAdminPagesReadStore();
      const page = createValidPage({
        draftRevisionId: null,
        publishedRevisionId: null,
      });
      store.pages = [page];

      const service = new AdminPagesService(store, async () => true);
      await assert.rejects(
        () => service.getPages({ actorId: 'user-1', projectId: 'proj-alpha' }),
        (err: any) => err.code === 'PAGE_STATE_INVALID'
      );
    });
  });

  describe('HIERARCHY & PATH', () => {
    it('derives root page path /slug correctly', async () => {
      const store = new FakeAdminPagesReadStore();
      const rev = createValidRevision({ slug: 'o-nas' });
      const page = createValidPage({ parentId: null, draftRevision: rev });
      store.pages = [page];
      store.revisions = [rev];

      const service = new AdminPagesService(store, async () => true);
      const pages = await service.getPages({ actorId: 'user-1', projectId: 'proj-alpha' });
      assert.strictEqual(pages[0].path, '/o-nas');
    });

    it('derives child and nested grandchild page paths correctly', async () => {
      const store = new FakeAdminPagesReadStore();
      const rootRev = createValidRevision({ id: 'rev-root', pageId: 'page-root', slug: 'sluzby' });
      const rootPage = createValidPage({
        id: 'page-root',
        parentId: null,
        draftRevisionId: 'rev-root',
        draftRevision: rootRev,
      });

      const childRev = createValidRevision({ id: 'rev-child', pageId: 'page-child', slug: 'vyvoj' });
      const childPage = createValidPage({
        id: 'page-child',
        parentId: 'page-root',
        draftRevisionId: 'rev-child',
        draftRevision: childRev,
      });

      const grandRev = createValidRevision({ id: 'rev-grand', pageId: 'page-grand', slug: 'web' });
      const grandPage = createValidPage({
        id: 'page-grand',
        parentId: 'page-child',
        draftRevisionId: 'rev-grand',
        draftRevision: grandRev,
      });

      store.pages = [rootPage, childPage, grandPage];
      store.revisions = [rootRev, childRev, grandRev];

      const service = new AdminPagesService(store, async () => true);
      const pages = await service.getPages({ actorId: 'user-1', projectId: 'proj-alpha' });

      const pageMap = new Map(pages.map((p) => [p.id, p]));
      assert.strictEqual(pageMap.get('page-root')?.path, '/sluzby');
      assert.strictEqual(pageMap.get('page-child')?.path, '/sluzby/vyvoj');
      assert.strictEqual(pageMap.get('page-grand')?.path, '/sluzby/vyvoj/web');
    });

    it('missing parent throws HIERARCHY_INTEGRITY_VIOLATION', async () => {
      const store = new FakeAdminPagesReadStore();
      const rev = createValidRevision();
      const page = createValidPage({
        parentId: 'non-existent-parent',
        draftRevision: rev,
      });
      store.pages = [page];
      store.revisions = [rev];

      const service = new AdminPagesService(store, async () => true);
      await assert.rejects(
        () => service.getPages({ actorId: 'user-1', projectId: 'proj-alpha' }),
        (err: any) => err.code === 'HIERARCHY_INTEGRITY_VIOLATION'
      );
    });

    it('cyclic parent link throws HIERARCHY_INTEGRITY_VIOLATION', async () => {
      const store = new FakeAdminPagesReadStore();
      const revA = createValidRevision({ id: 'rev-a', pageId: 'page-a', slug: 'a' });
      const pageA = createValidPage({
        id: 'page-a',
        parentId: 'page-b',
        draftRevisionId: 'rev-a',
        draftRevision: revA,
      });

      const revB = createValidRevision({ id: 'rev-b', pageId: 'page-b', slug: 'b' });
      const pageB = createValidPage({
        id: 'page-b',
        parentId: 'page-a', // Cycle!
        draftRevisionId: 'rev-b',
        draftRevision: revB,
      });

      store.pages = [pageA, pageB];
      store.revisions = [revA, revB];

      const service = new AdminPagesService(store, async () => true);
      await assert.rejects(
        () => service.getPages({ actorId: 'user-1', projectId: 'proj-alpha' }),
        (err: any) => err.code === 'HIERARCHY_INTEGRITY_VIOLATION'
      );
    });

    it('tree maintains sortOrder and level depth', async () => {
      const store = new FakeAdminPagesReadStore();
      const revRoot = createValidRevision({ id: 'rev-0', pageId: 'page-0', slug: 'root' });
      const pageRoot = createValidPage({
        id: 'page-0',
        parentId: null,
        sortOrder: 1,
        draftRevisionId: 'rev-0',
        draftRevision: revRoot,
      });

      const revChild1 = createValidRevision({ id: 'rev-1', pageId: 'page-1', slug: 'child1' });
      const pageChild1 = createValidPage({
        id: 'page-1',
        parentId: 'page-0',
        sortOrder: 20,
        draftRevisionId: 'rev-1',
        draftRevision: revChild1,
      });

      const revChild2 = createValidRevision({ id: 'rev-2', pageId: 'page-2', slug: 'child2' });
      const pageChild2 = createValidPage({
        id: 'page-2',
        parentId: 'page-0',
        sortOrder: 10, // Should be first child
        draftRevisionId: 'rev-2',
        draftRevision: revChild2,
      });

      store.pages = [pageRoot, pageChild1, pageChild2];
      store.revisions = [revRoot, revChild1, revChild2];

      const service = new AdminPagesService(store, async () => true);
      const tree = await service.getPageTree({ actorId: 'user-1', projectId: 'proj-alpha' });

      assert.strictEqual(tree.length, 1);
      assert.strictEqual(tree[0].id, 'page-0');
      assert.strictEqual(tree[0].level, 0);
      assert.strictEqual(tree[0].children.length, 2);

      // Child 2 has sortOrder 10, child 1 has sortOrder 20
      assert.strictEqual(tree[0].children[0].id, 'page-2');
      assert.strictEqual(tree[0].children[0].level, 1);
      assert.strictEqual(tree[0].children[1].id, 'page-1');
      assert.strictEqual(tree[0].children[1].level, 1);
    });
  });

  describe('CAPABILITIES', () => {
    it('A. DRAFT + all permissions: canPublish === false, canSave === true, canSubmitReview === true', async () => {
      const store = new FakeAdminPagesReadStore();
      const draftRev = createValidRevision({ status: 'DRAFT' });
      const page = createValidPage({ draftRevision: draftRev });
      store.pages = [page];
      store.revisions = [draftRev];

      const service = new AdminPagesService(store, async () => true);
      const pages = await service.getPages({ actorId: 'user-admin', projectId: 'proj-alpha' });
      const caps = pages[0].capabilities;

      assert.strictEqual(caps.canPublish, false);
      assert.strictEqual(caps.canSave, true);
      assert.strictEqual(caps.canSubmitReview, true);
    });

    it('B. IN_REVIEW + all permissions: canPublish === false, canSave === false, canSubmitReview === false', async () => {
      const store = new FakeAdminPagesReadStore();
      const inReviewRev = createValidRevision({ status: 'IN_REVIEW' });
      const page = createValidPage({ draftRevision: inReviewRev });
      store.pages = [page];
      store.revisions = [inReviewRev];

      const service = new AdminPagesService(store, async () => true);
      const pages = await service.getPages({ actorId: 'user-admin', projectId: 'proj-alpha' });
      const caps = pages[0].capabilities;

      assert.strictEqual(caps.canPublish, false);
      assert.strictEqual(caps.canSave, false);
      assert.strictEqual(caps.canSubmitReview, false);
    });

    it('C. APPROVED + content.publish: canPublish === true, canSave === false, canSubmitReview === false', async () => {
      const store = new FakeAdminPagesReadStore();
      const approvedRev = createValidRevision({ status: 'APPROVED' });
      const page = createValidPage({ draftRevision: approvedRev });
      store.pages = [page];
      store.revisions = [approvedRev];

      const service = new AdminPagesService(store, async () => true);
      const pages = await service.getPages({ actorId: 'user-publisher', projectId: 'proj-alpha' });
      const caps = pages[0].capabilities;

      assert.strictEqual(caps.canPublish, true);
      assert.strictEqual(caps.canSave, false);
      assert.strictEqual(caps.canSubmitReview, false);
    });

    it('D. APPROVED without content.publish: canPublish === false', async () => {
      const store = new FakeAdminPagesReadStore();
      const approvedRev = createValidRevision({ status: 'APPROVED' });
      const page = createValidPage({ draftRevision: approvedRev });
      store.pages = [page];
      store.revisions = [approvedRev];

      // Has view and edit, but lacks content.publish
      const service = new AdminPagesService(
        store,
        async (actorId, perm) => perm === 'content.view' || perm === 'content.edit'
      );
      const pages = await service.getPages({ actorId: 'user-editor', projectId: 'proj-alpha' });
      const caps = pages[0].capabilities;

      assert.strictEqual(caps.canPublish, false);
    });

    it('E. PUBLISHED + all permissions: canPublish === false', async () => {
      const store = new FakeAdminPagesReadStore();
      const pubRev = createValidRevision({ status: 'PUBLISHED' });
      const page = createValidPage({
        draftRevisionId: null,
        publishedRevisionId: 'rev-1',
        publishedRevision: pubRev,
      });
      store.pages = [page];
      store.revisions = [pubRev];

      const service = new AdminPagesService(store, async () => true);
      const pages = await service.getPages({ actorId: 'user-admin', projectId: 'proj-alpha' });
      const caps = pages[0].capabilities;

      assert.strictEqual(caps.canPublish, false);
      assert.strictEqual(caps.canSave, false);
      assert.strictEqual(caps.canSubmitReview, false);
    });
  });

  describe('DETAIL & CONTENT', () => {
    it('canonical content is validated and details are mapped correctly', async () => {
      const store = new FakeAdminPagesReadStore();
      const rev1 = createValidRevision({
        id: 'rev-1',
        revisionNumber: 1,
        createdAt: new Date('2026-01-01T10:00:00Z'),
      });
      const rev2 = createValidRevision({
        id: 'rev-2',
        revisionNumber: 2,
        createdAt: new Date('2026-01-02T10:00:00Z'),
      });
      const page = createValidPage({
        draftRevisionId: 'rev-2',
        draftRevision: rev2,
      });

      store.pages = [page];
      store.revisions = [rev1, rev2];
      store.users.set('user-admin', { id: 'user-admin', displayName: 'Administrátor' });
      store.auditLogs = [
        {
          id: 'audit-1',
          actorId: 'user-admin',
          action: 'CONTENT_PAGE_CREATED',
          scopeType: 'PROJECT',
          scopeId: 'proj-alpha',
          resourceType: 'PAGE',
          resourceId: 'page-1',
          metadata: { pageId: 'page-1', secretToken: 'LEAK_ME_NOT' },
          createdAt: new Date('2026-01-01T10:00:00Z'),
        },
      ];

      const service = new AdminPagesService(store, async () => true);
      const detail = await service.getPageById({
        actorId: 'user-admin',
        projectId: 'proj-alpha',
        pageId: 'page-1',
      });

      assert.ok(detail);
      assert.strictEqual(detail.id, 'page-1');
      assert.strictEqual(detail.author.name, 'Administrátor');
      assert.strictEqual(detail.content.blocks.length, 2);

      // Revisions ordered descending by revisionNumber
      assert.strictEqual(detail.revisions.length, 2);
      assert.strictEqual(detail.revisions[0].version, 'v2');
      assert.strictEqual(detail.revisions[1].version, 'v1');

      // Activity mapped safely without leaking metadata secrets
      assert.strictEqual(detail.activity.length, 1);
      assert.strictEqual(detail.activity[0].action, 'CONTENT_PAGE_CREATED');
      assert.strictEqual(detail.activity[0].details, 'Stránka byla vytvořena');
      assert.strictEqual(JSON.stringify(detail.activity).includes('LEAK_ME_NOT'), false);
    });

    it('corrupt JSON / invalid content throws CONTENT_INTEGRITY_VIOLATION', async () => {
      const store = new FakeAdminPagesReadStore();
      const corruptRev = createValidRevision({
        content: { version: -1, schemaVersion: '', blocks: 'not-an-array' },
      });
      const page = createValidPage({ draftRevision: corruptRev });
      store.pages = [page];
      store.revisions = [corruptRev];

      const service = new AdminPagesService(store, async () => true);
      await assert.rejects(
        () =>
          service.getPageById({
            actorId: 'user-admin',
            projectId: 'proj-alpha',
            pageId: 'page-1',
          }),
        (err: any) => err.code === 'CONTENT_INTEGRITY_VIOLATION'
      );
    });
  });

  describe('DATABASE UNAVAILABILITY', () => {
    it('production Prisma adapter throws DATABASE_UNAVAILABLE when isDatabaseConfigured() false', async () => {
      const originalDbUrl = process.env.DATABASE_URL;
      try {
        process.env.DATABASE_URL = '';
        const store = new PrismaAdminPagesReadStore({} as any);

        await assert.rejects(
          () => store.listProjectPages('proj-alpha'),
          (err: any) => {
            assert.strictEqual(err.name, 'AdminPagesPersistenceError');
            assert.strictEqual(err.code, 'DATABASE_UNAVAILABLE');
            return true;
          }
        );
      } finally {
        process.env.DATABASE_URL = originalDbUrl;
      }
    });
  });

  describe('SERVER ONLY', () => {
    it('production adapter cannot be safely imported into client bundle', () => {
      const filePath = path.join(
        process.cwd(),
        'lib/domain/pages-persistence/prisma-store.ts'
      );
      const content = fs.readFileSync(filePath, 'utf8');
      assert.ok(
        content.startsWith("import 'server-only';"),
        'Prisma store must start with import server-only;'
      );
    });

    it('service.ts contains import server-only', () => {
      const filePath = path.join(
        process.cwd(),
        'lib/domain/pages-persistence/service.ts'
      );
      const content = fs.readFileSync(filePath, 'utf8');
      assert.ok(
        content.startsWith("import 'server-only';"),
        'service.ts must start with import server-only;'
      );
    });
  });
});
