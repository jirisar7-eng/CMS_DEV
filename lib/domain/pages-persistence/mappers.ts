import { validatePageContent } from '../content/validation';
import type {
  PageSummary,
  PageDetail,
  PageTreeNode,
  PageStatus,
  PageVisibility,
  PageCapabilities,
  PageSEO,
  PageNavigationSettings,
  UIPageRevision,
  UIPageActivityLog,
  PersistencePage,
  PersistencePageRevision,
  PersistenceUser,
  PersistenceAuditLog,
} from './types';
import { AdminPagesPersistenceError } from './types';

const MAX_HIERARCHY_DEPTH = 64;

/**
 * Maps database revision status to canonical Czech UI status.
 * Rejects unknown or fabricated statuses.
 */
export function mapPersistenceStatus(status: string): PageStatus {
  switch (status) {
    case 'DRAFT':
      return 'Koncept';
    case 'IN_REVIEW':
      return 'Ke kontrole';
    case 'APPROVED':
      return 'Schváleno';
    case 'PUBLISHED':
      return 'Publikováno';
    default:
      throw new AdminPagesPersistenceError(
        'PAGE_STATE_INVALID',
        `Unsupported or invalid page revision status: ${status}`
      );
  }
}

/**
 * Maps database page visibility to canonical Czech UI visibility.
 */
export function mapPersistenceVisibility(visibility: string): PageVisibility {
  switch (visibility) {
    case 'PUBLIC':
      return 'Veřejná';
    case 'UNLISTED':
      return 'Neveřejná (přes odkaz)';
    case 'PASSWORD_PROTECTED':
      return 'Chráněná heslem';
    case 'INTERNAL':
      return 'Interní (pouze CMS)';
    default:
      throw new AdminPagesPersistenceError(
        'PAGE_STATE_INVALID',
        `Unsupported or invalid page visibility: ${visibility}`
      );
  }
}

/**
 * Resolves the active administrative revision for a page.
 * Priority:
 * 1. draftRevisionId (active work-in-progress)
 * 2. publishedRevisionId (active live revision if no active draft)
 *
 * Enforces pointer integrity (must point to revision of the same page).
 */
export function resolveActiveRevision(
  page: PersistencePage,
  revisionsLookup?: Map<string, PersistencePageRevision>
): PersistencePageRevision {
  let targetRevisionId: string | null = null;
  let candidateRevision: PersistencePageRevision | null | undefined = null;

  if (page.draftRevisionId) {
    targetRevisionId = page.draftRevisionId;
    candidateRevision = page.draftRevision ?? revisionsLookup?.get(targetRevisionId);
  } else if (page.publishedRevisionId) {
    targetRevisionId = page.publishedRevisionId;
    candidateRevision = page.publishedRevision ?? revisionsLookup?.get(targetRevisionId);
  } else {
    throw new AdminPagesPersistenceError(
      'PAGE_STATE_INVALID',
      `Page ${page.id} has neither draftRevisionId nor publishedRevisionId`
    );
  }

  if (!candidateRevision) {
    throw new AdminPagesPersistenceError(
      'POINTER_INTEGRITY_VIOLATION',
      `Page ${page.id} references non-existent revision ${targetRevisionId}`
    );
  }

  if (candidateRevision.pageId !== page.id) {
    throw new AdminPagesPersistenceError(
      'POINTER_INTEGRITY_VIOLATION',
      `Pointer integrity violation: Page ${page.id} references revision ${targetRevisionId} belonging to page ${candidateRevision.pageId}`
    );
  }

  return candidateRevision;
}

/**
 * Normalizes URL path segments into a clean absolute path.
 */
export function normalizePath(rawPath: string): string {
  let cleaned = rawPath.trim().replace(/\/+/g, '/');
  if (!cleaned.startsWith('/')) {
    cleaned = '/' + cleaned;
  }
  if (cleaned.length > 1 && cleaned.endsWith('/')) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
}

/**
 * Derives canonical paths for all pages within the project hierarchy.
 * Validates:
 * - Parent page must exist in the same project.
 * - No cyclical parent-child references.
 * - Depth must not exceed MAX_HIERARCHY_DEPTH (64).
 */
