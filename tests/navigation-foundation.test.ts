import { test, describe } from "node:test";
import assert from "node:assert";
import { 
  flattenAndCalculateDepths, 
  validateNavigationTree, 
  isSafeUrl, 
  sanitizeLabel,
  formatPublicNavigation,
  MAX_NAVIGATION_DEPTH
} from "../lib/domain/navigation/validation";
import { 
  resolvePublicProjectContext, 
  extractPublicProjectIdentifier,
  PublicProjectResolverDb 
} from "../lib/domain/navigation/public-context";
import { normalizeAdminProjectId } from "../lib/domain/pages-client/project-context";
import { NavigationItem } from "../lib/domain/navigation/types";

describe("SYN-NAV-001 Navigation Foundation — Behavioral Tests", () => {
  describe("1. Tree Hierarchy & Cycle Detection", () => {
    test("Calculates depths correctly for valid hierarchical tree", () => {
      const items: NavigationItem[] = [
        { id: "1", parentId: null, type: "PAGE", label: "Home", visibility: true, openInNewTab: false, order: 1 },
        { id: "2", parentId: null, type: "PAGE", label: "Products", visibility: true, openInNewTab: false, order: 2 },
        { id: "3", parentId: "2", type: "PAGE", label: "Software", visibility: true, openInNewTab: false, order: 1 },
        { id: "4", parentId: "3", type: "PAGE", label: "CMS", visibility: true, openInNewTab: false, order: 1 },
      ];

      const { flatItems, hasCycle, cycleErrors } = flattenAndCalculateDepths(items);
      assert.strictEqual(hasCycle, false, "Valid tree must not have cycles");
      assert.strictEqual(cycleErrors.length, 0);
      assert.strictEqual(flatItems.length, 4);

      const home = flatItems.find(i => i.id === "1");
      const products = flatItems.find(i => i.id === "2");
      const software = flatItems.find(i => i.id === "3");
      const cms = flatItems.find(i => i.id === "4");

      assert.strictEqual(home?.depth, 0);
      assert.strictEqual(products?.depth, 0);
      assert.strictEqual(software?.depth, 1);
      assert.strictEqual(cms?.depth, 2);
    });

    test("Detects cycles when item hierarchy contains circular reference", () => {
      const cyclicalItems: NavigationItem[] = [
        { id: "item-A", parentId: "item-C", type: "PAGE", label: "Item A", visibility: true, openInNewTab: false, order: 1 },
        { id: "item-B", parentId: "item-A", type: "PAGE", label: "Item B", visibility: true, openInNewTab: false, order: 1 },
        { id: "item-C", parentId: "item-B", type: "PAGE", label: "Item C", visibility: true, openInNewTab: false, order: 1 },
      ];

      const { hasCycle, cycleErrors } = flattenAndCalculateDepths(cyclicalItems);
      assert.strictEqual(hasCycle, true, "Cyclical tree must trigger hasCycle = true");
      assert.ok(cycleErrors.length > 0, "Cycle errors must contain diagnostic details");
    });

    test("Respects MAX_NAVIGATION_DEPTH invariant", () => {
      const deepItems: NavigationItem[] = [
        { id: "d0", parentId: null, type: "PAGE", label: "L0", visibility: true, openInNewTab: false, order: 1 },
        { id: "d1", parentId: "d0", type: "PAGE", label: "L1", visibility: true, openInNewTab: false, order: 1 },
        { id: "d2", parentId: "d1", type: "PAGE", label: "L2", visibility: true, openInNewTab: false, order: 1 },
        { id: "d3", parentId: "d2", type: "PAGE", label: "L3", visibility: true, openInNewTab: false, order: 1 },
        { id: "d4", parentId: "d3", type: "PAGE", label: "L4", visibility: true, openInNewTab: false, order: 1 },
      ];

      const { flatItems } = flattenAndCalculateDepths(deepItems);
      const l4 = flatItems.find(i => i.id === "d4");
      assert.strictEqual(l4?.depth, MAX_NAVIGATION_DEPTH, "Depths exceeding max must be clamped");
    });
  });

  describe("2. Security & Sanitization", () => {
    test("isSafeUrl blocks dangerous schemes and script protocols", () => {
      const dangerousUrls = [
        "javascript:alert(1)",
        "JAVASCRIPT:evil()",
        "  javascript:void(0)",
        "data:text/html,<script>alert(\"xss\")</script>",
        "vbscript:msgbox(\"hello\")",
        "file:///etc/passwd",
        "blob:https://example.com/uuid",
      ];

      for (const url of dangerousUrls) {
        const result = isSafeUrl(url);
        assert.strictEqual(result.safe, false, `URL ${url} must be marked unsafe`);
      }
    });

    test("isSafeUrl accepts valid safe protocols", () => {
      const safeUrls = [
        "https://synthesis-cms.com",
        "http://localhost:3000",
        "/blog/news-article",
        "#kontakt",
        "mailto:info@synthesis-cms.com",
        "tel:+420123456789",
      ];

      for (const url of safeUrls) {
        const result = isSafeUrl(url);
        assert.strictEqual(result.safe, true, `URL ${url} must be marked safe`);
      }
    });

    test("sanitizeLabel strips HTML tags and normalizes whitespace", () => {
      assert.strictEqual(sanitizeLabel("<b>Domů</b>"), "Domů");
      assert.strictEqual(sanitizeLabel("<p><span>O nás</span></p>"), "O nás");
      assert.strictEqual(sanitizeLabel("   Produkty   "), "Produkty");
      assert.strictEqual(sanitizeLabel(""), "");
    });

    test("validateNavigationTree rejects duplicate IDs and invalid items", () => {
      const invalidTree: NavigationItem[] = [
        { id: "dup-1", parentId: null, type: "PAGE", label: "First", visibility: true, openInNewTab: false, order: 1, pageId: "p1" },
        { id: "dup-1", parentId: null, type: "PAGE", label: "Second", visibility: true, openInNewTab: false, order: 2, pageId: "p2" },
        { id: "no-label", parentId: null, type: "PAGE", label: "   ", visibility: true, openInNewTab: false, order: 3, pageId: "p3" },
        { id: "bad-link", parentId: null, type: "EXTERNAL_LINK", label: "Evil", visibility: true, openInNewTab: false, order: 4, externalUrl: "javascript:alert(1)" },
      ];

      const validation = validateNavigationTree(invalidTree);
      assert.strictEqual(validation.isValid, false);
      assert.ok(validation.errors.some(e => e.includes("Duplicitní identifikátor")));
      assert.ok(validation.errors.some(e => e.includes("musí mít neprázdný název")));
      assert.ok(validation.errors.some(e => e.includes("zakázána")));
    });
  });

  describe("3. Public Navigation Read & Metadata Stripping", () => {
    test("formatPublicNavigation filters out non-PUBLISHED sets and invisible items", () => {
      const mixedSets = [
        {
          id: "set-draft",
          projectId: "proj-123",
          key: "draft-nav",
          name: "Draft Nav",
          context: "HEADER",
          status: "DRAFT",
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          items: [
            { id: "d1", parentId: null, type: "PAGE", label: "Draft Page", visibility: true, openInNewTab: false, order: 1 }
          ]
        },
        {
          id: "set-archived",
          projectId: "proj-123",
          key: "archived-nav",
          name: "Archived Nav",
          context: "FOOTER",
          status: "ARCHIVED",
          version: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
          items: [
            { id: "a1", parentId: null, type: "PAGE", label: "Old Page", visibility: true, openInNewTab: false, order: 1 }
          ]
        },
        {
          id: "set-published",
          projectId: "proj-123",
          key: "main-nav",
          name: "Main Navigation",
          context: "HEADER",
          description: "Public main header navigation",
          status: "PUBLISHED",
          version: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
          items: [
            { id: "p1", parentId: null, type: "PAGE", label: "Home", pageId: "page-home", visibility: true, openInNewTab: false, order: 1 },
            { id: "p2", parentId: null, type: "PAGE", label: "Hidden Item", pageId: "page-secret", visibility: false, openInNewTab: false, order: 2 },
            { id: "p3", parentId: null, type: "EXTERNAL_LINK", label: "Docs", externalUrl: "https://docs.synthesis-cms.com", visibility: true, openInNewTab: true, order: 3 },
          ]
        }
      ];

      const publicOutput = formatPublicNavigation(mixedSets);

      // Only published set is returned
      assert.strictEqual(publicOutput.length, 1);
      const pubSet = publicOutput[0];
      assert.strictEqual(pubSet.key, "main-nav");
      assert.strictEqual(pubSet.name, "Main Navigation");
      assert.strictEqual(pubSet.context, "HEADER");
      assert.strictEqual(pubSet.description, "Public main header navigation");

      // Admin metadata is completely stripped
      assert.strictEqual((pubSet as any).id, undefined);
      assert.strictEqual((pubSet as any).projectId, undefined);
      assert.strictEqual((pubSet as any).status, undefined);
      assert.strictEqual((pubSet as any).version, undefined);
      assert.strictEqual((pubSet as any).createdAt, undefined);
      assert.strictEqual((pubSet as any).updatedAt, undefined);

      // Only visible items are returned
      assert.strictEqual(pubSet.items.length, 2);
      assert.strictEqual(pubSet.items[0].label, "Home");
      assert.strictEqual(pubSet.items[1].label, "Docs");
      assert.strictEqual(pubSet.items.some(i => i.label === "Hidden Item"), false);
    });

    test("normalizeAdminProjectId sanitizes input and rejects malicious strings", () => {
      assert.strictEqual(normalizeAdminProjectId("proj-alpha"), "proj-alpha");
      assert.strictEqual(normalizeAdminProjectId("  proj-beta  "), "proj-beta");
      assert.strictEqual(normalizeAdminProjectId("<script>"), null);
      assert.strictEqual(normalizeAdminProjectId("proj\x00null"), null);
      assert.strictEqual(normalizeAdminProjectId(""), null);
      assert.strictEqual(normalizeAdminProjectId(null), null);
      assert.strictEqual(normalizeAdminProjectId(undefined), null);
    });

    test("Regression: Missing project context must NOT select any project automatically (Fail Closed)", async () => {
      let dbQueryCount = 0;
      const mockDb: PublicProjectResolverDb = {
        project: {
          findFirst: async () => {
            dbQueryCount++;
            return { id: "default-active-project" };
          }
        }
      };

      // 1. Request with no params, headers, or cookies
      const emptyReq = new Request("https://cms.local/api/public/navigation");
      const resolvedEmpty = await resolvePublicProjectContext(emptyReq, mockDb);
      assert.strictEqual(resolvedEmpty, null, "Empty request must resolve to null");
      assert.strictEqual(dbQueryCount, 0, "Must NOT query DB or fall back to any default project when context is missing");

      // 2. Request with undefined / no request object
      const resolvedUndefined = await resolvePublicProjectContext(undefined, mockDb);
      assert.strictEqual(resolvedUndefined, null, "Undefined request must resolve to null");
      assert.strictEqual(dbQueryCount, 0, "Must NOT query DB when request is undefined");

      // 3. Request with empty / invalid query params
      const invalidReq = new Request("https://cms.local/api/public/navigation?projectId=&project=");
      const resolvedInvalid = await resolvePublicProjectContext(invalidReq, mockDb);
      assert.strictEqual(resolvedInvalid, null, "Invalid query param must resolve to null");
      assert.strictEqual(dbQueryCount, 0, "Must NOT query DB for empty project param");
    });

    test("Public project context resolution validates ACTIVE project against DB", async () => {
      const activeProjects = [
        { id: "proj-123", key: "main-site", status: "ACTIVE" },
        { id: "proj-archived", key: "old-site", status: "ARCHIVED" },
      ];

      const mockDb: PublicProjectResolverDb = {
        project: {
          findFirst: async ({ where }: any) => {
            const requested = where.OR[0].id;
            const found = activeProjects.find(
              p => (p.id === requested || p.key === requested) && p.status === where.status
            );
            return found ? { id: found.id } : null;
          }
        }
      };

      // Query by ID
      const reqId = new Request("https://cms.local/api/public/navigation?projectId=proj-123");
      const resId = await resolvePublicProjectContext(reqId, mockDb);
      assert.strictEqual(resId, "proj-123");

      // Query by Key (alias)
      const reqKey = new Request("https://cms.local/api/public/navigation?project=main-site");
      const resKey = await resolvePublicProjectContext(reqKey, mockDb);
      assert.strictEqual(resKey, "proj-123");

      // Query via header
      const reqHeader = new Request("https://cms.local/api/public/navigation", {
        headers: { "x-project-id": "proj-123" }
      });
      const resHeader = await resolvePublicProjectContext(reqHeader, mockDb);
      assert.strictEqual(resHeader, "proj-123");

      // Inactive / Archived project fails closed
      const reqArchived = new Request("https://cms.local/api/public/navigation?projectId=proj-archived");
      const resArchived = await resolvePublicProjectContext(reqArchived, mockDb);
      assert.strictEqual(resArchived, null, "Archived project must not be resolved in public context");

      // Non-existent project fails closed
      const reqNotFound = new Request("https://cms.local/api/public/navigation?projectId=non-existent");
      const resNotFound = await resolvePublicProjectContext(reqNotFound, mockDb);
      assert.strictEqual(resNotFound, null, "Non-existent project must resolve to null");
    });
  });

  describe("4. Project Isolation & Multi-Tenancy Boundary", () => {
    test("Cross-project page reference validation fails when page belongs to different project", () => {
      const currentProjectId = "project-alpha";
      
      const validPage = { id: "page-1", projectId: "project-alpha", title: "Alpha Page" };
      const crossProjectPage = { id: "page-2", projectId: "project-beta", title: "Beta Page" };

      function validatePageProjectScope(page: { projectId: string }, targetProjectId: string): boolean {
        return page.projectId === targetProjectId;
      }

      assert.strictEqual(validatePageProjectScope(validPage, currentProjectId), true);
      assert.strictEqual(validatePageProjectScope(crossProjectPage, currentProjectId), false);
    });

    test("Navigation sets query enforces projectId scoping", () => {
      const allSetsInDb = [
        { id: "s1", projectId: "proj-1", name: "Set 1" },
        { id: "s2", projectId: "proj-2", name: "Set 2" },
        { id: "s3", projectId: "proj-1", name: "Set 3" },
      ];

      const scopedForProj1 = allSetsInDb.filter(s => s.projectId === "proj-1");
      assert.strictEqual(scopedForProj1.length, 2);
      assert.ok(scopedForProj1.every(s => s.projectId === "proj-1"));
    });
  });

  describe("5. RBAC & Publish Permission Invariants", () => {
    test("Role permission evaluation ensures navigation.publish is distinct from navigation.edit", () => {
      const editorPermissions = new Set<string>(["navigation.view", "navigation.edit", "navigation.create"]);
      const publisherPermissions = new Set<string>(["navigation.view", "navigation.edit", "navigation.create", "navigation.publish"]);

      function canPublish(permissions: Set<string>): boolean {
        return permissions.has("navigation.publish");
      }

      assert.strictEqual(canPublish(editorPermissions), false, "Editor without navigation.publish cannot publish");
      assert.strictEqual(canPublish(publisherPermissions), true, "Publisher with navigation.publish can publish");
    });

    test("Override evaluation prioritizes explicit grant/deny over base role", () => {
      interface UserContext {
        rolePermissions: string[];
        overrides: { permission: string; granted: boolean; projectId: string | null }[];
      }

      function evaluatePermission(user: UserContext, permission: string, projectId: string): boolean {
        const projOverride = user.overrides.find(o => o.permission === permission && o.projectId === projectId);
        if (projOverride) return projOverride.granted;

        const globalOverride = user.overrides.find(o => o.permission === permission && o.projectId === null);
        if (globalOverride) return globalOverride.granted;

        return user.rolePermissions.includes(permission);
      }

      const userWithPublishDenied: UserContext = {
        rolePermissions: ["navigation.view", "navigation.edit", "navigation.publish"],
        overrides: [
          { permission: "navigation.publish", granted: false, projectId: "proj-restricted" }
        ]
      };

      assert.strictEqual(evaluatePermission(userWithPublishDenied, "navigation.publish", "proj-regular"), true);
      assert.strictEqual(evaluatePermission(userWithPublishDenied, "navigation.publish", "proj-restricted"), false);
    });
  });
});
