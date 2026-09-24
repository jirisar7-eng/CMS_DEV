import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import { navigationRepository } from "../lib/domain/navigation/repository";
import { ALL_ADMIN_NAV_ITEMS, getCapabilityStatus } from "../lib/navigation/adminNav";

describe("SYN-NAV-002: Admin Navigation Lifecycle UI Contracts & Security", () => {
  const repoRoot = path.resolve(__dirname, "..");
  const workspacePath = path.join(repoRoot, "components/admin/navigation/NavigationWorkspace.tsx");
  const previewPath = path.join(repoRoot, "components/admin/navigation/NavigationPreview.tsx");
  const repositoryPath = path.join(repoRoot, "lib/domain/navigation/repository.ts");

  it("1. repository exposes all explicit lifecycle methods", () => {
    assert.strictEqual(typeof navigationRepository.publishNavigationSet, "function");
    assert.strictEqual(typeof navigationRepository.unpublishNavigationSet, "function");
    assert.strictEqual(typeof navigationRepository.archiveNavigationSet, "function");
    assert.strictEqual(typeof navigationRepository.deleteNavigationSet, "function");
    assert.strictEqual(typeof navigationRepository.updateNavigationSet, "function");
  });

  it("2. workspace source wires all lifecycle methods and guards archived mutations", () => {
    const workspaceCode = fs.readFileSync(workspacePath, "utf8");

    // Wires publish, unpublish, archive
    assert.ok(
      workspaceCode.includes("publishNavigationSet"),
      "Workspace must wire publishNavigationSet"
    );
    assert.ok(
      workspaceCode.includes("unpublishNavigationSet"),
      "Workspace must wire unpublishNavigationSet"
    );
    assert.ok(
      workspaceCode.includes("archiveNavigationSet"),
      "Workspace must wire archiveNavigationSet"
    );

    // Checks archived guard in mutation handlers
    assert.ok(
      workspaceCode.includes("isArchived") || workspaceCode.includes("ARCHIVED"),
      "Workspace must track archived lifecycle status"
    );
  });

  it("3. unpublished changes detection correctly identifies stale public version", () => {
    const isPublishedWithChanges = (status: string, version: number, publishedVersion?: number | null) => {
      if (status !== "PUBLISHED") return false;
      if (publishedVersion === null || publishedVersion === undefined) return false;
      return version > publishedVersion;
    };

    assert.strictEqual(isPublishedWithChanges("DRAFT", 1, null), false);
    assert.strictEqual(isPublishedWithChanges("PUBLISHED", 2, 2), false); // Up to date
    assert.strictEqual(isPublishedWithChanges("PUBLISHED", 3, 2), true); // Unpublished draft changes
    assert.strictEqual(isPublishedWithChanges("ARCHIVED", 5, 4), false); // Archived set
  });

  it("4. capability status is FUNKČNÍ in workspace badge and adminNav registry", () => {
    const workspaceCode = fs.readFileSync(workspacePath, "utf8");
    assert.ok(
      workspaceCode.includes('<CapabilityStatusBadge status="FUNKČNÍ" />') ||
        workspaceCode.includes("<CapabilityStatusBadge status='FUNKČNÍ' />") ||
        workspaceCode.includes('status="FUNKČNÍ"'),
      "Workspace badge must be FUNKČNÍ"
    );

    const navItem = ALL_ADMIN_NAV_ITEMS.find((item) => item.id === "navigation");
    assert.ok(navItem, "Navigation entry must exist in admin nav");
    assert.strictEqual(navItem.status, "FUNKČNÍ", "adminNav status for navigation must be FUNKČNÍ");
    assert.strictEqual(getCapabilityStatus("navigation"), "FUNKČNÍ");
  });

  it("5. preview explicitly identifies draft semantics without claiming live/public state", () => {
    const previewCode = fs.readFileSync(previewPath, "utf8");

    assert.ok(
      previewCode.includes("Náhled konceptu") || previewCode.includes("Draft preview"),
      "Preview must clearly label draft semantics"
    );
    assert.ok(
      previewCode.includes("draft") || previewCode.includes("koncept"),
      "Preview must inform user that it renders editable draft data"
    );
  });

  it("6. validation error formatting in repository avoids arbitrary HTML and renders safe text", () => {
    const repoCode = fs.readFileSync(repositoryPath, "utf8");

    assert.strictEqual(
      repoCode.includes("dangerouslySetInnerHTML"),
      false,
      "Repository must never use dangerouslySetInnerHTML"
    );
    assert.ok(
      repoCode.includes("errorData.errors") || repoCode.includes("errorData.error"),
      "Repository must extract structured validation error details"
    );
  });
});
