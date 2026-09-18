import { prisma } from '@/lib/db';
import { RedirectService } from '@/lib/domain/redirects/service';
import { SeoService } from '@/lib/domain/seo/service';
import { validatePageContent } from '@/lib/domain/content/validation';
import type { PageSEO, PageNavigationSettings } from '@/lib/domain/pages';

export type RoutingErrorCode =
  | 'INVALID_PROJECT_ID'
  | 'INVALID_PATH'
  | 'RESERVED_ROUTE'
  | 'PAGE_NOT_FOUND'
  | 'PAGE_NOT_PUBLISHED'
  | 'POINTER_INTEGRITY_VIOLATION'
  | 'PARENT_NOT_FOUND'
  | 'PARENT_NOT_PUBLISHED'
  | 'CROSS_PROJECT_PARENT'
  | 'HIERARCHY_CYCLE_DETECTED'
  | 'HIERARCHY_DEPTH_EXCEEDED'
  | 'DUPLICATE_PUBLISHED_PATH'
  | 'ROUTE_NOT_PUBLIC';

export class RoutingError extends Error {
  readonly code: RoutingErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: RoutingErrorCode, message: string, details?: Record<string, unknown>) {
    super(`[${code}] ${message}`);
    this.name = 'RoutingError';
    this.code = code;
    this.details = details;
  }
}

export type PageVisibility = 'PUBLIC' | 'UNLISTED' | 'PASSWORD_PROTECTED' | 'INTERNAL';
export type PageRevisionStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED';

export interface PublishedRevisionData {
  id: string;
  pageId: string;
  revisionNumber: number;
  status: PageRevisionStatus | string;
  title: string;
  slug: string;
  locale: string;
  description: string | null;
  visibility: PageVisibility | string;
  content: unknown;
  seo: unknown;
  navigation: unknown;
  schemaVersion: string;
  lockVersion?: number;
  createdById?: string | null;
  createdAt?: Date;
  submittedAt?: Date | null;
  approvedAt?: Date | null;
  publishedAt?: Date | null;
}

export interface PageWithPublishedRevision {
  id: string;
  projectId: string;
  key: string;
  parentId: string | null;
  sortOrder: number;
  draftRevisionId?: string | null;
  publishedRevisionId: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  publishedRevision?: PublishedRevisionData | null;
}

export interface DerivedPublishedRoute {
  pageId: string;
  projectId: string;
  path: string;
  slug: string;
  parentId: string | null;
  visibility: PageVisibility;
  publishedRevisionId: string;
  revisionNumber: number;
  title: string;
  locale: string;
  publishedAt: Date | null;
}

export interface PublishedRouteResolution {
  pageId: string;
  projectId: string;
  path: string;
  slug: string;
  title: string;
  locale: string;
  visibility: PageVisibility;
  publishedRevisionId: string;
  publishedAt: Date | null;
  content: unknown;
  seo: PageSEO;
  navigation?: PageNavigationSettings;
  schemaVersion: string;
  updatedAt?: Date;
  page: {
    id: string;
    key: string;
    parentId: string | null;
    sortOrder: number;
  };
  revision: {
    id: string;
    revisionNumber: number;
    title: string;
    slug: string;
    locale: string;
    description: string | null;
    visibility: PageVisibility;
    publishedAt: Date | null;
  };
}

export interface DeriveRoutesOptions {
  strict?: boolean;
}

export class RoutingService {
  public static readonly RESERVED_ROUTES = ['/admin', '/api', '/_next'] as const;
  public static readonly MAX_HIERARCHY_DEPTH = 32;

  /**
   * Normalizes URL paths using the canonical RedirectService path rules.
   */
  static normalizePath(rawPath: string): string {
    return RedirectService.normalizePath(rawPath);
  }

