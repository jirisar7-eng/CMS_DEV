// @ts-nocheck

// Patch Module resolution for dependencies not present in isolated clone


import { describe, it } from "node:test";
import assert from "node:assert";
import {
  extractMediaReferences,
  hasMediaReferences,
} from "../lib/domain/content/lifecycle/store";
import { PrismaContentLifecycleStore } from "../lib/domain/content/lifecycle/prisma-store";
import { ContentLifecycleService } from "../lib/domain/content/lifecycle/service";
import { PrismaMediaRepository } from "../lib/domain/media/prismaRepository";
import { ContentLifecycleError } from "../lib/domain/content/lifecycle/types";
import { PageContent } from "../lib/domain/content/contracts";

/**
 * In-memory transactional Prisma mock
 */
class InMemoryPrismaDatabase {
  pages = new Map<string, any>();
  pageRevisions = new Map<string, any>();
  mediaAssets = new Map<string, any>();
  mediaUsageReferences = new Map<string, any>();
  contentReleases = new Map<string, any>();
  contentReleaseItems = new Map<string, any>();
  users = new Map<string, any>();
  auditLogs: any[] = [];

  private cloneState() {
    return {
      pages: new Map(JSON.parse(JSON.stringify(Array.from(this.pages.entries())))),
      pageRevisions: new Map(JSON.parse(JSON.stringify(Array.from(this.pageRevisions.entries())))),
      mediaAssets: new Map(JSON.parse(JSON.stringify(Array.from(this.mediaAssets.entries())))),
      mediaUsageReferences: new Map(JSON.parse(JSON.stringify(Array.from(this.mediaUsageReferences.entries())))),
      contentReleases: new Map(JSON.parse(JSON.stringify(Array.from(this.contentReleases.entries())))),
      contentReleaseItems: new Map(JSON.parse(JSON.stringify(Array.from(this.contentReleaseItems.entries())))),
      users: new Map(JSON.parse(JSON.stringify(Array.from(this.users.entries())))),
      auditLogs: [...this.auditLogs],
    };
  }

  private restoreState(snapshot: any) {
    this.pages = snapshot.pages;
    this.pageRevisions = snapshot.pageRevisions;
    this.mediaAssets = snapshot.mediaAssets;
    this.mediaUsageReferences = snapshot.mediaUsageReferences;
    this.contentReleases = snapshot.contentReleases;
    this.contentReleaseItems = snapshot.contentReleaseItems;
    this.users = snapshot.users;
    this.auditLogs = snapshot.auditLogs;
  }

