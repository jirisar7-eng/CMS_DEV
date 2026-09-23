import 'server-only';
import { NextRequest } from 'next/server';
import { AdminPagesPersistenceError } from '../pages-persistence/types';
import { ApiError } from './errors';
import type { PageStatus } from '../pages';
import type { PageVisibility } from '../content/lifecycle';
import type { PageContent } from '../content/contracts';

const ALLOWED_VISIBILITIES: readonly PageVisibility[] = [
  'PUBLIC',
  'UNLISTED',
  'PASSWORD_PROTECTED',
  'INTERNAL',
];

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

export async function parseJsonBody<T = Record<string, unknown>>(
  request: NextRequest
): Promise<T> {
  const contentType = request.headers.get('content-type');
  if (!contentType || !contentType.toLowerCase().includes('application/json')) {
    throw new ApiError(
      'UNSUPPORTED_MEDIA_TYPE',
      'Content-Type must be application/json',
      415
    );
  }

  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > 2 * 1024 * 1024) {
    throw new ApiError('INVALID_INPUT', 'Payload too large', 400);
  }

  const raw = await request.text();
  if (raw.length > 2 * 1024 * 1024) {
    throw new ApiError('INVALID_INPUT', 'Payload too large', 400);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError('INVALID_INPUT', 'Invalid JSON body', 400);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ApiError('INVALID_INPUT', 'Request body must be a JSON object', 400);
  }

  return parsed as T;
}

export interface ValidatedCreatePageBody {
  key: string;
  title: string;
  slug: string;
  locale: string;
  visibility: PageVisibility;
  content: PageContent;
  parentId?: string | null;
  description?: string | null;
}

export function validateCreatePageBody(
  body: Record<string, unknown>
): ValidatedCreatePageBody {
  const forbiddenKeys = [
    'actorId',
    'userId',
    'role',
    'permissions',
    'projectId',
    'pageId',
    'status',
    'lockVersion',
    'revisionNumber',
    'publishedRevisionId',
    'draftRevisionId',
  ];
  for (const k of forbiddenKeys) {
    if (k in body) {
      throw new ApiError(
        'INVALID_INPUT',
        `Field '${k}' cannot be provided in request body`,
        400
      );
    }
  }

  const { key, title, slug, locale, visibility, content, parentId, description } =
    body;

  if (typeof key !== 'string' || key.trim().length === 0 || key.length > 128) {
    throw new ApiError(
      'INVALID_INPUT',
      'key is required and must be between 1 and 128 characters',
      400
    );
  }

  if (typeof title !== 'string' || title.trim().length === 0 || title.length > 256) {
    throw new ApiError(
      'INVALID_INPUT',
      'title is required and must be between 1 and 256 characters',
      400
    );
  }

  if (typeof slug !== 'string' || slug.trim().length === 0 || slug.length > 256) {
    throw new ApiError(
      'INVALID_INPUT',
      'slug is required and must be between 1 and 256 characters',
      400
    );
  }

  if (typeof locale !== 'string' || locale.trim().length === 0 || locale.length > 32) {
    throw new ApiError(
      'INVALID_INPUT',
      'locale is required and must be between 1 and 32 characters',
      400
    );
  }

  if (
    typeof visibility !== 'string' ||
    !ALLOWED_VISIBILITIES.includes(visibility as PageVisibility)
  ) {
    throw new ApiError(
      'INVALID_INPUT',
      `visibility must be one of: ${ALLOWED_VISIBILITIES.join(', ')}`,
      400
    );
  }

  if (
    !content ||
    typeof content !== 'object' ||
    Array.isArray(content)
  ) {
    throw new ApiError('INVALID_INPUT', 'content must be a valid object', 400);
  }

  let sanitizedParentId: string | null | undefined = undefined;
  if (parentId !== undefined) {
    if (parentId === null) {
      sanitizedParentId = null;
    } else if (typeof parentId === 'string') {
      if (parentId.trim().length === 0) {
        sanitizedParentId = null;
      } else {
        sanitizedParentId = parentId.trim();
      }
    } else {
      throw new ApiError(
        'INVALID_INPUT',
        'parentId must be a string or null',
        400
      );
    }
  }

  let sanitizedDescription: string | null | undefined = undefined;
  if (description !== undefined) {
    if (description === null) {
      sanitizedDescription = null;
    } else if (typeof description === 'string') {
      sanitizedDescription = description.trim();
    } else {
      throw new ApiError(
        'INVALID_INPUT',
        'description must be a string or null',
        400
      );
    }
  }

  return {
    key: key.trim(),
    title: title.trim(),
    slug: slug.trim(),
    locale: locale.trim(),
    visibility: visibility as PageVisibility,
    content: content as PageContent,
    parentId: sanitizedParentId,
    description: sanitizedDescription,
  };
}

