/**
 * SYNTHESIS CMS — IMMUTABLE PUBLISHED NAVIGATION SNAPSHOT
 * Strongly-typed domain builder, parser, and security invariants.
 */

import {
  NavigationContext,
  NavigationItem,
  PublishedNavigationItem,
  PublishedNavigationSnapshot,
} from "./types";
import {
  isSafeUrl,
  sanitizeLabel,
  flattenAndCalculateDepths,
  MAX_NAVIGATION_DEPTH,
} from "./validation";

export interface BuildSnapshotOptions {
  availablePageIds?: Set<string> | string[];
}

export interface BuildSnapshotResult {
  success: boolean;
  snapshot?: PublishedNavigationSnapshot;
  errors: string[];
}

function checkVisibleDescendant(parentId: string, allItems: NavigationItem[]): boolean {
  const directChildren = allItems.filter(i => i.parentId === parentId);
  for (const child of directChildren) {
    if (child.visibility !== false) {
      return true;
    }
    if (checkVisibleDescendant(child.id, allItems)) {
      return true;
    }
  }
  return false;
}

/**
 * Builds an immutable, public-safe published snapshot from draft navigation items.
 * Validates the full tree, project page references, external URLs, hierarchy consistency,
 * and completely strips internal admin/database metadata.
 */
