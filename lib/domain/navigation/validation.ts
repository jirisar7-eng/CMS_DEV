/**
 * SYNTHESIS CMS — NAVIGATION SECURITY & TREE VALIDATION
 * Pure functions for URL sanitization, label safety, cyclic tree prevention, and max nesting guards.
 */

import { NavigationItem, NavigationValidationResult } from './types';

export const MAX_NAVIGATION_DEPTH = 3; // 0 = root, 1 = sub, 2 = sub-sub, 3 = max

/**
 * Validates whether an external or internal URL uses a safe protocol.
 * Forbids javascript:, data:, vbscript:, and relative script vectors.
 */
export function isSafeUrl(url: string | null | undefined): { safe: boolean; reason?: string } {
  if (!url || typeof url !== 'string') {
    return { safe: true };
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return { safe: true };
  }

  // Check for dangerous protocols (case-insensitive, handling encoded spaces/control characters)
  const normalized = trimmed.toLowerCase().replace(/[\x00-\x1F\x7F\s]+/g, '');

  if (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('file:') ||
    normalized.startsWith('blob:')
  ) {
    return {
      safe: false,
      reason: 'Protokoly javascript:, data:, vbscript: a lokální souborová schémata jsou z bezpečnostních důvodů zakázána.',
    };
  }

  // Safe schemes
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('#')
  ) {
    return { safe: true };
  }

  // Default warning if no recognized scheme is present
  return {
    safe: false,
    reason: 'URL musí začínat https://, http://, mailto:, tel:, lomítkem (/) nebo mřížkou (#).',
  };
}

/**
 * Sanitizes navigation label by stripping HTML tags and trimming.
 */
export function sanitizeLabel(label: string | null | undefined): string {
  if (!label || typeof label !== 'string') return '';
  // Strip HTML tags and normalize whitespace
  const stripped = label.replace(/<[^>]*>?/gm, '').trim();
  return stripped;
}

/**
 * Builds a flat list with calculated depth and detects cycles.
 */
export function flattenAndCalculateDepths(
  items: NavigationItem[],
  maxDepth = MAX_NAVIGATION_DEPTH
): { flatItems: NavigationItem[]; hasCycle: boolean; cycleErrors: string[] } {
  const itemMap = new Map<string, NavigationItem>();
  const childrenMap = new Map<string | null, NavigationItem[]>();
  const cycleErrors: string[] = [];

  // Sort by order initially
  const sorted = [...items].sort((a, b) => a.order - b.order);

  sorted.forEach((item) => {
    itemMap.set(item.id, { ...item });
    const pId = item.parentId || null;
    if (!childrenMap.has(pId)) {
      childrenMap.set(pId, []);
    }
    childrenMap.get(pId)!.push(item);
  });

  const result: NavigationItem[] = [];
  const visited = new Set<string>();

  function traverse(parentId: string | null, depth: number, path: string[]) {
    const children = childrenMap.get(parentId) || [];
    for (const child of children) {
      if (path.includes(child.id)) {
        cycleErrors.push(`Detekován cyklus ve stromu navigace u položky ${child.id} (${child.label}).`);
        continue;
      }
      if (visited.has(child.id)) {
        continue;
      }

      visited.add(child.id);
      const effectiveDepth = Math.min(depth, maxDepth);
      result.push({
        ...child,
        depth: effectiveDepth,
      });

      traverse(child.id, effectiveDepth + 1, [...path, child.id]);
    }
  }

  traverse(null, 0, []);

  // Detect any disconnected cycles where no item in the loop has parentId === null
  for (const item of sorted) {
    if (!visited.has(item.id) && item.parentId !== null) {
      const trace = [item.id];
      let curr = item.parentId;
      while (curr) {
        if (trace.includes(curr)) {
          cycleErrors.push(`Detekován cyklus ve stromu navigace u položky ${item.id} (${item.label}).`);
          break;
        }
        trace.push(curr);
        const parentItem = itemMap.get(curr);
        curr = parentItem?.parentId || null;
      }
    }
  }

  // Catch any disconnected/orphaned items
  sorted.forEach((item) => {
    if (!visited.has(item.id)) {
      result.push({
        ...item,
        depth: 0,
        parentId: null,
      });
    }
  });

  return {
    flatItems: result,
    hasCycle: cycleErrors.length > 0,
    cycleErrors,
  };
}

/**
 * Validates an entire navigation item tree for integrity, security, and structure.
 */
export function validateNavigationTree(items: NavigationItem[]): NavigationValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const idSet = new Set<string>();

  const { hasCycle, cycleErrors } = flattenAndCalculateDepths(items);
  if (hasCycle) {
    errors.push(...cycleErrors);
  }

  items.forEach((item) => {
    // 1. Duplicate ID check
    if (idSet.has(item.id)) {
      errors.push(`Duplicitní identifikátor položky: ${item.id}`);
    }
    idSet.add(item.id);

    // 2. Empty label check
    if (!item.label || sanitizeLabel(item.label).length === 0) {
      errors.push(`Položka (${item.id}) musí mít neprázdný název.`);
    }

    // 3. Type-specific validation
    if (item.type === 'EXTERNAL_LINK') {
      const urlCheck = isSafeUrl(item.externalUrl);
      if (!urlCheck.safe) {
        errors.push(`Položka „${item.label}“: ${urlCheck.reason}`);
      }
    } else if (item.type === 'PAGE') {
      if (!item.pageId) {
        errors.push(`Položka typu Stránka „${item.label}“ nemá vybranou cílovou stránku.`);
      }
    } else if (item.type === 'ANCHOR') {
      if (!item.anchor || !item.anchor.startsWith('#')) {
        warnings.push(`Položka typu Kotva „${item.label}“ by měla začínat znakem # (např. #kontakt).`);
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export interface PublicNavigationItem {
  id: string;
  parentId: string | null;
  type: string;
  label: string;
  pageId: string | null;
  externalUrl: string | null;
  anchor: string | null;
  icon: string | null;
  openInNewTab: boolean;
  order: number;
}

export interface PublicNavigationSet {
  key: string;
  name: string;
  context: string;
  description?: string;
  items: PublicNavigationItem[];
}

/**
 * Transforms raw DB navigation sets into public format:
 * - only PUBLISHED sets
 * - only visible items
 * - NO admin metadata (no projectId, status, version, createdAt, updatedAt, audit fields)
 */
export function formatPublicNavigation(navSets: any[]): PublicNavigationSet[] {
  return navSets
    .filter(set => set.status === 'PUBLISHED')
    .map(set => ({
      key: set.key,
      name: set.name,
      context: set.context,
      ...(set.description ? { description: set.description } : {}),
      items: (set.items || [])
        .filter((item: any) => item.visibility !== false)
        .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
        .map((item: any) => ({
          id: item.id,
          parentId: item.parentId ?? null,
          type: item.type,
          label: item.label,
          pageId: item.pageId ?? null,
          externalUrl: item.externalUrl ?? null,
          anchor: item.anchor ?? null,
          icon: item.icon ?? null,
          openInNewTab: item.openInNewTab ?? false,
          order: item.order ?? 0,
        })),
    }));
}
