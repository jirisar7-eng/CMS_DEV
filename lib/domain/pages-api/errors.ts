import 'server-only';
import { NextResponse } from 'next/server';
import { AdminPagesPersistenceError } from '../pages-persistence/types';
import { ContentLifecycleError } from '../content/lifecycle/types';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export function jsonError(
  code: string,
  message: string,
  status: number
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    }
  );
}

export function jsonSuccess<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(
    { data },
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    }
  );
}

export function isPagesPersistenceError(
  err: unknown
): err is AdminPagesPersistenceError {
  return (
    err instanceof AdminPagesPersistenceError ||
    (typeof err === 'object' &&
      err !== null &&
      'name' in err &&
      (err as any).name === 'AdminPagesPersistenceError' &&
      'code' in err)
  );
}

export function isContentLifecycleError(
  err: unknown
): err is ContentLifecycleError {
  return (
    err instanceof ContentLifecycleError ||
    (typeof err === 'object' &&
      err !== null &&
      'name' in err &&
      (err as any).name === 'ContentLifecycleError' &&
      'code' in err)
  );
}

export function isApiError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError ||
    (typeof err === 'object' &&
      err !== null &&
      'name' in err &&
      (err as any).name === 'ApiError' &&
      'code' in err &&
      'status' in err)
  );
}

export function handleApiError(err: unknown): NextResponse {
  if (isApiError(err)) {
    return jsonError(err.code, err.message, err.status);
  }

  if (isContentLifecycleError(err)) {
    switch (err.code) {
      case 'INVALID_INPUT':
        return jsonError(err.code, err.message || 'Invalid input', 400);
      case 'FORBIDDEN':
        return jsonError(err.code, 'Forbidden: insufficient permissions', 403);
      case 'PAGE_NOT_FOUND':
        return jsonError(err.code, 'Page not found', 404);
      case 'PARENT_SCOPE_VIOLATION':
        return jsonError(err.code, 'Parent page not found', 404);
      case 'NO_DRAFT':
        return jsonError(err.code, 'No draft found', 409);
      case 'DRAFT_STATE_INVALID':
        return jsonError(err.code, 'Draft state invalid', 409);
      case 'STATE_TRANSITION_INVALID':
        return jsonError(err.code, 'State transition invalid', 409);
      case 'LOCK_CONFLICT':
        return jsonError(err.code, 'Lock conflict: resource has been modified', 409);
      case 'POINTER_INTEGRITY_VIOLATION':
        return jsonError(err.code, 'Pointer integrity violation', 409);
      case 'KEY_CONFLICT':
        return jsonError(err.code, 'Page key conflict', 409);
      case 'NO_PUBLISHED_REVISION':
        return jsonError(err.code, 'No published revision', 409);
      case 'ROLLBACK_NOT_AVAILABLE':
        return jsonError(err.code, 'Rollback not available', 409);
      case 'ACTIVE_DRAFT_EXISTS':
        return jsonError(err.code, 'Active draft already exists', 409);
      default:
        return jsonError('INTERNAL_ERROR', 'An unexpected error occurred', 500);
    }
  }

  if (isPagesPersistenceError(err)) {
    switch (err.code) {
      case 'INVALID_INPUT':
        return jsonError(err.code, err.message, 400);
      case 'FORBIDDEN':
        return jsonError(err.code, 'Forbidden: insufficient permissions', 403);
      case 'PAGE_NOT_FOUND':
        return jsonError(err.code, 'Page not found', 404);
      case 'PAGE_STATE_INVALID':
      case 'POINTER_INTEGRITY_VIOLATION':
      case 'HIERARCHY_INTEGRITY_VIOLATION':
      case 'CONTENT_INTEGRITY_VIOLATION':
        return jsonError(err.code, 'Page integrity violation', 409);
      case 'DATABASE_UNAVAILABLE':
        return jsonError(err.code, 'Database unavailable', 503);
      default:
        return jsonError('INTERNAL_ERROR', 'An unexpected error occurred', 500);
    }
  }

  if (err instanceof Error) {
    if (err.message === 'UNAUTHENTICATED') {
      return jsonError('UNAUTHENTICATED', 'Authentication required', 401);
    }
    if (err.message === 'DATABASE_UNAVAILABLE') {
      return jsonError('DATABASE_UNAVAILABLE', 'Database unavailable', 503);
    }
    if (err.message === 'FORBIDDEN') {
      return jsonError('FORBIDDEN', 'Forbidden: insufficient permissions', 403);
    }
    if (err.message === 'CSRF_REJECTED') {
      return jsonError('CSRF_REJECTED', 'Cross-origin request rejected', 403);
    }
    if (err.message === 'UNSUPPORTED_MEDIA_TYPE') {
      return jsonError('UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json', 415);
    }
  }

  // Sanitized 500 without leaking stack traces or internal details
  return jsonError('INTERNAL_ERROR', 'An unexpected error occurred', 500);
}