export function derivePagePaths(
  pages: PersistencePage[],
  activeRevisionsMap?: Map<string, PersistencePageRevision>
): Map<string, string> {
  const pagesById = new Map<string, PersistencePage>();
  for (const page of pages) {
    pagesById.set(page.id, page);
  }

  const paths = new Map<string, string>();

  function resolvePathForPage(
    page: PersistencePage,
    visited: Set<string>,
    depth: number
  ): string {
    if (paths.has(page.id)) {
      return paths.get(page.id)!;
    }

    if (depth > MAX_HIERARCHY_DEPTH) {
      throw new AdminPagesPersistenceError(
        'HIERARCHY_INTEGRITY_VIOLATION',
        `Hierarchy depth limit (${MAX_HIERARCHY_DEPTH}) exceeded for page ${page.id}`
      );
    }

    if (visited.has(page.id)) {
      throw new AdminPagesPersistenceError(
        'HIERARCHY_INTEGRITY_VIOLATION',
        `Cycle detected in page hierarchy at page ${page.id}`
      );
    }

    visited.add(page.id);

    const activeRev =
      activeRevisionsMap?.get(page.id) ?? resolveActiveRevision(page);
    const slug = activeRev.slug || '';

    if (!page.parentId) {
      // Root page
      const computedPath = normalizePath(slug === '/' || slug === '' ? '/' : `/${slug}`);
      paths.set(page.id, computedPath);
      return computedPath;
    }

    const parentPage = pagesById.get(page.parentId);
    if (!parentPage) {
      throw new AdminPagesPersistenceError(
        'HIERARCHY_INTEGRITY_VIOLATION',
        `Parent page ${page.parentId} not found within project ${page.projectId} for child ${page.id}`
      );
    }

    if (parentPage.projectId !== page.projectId) {
      throw new AdminPagesPersistenceError(
        'HIERARCHY_INTEGRITY_VIOLATION',
        `Cross-project parent link detected: parent ${parentPage.id} belongs to project ${parentPage.projectId}, but child ${page.id} belongs to ${page.projectId}`
      );
    }

    const parentPath = resolvePathForPage(parentPage, visited, depth + 1);
    const combined = parentPath === '/' ? `/${slug}` : `${parentPath}/${slug}`;
    const computedPath = normalizePath(combined);

    paths.set(page.id, computedPath);
    return computedPath;
  }

  for (const page of pages) {
    if (!paths.has(page.id)) {
      resolvePathForPage(page, new Set<string>(), 0);
    }
  }

  return paths;
}

export interface ActorPermissions {
  canView: boolean;
  canEdit: boolean;
  canPublish: boolean;
}

/**
 * Calculates page capabilities based on actual actor permissions and current revision state.
 */
export function calculateCapabilities(
  perms: ActorPermissions,
  activeRevision: PersistencePageRevision
): PageCapabilities {
  const isDraft = activeRevision.status === 'DRAFT';
  const isApproved = activeRevision.status === 'APPROVED';

  return {
    canOpen: perms.canView,
    canEdit: perms.canEdit && isDraft,
    canPreview: perms.canView,
    canDuplicate: false, // Mutation not supported in this read-only adapter checkpoint
    canMove: false,      // Hierarchy mutation not supported in this checkpoint
    canArchive: false,   // Archive mutation not supported in this checkpoint
    canPublish: perms.canPublish && isApproved,
    canSave: perms.canEdit && isDraft,
    canSubmitReview: perms.canEdit && isDraft,
  };
}

/**
 * Formats a non-sensitive presentation string for audit events.
 * Strips secrets, raw JSON, tokens, and blocks.
 */
export function formatSafeAuditDetails(action: string): string {
  switch (action) {
    case 'CONTENT_PAGE_CREATED':
      return 'Stránka byla vytvořena';
    case 'CONTENT_DRAFT_UPDATED':
      return 'Koncept byl upraven';
    case 'CONTENT_REVIEW_SUBMITTED':
      return 'Odesláno ke kontrole';
    case 'CONTENT_CHANGES_REQUESTED':
      return 'Vráceno k dopracování';
    case 'CONTENT_REVIEW_APPROVED':
      return 'Schváleno ke zveřejnění';
    case 'CONTENT_RELEASE_PUBLISHED':
      return 'Publikováno';
    case 'CONTENT_RELEASE_ROLLED_BACK':
      return 'Vráceno na předchozí verzi';
    case 'CONTENT_DRAFT_REOPENED':
      return 'Otevřen nový koncept';
    default: {
      const clean = action.replace(/^CONTENT_/, '').toLowerCase().replace(/_/g, ' ');
      return clean.charAt(0).toUpperCase() + clean.slice(1);
    }
  }
}

/**
 * Maps persistence page and active revision to UI PageSummary.
 */
export function mapToPageSummary(
  page: PersistencePage,
  activeRevision: PersistencePageRevision,
  derivedPath: string,
  usersMap: Map<string, PersistenceUser>,
  capabilities: PageCapabilities
): PageSummary {
  const authorUser = activeRevision.createdById
    ? usersMap.get(activeRevision.createdById)
    : null;

  return {
    id: page.id,
    title: activeRevision.title,
    slug: activeRevision.slug,
    path: derivedPath,
    status: mapPersistenceStatus(activeRevision.status),
    parentId: page.parentId,
    author: {
      id: activeRevision.createdById ?? 'system',
      name: authorUser?.displayName || 'Systém',
    },
    updatedAt:
      page.updatedAt instanceof Date
        ? page.updatedAt.toISOString()
        : new Date(page.updatedAt).toISOString(),
    locale: activeRevision.locale || 'cs',
    order: page.sortOrder,
    capabilities,
  };
}

/**
 * Maps persistence page, revisions, and audit logs to UI PageDetail.
 */
