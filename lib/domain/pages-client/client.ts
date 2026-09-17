import { PagesApiClientError } from './errors';
import type {
  AdminPageDetailResult,
  AdminPageMutationResult,
  AdminPagePublishResult,
  AdminPageReopenDraftResult,
  AdminPageRequestChangesResult,
  AdminPageRollbackResult,
  AdminPagesClient,
  CanonicalVisibility,
  CreateAdminPageDraftInput,
  PageFilterCriteria,
  PageSummary,
  PageTreeNode,
  PageVisibility,
  UpdateAdminPageDraftInput,
} from './types';

function isValidIdentifier(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed || trimmed.length > 128) return false;
  if (/[\x00-\x1F\x7F-\x9F<>]/.test(trimmed)) return false;
  return true;
}

function validateProjectId(projectId: unknown): string {
  if (!isValidIdentifier(projectId)) {
    throw new PagesApiClientError(
      'INVALID_PROJECT_CONTEXT',
      'Invalid or missing projectId context'
    );
  }
  return projectId.trim();
}

function validatePageId(pageId: unknown): string {
  if (!isValidIdentifier(pageId)) {
    throw new PagesApiClientError('INVALID_PAGE_ID', 'Invalid or missing pageId');
  }
  return pageId.trim();
}

function mapVisibility(
  v?: PageVisibility | CanonicalVisibility
): CanonicalVisibility | undefined {
  if (!v) return undefined;
  switch (v) {
    case 'Veřejná':
    case 'PUBLIC':
      return 'PUBLIC';
    case 'Neveřejná (přes odkaz)':
    case 'UNLISTED':
      return 'UNLISTED';
    case 'Chráněná heslem':
    case 'PASSWORD_PROTECTED':
      return 'PASSWORD_PROTECTED';
    case 'Interní (pouze CMS)':
    case 'INTERNAL':
      return 'INTERNAL';
    default:
      return undefined;
  }
}

async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err: unknown) {
    if (err instanceof PagesApiClientError) {
      throw err;
    }
    throw new PagesApiClientError(
      'NETWORK_ERROR',
      err instanceof Error ? err.message : 'Network request failed'
    );
  }
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  let body: any;
  try {
    const text = await res.text();
    body = JSON.parse(text);
  } catch (_e) {
    if (!res.ok) {
      throw new PagesApiClientError(
        'INVALID_API_RESPONSE',
        `API request failed with HTTP ${res.status}`,
        res.status
      );
    }
    throw new PagesApiClientError(
      'INVALID_API_RESPONSE',
      'Failed to parse API response as JSON',
      res.status
    );
  }

  if (!res.ok) {
    if (
      body &&
      typeof body === 'object' &&
      body.error &&
      typeof body.error === 'object' &&
      typeof body.error.code === 'string'
    ) {
      throw new PagesApiClientError(
        body.error.code,
        typeof body.error.message === 'string'
          ? body.error.message
          : 'API error',
        res.status
      );
    }
    throw new PagesApiClientError(
      'INVALID_API_RESPONSE',
      `API request failed with HTTP ${res.status}`,
      res.status
    );
  }

  if (body && typeof body === 'object' && 'data' in body) {
    return body.data as T;
  }

  throw new PagesApiClientError(
    'INVALID_API_RESPONSE',
    'API response missing data wrapper',
    res.status
  );
}

class AdminPagesClientImpl implements AdminPagesClient {
  readonly projectId: string;
  private readonly encodedProjectId: string;

  constructor(projectId: string) {
    this.projectId = validateProjectId(projectId);
    this.encodedProjectId = encodeURIComponent(this.projectId);
  }

