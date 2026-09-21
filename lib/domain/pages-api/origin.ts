import 'server-only';

import { NextRequest } from 'next/server';
import { ApiError } from './errors';

function normalizeOrigin(origin: string): string {
  try {
    const u = new URL(origin);
    if (u.hostname === '127.0.0.1') {
      u.hostname = 'localhost';
    }
    return u.origin;
  } catch {
    return origin;
  }
}

export function validateMutationOrigin(request: NextRequest): void {
  const origin = request.headers.get('origin');
  if (origin) {
    let requestOrigin: string;
    try {
      requestOrigin = new URL(request.url).origin;
    } catch {
      throw new ApiError('CSRF_REJECTED', 'Invalid request URL origin', 403);
    }
    if (normalizeOrigin(origin) !== normalizeOrigin(requestOrigin)) {
      throw new ApiError('CSRF_REJECTED', 'Cross-origin request rejected', 403);
    }
    return;
  }

  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite) {
    if (secFetchSite === 'cross-site') {
      throw new ApiError('CSRF_REJECTED', 'Cross-site request rejected', 403);
    }
    if (
      secFetchSite !== 'same-origin' &&
      secFetchSite !== 'same-site' &&
      secFetchSite !== 'none'
    ) {
      throw new ApiError('CSRF_REJECTED', 'Cross-site request rejected', 403);
    }
  }
}
