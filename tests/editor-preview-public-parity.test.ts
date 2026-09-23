import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BlockRenderer, getColumnsLayoutInfo } from "@/components/admin/composer/BlockRenderer";
import { CanonicalContentRenderer } from "@/lib/composer/render";
import { puckConfig } from "@/lib/composer/puck.config";
import { ContentBlock, PageContent } from "@/lib/domain/pages";
import { getBlockDefinition } from "@/lib/composer/registry";
import { canonicalToPuckData, puckDataToCanonical } from "@/lib/composer/adapter";
import { ProjectEntitlements } from "@/lib/composer/types";

const ALL_ENTITLEMENTS: ProjectEntitlements = {
  tier: "enterprise",
  features: {
    advancedComponents: true,
    customCode: true,
    customCss: true,
    formsModule: true,
    ecommerceModule: true,
    analyticsModule: true
  }
};

describe("SYN-EDITOR-002 Step 1.1: Parity Test Hardening", () => {
  describe("1. Component Parity (Preview vs Public)", () => {
    test("heading parity across preview and public rendering", () => {
      const block: ContentBlock = {
        id: "h-1",
        type: "heading",
        order: 0,
        data: { level: 2, text: "Parity Heading", align: "center" }
      };

      const previewHtml = renderToStaticMarkup(React.createElement(BlockRenderer, { block, isPreview: true }));
      const publicHtml = renderToStaticMarkup(React.createElement(BlockRenderer, { block, isPreview: false }));

      assert.equal(previewHtml, publicHtml);
      assert.ok(previewHtml.includes("<h2"));
      assert.ok(previewHtml.includes("text-center"));
      assert.ok(previewHtml.includes("Parity Heading"));
    });

    test("paragraph parity with preview placeholder vs clean public output", () => {
      const blockWithText: ContentBlock = {
        id: "p-1",
        type: "paragraph",
        order: 0,
        data: { text: "Standard text content", size: "lg", align: "left" }
      };

      const textPreview = renderToStaticMarkup(React.createElement(BlockRenderer, { block: blockWithText, isPreview: true }));
      const textPublic = renderToStaticMarkup(React.createElement(BlockRenderer, { block: blockWithText, isPreview: false }));

      assert.equal(textPreview, textPublic);
      assert.ok(textPreview.includes("Standard text content"));
      assert.ok(textPreview.includes("text-lg"));

      const emptyBlock: ContentBlock = {
        id: "p-empty",
        type: "paragraph",
        order: 0,
        data: { text: "" }
      };

      const emptyPreview = renderToStaticMarkup(React.createElement(BlockRenderer, { block: emptyBlock, isPreview: true }));
      const emptyPublic = renderToStaticMarkup(React.createElement(BlockRenderer, { block: emptyBlock, isPreview: false }));

      assert.ok(emptyPreview.includes("Prázdný odstavec"));
      assert.ok(!emptyPublic.includes("Prázdný odstavec"));
    });

    test("rich_text parity and sanitization across preview and public", () => {
      const block: ContentBlock = {
        id: "rt-1",
        type: "rich_text",
        order: 0,
        data: { html: "<p>Rich <strong>bold</strong> text</p><script>alert(1)</script>", align: "right" }
      };

      const previewHtml = renderToStaticMarkup(React.createElement(BlockRenderer, { block, isPreview: true }));
      const publicHtml = renderToStaticMarkup(React.createElement(BlockRenderer, { block, isPreview: false }));

      assert.equal(previewHtml, publicHtml);
      assert.ok(previewHtml.includes("<strong>bold</strong>"));
      assert.ok(!previewHtml.includes("<script>"));
      assert.ok(previewHtml.includes("text-right"));
    });

    test("image parity across preview and public", () => {
      const block: ContentBlock = {
        id: "img-1",
        type: "image",
        order: 0,
        data: { url: "https://example.com/photo.jpg", alt: "Test photo", caption: "Photo caption", aspectRatio: "16:9" }
      };

      const previewHtml = renderToStaticMarkup(React.createElement(BlockRenderer, { block, isPreview: true }));
      const publicHtml = renderToStaticMarkup(React.createElement(BlockRenderer, { block, isPreview: false }));

      assert.equal(previewHtml, publicHtml);
      assert.ok(previewHtml.includes("https://example.com/photo.jpg"));
      assert.ok(previewHtml.includes("Photo caption"));
      assert.ok(previewHtml.includes("aspect-video"));
    });

    test("callout parity across tones in preview and public", () => {
      for (const tone of ["info", "warning", "success", "critical"] as const) {
        const block: ContentBlock = {
          id: `callout-${tone}`,
          type: "callout",
          order: 0,
          data: { tone, title: `Title ${tone}`, text: `Notice message for ${tone}` }
        };

        const previewHtml = renderToStaticMarkup(React.createElement(BlockRenderer, { block, isPreview: true }));
        const publicHtml = renderToStaticMarkup(React.createElement(BlockRenderer, { block, isPreview: false }));

        assert.equal(previewHtml, publicHtml);
        assert.ok(previewHtml.includes(`Title ${tone}`));
        assert.ok(previewHtml.includes(`Notice message for ${tone}`));
      }
    });

    test("quote parity in preview and public", () => {
      const block: ContentBlock = {
        id: "q-1",
        type: "quote",
        order: 0,
        data: { quote: "Moudrost dne", author: "Jan Ámos", citation: "Labyrint světa" }
      };

      const previewHtml = renderToStaticMarkup(React.createElement(BlockRenderer, { block, isPreview: true }));
      const publicHtml = renderToStaticMarkup(React.createElement(BlockRenderer, { block, isPreview: false }));

      assert.equal(previewHtml, publicHtml);
      assert.ok(previewHtml.includes("Moudrost dne"));
      assert.ok(previewHtml.includes("Jan Ámos"));
      assert.ok(previewHtml.includes("Labyrint světa"));
    });

    test("button parity HTML attributes across preview and public", () => {
      const block: ContentBlock = {
        id: "b-1",
        type: "button",
        order: 0,
        data: { label: "Akční tlačítko", url: "/kontakt", variant: "primary", target: "_blank" }
      };

      const previewHtml = renderToStaticMarkup(React.createElement(BlockRenderer, { block, isPreview: true }));
      const publicHtml = renderToStaticMarkup(React.createElement(BlockRenderer, { block, isPreview: false }));

      assert.ok(previewHtml.includes("href=\"/kontakt\""));
      assert.ok(previewHtml.includes("target=\"_blank\""));
      assert.ok(previewHtml.includes("rel=\"noopener noreferrer\""));
      assert.ok(publicHtml.includes("href=\"/kontakt\""));
    });

    test("button interaction contract: invokes preventDefault when isPreview=true, allows default when isPreview=false", () => {
      const block: ContentBlock = {
        id: "b-int-1",
        type: "button",
        order: 0,
        data: { label: "Klik", url: "/cil", variant: "primary", target: "_self" }
      };

      // 1. In preview mode: must preventDefault
      const previewElement = BlockRenderer({ block, isPreview: true }) as React.ReactElement<{ children: React.ReactElement<{ onClick: (e: any) => void }> }>;
      assert.ok(previewElement && previewElement.props && previewElement.props.children);
      const previewAnchor = previewElement.props.children;
      let previewPrevented = false;
      previewAnchor.props.onClick({
        preventDefault: () => {
          previewPrevented = true;
        }
      });
      assert.equal(previewPrevented, true, "isPreview=true MUST invoke preventDefault to protect editor workspace");

      // 2. In public mode: must NOT preventDefault
      const publicElement = BlockRenderer({ block, isPreview: false }) as React.ReactElement<{ children: React.ReactElement<{ onClick: (e: any) => void }> }>;
      assert.ok(publicElement && publicElement.props && publicElement.props.children);
      const publicAnchor = publicElement.props.children;
      let publicPrevented = false;
      publicAnchor.props.onClick({
        preventDefault: () => {
          publicPrevented = true;
        }
      });
      assert.equal(publicPrevented, false, "isPreview=false MUST NOT invoke preventDefault to allow user navigation");
    });

    test("divider parity across preview and public", () => {
      const block: ContentBlock = {
        id: "d-1",
        type: "divider",
        order: 0,
        data: { style: "dashed", spacing: "lg" }
      };

      const previewHtml = renderToStaticMarkup(React.createElement(BlockRenderer, { block, isPreview: true }));
      const publicHtml = renderToStaticMarkup(React.createElement(BlockRenderer, { block, isPreview: false }));

      assert.equal(previewHtml, publicHtml);
      assert.ok(previewHtml.includes("border-dashed"));
      assert.ok(previewHtml.includes("my-8"));
    });

    test("module_embed parity across preview and public", () => {
      const block: ContentBlock = {
        id: "m-1",
        type: "module_embed",
        order: 0,
        data: { moduleId: "contact_form", schemaVersion: "v1" }
      };

      const previewHtml = renderToStaticMarkup(React.createElement(BlockRenderer, { block, isPreview: true }));
      const publicHtml = renderToStaticMarkup(React.createElement(BlockRenderer, { block, isPreview: false }));

      assert.equal(previewHtml, publicHtml);
      assert.ok(previewHtml.includes("contact_form"));
      assert.ok(previewHtml.includes("Systémový modul"));
    });
  });

  describe("2. Shared Layout Semantics for Columns", () => {
    test("getColumnsLayoutInfo provides identical classes for layout ratios and gaps", () => {
      const layout11 = getColumnsLayoutInfo("1-1", "sm");
      assert.equal(layout11.gapClass, "gap-3");
      assert.equal(layout11.gridClass, "grid-cols-1 md:grid-cols-2");
      assert.equal(layout11.getColumnSpanClass(0), "md:col-span-1");
      assert.equal(layout11.getColumnSpanClass(1), "md:col-span-1");

      const layout12 = getColumnsLayoutInfo("1-2", "md");
      assert.equal(layout12.gapClass, "gap-5");
      assert.equal(layout12.gridClass, "grid-cols-1 md:grid-cols-3");
      assert.equal(layout12.getColumnSpanClass(0), "md:col-span-1");
      assert.equal(layout12.getColumnSpanClass(1), "md:col-span-2");

      const layout21 = getColumnsLayoutInfo("2-1", "lg");
      assert.equal(layout21.gapClass, "gap-8");
      assert.equal(layout21.gridClass, "grid-cols-1 md:grid-cols-3");
      assert.equal(layout21.getColumnSpanClass(0), "md:col-span-2");
      assert.equal(layout21.getColumnSpanClass(1), "md:col-span-1");

      const layout111 = getColumnsLayoutInfo("1-1-1", "md");
      assert.equal(layout111.gridClass, "grid-cols-1 md:grid-cols-3");
      assert.equal(layout111.getColumnSpanClass(0), "md:col-span-1");
      assert.equal(layout111.getColumnSpanClass(1), "md:col-span-1");
      assert.equal(layout111.getColumnSpanClass(2), "md:col-span-1");
    });

    test("Puck columns and public columns derive layout and gap from the same shared contract across all layouts", () => {
      const testCases = [
        { layout: "1-1", gap: "sm", expectedGrid: "grid-cols-1 md:grid-cols-2", expectedGap: "gap-3" },
        { layout: "1-2", gap: "md", expectedGrid: "grid-cols-1 md:grid-cols-3", expectedGap: "gap-5" },
        { layout: "2-1", gap: "lg", expectedGrid: "grid-cols-1 md:grid-cols-3", expectedGap: "gap-8" },
        { layout: "1-1-1", gap: "md", expectedGrid: "grid-cols-1 md:grid-cols-3", expectedGap: "gap-5" }
      ] as const;

      const columnsPuckComponent = puckConfig.components["columns"];
      assert.ok(columnsPuckComponent, "columns component must exist in puckConfig");

      for (const tc of testCases) {
        // 1. Verify getColumnsLayoutInfo contract
        const layoutInfo = getColumnsLayoutInfo(tc.layout, tc.gap);
        assert.equal(layoutInfo.gridClass, tc.expectedGrid);
        assert.equal(layoutInfo.gapClass, tc.expectedGap);

        // 2. Verify Puck render output carries exact shared classes
        const renderedPuck = renderToStaticMarkup(columnsPuckComponent.render({ layout: tc.layout, gap: tc.gap }));
        assert.ok(renderedPuck.includes(tc.expectedGrid), `Puck columns must include ${tc.expectedGrid}`);
        assert.ok(renderedPuck.includes(tc.expectedGap), `Puck columns must include ${tc.expectedGap}`);

        // 3. Verify public BlockRenderer output carries exact shared classes and column spans
        const colBlock: ContentBlock = {
          id: `col-${tc.layout}`,
          type: "columns",
          order: 0,
          data: { layout: tc.layout, gap: tc.gap },
          children: [
            { id: "c-1", type: "paragraph", order: 0, data: { text: "Col 1" } },
            { id: "c-2", type: "paragraph", order: 1, data: { text: "Col 2" } }
          ]
        };

        const renderedPublic = renderToStaticMarkup(React.createElement(BlockRenderer, { block: colBlock, isPreview: false }));
        assert.ok(renderedPublic.includes(tc.expectedGrid), `Public columns must include ${tc.expectedGrid}`);
        assert.ok(renderedPublic.includes(tc.expectedGap), `Public columns must include ${tc.expectedGap}`);
        assert.ok(renderedPublic.includes(layoutInfo.getColumnSpanClass(0)), "First column must have layout span class");
        assert.ok(renderedPublic.includes(layoutInfo.getColumnSpanClass(1)), "Second column must have layout span class");
      }
    });

    test("nested content serialization contract: bidirectional round-trip preserves tree and data", () => {
      const originalPageContent: PageContent = {
        version: 1,
        schemaVersion: "syn-content-v1",
        blocks: [
          {
            id: "cols-nested-1",
            type: "columns",
            order: 0,
            data: { layout: "1-2", gap: "lg" },
            children: [
              {
                id: "child-h-1",
                type: "heading",
                order: 0,
                data: { level: 3, text: "Levý sloupec", align: "left" }
              },
              {
                id: "child-p-1",
                type: "paragraph",
                order: 1,
                data: { text: "Pravý širší sloupec s textem", size: "md", align: "left" }
              }
            ]
          }
        ]
      };

      // 1. Serialize canonical -> Puck data format
      const puckData = canonicalToPuckData(originalPageContent);
      assert.equal(puckData.content.length, 1);
      assert.equal(puckData.content[0].type, "columns");
      assert.equal(puckData.content[0].props.layout, "1-2");
      assert.equal(puckData.content[0].props.gap, "lg");
      assert.ok(puckData.content[0].zones && puckData.content[0].zones.default);
      assert.equal(puckData.content[0].zones.default.length, 2);
      assert.equal(puckData.content[0].zones.default[0].type, "heading");
      assert.equal(puckData.content[0].zones.default[0].props.text, "Levý sloupec");
      assert.equal(puckData.content[0].zones.default[1].type, "paragraph");

      // 2. Deserialize Puck data format -> canonical PageContent
      const roundtripped = puckDataToCanonical(puckData, "syn-content-v1", ALL_ENTITLEMENTS);
      assert.equal(roundtripped.blocks.length, 1);
      assert.equal(roundtripped.blocks[0].id, "cols-nested-1");
      assert.equal(roundtripped.blocks[0].type, "columns");
      assert.deepEqual(roundtripped.blocks[0].data, { layout: "1-2", gap: "lg" });
      assert.ok(Array.isArray(roundtripped.blocks[0].children));
      assert.equal(roundtripped.blocks[0].children.length, 2);
      assert.equal(roundtripped.blocks[0].children[0].id, "child-h-1");
      assert.equal(roundtripped.blocks[0].children[0].type, "heading");
      assert.equal(roundtripped.blocks[0].children[0].data.text, "Levý sloupec");
      assert.equal(roundtripped.blocks[0].children[1].id, "child-p-1");
      assert.equal(roundtripped.blocks[0].children[1].type, "paragraph");
      assert.equal(roundtripped.blocks[0].children[1].data.text, "Pravý širší sloupec s textem");
    });

    test("CanonicalContentRenderer delegates rendering with order sorting", () => {
      const pageContent: PageContent = {
        version: 1,
        schemaVersion: "syn-content-v1",
        blocks: [
          { id: "b-2", type: "paragraph", order: 2, data: { text: "Second Block" } },
          { id: "b-1", type: "heading", order: 1, data: { level: 1, text: "First Block" } }
        ]
      };

      const html = renderToStaticMarkup(React.createElement(CanonicalContentRenderer, { content: pageContent, isPreview: false }));
      const firstIdx = html.indexOf("First Block");
      const secondIdx = html.indexOf("Second Block");

      assert.ok(firstIdx !== -1 && secondIdx !== -1);
      assert.ok(firstIdx < secondIdx, "Blocks must be sorted by order");
    });
  });

  describe("3. Security & Sanitization Integrity", () => {
    test("rich_text sanitizer strips dangerous XSS tags and event handlers", () => {
      const def = getBlockDefinition("rich_text");
      const res = def.validateData({
        html: "<p>Safe</p><script>alert(\"xss\")</script><img src=\"x\" onerror=\"alert(1)\" /><a href=\"javascript:alert(1)\">Link</a>"
      });
      assert.equal(res.valid, true);
      assert.ok(!res.sanitized.html.includes("<script"));
      assert.ok(!res.sanitized.html.includes("onerror"));
      assert.ok(res.sanitized.html.includes("href=\"#\""));
    });

    test("button sanitizer neutralizes dangerous URL schemes", () => {
      const def = getBlockDefinition("button");
      const res = def.validateData({
        url: "javascript:alert(document.cookie)",
        label: "Click"
      });
      assert.equal(res.valid, true);
      assert.equal(res.sanitized.url, "#");
    });
  });
});
