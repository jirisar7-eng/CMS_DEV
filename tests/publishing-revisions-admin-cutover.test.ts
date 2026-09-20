import { describe, it, expect, vi, beforeEach } from "vitest";
import { ADMIN_NAV_GROUPS, getCapabilityById } from "@/lib/navigation/adminNav";
import { ContentLifecycleService } from "@/lib/domain/content/lifecycle/service";
import { ContentLifecycleStore } from "@/lib/domain/content/lifecycle/store";
import fs from "fs";
import path from "path";

describe("SYN-CONTENT-003: Publishing & Revisions Admin Cutover", () => {
  it("verifies capability status for publishing and revisions in adminNav.ts is FUNKČNÍ", () => {
    const pubCap = getCapabilityById("publishing");
    expect(pubCap).toBeDefined();
    expect(pubCap?.status).toBe("FUNKČNÍ");

    const revCap = getCapabilityById("revisions");
    expect(revCap).toBeDefined();
    expect(revCap?.status).toBe("FUNKČNÍ");
  });

  it("verifies app/admin/publishing/page.tsx and app/admin/revisions/page.tsx contain no hardcoded demo data", () => {
    const pubPageContent = fs.readFileSync(
      path.join(process.cwd(), "app/admin/publishing/page.tsx"),
      "utf-8"
    );
    expect(pubPageContent).not.toContain("v2.4.1");
    expect(pubPageContent).not.toContain("handleUnfinishedAction");

    const revPageContent = fs.readFileSync(
      path.join(process.cwd(), "app/admin/revisions/page.tsx"),
      "utf-8"
    );
    expect(revPageContent).not.toContain("handleUnfinishedAction");
    expect(revPageContent).not.toContain("Přidána tabulka srovnání tarifů Enterprise");
  });

  describe("ContentLifecycleService - listReleases and listRevisions", () => {
    let mockStore: Partial<ContentLifecycleStore>;

    beforeEach(() => {
      mockStore = {
        listProjectReleases: vi.fn().mockResolvedValue([
          {
            release: {
              id: "rel-1",
              projectId: "proj-123",
              status: "PUBLISHED",
              createdById: "user-1",
              createdAt: new Date(),
              publishedAt: new Date(),
              rolledBackAt: null,
            },
            items: [
              {
                releaseId: "rel-1",
                pageId: "page-1",
                revisionId: "rev-1",
                previousRevisionId: null,
                pageTitle: "Úvodní stránka",
                pageSlug: "home",
              },
            ],
          },
        ]),
        listProjectRevisions: vi.fn().mockResolvedValue([
          {
            id: "rev-1",
            pageId: "page-1",
            revisionNumber: 1,
            status: "PUBLISHED",
            title: "Úvodní stránka",
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
            pageTitle: "Úvodní stránka",
            pageSlug: "home",
          },
        ]),
      };
    });

    it("returns project releases when user has content.view permission", async () => {
      const permissionChecker = vi.fn().mockResolvedValue(true);
      const service = new ContentLifecycleService({
        store: mockStore as ContentLifecycleStore,
        hasPermission: permissionChecker,
      });

      const releases = await service.listReleases({ actorId: "user-1", projectId: "proj-123" });
      expect(permissionChecker).toHaveBeenCalledWith("user-1", "content.view", "proj-123");
      expect(releases).toHaveLength(1);
      expect(releases[0].release.id).toBe("rel-1");
    });

    it("throws FORBIDDEN error when user lacks content.view permission for listReleases", async () => {
      const permissionChecker = vi.fn().mockResolvedValue(false);
      const service = new ContentLifecycleService({
        store: mockStore as ContentLifecycleStore,
        hasPermission: permissionChecker,
      });

      await expect(
        service.listReleases({ actorId: "user-2", projectId: "proj-123" })
      ).rejects.toThrow("Permission content.view required");
    });

    it("returns project revisions when user has content.view permission", async () => {
      const permissionChecker = vi.fn().mockResolvedValue(true);
      const service = new ContentLifecycleService({
        store: mockStore as ContentLifecycleStore,
        hasPermission: permissionChecker,
      });

      const revisions = await service.listRevisions({ actorId: "user-1", projectId: "proj-123" });
      expect(permissionChecker).toHaveBeenCalledWith("user-1", "content.view", "proj-123");
      expect(revisions).toHaveLength(1);
      expect(revisions[0].id).toBe("rev-1");
    });

    it("throws FORBIDDEN error when user lacks content.view permission for listRevisions", async () => {
      const permissionChecker = vi.fn().mockResolvedValue(false);
      const service = new ContentLifecycleService({
        store: mockStore as ContentLifecycleStore,
        hasPermission: permissionChecker,
      });

      await expect(
        service.listRevisions({ actorId: "user-2", projectId: "proj-123" })
      ).rejects.toThrow("Permission content.view required");
    });
  });
});
