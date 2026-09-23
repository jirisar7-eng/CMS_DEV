import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BlockRenderer, getColumnsLayoutInfo } from "@/components/admin/composer/BlockRenderer";
import { CanonicalContentRenderer } from "@/lib/composer/render";
import { puckConfig } from "@/lib/composer/puck.config";
import { ContentBlock, PageContent } from "@/lib/domain/pages";
import { getBlockDefinition } from "@/lib/composer/registry";

describe("SYN-EDITOR-002 Step 1: Editor Preview & Public Renderer Parity", () => {
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

    test("button parity and navigation behavior contract", () => {
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

    test("Puck config component render function reuses BlockRenderer and layout contract", () => {
      const headingPuckComponent = puckConfig.components["heading"];
      assert.ok(headingPuckComponent);
      const renderedHeading = renderToStaticMarkup(headingPuckComponent.render({ text: "Puck Heading", level: 1 }));
      assert.ok(renderedHeading.includes("<h1"));
      assert.ok(renderedHeading.includes("Puck Heading"));

      const columnsPuckComponent = puckConfig.components["columns"];
      assert.ok(columnsPuckComponent);
      const renderedColumns = renderToStaticMarkup(columnsPuckComponent.render({ layout: "1-2", gap: "lg" }));
      assert.ok(renderedColumns.includes("grid-cols-1 md:grid-cols-3"));
      assert.ok(renderedColumns.includes("gap-8"));
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
