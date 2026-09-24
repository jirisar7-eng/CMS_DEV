/**
 * SYNTHESIS CMS — NAVIGATION LIFECYCLE DETERMINISTIC TESTS
 * Tests for immutable published snapshots, validation gates, security invariants,
 * metadata stripping, and tree consistency.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  buildPublishedNavigationSnapshot,
  parsePublishedNavigationSnapshot,
} from "../lib/domain/navigation/snapshot";
import {
  NavigationItem,
  NavigationSet,
  PublishedNavigationSnapshot,
} from "../lib/domain/navigation/types";

describe("SYN-NAV-002 Phase B: Navigation Lifecycle & Snapshot Hardening", () => {
  const baseItems: NavigationItem[] = [
    {
      id: "item-1",
      parentId: null,
      type: "PAGE",
      label: "Domů",
      pageId: "page-home",
      visibility: true,
      openInNewTab: false,
      order: 1,
    },
    {
      id: "item-2",
      parentId: null,
      type: "PAGE",
      label: "O nás",
      pageId: "page-about",
      visibility: true,
      openInNewTab: false,
      order: 2,
    },
    {
      id: "item-3",
      parentId: "item-2",
      type: "EXTERNAL_LINK",
      label: "Partner",
      externalUrl: "https://partner.example.com",
      visibility: true,
      openInNewTab: true,
      order: 1,
    },
  ];

  it("1. builds valid published snapshot with sanitized public data", () => {
    const res = buildPublishedNavigationSnapshot(
      {
        key: "main-menu",
        name: "Hlavní menu",
        context: "HEADER",
        description: "Primární navigace",
        items: baseItems,
      },
      { availablePageIds: new Set(["page-home", "page-about"]) }
    );

    assert.strictEqual(res.success, true);
    assert.ok(res.snapshot);
    assert.strictEqual(res.snapshot.key, "main-menu");
    assert.strictEqual(res.snapshot.name, "Hlavní menu");
    assert.strictEqual(res.snapshot.context, "HEADER");
    assert.strictEqual(res.snapshot.description, "Primární navigace");
    assert.strictEqual(res.snapshot.items.length, 3);

    // Verify metadata stripping: zero admin fields in snapshot
    const rawSnapshot = res.snapshot as any;
    assert.strictEqual(rawSnapshot.projectId, undefined);
    assert.strictEqual(rawSnapshot.status, undefined);
    assert.strictEqual(rawSnapshot.version, undefined);
    assert.strictEqual(rawSnapshot.createdAt, undefined);
    assert.strictEqual(rawSnapshot.updatedAt, undefined);
    assert.strictEqual(rawSnapshot.publishedVersion, undefined);
  });

  it("2. excludes invisible items from the published snapshot", () => {
    const itemsWithHidden: NavigationItem[] = [
      ...baseItems,
      {
        id: "item-hidden",
        parentId: null,
        type: "EXTERNAL_LINK",
        label: "Skrytý odkaz",
        externalUrl: "https://hidden.example.com",
        visibility: false,
        openInNewTab: false,
        order: 3,
      },
    ];

    const res = buildPublishedNavigationSnapshot(
      {
        key: "main-menu",
        name: "Hlavní menu",
        context: "HEADER",
        items: itemsWithHidden,
      },
      { availablePageIds: new Set(["page-home", "page-about"]) }
    );

    assert.strictEqual(res.success, true);
    assert.ok(res.snapshot);
    assert.strictEqual(res.snapshot.items.length, 3);
    assert.strictEqual(res.snapshot.items.some(i => i.id === "item-hidden"), false);
  });

  it("3. fails closed when an invisible parent contains visible children", () => {
    const inconsistentTree: NavigationItem[] = [
      {
        id: "parent-hidden",
        parentId: null,
        type: "GROUP",
        label: "Skupina (skrytá)",
        visibility: false,
        openInNewTab: false,
        order: 1,
      },
      {
        id: "child-visible",
        parentId: "parent-hidden",
        type: "PAGE",
        label: "Viditelné dítě",
        pageId: "page-home",
        visibility: true,
        openInNewTab: false,
        order: 1,
      },
    ];

    const res = buildPublishedNavigationSnapshot(
      {
        key: "inconsistent-menu",
        name: "Nekonzistentní",
        context: "HEADER",
        items: inconsistentTree,
      },
      { availablePageIds: new Set(["page-home"]) }
    );

    assert.strictEqual(res.success, false);
    assert.ok(res.errors.some(e => e.includes("skrytá, ale obsahuje viditelné podpoložky")));
  });

  it("4. rejects PAGE reference not in the available project pages set", () => {
    const crossProjectItems: NavigationItem[] = [
      {
        id: "item-cross",
        parentId: null,
        type: "PAGE",
        label: "Cizí stránka",
        pageId: "page-other-project",
        visibility: true,
        openInNewTab: false,
        order: 1,
      },
    ];

    const res = buildPublishedNavigationSnapshot(
      {
        key: "menu",
        name: "Menu",
        context: "HEADER",
        items: crossProjectItems,
      },
      { availablePageIds: new Set(["page-home", "page-about"]) }
    );

    assert.strictEqual(res.success, false);
    assert.ok(res.errors.some(e => e.includes("neexistující nebo cizí stránku")));
  });

  it("5. rejects PAGE item with empty or missing pageId", () => {
    const invalidPageItem: NavigationItem[] = [
      {
        id: "item-nopage",
        parentId: null,
        type: "PAGE",
        label: "Bez stránky",
        pageId: "",
        visibility: true,
        openInNewTab: false,
        order: 1,
      },
    ];

    const res = buildPublishedNavigationSnapshot({
      key: "menu",
      name: "Menu",
      context: "HEADER",
      items: invalidPageItem,
    });

    assert.strictEqual(res.success, false);
    assert.ok(res.errors.some(e => e.includes("nemá vybranou cílovou stránku")));
  });

  it("6. rejects unsafe external URL schemes (javascript:, data:, vbscript:)", () => {
    const dangerousSchemes = [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "blob:https://example.com/uuid",
    ];

    for (const badUrl of dangerousSchemes) {
      const res = buildPublishedNavigationSnapshot({
        key: "menu",
        name: "Menu",
        context: "HEADER",
        items: [
          {
            id: "item-bad",
            parentId: null,
            type: "EXTERNAL_LINK",
            label: "Nebezpečný odkaz",
            externalUrl: badUrl,
            visibility: true,
            openInNewTab: true,
            order: 1,
          },
        ],
      });

      assert.strictEqual(res.success, false, "Should reject dangerous URL: " + badUrl);
      assert.ok(res.errors.length > 0);
    }
  });

  it("7. rejects cycles in the navigation tree", () => {
    const cyclicItems: NavigationItem[] = [
      {
        id: "item-a",
        parentId: "item-b",
        type: "GROUP",
        label: "A",
        visibility: true,
        openInNewTab: false,
        order: 1,
      },
      {
        id: "item-b",
        parentId: "item-a",
        type: "GROUP",
        label: "B",
        visibility: true,
        openInNewTab: false,
        order: 1,
      },
    ];

    const res = buildPublishedNavigationSnapshot({
      key: "cyclic-menu",
      name: "Cyklus",
      context: "HEADER",
      items: cyclicItems,
    });

    assert.strictEqual(res.success, false);
    assert.ok(res.errors.some(e => e.includes("cyklus ve stromu navigace")));
  });

  it("8. rejects items exceeding maximum navigation depth", () => {
    // 0 -> 1 -> 2 -> 3 -> 4 (exceeds MAX_NAVIGATION_DEPTH = 3)
    const deepItems: NavigationItem[] = [
      { id: "d0", parentId: null, type: "GROUP", label: "Level 0", visibility: true, openInNewTab: false, order: 1 },
      { id: "d1", parentId: "d0", type: "GROUP", label: "Level 1", visibility: true, openInNewTab: false, order: 1 },
      { id: "d2", parentId: "d1", type: "GROUP", label: "Level 2", visibility: true, openInNewTab: false, order: 1 },
      { id: "d3", parentId: "d2", type: "GROUP", label: "Level 3", visibility: true, openInNewTab: false, order: 1 },
      { id: "d4", parentId: "d3", type: "PAGE", label: "Level 4 (too deep)", pageId: "p1", visibility: true, openInNewTab: false, order: 1 },
    ];

    const res = buildPublishedNavigationSnapshot(
      {
        key: "deep-menu",
        name: "Hluboké menu",
        context: "HEADER",
        items: deepItems,
      },
      { availablePageIds: new Set(["p1"]) }
    );

    assert.strictEqual(res.success, false);
    assert.ok(res.errors.some(e => e.includes("překračuje maximální povolené zanoření")));
  });

  it("9. hardened parsePublishedNavigationSnapshot rejects malformed or invalid inputs fail-closed", () => {
    const validSnapshot = {
      key: "header-main",
      name: "Hlavní",
      context: "HEADER",
      description: "Popis",
      items: [
        {
          id: "it-1",
          parentId: null,
          type: "PAGE",
          label: "Domů",
          pageId: "page-1",
          externalUrl: null,
          anchor: null,
          icon: null,
          openInNewTab: false,
          order: 1,
        },
      ],
    };

    const parsed = parsePublishedNavigationSnapshot(validSnapshot);
    assert.ok(parsed);
    assert.strictEqual(parsed.key, "header-main");
    assert.strictEqual(parsed.items.length, 1);

    // Rejections:
    assert.strictEqual(parsePublishedNavigationSnapshot(null), null);
    assert.strictEqual(parsePublishedNavigationSnapshot(undefined), null);
    assert.strictEqual(parsePublishedNavigationSnapshot("string"), null);
    assert.strictEqual(parsePublishedNavigationSnapshot({ key: "", name: "test" }), null);
    assert.strictEqual(parsePublishedNavigationSnapshot({ ...validSnapshot, context: "INVALID" }), null);
    assert.strictEqual(parsePublishedNavigationSnapshot({ ...validSnapshot, items: [{ type: "UNKNOWN" }] }), null);

    // Malformed: empty label
    assert.strictEqual(parsePublishedNavigationSnapshot({
      ...validSnapshot,
      items: [{ id: "it-1", parentId: null, type: "PAGE", label: "", pageId: "p1", order: 1 }]
    }), null);

    // Malformed: self-parent
    assert.strictEqual(parsePublishedNavigationSnapshot({
      ...validSnapshot,
      items: [{ id: "it-1", parentId: "it-1", type: "PAGE", label: "P", pageId: "p1", order: 1 }]
    }), null);

    // Malformed: parent points outside snapshot
    assert.strictEqual(parsePublishedNavigationSnapshot({
      ...validSnapshot,
      items: [{ id: "it-1", parentId: "nonexistent", type: "PAGE", label: "P", pageId: "p1", order: 1 }]
    }), null);

    // Malformed: cycle in snapshot
    assert.strictEqual(parsePublishedNavigationSnapshot({
      ...validSnapshot,
      items: [
        { id: "a", parentId: "b", type: "GROUP", label: "A", order: 1 },
        { id: "b", parentId: "a", type: "GROUP", label: "B", order: 2 },
      ]
    }), null);

    // Malformed: depth exceeded in snapshot
    assert.strictEqual(parsePublishedNavigationSnapshot({
      ...validSnapshot,
      items: [
        { id: "0", parentId: null, type: "GROUP", label: "0", order: 1 },
        { id: "1", parentId: "0", type: "GROUP", label: "1", order: 1 },
        { id: "2", parentId: "1", type: "GROUP", label: "2", order: 1 },
        { id: "3", parentId: "2", type: "GROUP", label: "3", order: 1 },
        { id: "4", parentId: "3", type: "PAGE", label: "4", pageId: "p", order: 1 },
      ]
    }), null);

    // Malformed: dangerous url in snapshot
    assert.strictEqual(parsePublishedNavigationSnapshot({
      ...validSnapshot,
      items: [{ id: "x", parentId: null, label: "x", type: "EXTERNAL_LINK", externalUrl: "javascript:evil()", order: 1 }]
    }), null);
  });

  it("10. mutating draft items array after snapshot creation does not mutate snapshot", () => {
    const itemsCopy = JSON.parse(JSON.stringify(baseItems));
    const res = buildPublishedNavigationSnapshot({
      key: "main",
      name: "Main",
      context: "HEADER",
      items: itemsCopy,
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.snapshot);

    // Mutate source draft items
    itemsCopy[0].label = "Změněný název v draftu";
    itemsCopy.push({
      id: "new-item",
      parentId: null,
      type: "GROUP",
      label: "Novinka",
      visibility: true,
      openInNewTab: false,
      order: 4,
    });

    assert.strictEqual(res.snapshot.items.length, 3);
    assert.strictEqual(res.snapshot.items[0].label, "Domů");
  });

  it("11. verifies publishedVersion <= version contract and unpublished changes detection", () => {
    const navSet: NavigationSet = {
      id: "set-1",
      projectId: "proj-1",
      key: "header",
      name: "Header",
      context: "HEADER",
      status: "PUBLISHED",
      version: 5,
      publishedVersion: 5,
      publishedAt: "2026-09-24T18:00:00.000Z",
      updatedAt: "2026-09-24T18:00:00.000Z",
      items: baseItems,
    };

    // When version === publishedVersion, no unpublished changes
    const hasUnpublishedChanges = (navSet.publishedVersion ?? 0) < navSet.version;
    assert.strictEqual(hasUnpublishedChanges, false);

    // When version incremented on draft edit
    navSet.version = 6;
    const hasUnpublishedChangesAfterEdit = (navSet.publishedVersion ?? 0) < navSet.version;
    assert.strictEqual(hasUnpublishedChangesAfterEdit, true);
    assert.ok((navSet.publishedVersion ?? 0) <= navSet.version);
  });
});
