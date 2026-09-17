import 'server-only';
import { hasPermission, PermissionKey } from '@/lib/auth/rbac';
import type { AdminPagesReadStore } from './store';
import type {
  PageSummary,
  PageDetail,
  PageTreeNode,
  GetPagesParams,
  GetPageTreeParams,
  GetPageByIdParams,
  PermissionChecker,
  AdminPageLifecycleState,
  PageDetailWithLifecycle,
  PersistenceRevisionStatus,
} from './types';
import { AdminPagesPersistenceError } from './types';
import {
  resolveActiveRevision,
  derivePagePaths,
  calculateCapabilities,
  mapToPageSummary,
  mapToPageDetail,
  buildPageTree,
  ActorPermissions,
} from './mappers';

export class AdminPagesService {
  constructor(
    private readonly store: AdminPagesReadStore,
    private readonly permissionChecker?: PermissionChecker
  ) {}

  private async checkPermission(
    actorId: string,
    permission: PermissionKey,
    projectId: string
  ): Promise<boolean> {
    if (this.permissionChecker) {
      return this.permissionChecker(actorId, permission, projectId);
    }
    return hasPermission(actorId, permission, projectId);
  }

  private validateActorAndProject(actorId: string, projectId: string) {
    if (
      !actorId ||
      typeof actorId !== 'string' ||
      actorId.trim().length === 0
    ) {
      throw new AdminPagesPersistenceError(
        'INVALID_INPUT',
        'actorId is required and cannot be empty'
      );
    }
    if (
      !projectId ||
      typeof projectId !== 'string' ||
      projectId.trim().length === 0
    ) {
      throw new AdminPagesPersistenceError(
        'INVALID_INPUT',
        'projectId is required and cannot be empty'
      );
    }
  }

  /**
   * Retrieves a list of page summaries for the specified project,
   * with optional filtering and sorting.
   */
  async getPages(params: GetPagesParams): Promise<PageSummary[]> {
    this.validateActorAndProject(params.actorId, params.projectId);

    const canView = await this.checkPermission(
      params.actorId,
      'content.view',
      params.projectId
    );
    if (!canView) {
      throw new AdminPagesPersistenceError(
        'FORBIDDEN',
        `Actor ${params.actorId} does not have content.view permission for project ${params.projectId}`
      );
    }

    const [canEdit, canPublish, canReview, canApprove, canRollback] =
      await Promise.all([
        this.checkPermission(params.actorId, 'content.edit', params.projectId),
        this.checkPermission(
          params.actorId,
          'content.publish',
          params.projectId
        ),
        this.checkPermission(
          params.actorId,
          'content.review',
          params.projectId
        ),
        this.checkPermission(
          params.actorId,
          'content.approve',
          params.projectId
        ),
        this.checkPermission(
          params.actorId,
          'content.rollback',
          params.projectId
        ),
      ]);

    const perms: ActorPermissions = {
      canView: true,
      canEdit,
      canPublish,
      canReview,
      canApprove,
      canRollback,
    };

    const pages = await this.store.listProjectPages(params.projectId);
    if (pages.length === 0) {
      return [];
    }

    // Derive hierarchy paths for all project pages
    const pathsMap = derivePagePaths(pages);

    // Collect user IDs for author resolution
    const userIdsSet = new Set<string>();
    for (const page of pages) {
      const activeRev = resolveActiveRevision(page);
      if (activeRev.createdById) {
        userIdsSet.add(activeRev.createdById);
      }
    }

    const usersMap = await this.store.getUsersByIds(Array.from(userIdsSet));

    let summaries: PageSummary[] = pages.map((page) => {
      const activeRev = resolveActiveRevision(page);
      const path = pathsMap.get(page.id) || '/';
      const caps = calculateCapabilities(perms, activeRev);
      return mapToPageSummary(page, activeRev, path, usersMap, caps);
    });

    // Apply filtering if criteria provided
    if (params.criteria) {
      const { searchQuery, status, sortBy, sortDirection } = params.criteria;

      if (searchQuery && searchQuery.trim() !== '') {
        const query = searchQuery.trim().toLowerCase();
        summaries = summaries.filter(
          (s) =>
            s.title.toLowerCase().includes(query) ||
            s.slug.toLowerCase().includes(query) ||
            s.path.toLowerCase().includes(query)
        );
      }

      if (status && status !== 'Všechny') {
        summaries = summaries.filter((s) => s.status === status);
      }

      if (sortBy) {
        const dirMultiplier = sortDirection === 'desc' ? -1 : 1;
        summaries.sort((a, b) => {
          if (sortBy === 'title') {
            return dirMultiplier * a.title.localeCompare(b.title, 'cs');
          }
          if (sortBy === 'order') {
            return dirMultiplier * (a.order - b.order);
          }
          // Default: updatedAt
          const timeA = new Date(a.updatedAt).getTime();
          const timeB = new Date(b.updatedAt).getTime();
          return dirMultiplier * (timeA - timeB);
        });
      }
    }

    return summaries;
  }

