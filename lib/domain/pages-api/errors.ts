import 'server-only';
import { NextResponse } from 'next/server';
import { AdminPagesPersistenceError } from '../pages-persistence/types';

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

export function handleApiError(err: unknown): NextResponse {
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
  }

  // Sanitized 500 without leaking stack traces or internal details
  return jsonError('INTERNAL_ERROR', 'An unexpected error occurred', 500);
}
