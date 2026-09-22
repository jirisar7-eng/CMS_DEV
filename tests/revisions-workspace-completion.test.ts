import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeRevisionDiff,
  canonicalizeValue,
  isDeepEqual,
  selectPreviousRevision,
} from "../components/admin/revisions/RevisionsWorkspace";

describe("Revisions Workspace Completion", () => {
  it("canonicalizes nested objects and compares values deterministically regardless of key order", () => {
    const objA = { z: "last", a: 1, m: { c: [1, 2], b: "hello" } };
    const objB = { a: 1, m: { b: "hello", c: [1, 2] }, z: "last" };

    assert.strictEqual(isDeepEqual(objA, objB), true);

    const canonicalA = canonicalizeValue(objA);
    const canonicalB = canonicalizeValue(objB);

    assert.strictEqual(JSON.stringify(canonicalA), JSON.stringify(canonicalB));
  });

  it("selects previous revision strictly from the same pageId", () => {
    const revs = [
      {
        id: "rev-p1-v1",
        pageId: "page-1",
        revisionNumber: 1,
        status: "PUBLISHED" as const,
        title: "P1 v1",
        slug: "p1",
        locale: "cs",
        description: null,
        visibility: "PUBLIC" as const,
        content: {},
        seo: {},
        navigation: {},
        createdById: "user-1",
        createdAt: "2026-01-01T00:00:00Z",
        publishedAt: "2026-01-01T00:00:00Z",
        derivedFromRevisionId: null,
      },
      {
        id: "rev-p2-v5",
        pageId: "page-2",
        revisionNumber: 5,
        status: "PUBLISHED" as const,
        title: "P2 v5",
        slug: "p2",
        locale: "cs",
        description: null,
        visibility: "PUBLIC" as const,
        content: {},
        seo: {},
        navigation: {},
        createdById: "user-1",
        createdAt: "2026-01-02T00:00:00Z",
        publishedAt: "2026-01-02T00:00:00Z",
        derivedFromRevisionId: null,
      },
      {
        id: "rev-p1-v2",
        pageId: "page-1",
        revisionNumber: 2,
        status: "DRAFT" as const,
        title: "P1 v2",
        slug: "p1-v2",
        locale: "cs",
        description: null,
        visibility: "PUBLIC" as const,
        content: {},
        seo: {},
        navigation: {},
        createdById: "user-1",
        createdAt: "2026-01-03T00:00:00Z",
        publishedAt: null,
        derivedFromRevisionId: "rev-p1-v1",
      },
    ];

    const selectedP1V2 = revs[2];
    const prev = selectPreviousRevision(selectedP1V2, revs);

    assert.notStrictEqual(prev, null);
    assert.strictEqual(prev?.id, "rev-p1-v1");
    assert.strictEqual(prev?.pageId, "page-1");

    const selectedP2V5 = revs[1];
    const prevP2 = selectPreviousRevision(selectedP2V5, revs);
    assert.strictEqual(prevP2, null);
  });

  it("computes comprehensive deterministic diffs including locale, description, visibility, SEO, and navigation", () => {
    const rev1 = {
      title: "Původní Název",
      slug: "puvodni-slug",
      locale: "cs",
      description: "Starý popis",
      visibility: "PUBLIC",
      seo: { metaTitle: "SEO Title A", keywords: ["a", "b"] },
      navigation: { inMenu: true, order: 1 },
      content: {
        blocks: [
          { id: "b1", type: "hero", data: { heading: "Ahoj", align: "center" } },
        ],
      },
      revisionNumber: 1,
    };

    const rev2 = {
      title: "Nový Název",
      slug: "novy-slug",
      locale: "en",
      description: "Nový popis",
      visibility: "UNLISTED",
      seo: { metaTitle: "SEO Title B", keywords: ["a", "b"] },
      navigation: { inMenu: false, order: 2 },
      content: {
        blocks: [
          { id: "b1", type: "hero", data: { align: "center", heading: "Ahoj" } }, // key order swapped
        ],
      },
      revisionNumber: 2,
    };

    const diff = computeRevisionDiff(rev2, rev1);

    assert.strictEqual(diff.titleChanged, true);
    assert.strictEqual(diff.slugChanged, true);
    assert.strictEqual(diff.localeChanged, true);
    assert.strictEqual(diff.descriptionChanged, true);
    assert.strictEqual(diff.visibilityChanged, true);
    assert.strictEqual(diff.seoChanged, true);
    assert.strictEqual(diff.navigationChanged, true);
    assert.strictEqual(diff.blockOrderChanged, false);

    const b1Diff = diff.blockDiffs.find((b) => b.id === "b1");
    assert.strictEqual(b1Diff?.status, "UNCHANGED"); // object key order difference in data ignored
  });

  it("detects block additions, removals, content changes, and block reordering deterministically", () => {
    const rev1 = {
      title: "Stránka",
      slug: "stranka",
      content: {
        blocks: [
          { id: "b1", type: "header", data: { text: "Header" } },
          { id: "b2", type: "text", data: { body: "Text 1" } },
          { id: "b3", type: "footer", data: { copyright: "2026" } },
        ],
      },
      revisionNumber: 1,
    };

    // Reorder b1 and b2, modify b2 content, remove b3, add b4
    const rev2 = {
      title: "Stránka",
      slug: "stranka",
      content: {
        blocks: [
          { id: "b2", type: "text", data: { body: "Text 1 Změněno" } },
          { id: "b1", type: "header", data: { text: "Header" } },
          { id: "b4", type: "cta", data: { label: "Klikni" } },
        ],
      },
      revisionNumber: 2,
    };

    const diff = computeRevisionDiff(rev2, rev1);

    assert.strictEqual(diff.hasChanges, true);

    const b1Diff = diff.blockDiffs.find((b) => b.id === "b1");
    const b2Diff = diff.blockDiffs.find((b) => b.id === "b2");
    const b3Diff = diff.blockDiffs.find((b) => b.id === "b3");
    const b4Diff = diff.blockDiffs.find((b) => b.id === "b4");

    assert.strictEqual(b1Diff?.status, "MODIFIED"); // reordered
    assert.strictEqual(b2Diff?.status, "MODIFIED"); // data changed
    assert.strictEqual(b3Diff?.status, "REMOVED");
    assert.strictEqual(b4Diff?.status, "ADDED");
  });
});