  /**
   * Retrieves the hierarchical page tree for the specified project.
   */
  async getPageTree(params: GetPageTreeParams): Promise<PageTreeNode[]> {
    const summaries = await this.getPages({
      actorId: params.actorId,
      projectId: params.projectId,
    });
    return buildPageTree(summaries);
  }

  /**
   * Retrieves full page details and lifecycle concurrency metadata for a single page.
   * Returns null if page does not exist or does not belong to the project.
   */
  async getPageByIdWithLifecycle(
    params: GetPageByIdParams
  ): Promise<PageDetailWithLifecycle | null> {
    this.validateActorAndProject(params.actorId, params.projectId);

    if (
      !params.pageId ||
      typeof params.pageId !== 'string' ||
      params.pageId.trim().length === 0
    ) {
      throw new AdminPagesPersistenceError(
        'INVALID_INPUT',
        'pageId is required and cannot be empty'
      );
    }

    const canView = await this.checkPermission(
      params.actorId,
      'content.view',
      params.projectId
    );
    if (!canView) {
      throw new AdminPagesPersistenceError(
        'FORBIDDEN',
        `Actor ${params.actorId} does not have content.view permission for project ${params.projectId}`
      );
    }

    const page = await this.store.getProjectPage(
      params.projectId,
      params.pageId
    );
    if (!page) {
      return null;
    }

    // Derive hierarchy paths using all project pages
    const allProjectPages = await this.store.listProjectPages(params.projectId);
    const pathsMap = derivePagePaths(allProjectPages);
    const derivedPath = pathsMap.get(page.id) || '/';

    // Retrieve revisions and audit logs
    const [
      revisions,
      auditLogs,
      canEdit,
      canPublish,
      canReview,
      canApprove,
      canRollback,
    ] = await Promise.all([
      this.store.listPageRevisions(params.pageId),
      this.store.listPageAuditEvents(params.projectId, params.pageId),
      this.checkPermission(params.actorId, 'content.edit', params.projectId),
      this.checkPermission(params.actorId, 'content.publish', params.projectId),
      this.checkPermission(params.actorId, 'content.review', params.projectId),
      this.checkPermission(params.actorId, 'content.approve', params.projectId),
      this.checkPermission(params.actorId, 'content.rollback', params.projectId),
    ]);

    const activeRev = resolveActiveRevision(page);

    // Collect all relevant user IDs
    const userIdsSet = new Set<string>();
    if (activeRev.createdById) userIdsSet.add(activeRev.createdById);
    for (const r of revisions) {
      if (r.createdById) userIdsSet.add(r.createdById);
    }
    for (const a of auditLogs) {
      if (a.actorId) userIdsSet.add(a.actorId);
    }

    const usersMap = await this.store.getUsersByIds(Array.from(userIdsSet));

    const perms: ActorPermissions = {
      canView: true,
      canEdit,
      canPublish,
      canReview,
      canApprove,
      canRollback,
    };
    const caps = calculateCapabilities(perms, activeRev);

    const pageDetail = mapToPageDetail(
      page,
      activeRev,
      revisions,
      auditLogs,
      derivedPath,
      usersMap,
      caps
    );

    const lifecycle: AdminPageLifecycleState = {
      activeRevisionId: activeRev.id,
      revisionNumber: activeRev.revisionNumber,
      lockVersion: activeRev.lockVersion,
      status: activeRev.status as PersistenceRevisionStatus,
      draftRevisionId: page.draftRevisionId,
      publishedRevisionId: page.publishedRevisionId,
    };

    return {
      page: pageDetail,
      lifecycle,
    };
  }

  /**
   * Retrieves full page details for a single page within the specified project.
   * Returns null if page does not exist or does not belong to the project.
   */
  async getPageById(params: GetPageByIdParams): Promise<PageDetail | null> {
    const result = await this.getPageByIdWithLifecycle(params);
    return result ? result.page : null;
  }
}
