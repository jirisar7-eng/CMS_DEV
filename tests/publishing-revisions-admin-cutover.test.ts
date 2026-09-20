import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ContentLifecycleService } from "../lib/domain/content/lifecycle/service";
import { ContentLifecycleStore } from "../lib/domain/content/lifecycle/store";
import {
  ContentLifecycleError,
  LifecyclePage,
  LifecyclePageRevision,
} from "../lib/domain/content/lifecycle/types";
import { PageContent } from "../lib/domain/content/contracts";
import { getCapabilityStatus } from "../lib/navigation/adminNav";
import { computeRevisionDiff } from "../components/admin/revisions/RevisionsWorkspace";

function createDummyStore(): ContentLifecycleStore {
  return {
    async findPageById() { return null; },
    async findRevisionById() { return null; },
    async getNextRevisionNumber() { return 1; },
    async createPageWithDraft() { throw new Error("Not implemented"); },
    async updateDraftRevisionAtomic() { throw new Error("Not implemented"); },
    async transitionRevisionStatusAtomic() { throw new Error("Not implemented"); },
    async claimRevisionLockAtomic() { throw new Error("Not implemented"); },
    async createDraftRevisionFromSource() { throw new Error("Not implemented"); },
    async setPageDraftRevisionPointer() { throw new Error("Not implemented"); },
    async touchPageUpdatedAt() { throw new Error("Not implemented"); },
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

  it("fails closed when projectId is missing or empty", async () => {
    const store = createDummyStore();
    const service = new ContentLifecycleService({
      store,
      hasPermission: async () => true,
    });
    await assert.rejects(
      async () => {
        await service.listReleases({ actorId: "user-1", projectId: "" });
      },
      (err: unknown) => {
        return err instanceof ContentLifecycleError && err.code === "INVALID_INPUT";
      }
    );
  });

  it("prevents cross-project IDOR by filtering releases exclusively by requested projectId", async () => {
    const store = createDummyStore();
    store.listProjectReleases = async (requestedProjectId: string) => {
      if (requestedProjectId === "proj-target") {
        return [
          {
            release: {
              id: "rel-1",
              projectId: "proj-target",
              status: "PUBLISHED",
              createdById: "user-1",
              createdAt: new Date(),
              publishedAt: new Date(),
              rolledBackAt: null,
            },
            items: [],
          },
        ];
      }
      return [];
    };
    const service = new ContentLifecycleService({
      store,
      hasPermission: async () => true,
    });

    const otherReleases = await service.listReleases({ actorId: "user-1", projectId: "proj-other" });
    assert.strictEqual(otherReleases.length, 0);

    const targetReleases = await service.listReleases({ actorId: "user-1", projectId: "proj-target" });
    assert.strictEqual(targetReleases.length, 1);
    assert.strictEqual(targetReleases[0].release.projectId, "proj-target");
  });

  it("handles invalid lifecycle transitions gracefully during rollback when active draft exists", async () => {
    const canonicalContent: PageContent = {
      version: 1,
      schemaVersion: "1.0",
      blocks: [
        {
          id: "b1",
          type: "heading",
          order: 1,
          data: { text: "Domů" },
        },
      ],
    };

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
      content: canonicalContent,
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

  it("delegates rollback/reopen correctly when valid parameters are provided", async () => {
    const canonicalContent: PageContent = {
      version: 1,
      schemaVersion: "1.0",
      blocks: [
        {
          id: "b1",
          type: "heading",
          order: 1,
          data: { text: "Hlavní nadpis" },
        },
      ],
    };

    const dummyPage: LifecyclePage = {
      id: "page-2",
      projectId: "proj-1",
      key: "about",
      parentId: null,
      sortOrder: 0,
      draftRevisionId: null,
      publishedRevisionId: "rev-pub-2",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const dummyPubRev: LifecyclePageRevision = {
      id: "rev-pub-2",
      pageId: "page-2",
      revisionNumber: 2,
      status: "PUBLISHED",
      title: "O nás",
      slug: "about",
      locale: "cs",
      description: null,
      visibility: "PUBLIC",
      content: canonicalContent,
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

    const dummyNewDraft: LifecyclePageRevision = {
      ...dummyPubRev,
      id: "rev-draft-new",
      revisionNumber: 3,
      status: "DRAFT",
      derivedFromRevisionId: "rev-pub-2",
    };

    const store = createDummyStore();
    store.findPageById = async () => dummyPage;
    store.findRevisionById = async () => dummyPubRev;
    store.getNextRevisionNumber = async () => 3;
    store.createDraftRevisionFromSource = async () => dummyNewDraft;
    store.setDraftFromPublishedPointerAtomic = async () => ({
      updated: true,
      page: { ...dummyPage, draftRevisionId: "rev-draft-new" },
    });

    const service = new ContentLifecycleService({
      store,
      hasPermission: async () => true,
    });

    const result = await service.createDraftFromPublished({
      actorId: "user-1",
      projectId: "proj-1",
      pageId: "page-2",
      expectedPublishedRevisionId: "rev-pub-2",
    });

    assert.strictEqual(result.draftRevision.id, "rev-draft-new");
    assert.strictEqual(result.draftRevision.status, "DRAFT");
  });

  it("computes deterministic revision diffs without simulation", () => {
    const rev1Content: PageContent = {
      version: 1,
      schemaVersion: "1.0",
      blocks: [
        { id: "b1", type: "heading", order: 1, data: { text: "Ahoj" } },
        { id: "b2", type: "paragraph", order: 2, data: { content: "Starý text" } },
      ],
    };

    const rev2Content: PageContent = {
      version: 1,
      schemaVersion: "1.0",
      blocks: [
        { id: "b1", type: "heading", order: 1, data: { text: "Ahoj" } },
        { id: "b2", type: "paragraph", order: 2, data: { content: "Nový text" } },
        { id: "b3", type: "button", order: 3, data: { label: "Koupit" } },
      ],
    };

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
      content: rev1Content,
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
      content: rev2Content,
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
