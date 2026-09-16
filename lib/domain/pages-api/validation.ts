import 'server-only';
import { AdminPagesPersistenceError } from '../pages-persistence/types';
import type { PageStatus } from '../pages';

export function validateProjectId(projectId: unknown): string {
  if (
    !projectId ||
    typeof projectId !== 'string' ||
    projectId.trim().length === 0 ||
    projectId.trim().length > 128 ||
    /[\x00-\x1f\x7f<>]/.test(projectId)
  ) {
    throw new AdminPagesPersistenceError(
      'INVALID_INPUT',
      'projectId is required, must be between 1 and 128 characters, and contain valid characters'
    );
  }
  return projectId.trim();
}

export function validatePageId(pageId: unknown): string {
  if (
    !pageId ||
    typeof pageId !== 'string' ||
    pageId.trim().length === 0 ||
    pageId.trim().length > 128 ||
    /[\x00-\x1f\x7f<>]/.test(pageId)
  ) {
    throw new AdminPagesPersistenceError(
      'INVALID_INPUT',
      'pageId is required, must be between 1 and 128 characters, and contain valid characters'
    );
  }
  return pageId.trim();
}

export function parseListQueryParams(searchParams: URLSearchParams): {
  view: 'list' | 'tree';
  criteria: {
    searchQuery?: string;
    status?: PageStatus | 'Všechny';
    sortBy?: 'updatedAt' | 'title' | 'order';
    sortDirection?: 'asc' | 'desc';
  };
} {
  const viewParam = searchParams.get('view');
  let view: 'list' | 'tree' = 'list';
  if (viewParam !== null) {
    if (viewParam === 'list' || viewParam === 'tree') {
      view = viewParam;
    } else {
      throw new AdminPagesPersistenceError(
        'INVALID_INPUT',
        'Invalid view parameter. Allowed values: list, tree'
      );
    }
  }

  const searchParam = searchParams.get('search');
  const searchQuery =
    searchParam !== null && searchParam.trim().length > 0
      ? searchParam.trim()
      : undefined;

  const statusParam = searchParams.get('status');
  let status: PageStatus | 'Všechny' | undefined;
  if (statusParam !== null && statusParam.trim().length > 0) {
    const s = statusParam.trim();
    switch (s) {
      case 'Všechny':
      case 'ALL':
        status = 'Všechny';
        break;
      case 'Koncept':
      case 'DRAFT':
        status = 'Koncept';
        break;
      case 'Ke kontrole':
      case 'IN_REVIEW':
        status = 'Ke kontrole';
        break;
      case 'Schváleno':
      case 'APPROVED':
        status = 'Schváleno';
        break;
      case 'Publikováno':
      case 'PUBLISHED':
        status = 'Publikováno';
        break;
      case 'Naplánováno':
        status = 'Naplánováno';
        break;
      case 'Archivováno':
        status = 'Archivováno';
        break;
      default:
        throw new AdminPagesPersistenceError(
          'INVALID_INPUT',
          `Invalid status filter: ${s}`
        );
    }
  }

  const sortByParam = searchParams.get('sortBy');
  let sortBy: 'updatedAt' | 'title' | 'order' | undefined;
  if (sortByParam !== null && sortByParam.trim().length > 0) {
    const sb = sortByParam.trim();
    if (sb === 'updatedAt' || sb === 'title' || sb === 'order') {
      sortBy = sb;
    } else {
      throw new AdminPagesPersistenceError(
        'INVALID_INPUT',
        'Invalid sortBy parameter. Allowed values: updatedAt, title, order'
      );
    }
  }

  const sortDirectionParam = searchParams.get('sortDirection');
  let sortDirection: 'asc' | 'desc' | undefined;
  if (sortDirectionParam !== null && sortDirectionParam.trim().length > 0) {
    const sd = sortDirectionParam.trim();
    if (sd === 'asc' || sd === 'desc') {
      sortDirection = sd;
    } else {
      throw new AdminPagesPersistenceError(
        'INVALID_INPUT',
        'Invalid sortDirection parameter. Allowed values: asc, desc'
      );
    }
  }

  return {
    view,
    criteria: {
      searchQuery,
      status,
      sortBy,
      sortDirection,
    },
  };
}
