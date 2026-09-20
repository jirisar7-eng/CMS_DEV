import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ContentLifecycleService } from "../lib/domain/content/lifecycle/service";
import {
  ContentLifecycleStore,
  ContentLifecycleError,
  LifecyclePage,
  LifecyclePageRevision,
} from "../lib/domain/content/lifecycle/types";
import { getCapabilityStatus } from "../lib/navigation/adminNav";
import { computeRevisionDiff } from "../lib/domain/content/diff";

function createDummyStore(): ContentLifecycleStore {
  return {
    async findPageById() { return null; },
    async findRevisionById() { return null; },
    async findDraftRevisionByPageId() { return null; },
    async findPublishedRevisionByPageId() { return null; },
    async findPageByKey() { return null; },
    async getNextRevisionNumber() { return 1; },
    async createPageWithDraft() { throw new Error("Not implemented"); },
    async updateDraftRevisionAtomic() { throw new Error("Not implemented"); },
    async transitionRevisionStatusAtomic() { throw new Error("Not implemented"); },
    async claimRevisionLockAtomic() { throw new Error("Not implemented"); },
    async createDraftRevisionFromSource() { throw new Error("Not implemented"); },
    async setPageDraftRevisionPointer() { throw new Error("Not implemented"); },
    async createPublishedRelease() { throw new Error("Not implemented"); },
    async createReleaseItem() { throw new Error("Not implemented"); },
    async setPublishedPagePointersAtomic() { throw new Error("Not implemented"); },
    async setDraftFromPublishedPointerAtomic() { throw new Error("Not implemented"); },
    async recordAudit() { /* noop */ },
    async transaction<T>(fn: (txStore: ContentLifecycleStore) => Promise<T>): Promise<T> {
      return fn(this);
    },
    async listProjectReleases() { return []; },
    async listProjectRevisions() { return []; },
  };
}

describe("Publishing and Revisions Admin Cutover", () => {
  it("enforces capability status ZÁKLAD for publishing and revisions", () => {
    assert.strictEqual(getCapabilityStatus("publishing"), "ZÁKLAD");
    assert.strictEqual(getCapabilityStatus("revisions"), "ZÁKLAD");
  });

  it("fails closed when store implementation for listProjectReleases is missing", async () => {
    const store = createDummyStore();
    delete store.listProjectReleases;
    const service = new ContentLifecycleService({
      store,
      hasPermission: async () => true,
    });

    await assert.rejects(
      async () => {
        await service.listReleases({ actorId: "user-1", projectId: "proj-1" });
      },
      (err: unknown) => {
        return (
          err instanceof ContentLifecycleError &&
          err.code === "INVALID_INPUT" &&
          err.message.includes("listProjectReleases")
        );
      }
    );
  });

  it("fails closed when store implementation for listProjectRevisions is missing", async () => {
    const store = createDummyStore();
    delete store.listProjectRevisions;
    const service = new ContentLifecycleService({
      store,
      hasPermission: async () => true,
    });

    await assert.rejects(
      async () => {
        await service.listRevisions({ actorId: "user-1", projectId: "proj-1" });
      },
      (err: unknown) => {
        return (
          err instanceof ContentLifecycleError &&
          err.code === "INVALID_INPUT" &&
          err.message.includes("listProjectRevisions")
        );
      }
    );
  });

  it("handles empty project gracefully returning empty arrays for listReleases and listRevisions", async () => {
    const store = createDummyStore();
    store.listProjectReleases = async () => [];
    store.listProjectRevisions = async () => [];

    const service = new ContentLifecycleService({
      store,
      hasPermission: async () => true,
    });

    const releases = await service.listReleases({ actorId: "user-1", projectId: "proj-empty" });
    assert.deepStrictEqual(releases, []);

    const revisions = await service.listRevisions({ actorId: "user-1", projectId: "proj-empty" });
    assert.deepStrictEqual(revisions, []);
  });

  it("enforces 403 FORBIDDEN when user lacks content.view permission", async () => {
    const store = createDummyStore();
    const service = new ContentLifecycleService({
      store,
      hasPermission: async () => false,
    });

    await assert.rejects(
      async () => {
        await service.listReleases({ actorId: "unauthorized-user", projectId: "proj-1" });
      },
      (err: unknown) => {
        return err instanceof ContentLifecycleError && err.code === "FORBIDDEN";
      }
    );
  });

  it("handles invalid lifecycle transitions gracefully during rollback when active draft exists", async () => {
    const dummyPage: LifecyclePage = {
      id: "page-1",
      projectId: "proj-1",
      key: "home",
      parentId: null,
      sortOrder: 0,
      draftRevisionId: "rev-draft-1",
      publishedRevisionId: "rev-pub-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const dummyRev: LifecyclePageRevision = {
      id: "rev-pub-1",
      pageId: "page-1",
      revisionNumber: 1,
      status: "PUBLISHED",
      title: "Home",
      slug: "home",
      locale: "cs",
      description: null,
      visibility: "PUBLIC",
      content: { blocks: [] },
      seo: {},
      navigation: {},
      schemaVersion: "1.0",
      lockVersion: 1,
      createdById: "user-1",
      createdAt: new Date(),
      submittedAt: null,
      approvedAt: null,
      publishedAt: new Date(),
      derivedFromRevisionId: null,
    };

    const store = createDummyStore();
    store.findPageById = async () => dummyPage;
    store.findRevisionById = async () => dummyRev;

    const service = new ContentLifecycleService({
      store,
      hasPermission: async () => true,
    });

    await assert.rejects(
      async () => {
        await service.createDraftFromPublished({
          actorId: "user-1",
          projectId: "proj-1",
          pageId: "page-1",
          expectedPublishedRevisionId: "rev-pub-1",
        });
      },
      (err: unknown) => {
        return err instanceof ContentLifecycleError && err.code === "ACTIVE_DRAFT_EXISTS";
      }
    );
  });

  it("computes deterministic revision diffs without simulation", () => {
    const rev1: LifecyclePageRevision = {
      id: "rev-1",
      pageId: "page-1",
      revisionNumber: 1,
      status: "PUBLISHED",
      title: "Úvodní stránka",
      slug: "home",
      locale: "cs",
      description: "Původní popis",
      visibility: "PUBLIC",
      content: {
        blocks: [
          { id: "b1", type: "hero", data: { text: "Ahoj" } },
          { id: "b2", type: "text", data: { content: "Starý text" } },
        ],
      },
      seo: {},
      navigation: {},
      schemaVersion: "1.0",
      lockVersion: 1,
      createdById: "user-1",
      createdAt: new Date(),
      submittedAt: null,
      approvedAt: null,
      publishedAt: new Date(),
      derivedFromRevisionId: null,
    };

    const rev2: LifecyclePageRevision = {
      ...rev1,
      id: "rev-2",
      revisionNumber: 2,
      title: "Nová úvodní stránka",
      content: {
        blocks: [
          { id: "b1", type: "hero", data: { text: "Ahoj" } },
          { id: "b2", type: "text", data: { content: "Nový text" } },
          { id: "b3", type: "cta", data: { label: "Koupit" } },
        ],
      },
    };

    const diff = computeRevisionDiff(rev2, rev1);
    assert.strictEqual(diff.titleChanged, true);
    assert.strictEqual(diff.slugChanged, false);
    assert.strictEqual(diff.blockDiffs.length, 3);

    const b1 = diff.blockDiffs.find((b) => b.id === "b1");
    const b2 = diff.blockDiffs.find((b) => b.id === "b2");
    assert.strictEqual(b1?.status, "UNCHANGED");
    assert.strictEqual(b2?.status, "MODIFIED");
  });
});
