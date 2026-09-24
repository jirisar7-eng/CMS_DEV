import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PuckData, puckDataToCanonical } from "@/lib/composer/adapter";
import { ProjectEntitlements } from "@/lib/composer/types";

const require = createRequire(import.meta.url);

let EDITOR_VIEWPORTS: any[];
let PageComposerWorkspace: React.FC<any>;

import { resolveProjectEntitlements } from "@/lib/composer/entitlements";

const TEST_ENTITLEMENTS: ProjectEntitlements = resolveProjectEntitlements("COMMUNITY");

describe("SYN-EDITOR-002 Step 2: Mobile Workspace UX & Viewport Parity", () => {
  before(async () => {
    // Provide safe no-op for .css imports in Node/tsx test runner
    require.extensions[".css"] = () => {};

    // Mock next/navigation for server/static tests
    const Module = require("node:module");
    const originalRequire = Module.prototype.require;
    Module.prototype.require = function (id: string) {
      if (id === "next/navigation") {
        return {
          useRouter: () => ({
            push: () => {},
            replace: () => {},
            refresh: () => {},
            back: () => {},
          }),
          usePathname: () => "/",
          useSearchParams: () => new URLSearchParams(),
        };
      }
      return originalRequire.apply(this, arguments as any);
    };

    const mod = await import("@/components/admin/composer/PageComposerWorkspace");
    EDITOR_VIEWPORTS = mod.EDITOR_VIEWPORTS;
    PageComposerWorkspace = mod.PageComposerWorkspace;
  });

  describe("1. Viewport Contract", () => {
    test("viewport contract explicitly contains 360, 390 and 768", () => {
      assert.ok(Array.isArray(EDITOR_VIEWPORTS), "EDITOR_VIEWPORTS must be an array");

      const v360 = EDITOR_VIEWPORTS.find((v) => v.width === 360);
      assert.ok(v360, "Must explicitly provide 360px viewport");
      assert.equal(v360.width, 360);
      assert.equal(v360.height, "auto");
      assert.equal(v360.icon, "Smartphone");
      assert.ok(v360.label && v360.label.includes("360"));

      const v390 = EDITOR_VIEWPORTS.find((v) => v.width === 390);
      assert.ok(v390, "Must explicitly provide 390px viewport");
      assert.equal(v390.width, 390);
      assert.equal(v390.height, "auto");
      assert.equal(v390.icon, "Smartphone");
      assert.ok(v390.label && v390.label.includes("390"));

      const v768 = EDITOR_VIEWPORTS.find((v) => v.width === 768);
      assert.ok(v768, "Must explicitly provide 768px viewport");
      assert.equal(v768.width, 768);
      assert.equal(v768.height, "auto");
      assert.equal(v768.icon, "Tablet");
      assert.ok(v768.label && v768.label.includes("768"));
    });

    test("desktop viewports remain available", () => {
      const vDesktop = EDITOR_VIEWPORTS.find((v) => v.width === 1280);
      assert.ok(vDesktop, "Must provide 1280px desktop viewport");
      assert.equal(vDesktop.icon, "Monitor");

      const vFull = EDITOR_VIEWPORTS.find((v) => v.width === "100%");
      assert.ok(vFull, "Must provide full-width viewport");
    });
  });

  describe("2. Authoring Shell & Overflow Containment", () => {
    test("editor shell contains no intentional page-level horizontal overflow", () => {
      const filePath = path.join(process.cwd(), "components/admin/composer/PageComposerWorkspace.tsx");
      const code = fs.readFileSync(filePath, "utf-8");

      // Shell root container must have overflow containment, max-width and min-w-0
      assert.ok(code.includes("overflow-x-hidden"), "Shell root must have overflow-x-hidden");
      assert.ok(code.includes("max-w-full"), "Shell root must prevent exceeding viewport width");
      assert.ok(code.includes("min-w-0"), "Shell root must be min-width safe");
      assert.ok(code.includes("w-full"), "Shell root must be responsive w-full");

      // Verify no hardcoded wide fixed pixel widths on layout
      assert.ok(!code.includes("w-[1"), "Must not hardcode wide fixed widths on layout");
    });

    test("narrow layout uses min-width-safe containers and responsive wrapping for banners", () => {
      const filePath = path.join(process.cwd(), "components/admin/composer/PageComposerWorkspace.tsx");
      const code = fs.readFileSync(filePath, "utf-8");

      // Banner checks: min-w-0, max-w-full, flex-col sm:flex-row, break-words, shrink-0
      assert.ok(code.includes("banner-not-draft"), "Draft banner test id present");
      assert.ok(code.includes("banner-lock-conflict"), "Lock conflict banner test id present");
      assert.ok(code.includes("banner-success"), "Success banner test id present");
      assert.ok(code.includes("banner-error"), "Error banner test id present");

      assert.ok(code.includes("flex-col sm:flex-row"), "Banners must stack on mobile and row on tablet+");
      assert.ok(code.includes("break-words"), "Banner text must allow wrapping on narrow screens");
      assert.ok(code.includes("shrink-0"), "Icons and action buttons must not collapse");
    });

    test("primary header/save controls remain rendered/reachable", () => {
      const filePath = path.join(process.cwd(), "components/admin/composer/PageComposerWorkspace.tsx");
      const code = fs.readFileSync(filePath, "utf-8");

      assert.ok(code.includes("puck-header-actions"), "Header actions container identifier present");
      assert.ok(code.includes("shrink-0 min-w-0"), "Header actions must be shrink-0 min-w-0 safe");
      assert.ok(code.includes("viewports={EDITOR_VIEWPORTS}"), "Puck must receive explicit EDITOR_VIEWPORTS");
    });

    test("conflict reload action remains reachable", () => {
      const filePath = path.join(process.cwd(), "components/admin/composer/PageComposerWorkspace.tsx");
      const code = fs.readFileSync(filePath, "utf-8");

      assert.ok(code.includes("btn-reload-conflict"), "Conflict reload button present");
      assert.ok(code.includes("shrink-0"), "Conflict reload button must be shrink-0");
      assert.ok(code.includes("setRefetchCounter"), "Conflict button triggers refetch");
    });
  });

  describe("3. Lifecycle, Entitlements & Fail-Closed Project Context", () => {
    test("responsive changes do not alter handleSave draft API semantics", async () => {
      const puckData: PuckData = {
        content: [
          {
            type: "heading",
            props: { id: "h-save-1", text: "Uložený nadpis", level: 2 },
          },
        ],
        root: {},
      };

      const canonical = puckDataToCanonical(puckData, "syn-content-v1", TEST_ENTITLEMENTS);
      assert.equal(canonical.blocks.length, 1);
      assert.equal(canonical.blocks[0].type, "heading");
      assert.equal(canonical.blocks[0].id, "h-save-1");
      assert.deepEqual(canonical.blocks[0].data, { text: "Uložený nadpis", level: 2, align: "left" });
    });

    test("existing project context failure remains fail-closed", () => {
      const rendered = renderToStaticMarkup(
        React.createElement(PageComposerWorkspace, {
          pageId: "page-1",
          projectId: "",
          initialEntitlements: TEST_ENTITLEMENTS,
        })
      );

      assert.ok(rendered.includes("Chybí platný kontext projektu"));
      assert.ok(rendered.includes("fail-closed-project-context"));
      assert.ok(rendered.includes("min-w-0"));
      assert.ok(rendered.includes("break-words"));
      assert.ok(!rendered.includes("puck-header-actions"), "Puck must not be rendered without valid project");
    });

    test("edit page server component fails closed without valid project context", () => {
      const filePath = path.join(process.cwd(), "app/admin/pages/[id]/edit/page.tsx");
      const code = fs.readFileSync(filePath, "utf-8");

      assert.ok(code.includes("projectContext.status !== 'PROJECT_VALID'"), "Server route validates project context");
      assert.ok(code.includes("fail-closed-server-project-context"), "Server route renders fail-closed container");
      assert.ok(code.includes("min-w-0"), "Server route uses min-w-0 safe container");
    });
  });
});