export interface ValidatedUpdateDraftBody {
  expectedLockVersion: number;
  title?: string;
  slug?: string;
  locale?: string;
  description?: string | null;
  visibility?: PageVisibility;
  content?: PageContent;
}

export function validateUpdateDraftBody(
  body: Record<string, unknown>
): ValidatedUpdateDraftBody {
  const forbiddenKeys = [
    'status',
    'seo',
    'navigation',
    'publishedRevisionId',
    'draftRevisionId',
    'revisionNumber',
    'lockVersion',
    'actorId',
    'userId',
    'projectId',
    'pageId',
    'role',
    'permissions',
  ];
  for (const k of forbiddenKeys) {
    if (k in body) {
      throw new ApiError(
        'INVALID_INPUT',
        `Field '${k}' cannot be modified via update draft`,
        400
      );
    }
  }

  const { expectedLockVersion } = body;
  if (
    typeof expectedLockVersion !== 'number' ||
    !Number.isInteger(expectedLockVersion) ||
    expectedLockVersion < 1
  ) {
    throw new ApiError(
      'INVALID_INPUT',
      'expectedLockVersion must be a positive integer',
      400
    );
  }

  const result: ValidatedUpdateDraftBody = {
    expectedLockVersion,
  };

  let hasMutableField = false;

  if ('title' in body) {
    if (
      typeof body.title !== 'string' ||
      body.title.trim().length === 0 ||
      body.title.length > 256
    ) {
      throw new ApiError(
        'INVALID_INPUT',
        'title must be a non-empty string with maximum 256 characters',
        400
      );
    }
    result.title = body.title.trim();
    hasMutableField = true;
  }

  if ('slug' in body) {
    if (
      typeof body.slug !== 'string' ||
      body.slug.trim().length === 0 ||
      body.slug.length > 256
    ) {
      throw new ApiError(
        'INVALID_INPUT',
        'slug must be a non-empty string with maximum 256 characters',
        400
      );
    }
    result.slug = body.slug.trim();
    hasMutableField = true;
  }

  if ('locale' in body) {
    if (
      typeof body.locale !== 'string' ||
      body.locale.trim().length === 0 ||
      body.locale.length > 32
    ) {
      throw new ApiError(
        'INVALID_INPUT',
        'locale must be a non-empty string with maximum 32 characters',
        400
      );
    }
    result.locale = body.locale.trim();
    hasMutableField = true;
  }

  if ('description' in body) {
    if (body.description === null) {
      result.description = null;
    } else if (typeof body.description === 'string') {
      result.description = body.description.trim();
    } else {
      throw new ApiError(
        'INVALID_INPUT',
        'description must be a string or null',
        400
      );
    }
    hasMutableField = true;
  }

  if ('visibility' in body) {
    if (
      typeof body.visibility !== 'string' ||
      !ALLOWED_VISIBILITIES.includes(body.visibility as PageVisibility)
    ) {
      throw new ApiError(
        'INVALID_INPUT',
        `visibility must be one of: ${ALLOWED_VISIBILITIES.join(', ')}`,
        400
      );
    }
    result.visibility = body.visibility as PageVisibility;
    hasMutableField = true;
  }

  if ('content' in body) {
    if (
      !body.content ||
      typeof body.content !== 'object' ||
      Array.isArray(body.content)
    ) {
      throw new ApiError('INVALID_INPUT', 'content must be a valid object', 400);
    }
    result.content = body.content as PageContent;
    hasMutableField = true;
  }

  if (!hasMutableField) {
    throw new ApiError(
      'INVALID_INPUT',
      'At least one mutable field must be provided for update',
      400
    );
  }

  return result;
}

export interface ValidatedActionBody {
  expectedLockVersion: number;
}

export function validateActionBody(
  body: Record<string, unknown>
): ValidatedActionBody {
  const forbiddenKeys = [
    'actorId',
    'userId',
    'role',
    'permissions',
    'projectId',
    'pageId',
    'status',
    'lockVersion',
    'revisionNumber',
    'publishedRevisionId',
    'draftRevisionId',
  ];
  for (const k of forbiddenKeys) {
    if (k in body) {
      throw new ApiError(
        'INVALID_INPUT',
        `Field '${k}' cannot be provided in request body`,
        400
      );
    }
  }

  const { expectedLockVersion } = body;
  if (
    typeof expectedLockVersion !== 'number' ||
    !Number.isInteger(expectedLockVersion) ||
    expectedLockVersion < 1
  ) {
    throw new ApiError(
      'INVALID_INPUT',
      'expectedLockVersion must be a positive integer',
      400
    );
  }

  return { expectedLockVersion };
}