  async $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const snapshot = this.cloneState();
    try {
      const res = await fn(this.asClient());
      return res;
    } catch (err) {
      this.restoreState(snapshot);
      throw err;
    }
  }

  asClient(): any {
    const db = this;
    return {
      $transaction: db.$transaction.bind(db),
      page: {
        findFirst: async ({ where }: any) => {
          for (const p of db.pages.values()) {
            let match = true;
            if (where.id !== undefined && p.id !== where.id) match = false;
            if (where.projectId !== undefined && p.projectId !== where.projectId) match = false;
            if (where.key !== undefined && p.key !== where.key) match = false;
            if (match) return { ...p };
          }
          return null;
        },
        create: async ({ data }: any) => {
          const id = data.id || "page-" + Math.random().toString(36).substring(2, 9);
          const p = {
            id,
            projectId: data.projectId,
            key: data.key,
            parentId: data.parentId ?? null,
            draftRevisionId: data.draftRevisionId ?? null,
            publishedRevisionId: data.publishedRevisionId ?? null,
            scheduledRevisionId: data.scheduledRevisionId ?? null,
            scheduledPublishAt: data.scheduledPublishAt ?? null,
            scheduledById: data.scheduledById ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          db.pages.set(id, p);
          return { ...p };
        },
        update: async ({ where, data }: any) => {
          const p = db.pages.get(where.id);
          if (!p) throw new Error("Page not found");
          Object.assign(p, data, { updatedAt: new Date() });
          return { ...p };
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const p of db.pages.values()) {
            let match = true;
            if (where.id !== undefined && p.id !== where.id) match = false;
            if (where.projectId !== undefined && p.projectId !== where.projectId) match = false;
            if (where.draftRevisionId !== undefined && p.draftRevisionId !== where.draftRevisionId) match = false;
            if (where.publishedRevisionId !== undefined && p.publishedRevisionId !== where.publishedRevisionId) match = false;
            if (where.scheduledRevisionId !== undefined && p.scheduledRevisionId !== where.scheduledRevisionId) match = false;
            if (where.scheduledPublishAt !== undefined && p.scheduledPublishAt?.getTime() !== where.scheduledPublishAt?.getTime()) match = false;
            if (where.scheduledById !== undefined && p.scheduledById !== where.scheduledById) match = false;
            if (match) {
              Object.assign(p, data, { updatedAt: new Date() });
              count++;
            }
          }
          return { count };
        },
      },
      pageRevision: {
        findUnique: async ({ where }: any) => {
          const r = db.pageRevisions.get(where.id);
          return r ? JSON.parse(JSON.stringify(r)) : null;
        },
        findFirst: async ({ where }: any) => {
          for (const r of db.pageRevisions.values()) {
            let match = true;
            if (where.id !== undefined && r.id !== where.id) match = false;
            if (where.pageId !== undefined && r.pageId !== where.pageId) match = false;
            if (where.status !== undefined && r.status !== where.status) match = false;
            if (where.lockVersion !== undefined && r.lockVersion !== where.lockVersion) match = false;
            if (match) return { ...r };
          }
          return null;
        },
        findMany: async ({ where, orderBy }: any) => {
          const list: any[] = [];
          for (const r of db.pageRevisions.values()) {
            let match = true;
            if (where?.id?.in && !where.id.in.includes(r.id)) match = false;
            if (where?.pageId !== undefined && r.pageId !== where.pageId) match = false;
            if (where?.status !== undefined && r.status !== where.status) match = false;
            if (match) list.push({ ...r });
          }
          if (orderBy?.revisionNumber === "desc") {
            list.sort((a, b) => b.revisionNumber - a.revisionNumber);
          }
          return list;
        },
        create: async ({ data }: any) => {
          const id = data.id || "rev-" + Math.random().toString(36).substring(2, 9);
          const r = {
            id,
            pageId: data.pageId,
            revisionNumber: data.revisionNumber,
            title: data.title,
            slug: data.slug,
            locale: data.locale,
            description: data.description ?? null,
            visibility: data.visibility ?? "PUBLIC",
            content: data.content,
            schemaVersion: data.schemaVersion ?? "1.0",
            lockVersion: data.lockVersion ?? 1,
            status: data.status ?? "DRAFT",
            createdById: data.createdById,
            createdAt: new Date(),
            submittedAt: data.submittedAt ?? null,
            approvedAt: data.approvedAt ?? null,
            publishedAt: data.publishedAt ?? null,
            derivedFromRevisionId: data.derivedFromRevisionId ?? null,
          };
          db.pageRevisions.set(id, r);
          return { ...r };
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const r of db.pageRevisions.values()) {
            let match = true;
            if (where.id !== undefined && r.id !== where.id) match = false;
            if (where.pageId !== undefined && r.pageId !== where.pageId) match = false;
            if (where.status !== undefined && r.status !== where.status) match = false;
            if (where.lockVersion !== undefined && r.lockVersion !== where.lockVersion) match = false;
            if (match) {
              const updatedData = { ...data };
              if (updatedData.lockVersion?.increment) {
                updatedData.lockVersion = r.lockVersion + updatedData.lockVersion.increment;
              }
              Object.assign(r, updatedData);
              count++;
            }
          }
          return { count };
        },
      },
      mediaAsset: {
        findUnique: async ({ where }: any) => {
          const a = db.mediaAssets.get(where.id);
          return a ? JSON.parse(JSON.stringify(a)) : null;
        },
        findFirst: async ({ where }: any) => {
          for (const a of db.mediaAssets.values()) {
            let match = true;
            if (where.id !== undefined && a.id !== where.id) match = false;
            if (where.projectId !== undefined && a.projectId !== where.projectId) match = false;
            if (match) return JSON.parse(JSON.stringify(a));
          }
          return null;
        },
        findMany: async ({ where }: any) => {
          const list: any[] = [];
          for (const a of db.mediaAssets.values()) {
            let match = true;
            if (where?.id?.in && !where.id.in.includes(a.id)) match = false;
            if (where?.projectId !== undefined && a.projectId !== where.projectId) match = false;
            if (match) list.push(JSON.parse(JSON.stringify(a)));
          }
          return list;
        },
        update: async ({ where, data }: any) => {
          const a = db.mediaAssets.get(where.id);
          if (!a) throw new Error("MediaAsset not found");
          Object.assign(a, data);
          return JSON.parse(JSON.stringify(a));
        },
        delete: async ({ where }: any) => {
          db.mediaAssets.delete(where.id);
          return {};
        },
      },
      mediaUsageReference: {
        findMany: async ({ where }: any) => {
          const list: any[] = [];
          for (const ref of db.mediaUsageReferences.values()) {
            let match = true;
            if (where?.pageId !== undefined && ref.pageId !== where.pageId) match = false;
            if (where?.assetId !== undefined && ref.assetId !== where.assetId) match = false;
            if (match) list.push(JSON.parse(JSON.stringify(ref)));
          }
          return list;
        },
        deleteMany: async ({ where }: any) => {
          let count = 0;
          for (const [id, ref] of Array.from(db.mediaUsageReferences.entries())) {
            let match = true;
            if (where?.pageId !== undefined && ref.pageId !== where.pageId) match = false;
            if (where?.assetId !== undefined && ref.assetId !== where.assetId) match = false;
            if (match) {
              db.mediaUsageReferences.delete(id);
              count++;
            }
          }
          return { count };
        },
        delete: async ({ where }: any) => {
          db.mediaUsageReferences.delete(where.id);
          return {};
        },
        create: async ({ data }: any) => {
          const id = data.id || "mur-" + Math.random().toString(36).substring(2, 9);
          const row = {
            id,
            assetId: data.assetId,
            pageId: data.pageId,
            pageTitle: data.pageTitle,
            pageSlug: data.pageSlug,
            blockId: data.blockId ?? null,
            blockType: data.blockType ?? null,
            field: data.field ?? null,
            usedAt: new Date(),
          };
          db.mediaUsageReferences.set(id, row);
          return JSON.parse(JSON.stringify(row));
        },
        count: async ({ where }: any) => {
          let count = 0;
          for (const ref of db.mediaUsageReferences.values()) {
            let match = true;
            if (where?.assetId !== undefined && ref.assetId !== where.assetId) match = false;
            if (where?.pageId !== undefined && ref.pageId !== where.pageId) match = false;
            if (match) count++;
          }
          return count;
        },
      },
      contentRelease: {
        create: async ({ data }: any) => {
          const id = "rel-" + Math.random().toString(36).substring(2, 9);
          const row = { id, ...data, createdAt: new Date() };
          db.contentReleases.set(id, row);
          return JSON.parse(JSON.stringify(row));
        },
        findMany: async () => Array.from(db.contentReleases.values()),
      },
      contentReleaseItem: {
        create: async ({ data }: any) => {
          const id = "item-" + Math.random().toString(36).substring(2, 9);
          const row = { id, ...data };
          db.contentReleaseItems.set(id, row);
          return JSON.parse(JSON.stringify(row));
        },
        findMany: async ({ where, include }: any = {}) => {
          const list: any[] = [];
          for (const item of db.contentReleaseItems.values()) {
            let match = true;
            if (where?.pageId !== undefined && item.pageId !== where.pageId) match = false;
            if (where?.revisionId !== undefined && item.revisionId !== where.revisionId) match = false;
            const rel = db.contentReleases.get(item.releaseId);
            if (where?.release?.projectId !== undefined && rel?.projectId !== where.release.projectId) match = false;
            if (where?.release?.status !== undefined && rel?.status !== where.release.status) match = false;
            if (match) {
              const itemCopy = JSON.parse(JSON.stringify(item));
              if (include?.release && rel) {
                itemCopy.release = JSON.parse(JSON.stringify(rel));
              }
              list.push(itemCopy);
            }
          }
          return list;
        },
      },
      user: {
        findUnique: async ({ where }: any) => {
          const u = db.users.get(where.id);
          return u ? JSON.parse(JSON.stringify(u)) : null;
        },
      },
      auditLog: {
        create: async ({ data }: any) => {
          db.auditLogs.push({ id: "audit-" + Math.random().toString(36).substring(2, 9), ...data });
          return {};
        },
      },
    };
  }
}

function makePageContent(blocks: any[]): PageContent {
  return {
    version: 1,
    schemaVersion: "1.0",
    blocks,
  };
}