  async getPages(
    criteria?: Partial<PageFilterCriteria>
  ): Promise<PageSummary[]> {
    const params = new URLSearchParams();
    if (criteria?.searchQuery) {
      params.set('search', criteria.searchQuery);
    }
    if (criteria?.status && criteria.status !== 'Všechny') {
      params.set('status', criteria.status);
    }
    if (criteria?.sortBy) {
      params.set('sortBy', criteria.sortBy);
    }
    if (criteria?.sortDirection) {
      params.set('sortDirection', criteria.sortDirection);
    }

    const query = params.toString();
    const url = `/api/admin/projects/${this.encodedProjectId}/pages${
      query ? `?${query}` : ''
    }`;

    const res = await safeFetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
      credentials: 'same-origin',
    });

    return parseJsonResponse<PageSummary[]>(res);
  }

  async getPageTree(): Promise<PageTreeNode[]> {
    const url = `/api/admin/projects/${this.encodedProjectId}/pages?view=tree`;

    const res = await safeFetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
      credentials: 'same-origin',
    });

    return parseJsonResponse<PageTreeNode[]>(res);
  }

  async getPageById(pageId: string): Promise<AdminPageDetailResult> {
    const sanitizedPageId = validatePageId(pageId);
    const encodedPageId = encodeURIComponent(sanitizedPageId);
    const url = `/api/admin/projects/${this.encodedProjectId}/pages/${encodedPageId}`;

    const res = await safeFetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
      credentials: 'same-origin',
    });

    return parseJsonResponse<AdminPageDetailResult>(res);
  }

  async createPageDraft(
    input: CreateAdminPageDraftInput
  ): Promise<AdminPageMutationResult> {
    const key = input.key?.trim() || `page_${crypto.randomUUID()}`;
    const visibility = mapVisibility(input.visibility) || 'PUBLIC';

    const payload: Record<string, unknown> = {
      key,
      title: input.title,
      slug: input.slug,
      locale: input.locale || 'cs',
      visibility,
      parentId: input.parentId !== undefined ? input.parentId : null,
    };

    if (input.content !== undefined) {
      payload.content = input.content;
    }
    if (input.description !== undefined) {
      payload.description = input.description;
    }

    const url = `/api/admin/projects/${this.encodedProjectId}/pages`;

    const res = await safeFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'same-origin',
    });

    return parseJsonResponse<AdminPageMutationResult>(res);
  }

  async updateDraft(
    pageId: string,
    expectedLockVersion: number,
    input: UpdateAdminPageDraftInput
  ): Promise<AdminPageMutationResult> {
    const sanitizedPageId = validatePageId(pageId);
    const encodedPageId = encodeURIComponent(sanitizedPageId);

    const payload: Record<string, unknown> = {
      expectedLockVersion,
    };

    if (input.title !== undefined) payload.title = input.title;
    if (input.slug !== undefined) payload.slug = input.slug;
    if (input.locale !== undefined) payload.locale = input.locale;
    if (input.description !== undefined) payload.description = input.description;
    if (input.visibility !== undefined) {
      payload.visibility = mapVisibility(input.visibility);
    }
    if (input.content !== undefined) payload.content = input.content;

    const url = `/api/admin/projects/${this.encodedProjectId}/pages/${encodedPageId}/draft`;

    const res = await safeFetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'same-origin',
    });

    return parseJsonResponse<AdminPageMutationResult>(res);
  }

  async submitForReview(
    pageId: string,
    expectedLockVersion: number
  ): Promise<AdminPageMutationResult> {
    const sanitizedPageId = validatePageId(pageId);
    const encodedPageId = encodeURIComponent(sanitizedPageId);

    const url = `/api/admin/projects/${this.encodedProjectId}/pages/${encodedPageId}/actions/submit-review`;

    const res = await safeFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ expectedLockVersion }),
      cache: 'no-store',
      credentials: 'same-origin',
    });

    return parseJsonResponse<AdminPageMutationResult>(res);
  }

  async requestChanges(
    pageId: string,
    expectedLockVersion: number
  ): Promise<AdminPageRequestChangesResult> {
    const sanitizedPageId = validatePageId(pageId);
    const encodedPageId = encodeURIComponent(sanitizedPageId);

    const url = `/api/admin/projects/${this.encodedProjectId}/pages/${encodedPageId}/actions/request-changes`;

    const res = await safeFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ expectedLockVersion }),
      cache: 'no-store',
      credentials: 'same-origin',
    });

    return parseJsonResponse<AdminPageRequestChangesResult>(res);
  }

  async approveReview(
    pageId: string,
    expectedLockVersion: number
  ): Promise<AdminPageMutationResult> {
    const sanitizedPageId = validatePageId(pageId);
    const encodedPageId = encodeURIComponent(sanitizedPageId);

    const url = `/api/admin/projects/${this.encodedProjectId}/pages/${encodedPageId}/actions/approve`;

    const res = await safeFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ expectedLockVersion }),
      cache: 'no-store',
      credentials: 'same-origin',
    });

    return parseJsonResponse<AdminPageMutationResult>(res);
  }

  async publishApproved(
    pageId: string,
    expectedLockVersion: number
  ): Promise<AdminPagePublishResult> {
    const sanitizedPageId = validatePageId(pageId);
    const encodedPageId = encodeURIComponent(sanitizedPageId);

    const url = `/api/admin/projects/${this.encodedProjectId}/pages/${encodedPageId}/actions/publish`;

    const res = await safeFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ expectedLockVersion }),
      cache: 'no-store',
      credentials: 'same-origin',
    });

    return parseJsonResponse<AdminPagePublishResult>(res);
  }

  async rollbackPublished(
    pageId: string,
    expectedPublishedRevisionId: string
  ): Promise<AdminPageRollbackResult> {
    const sanitizedPageId = validatePageId(pageId);
    const encodedPageId = encodeURIComponent(sanitizedPageId);

    const url = `/api/admin/projects/${this.encodedProjectId}/pages/${encodedPageId}/actions/rollback`;

    const res = await safeFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ expectedPublishedRevisionId }),
      cache: 'no-store',
      credentials: 'same-origin',
    });

    return parseJsonResponse<AdminPageRollbackResult>(res);
  }

  async reopenDraft(
    pageId: string,
    expectedPublishedRevisionId: string
  ): Promise<AdminPageReopenDraftResult> {
    const sanitizedPageId = validatePageId(pageId);
    const encodedPageId = encodeURIComponent(sanitizedPageId);

    const url = `/api/admin/projects/${this.encodedProjectId}/pages/${encodedPageId}/actions/reopen-draft`;

    const res = await safeFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ expectedPublishedRevisionId }),
      cache: 'no-store',
      credentials: 'same-origin',
    });

    return parseJsonResponse<AdminPageReopenDraftResult>(res);
  }
}

export function createAdminPagesClient(projectId: string): AdminPagesClient {
  return new AdminPagesClientImpl(projectId);
}