export function buildPublishedNavigationSnapshot(
  set: {
    key: string;
    name: string;
    context: NavigationContext;
    description?: string | null;
    items: NavigationItem[];
  },
  options?: BuildSnapshotOptions
): BuildSnapshotResult {
  const errors: string[] = [];

  if (!set.key || !set.key.trim()) {
    errors.push("Klíč navigační sady nesmí být prázdný.");
  }
  if (!set.name || !set.name.trim()) {
    errors.push("Název navigační sady nesmí být prázdný.");
  }

  const items = set.items || [];
  const idMap = new Map<string, NavigationItem>();
  const idSet = new Set<string>();

  // 1. Check duplicate IDs and populate item map
  for (const item of items) {
    if (idSet.has(item.id)) {
      errors.push("Duplicitní identifikátor položky: " + item.id);
    }
    idSet.add(item.id);
    idMap.set(item.id, item);
  }

  // 2. Cycle detection and max depth verification on complete tree
  const { hasCycle, cycleErrors } = flattenAndCalculateDepths(items);
  if (hasCycle) {
    errors.push(...cycleErrors);
  }

  // Check max depth explicitly
  for (const item of items) {
    let depth = 0;
    let currParentId = item.parentId;
    const visitedParents = new Set<string>();
    while (currParentId) {
      if (visitedParents.has(currParentId)) break; // cycle handled above
      visitedParents.add(currParentId);
      depth++;
      const parent = idMap.get(currParentId);
      currParentId = parent?.parentId || null;
    }
    if (depth > MAX_NAVIGATION_DEPTH) {
      errors.push("Položka „" + item.label + "“ překračuje maximální povolené zanoření (" + MAX_NAVIGATION_DEPTH + ").");
    }
  }

  // 3. Parent references must belong to same set
  for (const item of items) {
    if (item.parentId && !idMap.has(item.parentId)) {
      errors.push("Rodičovská položka " + item.parentId + " pro položku „" + item.label + "“ neexistuje v této sadě.");
    }
  }

  // 4. Validate availablePageIds set if provided
  let pageIdSet: Set<string> | null = null;
  if (options?.availablePageIds) {
    pageIdSet = options.availablePageIds instanceof Set
      ? options.availablePageIds
      : new Set(options.availablePageIds);
  }

  // 5. Item validation & integrity
  for (const item of items) {
    const cleanLabel = sanitizeLabel(item.label);
    if (!cleanLabel) {
      errors.push("Položka (" + item.id + ") musí mít neprázdný název.");
    }

    if (item.type === "PAGE") {
      if (!item.pageId || !item.pageId.trim()) {
        errors.push("Položka typu Stránka „" + item.label + "“ nemá vybranou cílovou stránku.");
      } else if (pageIdSet && !pageIdSet.has(item.pageId)) {
        errors.push("Položka „" + item.label + "“ odkazuje na neexistující nebo cizí stránku (" + item.pageId + ").");
      }
    } else if (item.type === "EXTERNAL_LINK") {
      if (!item.externalUrl || !item.externalUrl.trim()) {
        errors.push("Položka typu Externí odkaz „" + item.label + "“ nemá zadanou URL adresu.");
      } else {
        const urlCheck = isSafeUrl(item.externalUrl);
        if (!urlCheck.safe) {
          errors.push("Položka „" + item.label + "“: " + urlCheck.reason);
        }
      }
    } else if (item.type === "ANCHOR") {
      if (!item.anchor || !item.anchor.trim()) {
        errors.push("Položka typu Kotva „" + item.label + "“ nemá zadanou kotvu.");
      }
    } else if (item.type !== "GROUP") {
      errors.push("Neznámý typ položky: " + item.type);
    }
  }

  // 6. Invisible parent with visible child check (fail-closed policy)
  for (const item of items) {
    if (item.visibility === false) {
      const hasVisibleDescendants = checkVisibleDescendant(item.id, items);
      if (hasVisibleDescendants) {
        errors.push("Položka „" + item.label + "“ je skrytá, ale obsahuje viditelné podpoložky. Nelze publikovat nekonzistentní strom.");
      }
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      errors,
    };
  }

  // 7. Filter only visible items and construct deep immutable public snapshot
  const visibleItems = items.filter(i => i.visibility !== false);
  const sortedVisible = [...visibleItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const snapshotItems: PublishedNavigationItem[] = sortedVisible.map(item => ({
    id: String(item.id),
    parentId: item.parentId ? String(item.parentId) : null,
    type: item.type,
    label: sanitizeLabel(item.label),
    pageId: item.type === "PAGE" && item.pageId ? String(item.pageId) : null,
    externalUrl: item.type === "EXTERNAL_LINK" && item.externalUrl ? String(item.externalUrl).trim() : null,
    anchor: item.type === "ANCHOR" && item.anchor ? String(item.anchor).trim() : null,
    icon: item.icon ? String(item.icon).trim() : null,
    openInNewTab: Boolean(item.openInNewTab),
    order: Number(item.order ?? 0),
  }));

  const snapshot: PublishedNavigationSnapshot = {
    key: String(set.key).trim(),
    name: String(set.name).trim(),
    context: set.context,
    description: set.description ? String(set.description).trim() : null,
    items: snapshotItems,
  };

  return {
    success: true,
    snapshot,
    errors: [],
  };
}

/**
 * Parses and strictly validates a published navigation snapshot from raw DB JSON.
 * Fails closed (returns null) on any missing, malformed, cyclic, or insecure data.
 */
export function parsePublishedNavigationSnapshot(raw: unknown): PublishedNavigationSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, any>;

  if (typeof obj.key !== "string" || !obj.key.trim()) return null;
  if (typeof obj.name !== "string" || !obj.name.trim()) return null;
  if (typeof obj.context !== "string" || !["HEADER", "FOOTER", "MOBILE", "PORTAL", "CUSTOM"].includes(obj.context)) {
    return null;
  }
  if (!Array.isArray(obj.items)) return null;

  const validItems: PublishedNavigationItem[] = [];
  const itemIdSet = new Set<string>();
  const itemMap = new Map<string, any>();

  // Pass 1: validate basic fields and unique IDs
  for (const item of obj.items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    if (typeof item.id !== "string" || !item.id.trim()) return null;
    if (itemIdSet.has(item.id)) return null; // duplicate ID
    itemIdSet.add(item.id);

    if (typeof item.label !== "string") return null;
    const cleanLabel = sanitizeLabel(item.label);
    if (!cleanLabel) return null; // empty / unsafe label

    if (!["PAGE", "EXTERNAL_LINK", "ANCHOR", "GROUP"].includes(item.type)) return null;

    if (typeof item.order !== "number" || !Number.isFinite(item.order)) return null;

    // Type-specific field consistency
    if (item.type === "PAGE") {
      if (typeof item.pageId !== "string" || !item.pageId.trim()) return null;
      if (item.externalUrl !== null && item.externalUrl !== undefined) return null;
      if (item.anchor !== null && item.anchor !== undefined) return null;
    } else if (item.type === "EXTERNAL_LINK") {
      if (typeof item.externalUrl !== "string" || !item.externalUrl.trim()) return null;
      if (!isSafeUrl(item.externalUrl).safe) return null;
      if (item.pageId !== null && item.pageId !== undefined) return null;
      if (item.anchor !== null && item.anchor !== undefined) return null;
    } else if (item.type === "ANCHOR") {
      if (typeof item.anchor !== "string" || !item.anchor.trim()) return null;
      if (item.pageId !== null && item.pageId !== undefined) return null;
      if (item.externalUrl !== null && item.externalUrl !== undefined) return null;
    } else if (item.type === "GROUP") {
      if (item.pageId !== null && item.pageId !== undefined) return null;
      if (item.externalUrl !== null && item.externalUrl !== undefined) return null;
      if (item.anchor !== null && item.anchor !== undefined) return null;
    }

    if (item.parentId !== null && item.parentId !== undefined) {
      if (typeof item.parentId !== "string") return null;
      if (item.parentId === item.id) return null; // self-parent
    }

    itemMap.set(item.id, item);

    validItems.push({
      id: item.id,
      parentId: typeof item.parentId === "string" ? item.parentId : null,
      type: item.type,
      label: cleanLabel,
      pageId: typeof item.pageId === "string" ? item.pageId : null,
      externalUrl: typeof item.externalUrl === "string" ? item.externalUrl : null,
      anchor: typeof item.anchor === "string" ? item.anchor : null,
      icon: typeof item.icon === "string" ? item.icon : null,
      openInNewTab: Boolean(item.openInNewTab),
      order: item.order,
    });
  }

  // Pass 2: validate parent existence, cycles, and max depth
  for (const item of validItems) {
    if (item.parentId && !itemIdSet.has(item.parentId)) {
      return null; // parentId points outside snapshot
    }
  }

  // Check cycles and depth
  for (const item of validItems) {
    let depth = 0;
    let currParentId = item.parentId;
    const visited = new Set<string>([item.id]);

    while (currParentId) {
      if (visited.has(currParentId)) {
        return null; // cycle detected
      }
      visited.add(currParentId);
      depth++;
      if (depth > MAX_NAVIGATION_DEPTH) {
        return null; // depth exceeded
      }
      const parent = itemMap.get(currParentId);
      currParentId = parent && typeof parent.parentId === "string" ? parent.parentId : null;
    }
  }

  return {
    key: obj.key.trim(),
    name: obj.name.trim(),
    context: obj.context,
    description: typeof obj.description === "string" ? obj.description.trim() : null,
    items: validItems.sort((a, b) => a.order - b.order),
  };
}