describe("SYN-MEDIA-002 Phase B: Authoritative Media Usage References", () => {
  const projectId = "proj-media-002";
  const foreignProjectId = "proj-foreign-999";
  const actorId = "user-editor-1";
  const allowAllPermissions = async () => true;

  // 1. image.data.url = /api/media/A -> reference created
  it("1. image.data.url = /api/media/A -> reference created", () => {
    const content = makePageContent([
      {
        id: "b-img",
        type: "image",
        order: 0,
        data: {
          url: "/api/media/ast-exact-1",
          alt: "Description",
          caption: "Caption",
        },
      },
    ]);
    const extracted = extractMediaReferences(content);
    assert.strictEqual(extracted.length, 1);
    assert.strictEqual(extracted[0].assetId, "ast-exact-1");
    assert.strictEqual(extracted[0].blockId, "b-img");
    assert.strictEqual(extracted[0].blockType, "image");
    assert.strictEqual(extracted[0].field, "url");
  });

  // 2. nested image block -> reference created
  it("2. nested image block -> reference created", () => {
    const content = makePageContent([
      {
        id: "b-col",
        type: "columns",
        order: 0,
        data: { layout: "1-1" },
        children: [
          {
            id: "child-img",
            type: "image",
            order: 0,
            data: {
              url: "/api/media/ast-nested-2",
            },
          },
        ],
      },
      {
        id: "b-col-slot",
        type: "columns",
        order: 1,
        data: {
          columns: [
            {
              blocks: [
                {
                  id: "slot-img",
                  type: "image",
                  order: 0,
                  data: {
                    url: "/api/media/ast-slot-3",
                  },
                },
              ],
            },
          ],
        },
      },
    ]);
    const extracted = extractMediaReferences(content);
    assert.strictEqual(extracted.length, 2);
    assert.strictEqual(extracted[0].assetId, "ast-nested-2");
    assert.strictEqual(extracted[0].blockId, "child-img");
    assert.strictEqual(extracted[0].blockType, "image");
    assert.strictEqual(extracted[0].field, "url");
    assert.strictEqual(extracted[1].assetId, "ast-slot-3");
    assert.strictEqual(extracted[1].blockId, "slot-img");
    assert.strictEqual(extracted[1].blockType, "image");
    assert.strictEqual(extracted[1].field, "url");
  });

  // 3. paragraph.text = /api/media/A -> ignored
  it("3. paragraph.text = /api/media/A -> ignored", () => {
    const content = makePageContent([
      {
        id: "p1",
        type: "paragraph",
        order: 0,
        data: {
          text: "/api/media/ast-paragraph",
        },
      },
    ]);
    const extracted = extractMediaReferences(content);
    assert.strictEqual(extracted.length, 0);
  });

  // 4. heading.text = /api/media/A -> ignored
  it("4. heading.text = /api/media/A -> ignored", () => {
    const content = makePageContent([
      {
        id: "h1",
        type: "heading",
        order: 0,
        data: {
          text: "/api/media/ast-heading",
          level: 2,
        },
      },
    ]);
    const extracted = extractMediaReferences(content);
    assert.strictEqual(extracted.length, 0);
  });

  // 5. button.url = /api/media/A -> ignored
  it("5. button.url = /api/media/A -> ignored", () => {
    const content = makePageContent([
      {
        id: "btn1",
        type: "button",
        order: 0,
        data: {
          label: "Download",
          url: "/api/media/ast-button",
        },
      },
    ]);
    const extracted = extractMediaReferences(content);
    assert.strictEqual(extracted.length, 0);
  });

  // 6. module parameter = /api/media/A -> ignored
  it("6. module parameter = /api/media/A -> ignored", () => {
    const content = makePageContent([
      {
        id: "mod1",
        type: "module_embed",
        order: 0,
        data: {
          moduleId: "hero-slider",
          schemaVersion: "v1",
          parameters: {
            slideImage: "/api/media/ast-module-param-1",
            bgImage: "/api/media/ast-module-param-2",
          },
        },
      },
    ]);
    const extracted = extractMediaReferences(content);
    assert.strictEqual(extracted.length, 0);
  });

  // 7. prose containing /api/media/A -> ignored
  it("7. prose containing /api/media/A -> ignored", () => {
    const content = makePageContent([
      {
        id: "p-prose",
        type: "paragraph",
        order: 0,
        data: {
          text: "Check out the documentation at /api/media/ast-prose in the system",
        },
      },
      {
        id: "c-prose",
        type: "callout",
        order: 1,
        data: {
          text: "Note: /api/media/ast-callout is mentioned here",
        },
      },
      {
        id: "q-prose",
        type: "quote",
        order: 2,
        data: {
          quote: "Quoted /api/media/ast-quote reference",
        },
      },
    ]);
    const extracted = extractMediaReferences(content);
    assert.strictEqual(extracted.length, 0);
  });

  // 8. external URL containing /api/media/A -> ignored
  it("8. external URL containing /api/media/A -> ignored", () => {
    const content = makePageContent([
      {
        id: "img-ext",
        type: "image",
        order: 0,
        data: {
          url: "https://example.com/api/media/ast-ext",
        },
      },
      {
        id: "img-proto",
        type: "image",
        order: 1,
        data: {
          url: "//cdn.domain.com/api/media/ast-proto",
        },
      },
      {
        id: "img-data",
        type: "image",
        order: 2,
        data: {
          url: "data:image/png;/api/media/ast-data",
        },
      },
    ]);
    const extracted = extractMediaReferences(content);
    assert.strictEqual(extracted.length, 0);
  });

  // 9. /api/media/A?x=1 -> ignored
  it("9. /api/media/A?x=1 -> ignored", () => {
    const content = makePageContent([
      {
        id: "img-query",
        type: "image",
        order: 0,
        data: {
          url: "/api/media/ast-query?x=1&width=800",
        },
      },
    ]);
    const extracted = extractMediaReferences(content);
    assert.strictEqual(extracted.length, 0);
  });

  // 10. /api/media/A/extra -> ignored
  it("10. /api/media/A/extra -> ignored", () => {
    const content = makePageContent([
      {
        id: "img-extra",
        type: "image",
        order: 0,
        data: {
          url: "/api/media/ast-extra/raw/download.png",
        },
      },
    ]);
    const extracted = extractMediaReferences(content);
    assert.strictEqual(extracted.length, 0);
  });

  // 11. duplicate canonical image reference handling remains deterministic
  it("11. duplicate canonical image reference handling remains deterministic", () => {
    const content = makePageContent([
      {
        id: "img-dupe-1",
        type: "image",
        order: 0,
        data: {
          url: "/api/media/ast-dupe",
        },
      },
      {
        id: "img-dupe-1", // same blockId and field -> deduplicated
        type: "image",
        order: 1,
        data: {
          url: "/api/media/ast-dupe",
        },
      },
      {
        id: "img-dupe-2", // distinct blockId -> distinct logical reference
        type: "image",
        order: 2,
        data: {
          url: "/api/media/ast-dupe",
        },
      },
    ]);
    const extracted = extractMediaReferences(content);
    assert.strictEqual(extracted.length, 2);
    assert.strictEqual(extracted[0].blockId, "img-dupe-1");
    assert.strictEqual(extracted[0].field, "url");
    assert.strictEqual(extracted[1].blockId, "img-dupe-2");
    assert.strictEqual(extracted[1].field, "url");
  });

  // 12. cross-project asset reference fails closed
  it("12. cross-project asset reference fails closed", async () => {
    const db = new InMemoryPrismaDatabase();
    // Asset belongs to foreignProjectId
    db.mediaAssets.set("ast-foreign", {
      id: "ast-foreign",
      projectId: foreignProjectId,
      status: "READY",
      usageCount: 0,
    });

    const store = new PrismaContentLifecycleStore(db.asClient());
    const service = new ContentLifecycleService({ store, hasPermission: allowAllPermissions });

    await assert.rejects(
      async () => {
        await service.createPageDraft({
          projectId,
          actorId,
          key: "page-cross-project",
          title: "Cross Project Page",
          slug: "cross-project",
          locale: "en",
          description: null,
          visibility: "PUBLIC",
          content: makePageContent([
            { id: "b1", type: "image", order: 0, data: { url: "/api/media/ast-foreign" } },
          ]),
        });
      },
      (err: any) => {
        assert.ok(err instanceof ContentLifecycleError);
        assert.strictEqual(err.code, "FORBIDDEN");
        return true;
      }
    );

    // Verify transaction rollback: page was NOT created
    assert.strictEqual(db.pages.size, 0);
    assert.strictEqual(db.mediaUsageReferences.size, 0);
  });

  // 13. missing asset fails closed
  it("13. missing asset fails closed", async () => {
    const db = new InMemoryPrismaDatabase();
    const store = new PrismaContentLifecycleStore(db.asClient());
    const service = new ContentLifecycleService({ store, hasPermission: allowAllPermissions });

    await assert.rejects(
      async () => {
        await service.createPageDraft({
          projectId,
          actorId,
          key: "page-missing-asset",
          title: "Missing Asset Page",
          slug: "missing-asset",
          locale: "en",
          description: null,
          visibility: "PUBLIC",
          content: makePageContent([
            { id: "b1", type: "image", order: 0, data: { url: "/api/media/ast-non-existent" } },
          ]),
        });
      },
      (err: any) => {
        assert.ok(err instanceof ContentLifecycleError);
        assert.strictEqual(err.code, "INVALID_INPUT");
        return true;
      }
    );

    // Verify rollback
    assert.strictEqual(db.pages.size, 0);
    assert.strictEqual(db.mediaUsageReferences.size, 0);
  });

  // 14. initial draft creates usage
  it("14. initial draft creates usage", async () => {
    const db = new InMemoryPrismaDatabase();
    db.mediaAssets.set("ast-1", {
      id: "ast-1",
      projectId,
      status: "READY",
      usageCount: 0,
    });

    const store = new PrismaContentLifecycleStore(db.asClient());
    const service = new ContentLifecycleService({ store, hasPermission: allowAllPermissions });

    const result = await service.createPageDraft({
      projectId,
      actorId,
      key: "page-initial",
      title: "Initial Page",
      slug: "initial-page",
      locale: "en",
      description: null,
      visibility: "PUBLIC",
      content: makePageContent([
        { id: "b1", type: "image", order: 0, data: { url: "/api/media/ast-1" } },
      ]),
    });

    assert.ok(result.page.id);
    assert.strictEqual(db.mediaUsageReferences.size, 1);
    const ref = Array.from(db.mediaUsageReferences.values())[0];
    assert.strictEqual(ref.assetId, "ast-1");
    assert.strictEqual(ref.pageId, result.page.id);
    assert.strictEqual(ref.pageTitle, "Initial Page");
    assert.strictEqual(ref.pageSlug, "initial-page");
    assert.strictEqual(ref.blockId, "b1");
    assert.strictEqual(ref.field, "url");

    const asset = db.mediaAssets.get("ast-1");
    assert.strictEqual(asset.usageCount, 1);
  });

  // 15. draft edit updates usage
  it("15. draft edit updates usage", async () => {
    const db = new InMemoryPrismaDatabase();
    db.mediaAssets.set("ast-1", { id: "ast-1", projectId, status: "READY", usageCount: 0 });
    db.mediaAssets.set("ast-2", { id: "ast-2", projectId, status: "READY", usageCount: 0 });

    const store = new PrismaContentLifecycleStore(db.asClient());
    const service = new ContentLifecycleService({ store, hasPermission: allowAllPermissions });

    const { page, revision } = await service.createPageDraft({
      projectId,
      actorId,
      key: "page-edit",
      title: "Page Edit",
      slug: "page-edit",
      locale: "en",
      description: null,
      visibility: "PUBLIC",
      content: makePageContent([
        { id: "b1", type: "image", order: 0, data: { url: "/api/media/ast-1" } },
      ]),
    });

    assert.strictEqual(db.mediaAssets.get("ast-1").usageCount, 1);
    assert.strictEqual(db.mediaAssets.get("ast-2").usageCount, 0);

    // Edit draft to use ast-2 instead
    await service.updateDraft({
      projectId,
      actorId,
      pageId: page.id,
      expectedLockVersion: revision.lockVersion,
      content: makePageContent([
        { id: "b1", type: "image", order: 0, data: { url: "/api/media/ast-2" } },
      ]),
    });

    assert.strictEqual(db.mediaAssets.get("ast-1").usageCount, 0);
    assert.strictEqual(db.mediaAssets.get("ast-2").usageCount, 1);
    assert.strictEqual(db.mediaUsageReferences.size, 1);
    const ref = Array.from(db.mediaUsageReferences.values())[0];
    assert.strictEqual(ref.assetId, "ast-2");
  });

  // 16. removing draft reference removes it when no published/scheduled pointer uses it
  it("16. removing draft reference removes it when no published/scheduled pointer uses it", async () => {
    const db = new InMemoryPrismaDatabase();
    db.mediaAssets.set("ast-1", { id: "ast-1", projectId, status: "READY", usageCount: 0 });

    const store = new PrismaContentLifecycleStore(db.asClient());
    const service = new ContentLifecycleService({ store, hasPermission: allowAllPermissions });

    const { page, revision } = await service.createPageDraft({
      projectId,
      actorId,
      key: "page-clear",
      title: "Page Clear",
      slug: "page-clear",
      locale: "en",
      description: null,
      visibility: "PUBLIC",
      content: makePageContent([
        { id: "b1", type: "image", order: 0, data: { url: "/api/media/ast-1" } },
      ]),
    });

    assert.strictEqual(db.mediaAssets.get("ast-1").usageCount, 1);

    // Remove reference
    await service.updateDraft({
      projectId,
      actorId,
      pageId: page.id,
      expectedLockVersion: revision.lockVersion,
      content: makePageContent([]),
    });

    assert.strictEqual(db.mediaAssets.get("ast-1").usageCount, 0);
    assert.strictEqual(db.mediaUsageReferences.size, 0);
  });

  // 17. published reference survives when draft removes it
  it("17. published reference survives when draft removes it", async () => {
    const db = new InMemoryPrismaDatabase();
    db.mediaAssets.set("ast-pub", { id: "ast-pub", projectId, status: "READY", usageCount: 0 });
    db.mediaAssets.set("ast-new", { id: "ast-new", projectId, status: "READY", usageCount: 0 });

    const store = new PrismaContentLifecycleStore(db.asClient());
    const service = new ContentLifecycleService({ store, hasPermission: allowAllPermissions });

    // 1. Create page with ast-pub
    const { page, revision } = await service.createPageDraft({
      projectId,
      actorId,
      key: "page-survive",
      title: "Survive Page",
      slug: "survive-page",
      locale: "en",
      description: null,
      visibility: "PUBLIC",
      content: makePageContent([
        { id: "b1", type: "image", order: 0, data: { url: "/api/media/ast-pub" } },
      ]),
    });

    // 2. Submit & Approve & Publish
    const rev2 = (await service.submitForReview({ projectId, actorId, pageId: page.id, revisionId: revision.id, expectedLockVersion: revision.lockVersion })).revision;
    const rev3 = (await service.approveReview({ projectId, actorId, pageId: page.id, revisionId: rev2.id, expectedLockVersion: rev2.lockVersion })).revision;
    await service.publishApproved({ projectId, actorId, pageId: page.id, revisionId: rev3.id, expectedLockVersion: rev3.lockVersion });

    assert.strictEqual(db.mediaAssets.get("ast-pub").usageCount, 1);

    // 3. Create new draft from published (reopen draft)
    const { draftRevision: newDraft } = await service.createDraftFromPublished({
      projectId,
      actorId,
      pageId: page.id,
      expectedPublishedRevisionId: rev3.id,
    });

    // 4. In new draft, remove ast-pub and use ast-new
    await service.updateDraft({
      projectId,
      actorId,
      pageId: page.id,
      expectedLockVersion: newDraft.lockVersion,
      content: makePageContent([
        { id: "b1", type: "image", order: 0, data: { url: "/api/media/ast-new" } },
      ]),
    });

    // Authoritative union: published has ast-pub, draft has ast-new -> BOTH are referenced!
    assert.strictEqual(db.mediaAssets.get("ast-pub").usageCount, 1, "Published reference MUST survive when draft removes it");
    assert.strictEqual(db.mediaAssets.get("ast-new").usageCount, 1, "New draft reference must also be tracked");
    assert.strictEqual(db.mediaUsageReferences.size, 2);
  });

  // 18. scheduled reference remains protected
  it("18. scheduled reference remains protected", async () => {
    const db = new InMemoryPrismaDatabase();
    db.mediaAssets.set("ast-sched", { id: "ast-sched", projectId, status: "READY", usageCount: 0 });

    const store = new PrismaContentLifecycleStore(db.asClient());
    const service = new ContentLifecycleService({ store, hasPermission: allowAllPermissions });

    const { page, revision } = await service.createPageDraft({
      projectId,
      actorId,
      key: "page-sched",
      title: "Sched Page",
      slug: "sched-page",
      locale: "en",
      description: null,
      visibility: "PUBLIC",
      content: makePageContent([
        { id: "b1", type: "image", order: 0, data: { url: "/api/media/ast-sched" } },
      ]),
    });

    const rev2 = (await service.submitForReview({ projectId, actorId, pageId: page.id, revisionId: revision.id, expectedLockVersion: revision.lockVersion })).revision;
    const rev3 = (await service.approveReview({ projectId, actorId, pageId: page.id, revisionId: rev2.id, expectedLockVersion: rev2.lockVersion })).revision;

    const futureDate = new Date(Date.now() + 86400000);
    await service.schedulePublish({
      projectId,
      actorId,
      pageId: page.id,
      revisionId: rev3.id,
      expectedLockVersion: rev3.lockVersion,
      publishAt: futureDate,
    });

    // Asset must be protected by scheduled pointer
    assert.strictEqual(db.mediaAssets.get("ast-sched").usageCount, 1);
  });

  // 19. publishing new content reconciles old published reference away
  it("19. publishing new content reconciles old published reference away", async () => {
    const db = new InMemoryPrismaDatabase();
    db.mediaAssets.set("ast-v1", { id: "ast-v1", projectId, status: "READY", usageCount: 0 });
    db.mediaAssets.set("ast-v2", { id: "ast-v2", projectId, status: "READY", usageCount: 0 });

    const store = new PrismaContentLifecycleStore(db.asClient());
    const service = new ContentLifecycleService({ store, hasPermission: allowAllPermissions });

    // Initial draft with ast-v1
    const { page, revision } = await service.createPageDraft({
      projectId,
      actorId,
      key: "page-pub-cycle",
      title: "Pub Cycle",
      slug: "pub-cycle",
      locale: "en",
      description: null,
      visibility: "PUBLIC",
      content: makePageContent([
        { id: "b1", type: "image", order: 0, data: { url: "/api/media/ast-v1" } },
      ]),
    });

    // Publish v1
    const rev2 = (await service.submitForReview({ projectId, actorId, pageId: page.id, revisionId: revision.id, expectedLockVersion: revision.lockVersion })).revision;
    const rev3 = (await service.approveReview({ projectId, actorId, pageId: page.id, revisionId: rev2.id, expectedLockVersion: rev2.lockVersion })).revision;
    await service.publishApproved({ projectId, actorId, pageId: page.id, revisionId: rev3.id, expectedLockVersion: rev3.lockVersion });

    // Create v2 draft with ast-v2
    const { draftRevision: d2 } = await service.createDraftFromPublished({ projectId, actorId, pageId: page.id, expectedPublishedRevisionId: rev3.id });
    const { revision: d2Updated } = await service.updateDraft({
      projectId,
      actorId,
      pageId: page.id,
      expectedLockVersion: d2.lockVersion,
      content: makePageContent([
        { id: "b1", type: "image", order: 0, data: { url: "/api/media/ast-v2" } },
      ]),
    });

    // Publish v2
    const d2Review = (await service.submitForReview({ projectId, actorId, pageId: page.id, revisionId: d2Updated.id, expectedLockVersion: d2Updated.lockVersion })).revision;
    const d2Approved = (await service.approveReview({ projectId, actorId, pageId: page.id, revisionId: d2Review.id, expectedLockVersion: d2Review.lockVersion })).revision;
    await service.publishApproved({ projectId, actorId, pageId: page.id, revisionId: d2Approved.id, expectedLockVersion: d2Approved.lockVersion });

    // ast-v1 is no longer in published, draft, or scheduled pointers!
    assert.strictEqual(db.mediaAssets.get("ast-v1").usageCount, 0, "Old published reference must be reconciled away");
    assert.strictEqual(db.mediaAssets.get("ast-v2").usageCount, 1, "New published reference must be active");
    assert.strictEqual(db.mediaUsageReferences.size, 1);
    assert.strictEqual(Array.from(db.mediaUsageReferences.values())[0].assetId, "ast-v2");
  });

  // 20. cancel schedule reconciles union correctly
  it("20. cancel schedule reconciles union correctly", async () => {
    const db = new InMemoryPrismaDatabase();
    db.mediaAssets.set("ast-draft-keep", { id: "ast-draft-keep", projectId, status: "READY", usageCount: 0 });
    db.mediaAssets.set("ast-sched-cancel", { id: "ast-sched-cancel", projectId, status: "READY", usageCount: 0 });
    const store = new PrismaContentLifecycleStore(db.asClient());
    const service = new ContentLifecycleService({ store, hasPermission: allowAllPermissions });

    const { page, revision } = await service.createPageDraft({
      projectId,
      actorId,
      key: "page-cancel-sched",
      title: "Cancel Sched",
      slug: "cancel-sched",
      locale: "en",
      description: null,
      visibility: "PUBLIC",
      content: makePageContent([
        { id: "b1", type: "image", order: 0, data: { url: "/api/media/ast-draft-keep" } },
      ]),
    });

    // Create an approved revision with scheduled media
    const schedRev = await db.asClient().pageRevision.create({
      data: {
        pageId: page.id,
        revisionNumber: 2,
        title: "Sched Rev",
        slug: "cancel-sched",
        locale: "en",
        status: "APPROVED",
        lockVersion: 1,
        createdById: actorId,
        content: makePageContent([
          { id: "b2", type: "image", order: 0, data: { url: "/api/media/ast-sched-cancel" } },
        ]),
      },
    });

    const futureDate = new Date(Date.now() + 86400000);
    // Set scheduled pointers on page
    await db.asClient().page.update({
      where: { id: page.id },
      data: {
        scheduledRevisionId: schedRev.id,
        scheduledPublishAt: futureDate,
        scheduledById: actorId,
      },
    });

    // Reconcile initial active union (draft has ast-draft-keep, scheduled has ast-sched-cancel)
    await store.reconcilePageMediaUsage(projectId, page.id);

    assert.strictEqual(db.mediaAssets.get("ast-draft-keep").usageCount, 1);
    assert.strictEqual(db.mediaAssets.get("ast-sched-cancel").usageCount, 1);
    assert.strictEqual(db.mediaUsageReferences.size, 2);

    // Cancel scheduled publish via service
    await service.cancelScheduledPublish({
      projectId,
      actorId,
      pageId: page.id,
      expectedScheduledRevisionId: schedRev.id,
      expectedScheduledPublishAt: futureDate,
    });

    // When scheduled publish is cancelled, scheduled pointer is cleared.
    // ast-sched-cancel is no longer in active union -> usageCount drops to 0!
    // ast-draft-keep is still in draftRevisionId -> usageCount stays 1!
    assert.strictEqual(db.mediaAssets.get("ast-sched-cancel").usageCount, 0, "Cancelled schedule clears usage when not in draft/published");
    assert.strictEqual(db.mediaAssets.get("ast-draft-keep").usageCount, 1, "Draft reference remains active after schedule cancellation");
    assert.strictEqual(db.mediaUsageReferences.size, 1);
  });

  // 21. rollback reconciles target published revision
  it("21. rollback reconciles target published revision", async () => {
    const db = new InMemoryPrismaDatabase();
    db.mediaAssets.set("ast-r1", { id: "ast-r1", projectId, status: "READY", usageCount: 0 });
    db.mediaAssets.set("ast-r2", { id: "ast-r2", projectId, status: "READY", usageCount: 0 });

    const store = new PrismaContentLifecycleStore(db.asClient());
    const service = new ContentLifecycleService({ store, hasPermission: allowAllPermissions });

    // Release 1: ast-r1
    const { page, revision: r1 } = await service.createPageDraft({
      projectId,
      actorId,
      key: "page-rollback",
      title: "Rollback Page",
      slug: "rollback-page",
      locale: "en",
      description: null,
      visibility: "PUBLIC",
      content: makePageContent([
        { id: "b1", type: "image", order: 0, data: { url: "/api/media/ast-r1" } },
      ]),
    });
    const r1Sub = (await service.submitForReview({ projectId, actorId, pageId: page.id, revisionId: r1.id, expectedLockVersion: r1.lockVersion })).revision;
    const r1App = (await service.approveReview({ projectId, actorId, pageId: page.id, revisionId: r1Sub.id, expectedLockVersion: r1Sub.lockVersion })).revision;
    await service.publishApproved({ projectId, actorId, pageId: page.id, revisionId: r1App.id, expectedLockVersion: r1App.lockVersion });

    // Release 2: ast-r2
    const { draftRevision: r2Draft } = await service.createDraftFromPublished({ projectId, actorId, pageId: page.id, expectedPublishedRevisionId: r1App.id });
    const { revision: r2Updated } = await service.updateDraft({
      projectId,
      actorId,
      pageId: page.id,
      expectedLockVersion: r2Draft.lockVersion,
      content: makePageContent([
        { id: "b1", type: "image", order: 0, data: { url: "/api/media/ast-r2" } },
      ]),
    });
    const r2Sub = (await service.submitForReview({ projectId, actorId, pageId: page.id, revisionId: r2Updated.id, expectedLockVersion: r2Updated.lockVersion })).revision;
    const r2App = (await service.approveReview({ projectId, actorId, pageId: page.id, revisionId: r2Sub.id, expectedLockVersion: r2Sub.lockVersion })).revision;
    await service.publishApproved({ projectId, actorId, pageId: page.id, revisionId: r2App.id, expectedLockVersion: r2App.lockVersion });

    assert.strictEqual(db.mediaAssets.get("ast-r1").usageCount, 0);
    assert.strictEqual(db.mediaAssets.get("ast-r2").usageCount, 1);

    // Rollback to r1
    await service.rollbackPublished({
      projectId,
      actorId,
      pageId: page.id,
      expectedPublishedRevisionId: r2App.id,
    });

    assert.strictEqual(db.mediaAssets.get("ast-r1").usageCount, 1, "Target rollback revision assets must be restored to active usage");
    assert.strictEqual(db.mediaAssets.get("ast-r2").usageCount, 0, "Rolled-back revision assets must be removed from active usage");
  });

  // 22. unpublish reconciles active pointer union
  it("22. unpublish reconciles active pointer union", async () => {
    const db = new InMemoryPrismaDatabase();
    db.mediaAssets.set("ast-unpub", { id: "ast-unpub", projectId, status: "READY", usageCount: 0 });

    const store = new PrismaContentLifecycleStore(db.asClient());
    const service = new ContentLifecycleService({ store, hasPermission: allowAllPermissions });

    const { page, revision } = await service.createPageDraft({
      projectId,
      actorId,
      key: "page-unpub",
      title: "Unpub Page",
      slug: "unpub-page",
      locale: "en",
      description: null,
      visibility: "PUBLIC",
      content: makePageContent([
        { id: "b1", type: "image", order: 0, data: { url: "/api/media/ast-unpub" } },
      ]),
    });

    const rev2 = (await service.submitForReview({ projectId, actorId, pageId: page.id, revisionId: revision.id, expectedLockVersion: revision.lockVersion })).revision;
    const rev3 = (await service.approveReview({ projectId, actorId, pageId: page.id, revisionId: rev2.id, expectedLockVersion: rev2.lockVersion })).revision;
    await service.publishApproved({ projectId, actorId, pageId: page.id, revisionId: rev3.id, expectedLockVersion: rev3.lockVersion });

    assert.strictEqual(db.mediaAssets.get("ast-unpub").usageCount, 1);

    // Unpublish: moves published revision to a new draft revision, clears published pointer
    await service.unpublish({
      projectId,
      actorId,
      pageId: page.id,
      expectedPublishedRevisionId: rev3.id,
    });

    // The asset is now in the new draft revision, so it remains in use (usageCount === 1)
    assert.strictEqual(db.mediaAssets.get("ast-unpub").usageCount, 1);
    assert.strictEqual(db.mediaUsageReferences.size, 1);
  });

  // 23. nested references work
  it("23. nested references work", async () => {
    const db = new InMemoryPrismaDatabase();
    db.mediaAssets.set("ast-nested-1", { id: "ast-nested-1", projectId, status: "READY", usageCount: 0 });
    db.mediaAssets.set("ast-nested-2", { id: "ast-nested-2", projectId, status: "READY", usageCount: 0 });
    const store = new PrismaContentLifecycleStore(db.asClient());
    const service = new ContentLifecycleService({ store, hasPermission: allowAllPermissions });

    await service.createPageDraft({
      projectId,
      actorId,
      key: "page-nested-test",
      title: "Nested Page",
      slug: "nested-page",
      locale: "en",
      description: null,
      visibility: "PUBLIC",
      content: makePageContent([
        {
          id: "root-section",
          type: "columns",
          order: 0,
          data: { layout: "1-1", bg: "/api/media/ast-ignored-bg" },
          children: [
            {
              id: "child-card-1",
              type: "image",
              order: 0,
              data: {
                url: "/api/media/ast-nested-1",
                alt: "/api/media/ast-ignored-alt",
              },
            },
            {
              id: "child-card-2",
              type: "image",
              order: 1,
              data: {
                url: "/api/media/ast-nested-2",
              },
            },
          ],
        },
      ]),
    });

    assert.strictEqual(db.mediaAssets.get("ast-nested-1").usageCount, 1);
    assert.strictEqual(db.mediaAssets.get("ast-nested-2").usageCount, 1);
    assert.strictEqual(db.mediaUsageReferences.size, 2);
    assert.strictEqual(Array.from(db.mediaUsageReferences.values()).some((r) => r.assetId === "ast-ignored-bg"), false);
  });

  // 24. usageCount equals actual MediaUsageReference row count
  it("24. usageCount equals actual MediaUsageReference row count", async () => {
    const db = new InMemoryPrismaDatabase();
    db.mediaAssets.set("ast-multi", { id: "ast-multi", projectId, status: "READY", usageCount: 0 });

    const store = new PrismaContentLifecycleStore(db.asClient());
    const service = new ContentLifecycleService({ store, hasPermission: allowAllPermissions });

    // Page 1 references ast-multi
    await service.createPageDraft({
      projectId,
      actorId,
      key: "page-1",
      title: "Page 1",
      slug: "page-1",
      locale: "en",
      description: null,
      visibility: "PUBLIC",
      content: makePageContent([
        { id: "b1", type: "image", order: 0, data: { url: "/api/media/ast-multi" } },
      ]),
    });

    // Page 2 references ast-multi
    await service.createPageDraft({
      projectId,
      actorId,
      key: "page-2",
      title: "Page 2",
      slug: "page-2",
      locale: "en",
      description: null,
      visibility: "PUBLIC",
      content: makePageContent([
        { id: "b2", type: "image", order: 0, data: { url: "/api/media/ast-multi" } },
      ]),
    });

    const actualRowCount = Array.from(db.mediaUsageReferences.values()).filter(
      (r) => r.assetId === "ast-multi"
    ).length;
    assert.strictEqual(actualRowCount, 2);
    assert.strictEqual(db.mediaAssets.get("ast-multi").usageCount, 2);
    assert.strictEqual(db.mediaAssets.get("ast-multi").usageCount, actualRowCount);
  });

  // 25. stale usageCount cannot permit deletion
  it("25. stale usageCount cannot permit deletion", async () => {
    const db = new InMemoryPrismaDatabase();
    // Asset has actual row in mediaUsageReferences, but usageCount is staled to 0
    db.mediaAssets.set("ast-stale", {
      id: "ast-stale",
      projectId,
      status: "READY",
      usageCount: 0, // Stale!
    });
    db.mediaUsageReferences.set("mur-stale-1", {
      id: "mur-stale-1",
      assetId: "ast-stale",
      pageId: "some-page",
      pageTitle: "Some Page",
      pageSlug: "some-slug",
    });

    const repo = new PrismaMediaRepository(db.asClient());
    const isAllowed = await repo.isDeletionAllowed("ast-stale", projectId);
    assert.strictEqual(isAllowed, false, "Disagreement between stored usageCount and actual rows MUST fail closed");
  });

  // 26. referenced asset cannot be deleted
  it("26. referenced asset cannot be deleted", async () => {
    const db = new InMemoryPrismaDatabase();
    db.mediaAssets.set("ast-referenced", {
      id: "ast-referenced",
      projectId,
      status: "READY",
      usageCount: 1,
    });
    db.mediaUsageReferences.set("mur-1", {
      id: "mur-1",
      assetId: "ast-referenced",
      pageId: "some-page",
      pageTitle: "Some Page",
      pageSlug: "some-slug",
    });

    const repo = new PrismaMediaRepository(db.asClient());
    const isAllowed = await repo.isDeletionAllowed("ast-referenced", projectId);
    assert.strictEqual(isAllowed, false, "Referenced asset must NOT be allowed for deletion");

    await assert.rejects(
      async () => {
        await repo.deleteAsset("ast-referenced", projectId);
      },
      /Deletion is not allowed/
    );
  });

  // 27. unreferenced non-PUBLISHED asset is deletion-eligible
  it("27. unreferenced non-PUBLISHED asset is deletion-eligible", async () => {
    const db = new InMemoryPrismaDatabase();
    db.mediaAssets.set("ast-free", {
      id: "ast-free",
      projectId,
      status: "READY",
      usageCount: 0,
    });

    const repo = new PrismaMediaRepository(db.asClient());
    const isAllowed = await repo.isDeletionAllowed("ast-free", projectId);
    assert.strictEqual(isAllowed, true, "Unreferenced READY asset must be deletion-eligible");

    await repo.deleteAsset("ast-free", projectId);
    assert.strictEqual(db.mediaAssets.has("ast-free"), false);
  });

  // 28. transaction failure leaves content and reference state unchanged
  it("28. transaction failure leaves content and reference state unchanged", async () => {
    const db = new InMemoryPrismaDatabase();
    db.mediaAssets.set("ast-valid", {
      id: "ast-valid",
      projectId,
      status: "READY",
      usageCount: 0,
    });

    const store = new PrismaContentLifecycleStore(db.asClient());
    const service = new ContentLifecycleService({ store, hasPermission: allowAllPermissions });

    const { page, revision } = await service.createPageDraft({
      projectId,
      actorId,
      key: "page-atomic",
      title: "Atomic Page",
      slug: "atomic-page",
      locale: "en",
      description: null,
      visibility: "PUBLIC",
      content: makePageContent([
        { id: "b1", type: "image", order: 0, data: { url: "/api/media/ast-valid" } },
      ]),
    });

    assert.strictEqual(db.mediaAssets.get("ast-valid").usageCount, 1);
    assert.strictEqual(db.mediaUsageReferences.size, 1);

    // Attempt to update draft with a missing media asset
    await assert.rejects(
      async () => {
        await service.updateDraft({
          projectId,
          actorId,
          pageId: page.id,
          expectedLockVersion: revision.lockVersion,
          content: makePageContent([
            { id: "b1", type: "image", order: 0, data: { url: "/api/media/missing-asset-xyz" } },
          ]),
        });
      },
      (err: any) => {
        assert.ok(err instanceof ContentLifecycleError);
        assert.strictEqual(err.code, "INVALID_INPUT");
        return true;
      }
    );

    // Assert that draft content, lock version, and usage references were NOT modified!
    const pageInDb = db.pages.get(page.id);
    const revInDb = db.pageRevisions.get(pageInDb.draftRevisionId);
    assert.strictEqual(revInDb.lockVersion, revision.lockVersion);
    assert.strictEqual(db.mediaAssets.get("ast-valid").usageCount, 1);
    assert.strictEqual(db.mediaUsageReferences.size, 1);
    assert.strictEqual(Array.from(db.mediaUsageReferences.values())[0].assetId, "ast-valid");
  });

  // 29. reconciliation failure rolls back pointer mutation
  it("29. reconciliation failure rolls back pointer mutation", async () => {
    const db = new InMemoryPrismaDatabase();
    db.mediaAssets.set("ast-valid-ptr", {
      id: "ast-valid-ptr",
      projectId,
      status: "READY",
      usageCount: 0,
    });
    const store = new PrismaContentLifecycleStore(db.asClient());
    const service = new ContentLifecycleService({ store, hasPermission: allowAllPermissions });

    const { page, revision } = await service.createPageDraft({
      projectId,
      actorId,
      key: "page-ptr-atomic",
      title: "Pointer Atomic Page",
      slug: "ptr-atomic-page",
      locale: "en",
      description: null,
      visibility: "PUBLIC",
      content: makePageContent([
        { id: "b1", type: "image", order: 0, data: { url: "/api/media/ast-valid-ptr" } },
      ]),
    });

    const rev2 = (await service.submitForReview({
      projectId,
      actorId,
      pageId: page.id,
      revisionId: revision.id,
      expectedLockVersion: revision.lockVersion,
    })).revision;

    const rev3 = (await service.approveReview({
      projectId,
      actorId,
      pageId: page.id,
      revisionId: rev2.id,
      expectedLockVersion: rev2.lockVersion,
    })).revision;

    // Simulate an asset deletion right before publishing so reconciliation fails closed
    db.mediaAssets.delete("ast-valid-ptr");

    await assert.rejects(
      async () => {
        await service.publishApproved({
          projectId,
          actorId,
          pageId: page.id,
          revisionId: rev3.id,
          expectedLockVersion: rev3.lockVersion,
        });
      },
      (err: any) => {
        assert.ok(err instanceof ContentLifecycleError);
        assert.strictEqual(err.code, "INVALID_INPUT");
        return true;
      }
    );

    // Verify pointer mutation was rolled back atomically
    const pageInDb = db.pages.get(page.id);
    assert.strictEqual(pageInDb.publishedRevisionId, null, "publishedRevisionId must remain null");
    assert.strictEqual(pageInDb.draftRevisionId, rev3.id, "draftRevisionId must remain unchanged");

    const revInDb = db.pageRevisions.get(rev3.id);
    assert.strictEqual(revInDb.status, "APPROVED", "Revision status must remain APPROVED, not PUBLISHED");

    assert.strictEqual(db.contentReleases.size, 0, "No content release should be created on failure");
    assert.strictEqual(db.contentReleaseItems.size, 0, "No release item should be created on failure");
  });

  // 30. fake store without reconciliation fails closed on internal media and succeeds without internal media
  it("30. fake store without reconciliation fails closed on internal media and succeeds without internal media", async () => {
    const db = new InMemoryPrismaDatabase();
    class FakeStoreWithoutReconciliation extends PrismaContentLifecycleStore {
      reconcilePageMediaUsage = undefined as any;
      async transaction<T>(fn: (txStore: ContentLifecycleStore) => Promise<T>): Promise<T> {
        return fn(this);
      }
    }
    const fakeStore = new FakeStoreWithoutReconciliation(db.asClient());

    const service = new ContentLifecycleService({ store: fakeStore, hasPermission: allowAllPermissions });

    // 1. Content without media references must SUCCEED
    const { page, revision } = await service.createPageDraft({
      projectId,
      actorId,
      key: "page-no-media",
      title: "No Media Page",
      slug: "no-media-page",
      locale: "en",
      description: null,
      visibility: "PUBLIC",
      content: makePageContent([
        { id: "b1", type: "paragraph", order: 0, data: { text: "Just plain text, no internal media" } },
      ]),
    });
    assert.ok(page.id);
    assert.ok(revision.id);

    // 2. Content with internal /api/media/<id> must FAIL CLOSED with POINTER_INTEGRITY_VIOLATION
    await assert.rejects(
      async () => {
        await service.createPageDraft({
          projectId,
          actorId,
          key: "page-with-media-fail",
          title: "Media Fail Page",
          slug: "media-fail-page",
          locale: "en",
          description: null,
          visibility: "PUBLIC",
          content: makePageContent([
            { id: "b1", type: "image", order: 0, data: { url: "/api/media/ast-unsupported" } },
          ]),
        });
      },
      (err: any) => {
        assert.ok(err instanceof ContentLifecycleError);
        assert.strictEqual(err.code, "POINTER_INTEGRITY_VIOLATION");
        assert.match(err.message, /Media usage reconciliation unsupported by store/);
        return true;
      }
    );
  });

  // 31. createDraftFromPublished correctly maintains active pointer union
  it("31. createDraftFromPublished correctly maintains active pointer union", async () => {
    const db = new InMemoryPrismaDatabase();
    db.mediaAssets.set("ast-pub1", { id: "ast-pub1", projectId, status: "READY", usageCount: 0 });
    db.mediaAssets.set("ast-draft2", { id: "ast-draft2", projectId, status: "READY", usageCount: 0 });
    const store = new PrismaContentLifecycleStore(db.asClient());
    const service = new ContentLifecycleService({ store, hasPermission: allowAllPermissions });

    // 1. Create page with ast-pub1
    const { page, revision } = await service.createPageDraft({
      projectId,
      actorId,
      key: "page-union-test",
      title: "Union Test Page",
      slug: "union-test-page",
      locale: "en",
      description: null,
      visibility: "PUBLIC",
      content: makePageContent([
        { id: "b1", type: "image", order: 0, data: { url: "/api/media/ast-pub1" } },
      ]),
    });

    const revSub = (await service.submitForReview({
      projectId,
      actorId,
      pageId: page.id,
      revisionId: revision.id,
      expectedLockVersion: revision.lockVersion,
    })).revision;

    const revApp = (await service.approveReview({
      projectId,
      actorId,
      pageId: page.id,
      revisionId: revSub.id,
      expectedLockVersion: revSub.lockVersion,
    })).revision;

    await service.publishApproved({
      projectId,
      actorId,
      pageId: page.id,
      revisionId: revApp.id,
      expectedLockVersion: revApp.lockVersion,
    });

    assert.strictEqual(db.mediaAssets.get("ast-pub1").usageCount, 1);
    assert.strictEqual(db.mediaUsageReferences.size, 1);

    // 2. Reopen draft via createDraftFromPublished
    const { draftRevision: reopenedDraft } = await service.createDraftFromPublished({
      projectId,
      actorId,
      pageId: page.id,
      expectedPublishedRevisionId: revApp.id,
    });

    // Both published and draft reference ast-pub1 -> deduplicated usageCount is still 1
    assert.strictEqual(db.mediaAssets.get("ast-pub1").usageCount, 1);
    assert.strictEqual(db.mediaUsageReferences.size, 1);

    // 3. Update reopened draft to include ast-draft2 alongside ast-pub1
    await service.updateDraft({
      projectId,
      actorId,
      pageId: page.id,
      expectedLockVersion: reopenedDraft.lockVersion,
      content: makePageContent([
        { id: "b1", type: "image", order: 0, data: { url: "/api/media/ast-pub1" } },
        { id: "b2", type: "image", order: 1, data: { url: "/api/media/ast-draft2" } },
      ]),
    });

    // Active union contains ast-pub1 and ast-draft2
    assert.strictEqual(db.mediaAssets.get("ast-pub1").usageCount, 1);
    assert.strictEqual(db.mediaAssets.get("ast-draft2").usageCount, 1);
    assert.strictEqual(db.mediaUsageReferences.size, 2);
  });
});