export function mapToPageDetail(
  page: PersistencePage,
  activeRevision: PersistencePageRevision,
  allRevisions: PersistencePageRevision[],
  auditLogs: PersistenceAuditLog[],
  derivedPath: string,
  usersMap: Map<string, PersistenceUser>,
  capabilities: PageCapabilities
): PageDetail {
  const summary = mapToPageSummary(
    page,
    activeRevision,
    derivedPath,
    usersMap,
    capabilities
  );

  // Validate stored canonical content
  let validContent;
  try {
    validContent = validatePageContent(activeRevision.content);
  } catch (err: any) {
    throw new AdminPagesPersistenceError(
      'CONTENT_INTEGRITY_VIOLATION',
      `Stored page content violates canonical schema: ${err?.message || 'Invalid content'}`
    );
  }

  // Safe SEO mapping
  const rawSeo =
    activeRevision.seo && typeof activeRevision.seo === 'object'
      ? (activeRevision.seo as Record<string, unknown>)
      : {};
  const seo: PageSEO = {
    metaTitle: typeof rawSeo.metaTitle === 'string' ? rawSeo.metaTitle : '',
    metaDescription:
      typeof rawSeo.metaDescription === 'string' ? rawSeo.metaDescription : '',
    canonicalUrl:
      typeof rawSeo.canonicalUrl === 'string' ? rawSeo.canonicalUrl : '',
    noIndex: typeof rawSeo.noIndex === 'boolean' ? rawSeo.noIndex : false,
    ogImage: typeof rawSeo.ogImage === 'string' ? rawSeo.ogImage : '',
  };

  // Safe Navigation mapping
  const rawNav =
    activeRevision.navigation && typeof activeRevision.navigation === 'object'
      ? (activeRevision.navigation as Record<string, unknown>)
      : {};
  const navigation: PageNavigationSettings = {
    showInMainNavigation:
      typeof rawNav.showInMainNavigation === 'boolean'
        ? rawNav.showInMainNavigation
        : false,
    showInFooter:
      typeof rawNav.showInFooter === 'boolean' ? rawNav.showInFooter : false,
    navigationLabel:
      typeof rawNav.navigationLabel === 'string' ? rawNav.navigationLabel : '',
    order: typeof rawNav.order === 'number' ? rawNav.order : 0,
  };

  // Map real revisions (ordered descending by revisionNumber)
  const sortedRevisions = [...allRevisions].sort(
    (a, b) => b.revisionNumber - a.revisionNumber
  );

  const uiRevisions: UIPageRevision[] = sortedRevisions.map((rev) => {
    const revAuthor = rev.createdById ? usersMap.get(rev.createdById) : null;
    return {
      id: rev.id,
      version: `v${rev.revisionNumber}`,
      createdAt:
        rev.createdAt instanceof Date
          ? rev.createdAt.toISOString()
          : new Date(rev.createdAt).toISOString(),
      author: {
        id: rev.createdById ?? 'system',
        name: revAuthor?.displayName || 'Systém',
      },
      note: `Revize v${rev.revisionNumber}`,
      status: mapPersistenceStatus(rev.status),
    };
  });

  // Map audit logs into safe activity presentation
  const uiActivity: UIPageActivityLog[] = auditLogs.map((log) => {
    const actorUser = log.actorId ? usersMap.get(log.actorId) : null;
    return {
      id: log.id,
      timestamp:
        log.createdAt instanceof Date
          ? log.createdAt.toISOString()
          : new Date(log.createdAt).toISOString(),
      actor: {
        id: log.actorId ?? 'system',
        name: actorUser?.displayName || log.actor?.displayName || 'Systém',
      },
      action: log.action,
      details: formatSafeAuditDetails(log.action),
    };
  });

  return {
    ...summary,
    description: activeRevision.description ?? '',
    visibility: mapPersistenceVisibility(activeRevision.visibility),
    content: validContent,
    seo,
    navigation,
    revisions: uiRevisions,
    activity: uiActivity,
    templateId: 'default',
  };
}

/**
 * Builds a nested hierarchical tree from a flat list of PageSummary items.
 */
export function buildPageTree(summaries: PageSummary[]): PageTreeNode[] {
  const nodesById = new Map<string, PageTreeNode>();
  for (const s of summaries) {
    nodesById.set(s.id, {
      ...s,
      children: [],
      level: 0,
    });
  }

  const rootNodes: PageTreeNode[] = [];

  for (const s of summaries) {
    const node = nodesById.get(s.id)!;
    if (!s.parentId) {
      node.level = 0;
      rootNodes.push(node);
    } else {
      const parent = nodesById.get(s.parentId);
      if (parent) {
        node.level = parent.level + 1;
        parent.children.push(node);
      } else {
        // Parent not in current list; fallback to root with level 0
        node.level = 0;
        rootNodes.push(node);
      }
    }
  }

  function sortRecursively(nodes: PageTreeNode[]) {
    nodes.sort((a, b) => a.order - b.order);
    for (const n of nodes) {
      if (n.children.length > 0) {
        sortRecursively(n.children);
      }
    }
  }

  sortRecursively(rootNodes);
  return rootNodes;
}
