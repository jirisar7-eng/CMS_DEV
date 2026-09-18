import {
  SearchIndexDocument,
  SEARCH_INDEX_VERSION,
  SearchError,
  PageWithPublishedRevision,
} from './types';
import { extractCanonicalText } from './extractor';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const require: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const process: any;

export interface GenerateDocumentsOptions {
  includeUnlisted?: boolean;
  routingService?: {
    derivePublishedRoutesFromPages(
      projectId: string,
      pages: PageWithPublishedRevision[]
    ): {
      resolvableRoutes: Map<string, { path: string }>;
    };
  };
}

/**
 * Normalizes a URL path to ensure leading slash and no trailing slash (unless root '/').
 */
function normalizePath(p: string): string {
  if (!p || p === '/') return '/';
  let clean = p.trim();
  if (!clean.startsWith('/')) clean = '/' + clean;
  clean = clean.replace(/\/+/g, '/');
  if (clean.length > 1 && clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }
  return clean;
}

const RESERVED_PREFIXES = ['/admin', '/api', '/_next'];

function isReservedPath(p: string): boolean {
  const norm = normalizePath(p).toLowerCase();
  for (const prefix of RESERVED_PREFIXES) {
    if (norm === prefix || norm.startsWith(prefix + '/')) {
      return true;
    }
  }
  return false;
}

/**
 * Fallback routing derivation in pure memory when RoutingService or database is not loaded.
 */
function deriveCanonicalPathsFallback(
  projectId: string,
  pages: PageWithPublishedRevision[]
): Map<string, string> {
  const pagesById = new Map<string, PageWithPublishedRevision>();
  for (const p of pages) {
    pagesById.set(p.id, p);
  }

  const pathToPageIds = new Map<string, string[]>();
  const pageIdToPath = new Map<string, string>();

  function computePath(pageId: string, visited: Set<string>, depth: number): string | null {
    if (depth > 32) return null; // Hierarchy depth limit
    if (visited.has(pageId)) return null; // Cycle detected
    visited.add(pageId);

    const page = pagesById.get(pageId);
    if (!page || !page.publishedRevision || page.projectId !== projectId) {
      return null;
    }

    const slug = page.publishedRevision.slug.trim().replace(/^\/+|\/+$/g, '');

    if (!page.parentId) {
      return slug === '' ? '/' : `/${slug}`;
    }

    const parent = pagesById.get(page.parentId);
    if (!parent || !parent.publishedRevision || parent.projectId !== projectId) {
      return null;
    }

    // Ancestor must be public
    if (parent.publishedRevision.visibility !== 'PUBLIC') {
      return null;
    }

    const parentPath = computePath(parent.id, new Set(visited), depth + 1);
    if (!parentPath) return null;

    return parentPath === '/' ? `/${slug}` : `${parentPath}/${slug}`;
  }

  for (const page of pages) {
    if (!page.publishedRevisionId || !page.publishedRevision) continue;
    if (page.publishedRevision.status !== 'PUBLISHED') continue;
    if (page.publishedRevision.visibility !== 'PUBLIC') continue;

    const path = computePath(page.id, new Set(), 0);
    if (!path) continue;

    const normalized = normalizePath(path);
    if (isReservedPath(normalized)) continue;

    const existing = pathToPageIds.get(normalized) || [];
    existing.push(page.id);
    pathToPageIds.set(normalized, existing);
    pageIdToPath.set(page.id, normalized);
  }

  // Fail closed on duplicate published paths
  const resolvable = new Map<string, string>();
  for (const [pageId, path] of pageIdToPath.entries()) {
    const pagesForPath = pathToPageIds.get(path) || [];
    if (pagesForPath.length === 1) {
      resolvable.set(pageId, path);
    }
  }

  return resolvable;
}

/**
 * Attempts to resolve published routes using canonical RoutingService if available,
 * falling back to internal canonical derivation.
 */