export interface ValidatedPublishedRevisionActionBody {
  expectedPublishedRevisionId: string;
}

export function validatePublishedRevisionActionBody(
  body: Record<string, unknown>
): ValidatedPublishedRevisionActionBody {
  const forbiddenKeys = [
    'actorId',
    'userId',
    'role',
    'permissions',
    'projectId',
    'pageId',
    'status',
    'revisionId',
    'publishedRevisionId',
    'draftRevisionId',
    'expectedLockVersion',
    'lockVersion',
    'revisionNumber',
  ];
  for (const k of forbiddenKeys) {
    if (k in body) {
      throw new ApiError(
        'INVALID_INPUT',
        `Field '${k}' cannot be provided in request body`,
        400
      );
    }
  }

  const { expectedPublishedRevisionId } = body;
  if (
    typeof expectedPublishedRevisionId !== 'string' ||
    expectedPublishedRevisionId.trim().length === 0 ||
    expectedPublishedRevisionId.trim().length > 128 ||
    /[\x00-\x1f\x7f<>]/.test(expectedPublishedRevisionId)
  ) {
    throw new ApiError(
      'INVALID_INPUT',
      'expectedPublishedRevisionId must be a non-empty string with maximum 128 characters without control characters',
      400
    );
  }

  return { expectedPublishedRevisionId: expectedPublishedRevisionId.trim() };
}


export interface ValidatedSchedulePublishBody {
  expectedLockVersion: number;
  publishAt: Date;
}

export function validateSchedulePublishBody(
  body: Record<string, unknown>
): ValidatedSchedulePublishBody {
  const forbiddenKeys = [
    "actorId",
    "userId",
    "role",
    "permissions",
    "projectId",
    "pageId",
    "status",
    "revisionId",
    "publishedRevisionId",
    "draftRevisionId",
    "scheduledRevisionId",
    "scheduledById",
    "lockVersion",
    "revisionNumber",
  ];
  for (const k of forbiddenKeys) {
    if (k in body) {
      throw new ApiError(
        "INVALID_INPUT",
        `Field '${k}' cannot be provided in request body`,
        400
      );
    }
  }

  const { expectedLockVersion, publishAt } = body;

  if (
    typeof expectedLockVersion !== "number" ||
    !Number.isInteger(expectedLockVersion) ||
    expectedLockVersion < 1
  ) {
    throw new ApiError(
      "INVALID_INPUT",
      "expectedLockVersion must be a positive integer",
      400
    );
  }

  if (typeof publishAt !== "string") {
    throw new ApiError("INVALID_INPUT", "publishAt must be an ISO date string", 400);
  }

  const parsed = new Date(publishAt);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
    throw new ApiError("INVALID_INPUT", "publishAt must be a valid future date", 400);
  }

  return { expectedLockVersion, publishAt: parsed };
}

export interface ValidatedCancelScheduleBody {
  expectedScheduledRevisionId: string;
  expectedScheduledPublishAt: Date;
}

export function validateCancelScheduleBody(
  body: Record<string, unknown>
): ValidatedCancelScheduleBody {
  const forbiddenKeys = [
    "actorId",
    "userId",
    "role",
    "permissions",
    "projectId",
    "pageId",
    "status",
    "revisionId",
    "publishedRevisionId",
    "draftRevisionId",
    "scheduledRevisionId",
    "scheduledById",
    "expectedLockVersion",
    "lockVersion",
    "revisionNumber",
  ];
  for (const k of forbiddenKeys) {
    if (k in body) {
      throw new ApiError(
        "INVALID_INPUT",
        `Field '${k}' cannot be provided in request body`,
        400
      );
    }
  }

  const { expectedScheduledRevisionId, expectedScheduledPublishAt } = body;

  if (
    typeof expectedScheduledRevisionId !== "string" ||
    expectedScheduledRevisionId.trim().length === 0 ||
    expectedScheduledRevisionId.trim().length > 128 ||
    /[\x00-\x1f\x7f<>]/.test(expectedScheduledRevisionId)
  ) {
    throw new ApiError(
      "INVALID_INPUT",
      "expectedScheduledRevisionId must be a non-empty string with maximum 128 characters without control characters",
      400
    );
  }

  if (typeof expectedScheduledPublishAt !== "string") {
    throw new ApiError(
      "INVALID_INPUT",
      "expectedScheduledPublishAt must be an ISO date string",
      400
    );
  }

  const parsed = new Date(expectedScheduledPublishAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(
      "INVALID_INPUT",
      "expectedScheduledPublishAt must be a valid date",
      400
    );
  }

  return {
    expectedScheduledRevisionId: expectedScheduledRevisionId.trim(),
    expectedScheduledPublishAt: parsed,
  };
}