  /**
   * Checks if a normalized path matches any reserved system route (/admin, /api, /_next).
   */
  static isReserved(normalizedPath: string): boolean {
    const pathOnly = normalizedPath.split(/[?#]/)[0];
    return this.RESERVED_ROUTES.some(r => pathOnly === r || pathOnly.startsWith(r + '/'));
  }

  /**
   * PUBLIC and UNLISTED pages may resolve publicly.
   * INTERNAL and PASSWORD_PROTECTED must not resolve publicly.
   */
  static isPubliclyResolvableVisibility(visibility: string): boolean {
    return visibility === 'PUBLIC' || visibility === 'UNLISTED';
  }

  /**
   * Cleans leading and trailing slashes from a slug segment.
   */
  private static cleanSlugSegment(slug: string): string {
    if (typeof slug !== 'string') return '';
    return slug.trim().replace(/^\/+|\/+$/g, '');
  }

  /**
   * Validates published pointer integrity:
   * - publishedRevision.id must equal publishedRevisionId
   * - publishedRevision.pageId must equal Page.id
   * - revision status must be PUBLISHED
   */
  static validatePointerIntegrity(page: PageWithPublishedRevision): void {
    if (!page.publishedRevisionId) {
      throw new RoutingError(
        'PAGE_NOT_PUBLISHED',
        `Page ${page.id} does not have a publishedRevisionId`
      );
    }

    if (!page.publishedRevision) {
      throw new RoutingError(
        'POINTER_INTEGRITY_VIOLATION',
        `Page ${page.id} references non-existent publishedRevision ${page.publishedRevisionId}`
      );
    }

    if (page.publishedRevision.id !== page.publishedRevisionId) {
      throw new RoutingError(
        'POINTER_INTEGRITY_VIOLATION',
        `Pointer integrity violation: Page ${page.id} publishedRevisionId (${page.publishedRevisionId}) does not match revision id (${page.publishedRevision.id})`
      );
    }

    if (page.publishedRevision.pageId !== page.id) {
      throw new RoutingError(
        'POINTER_INTEGRITY_VIOLATION',
        `Pointer integrity violation: Page ${page.id} references revision ${page.publishedRevision.id} belonging to page ${page.publishedRevision.pageId}`
      );
    }

    if (page.publishedRevision.status !== 'PUBLISHED') {
      throw new RoutingError(
        'POINTER_INTEGRITY_VIOLATION',
        `Pointer integrity violation: Page ${page.id} revision status is ${page.publishedRevision.status}, expected PUBLISHED`
      );
    }
  }

  /**
   * Recursively derives the hierarchical public path for a given page.
   * Enforces:
   * - live authority is publishedRevisionId
   * - cycle detection
   * - bounded hierarchy depth
   * - missing parent detection
   * - cross-project parent detection
   * - parent published pointer integrity
   */
  static derivePathForPage(
    pageId: string,
    pagesById: Map<string, PageWithPublishedRevision>,
    projectId: string,
    visited = new Set<string>(),
    depth = 0
  ): string {
    if (depth > this.MAX_HIERARCHY_DEPTH) {
      throw new RoutingError(
        'HIERARCHY_DEPTH_EXCEEDED',
        `Hierarchy depth limit (${this.MAX_HIERARCHY_DEPTH}) exceeded for page ${pageId}`
      );
    }

    if (visited.has(pageId)) {
      throw new RoutingError(
        'HIERARCHY_CYCLE_DETECTED',
        `Cycle detected in page hierarchy at page ${pageId}`
      );
    }

    visited.add(pageId);

    const page = pagesById.get(pageId);
    if (!page) {
      throw new RoutingError(
        'PARENT_NOT_FOUND',
        `Page ${pageId} not found in project ${projectId}`
      );
    }

    if (page.projectId !== projectId) {
      throw new RoutingError(
        'CROSS_PROJECT_PARENT',
        `Cross-project parent link detected: page ${page.id} belongs to ${page.projectId}, but requested project is ${projectId}`
      );
    }

    this.validatePointerIntegrity(page);

    const revision = page.publishedRevision!;
    const cleanSlug = this.cleanSlugSegment(revision.slug);

    if (!page.parentId) {
      const rootPath = cleanSlug === '' ? '/' : `/${cleanSlug}`;
      return this.normalizePath(rootPath);
    }

    const parentPage = pagesById.get(page.parentId);
    if (!parentPage) {
      throw new RoutingError(
        'PARENT_NOT_FOUND',
        `Parent page ${page.parentId} not found for child ${page.id} in project ${projectId}`
      );
    }

    if (parentPage.projectId !== projectId) {
      throw new RoutingError(
        'CROSS_PROJECT_PARENT',
        `Cross-project parent link detected: parent ${parentPage.id} belongs to project ${parentPage.projectId}, but child ${page.id} belongs to ${projectId}`
      );
    }

    const parentPath = this.derivePathForPage(
      parentPage.id,
      pagesById,
      projectId,
      new Set(visited),
      depth + 1
    );

    const combined = parentPath === '/' ? `/${cleanSlug}` : `${parentPath}/${cleanSlug}`;
    return this.normalizePath(combined);
  }

  /**
   * Verifies that all ancestors in the hierarchy chain are publicly resolvable (PUBLIC or UNLISTED).
   * If any ancestor is INTERNAL or PASSWORD_PROTECTED, the child must not resolve publicly.
   */
  private static areAllAncestorsPubliclyResolvable(
    pageId: string,
    pagesById: Map<string, PageWithPublishedRevision>
  ): boolean {
    let current = pagesById.get(pageId);
    let depth = 0;

    while (current && current.parentId && depth < this.MAX_HIERARCHY_DEPTH) {
      const parent = pagesById.get(current.parentId);
      if (!parent || !parent.publishedRevision) {
        return false;
      }
      const vis = parent.publishedRevision.visibility;
      if (!this.isPubliclyResolvableVisibility(vis)) {
        return false;
      }
      current = parent;
      depth++;
    }

    return true;
  }

  /**
   * Derives all publicly resolvable routes from a given set of page models.
   * Fails closed on duplicate published paths (neither page resolves).
   */
  static derivePublishedRoutesFromPages(
    projectId: string,
    pages: PageWithPublishedRevision[],
    options?: DeriveRoutesOptions
  ): {
    resolvableRoutes: Map<string, DerivedPublishedRoute>;
    allDerivedRoutes: Map<string, DerivedPublishedRoute[]>;
    duplicatePaths: Map<string, string[]>;
    pagesById: Map<string, PageWithPublishedRevision>;
  } {
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      throw new RoutingError('INVALID_PROJECT_ID', 'Project ID is required and cannot be empty');
    }

    const pagesById = new Map<string, PageWithPublishedRevision>();
    for (const p of pages) {
      pagesById.set(p.id, p);
    }

    // Live authority: Page.publishedRevisionId is required. Never use draftRevisionId.
    const publishedPages = pages.filter(p => p.publishedRevisionId !== null);

    const pathToRoutes = new Map<string, Array<{ route: DerivedPublishedRoute; page: PageWithPublishedRevision }>>();

    for (const page of publishedPages) {
      this.validatePointerIntegrity(page);

      const derivedPath = this.derivePathForPage(page.id, pagesById, projectId);
      const revision = page.publishedRevision!;

      const route: DerivedPublishedRoute = {
        pageId: page.id,
        projectId,
        path: derivedPath,
        slug: revision.slug,
        parentId: page.parentId,
        visibility: revision.visibility as PageVisibility,
        publishedRevisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        title: revision.title,
        locale: revision.locale,
        publishedAt: revision.publishedAt ?? null,
      };

      const existing = pathToRoutes.get(derivedPath) || [];
      existing.push({ route, page });
      pathToRoutes.set(derivedPath, existing);
    }

    const resolvableRoutes = new Map<string, DerivedPublishedRoute>();
    const duplicatePaths = new Map<string, string[]>();
    const allDerivedRoutes = new Map<string, DerivedPublishedRoute[]>();

    for (const [path, items] of pathToRoutes.entries()) {
      allDerivedRoutes.set(path, items.map(i => i.route));

      // Reject reserved public paths (/admin, /api, /_next)
      if (this.isReserved(path)) {
        continue;
      }

      // Detect duplicate published paths and fail closed
      if (items.length > 1) {
        duplicatePaths.set(path, items.map(i => i.page.id));
        if (options?.strict) {
          throw new RoutingError(
            'DUPLICATE_PUBLISHED_PATH',
            `Duplicate published path detected for path "${path}" across pages: ${items.map(i => i.page.id).join(', ')}`
          );
        }
        // Fail closed: omit route from resolvableRoutes
        continue;
      }

      const { route, page } = items[0];

      // PUBLIC and UNLISTED pages may resolve publicly
      // INTERNAL and PASSWORD_PROTECTED must not resolve publicly
      if (!this.isPubliclyResolvableVisibility(route.visibility)) {
        continue;
      }

      // Ancestor visibility check
      if (!this.areAllAncestorsPubliclyResolvable(page.id, pagesById)) {
        continue;
      }

      resolvableRoutes.set(path, route);
    }

    return {
      resolvableRoutes,
      allDerivedRoutes,
      duplicatePaths,
      pagesById,
    };
  }

  /**
   * Queries the database for all project pages and derives public routes.
   */
  static async derivePublishedRoutes(
    projectId: string,
    options?: DeriveRoutesOptions
  ): Promise<Map<string, DerivedPublishedRoute>> {
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      throw new RoutingError('INVALID_PROJECT_ID', 'Project ID is required and cannot be empty');
    }

    const pages = await prisma.page.findMany({
      where: { projectId },
      include: {
        publishedRevision: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    const result = this.derivePublishedRoutesFromPages(
      projectId,
      pages as unknown as PageWithPublishedRevision[],
      options
    );

    return result.resolvableRoutes;
  }

  /**
   * Resolves a public route for a given path within a project.
   * Returns full resolution data if matched and public, or null if unresolvable.
   * Fails closed on duplicate paths, reserved routes, and non-public visibility.
   */
  static async resolvePublishedRoute(
    projectId: string,
    rawPath: string
  ): Promise<PublishedRouteResolution | null> {
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      throw new RoutingError('INVALID_PROJECT_ID', 'Project ID is required and cannot be empty');
    }

    let normalizedPath: string;
    try {
      normalizedPath = this.normalizePath(rawPath);
    } catch {
      return null;
    }

    // Strip query and fragment for route lookup
    const pathnameOnly = normalizedPath.split(/[?#]/)[0];

    // Reject reserved routes immediately
    if (this.isReserved(pathnameOnly)) {
      return null;
    }

    const pages = await prisma.page.findMany({
      where: { projectId },
      include: {
        publishedRevision: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    const derivation = this.derivePublishedRoutesFromPages(
      projectId,
      pages as unknown as PageWithPublishedRevision[]
    );

    // If duplicate published path exists for this pathname, fail closed
    if (derivation.duplicatePaths.has(pathnameOnly)) {
      return null;
    }

    const matchedRoute = derivation.resolvableRoutes.get(pathnameOnly);
    if (!matchedRoute) {
      return null;
    }

    const pageWithRevision = derivation.pagesById.get(matchedRoute.pageId);
    if (!pageWithRevision || !pageWithRevision.publishedRevision) {
      return null;
    }

    const revision = pageWithRevision.publishedRevision;

    // Resolve effective SEO inheriting project defaults and force-noindex
    const rawSeo = revision.seo && typeof revision.seo === 'object'
      ? (revision.seo as Partial<PageSEO>)
      : null;

    let effectiveSeo: PageSEO;
    try {
      effectiveSeo = await SeoService.resolveEffectiveSeo(projectId, rawSeo);
    } catch {
      return null;
    }

    // Canonical content validation check
    let validContent: unknown;
    try {
      validContent = validatePageContent(revision.content);
    } catch {
      return null;
    }

    const rawNav = revision.navigation && typeof revision.navigation === 'object'
      ? (revision.navigation as Record<string, unknown>)
      : {};

    const navigationSettings: PageNavigationSettings = {
      showInMainNavigation: typeof rawNav.showInMainNavigation === 'boolean' ? rawNav.showInMainNavigation : false,
      showInFooter: typeof rawNav.showInFooter === 'boolean' ? rawNav.showInFooter : false,
      navigationLabel: typeof rawNav.navigationLabel === 'string' ? rawNav.navigationLabel : revision.title,
      order: typeof rawNav.order === 'number' ? rawNav.order : pageWithRevision.sortOrder,
    };

    return {
      pageId: pageWithRevision.id,
      projectId: pageWithRevision.projectId,
      path: pathnameOnly,
      slug: revision.slug,
      title: revision.title,
      locale: revision.locale || 'cs',
      visibility: revision.visibility as PageVisibility,
      publishedRevisionId: revision.id,
      publishedAt: revision.publishedAt ?? null,
      content: validContent,
      seo: effectiveSeo,
      navigation: navigationSettings,
      schemaVersion: revision.schemaVersion || '1.0.0',
      updatedAt: pageWithRevision.updatedAt,
      page: {
        id: pageWithRevision.id,
        key: pageWithRevision.key,
        parentId: pageWithRevision.parentId,
        sortOrder: pageWithRevision.sortOrder,
      },
      revision: {
        id: revision.id,
        revisionNumber: revision.revisionNumber,
        title: revision.title,
        slug: revision.slug,
        locale: revision.locale,
        description: revision.description,
        visibility: revision.visibility as PageVisibility,
        publishedAt: revision.publishedAt ?? null,
      },
    };
  }
}