function resolvePublishedPaths(
  projectId: string,
  pages: PageWithPublishedRevision[],
  options?: GenerateDocumentsOptions
): Map<string, string> {
  // 1. Explicit routing service in options
  if (options?.routingService) {
    try {
      const result = options.routingService.derivePublishedRoutesFromPages(projectId, pages);
      const map = new Map<string, string>();
      for (const [pageId, route] of result.resolvableRoutes.entries()) {
        map.set(pageId, route.path);
      }
      return map;
    } catch {
      // fallback
    }
  }

  // 2. Try loading RoutingService dynamically
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const routingModule = require('@/lib/domain/routing/service');
    if (routingModule?.RoutingService?.derivePublishedRoutesFromPages) {
      const result = routingModule.RoutingService.derivePublishedRoutesFromPages(projectId, pages);
      const map = new Map<string, string>();
      for (const [pageId, route] of result.resolvableRoutes.entries()) {
        map.set(pageId, route.path);
      }
      return map;
    }
  } catch {
    // RoutingService or database client not available in current process
  }

  // 3. Fallback deterministic path calculation
  return deriveCanonicalPathsFallback(projectId, pages);
}

/**
 * Checks if a revision has SEO noIndex set.
 */
function isNoIndex(seo: unknown): boolean {
  if (process.env.FORCE_NOINDEX === 'true') {
    return true;
  }
  if (!seo || typeof seo !== 'object') {
    return false;
  }
  const s = seo as Record<string, unknown>;
  return s.noIndex === true || s.noindex === true;
}

/**
 * Generates derived SearchIndexDocument entries from published CMS content only.
 *
 * Rules:
 * - Page.publishedRevisionId is authority.
 * - Only publicly searchable published content is included.
 * - INTERNAL, PASSWORD_PROTECTED, and UNLISTED (by default) are excluded.
 * - SEO noIndex content is excluded.
 * - Uses canonical RoutingService-derived paths where possible.
 * - Indexes title, description, and allowlisted body text only.
 * - Search index remains derived/rebuildable and never becomes source of truth.
 */
export function generateSearchDocumentsFromPages(
  projectId: string,
  pages: PageWithPublishedRevision[],
  options?: GenerateDocumentsOptions
): SearchIndexDocument[] {
  if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
    throw new SearchError('INVALID_PROJECT_ID', 'Project ID is required');
  }

  const cleanProjectId = projectId.trim();
  const includeUnlisted = options?.includeUnlisted ?? false;

  // Resolve canonical routing paths
  const resolvablePaths = resolvePublishedPaths(cleanProjectId, pages, options);

  const documents: SearchIndexDocument[] = [];

  for (const page of pages) {
    // Check project boundary
    if (page.projectId !== cleanProjectId) {
      continue;
    }

    // Page.publishedRevisionId is authority
    if (!page.publishedRevisionId) {
      continue;
    }

    const revision = page.publishedRevision;
    if (!revision) {
      continue;
    }

    // Pointer integrity check
    if (page.publishedRevisionId !== revision.id) {
      continue;
    }

    // Revision must be published
    if (revision.status !== 'PUBLISHED') {
      continue;
    }

    // Visibility filtering
    const visibility = revision.visibility;
    if (visibility === 'INTERNAL' || visibility === 'PASSWORD_PROTECTED') {
      continue;
    }
    if (visibility === 'UNLISTED' && !includeUnlisted) {
      continue;
    }
    if (visibility !== 'PUBLIC' && !includeUnlisted) {
      continue;
    }

    // SEO noIndex check
    if (isNoIndex(revision.seo)) {
      continue;
    }

    // Path resolution check: must have a valid canonical public path
    const path = resolvablePaths.get(page.id);
    if (!path) {
      // Path cannot be resolved publicly (e.g. parent unpublished, cycle, duplicate)
      continue;
    }

    // Extract allowlisted text
    const bodyText = extractCanonicalText(revision.content);

    // Resolve description (revision description or SEO metaDescription)
    let description = revision.description;
    if (!description && revision.seo && typeof revision.seo === 'object') {
      const seoDesc = (revision.seo as Record<string, unknown>).metaDescription;
      if (typeof seoDesc === 'string' && seoDesc.trim().length > 0) {
        description = seoDesc.trim();
      }
    }

    documents.push({
      projectId: cleanProjectId,
      pageId: page.id,
      revisionId: revision.id,
      path,
      title: revision.title.trim(),
      description: description ? description.trim() : null,
      locale: revision.locale || 'cs',
      bodyText,
      indexVersion: SEARCH_INDEX_VERSION,
    });
  }

  return documents;
}
