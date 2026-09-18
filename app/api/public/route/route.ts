import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { RoutingService } from '@/lib/domain/routing/service';
import { RedirectService } from '@/lib/domain/redirects/service';
import { resolvePublicProjectContext } from '@/lib/domain/navigation/public-context';

export async function GET(req: Request) {
  try {
    const projectId = await resolvePublicProjectContext(req);
    if (!projectId) {
      return NextResponse.json({ error: 'PROJECT_NOT_FOUND' }, { status: 404 });
    }

    let url: URL;
    try {
      url = new URL(req.url);
    } catch {
      return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }

    const rawPath = url.searchParams.get('path') ?? url.searchParams.get('p') ?? url.searchParams.get('slug');
    if (rawPath === null || rawPath === undefined || typeof rawPath !== 'string' || !rawPath.trim()) {
      return NextResponse.json({ error: 'INVALID_PATH' }, { status: 400 });
    }

    let normalizedPath: string;
    try {
      normalizedPath = RoutingService.normalizePath(rawPath);
    } catch {
      return NextResponse.json({ error: 'INVALID_PATH' }, { status: 400 });
    }

    const pathnameOnly = normalizedPath.split(/[?#]/)[0];

    // Reject reserved routes immediately
    if (RoutingService.isReserved(pathnameOnly)) {
      return NextResponse.json({ error: 'RESERVED_ROUTE' }, { status: 400 });
    }

    // Page + redirect conflict check:
    // If a published page resolves AND an active redirect rule exists for this source path, fail closed.
    const [resolvedRoute, redirectRule] = await Promise.all([
      RoutingService.resolvePublishedRoute(projectId, pathnameOnly),
      prisma.redirectRule.findFirst({
        where: {
          projectId,
          sourcePath: pathnameOnly,
          active: true,
        },
        select: { id: true, targetPath: true, type: true },
      }),
    ]);

    if (resolvedRoute && redirectRule) {
      return NextResponse.json(
        { error: 'ROUTE_CONFLICT', message: 'Route conflict detected between published page and redirect rule' },
        { status: 409 }
      );
    }

    if (resolvedRoute) {
      return NextResponse.json(resolvedRoute, { status: 200 });
    }

    // If page does not resolve, check RedirectService
    const resolvedRedirect = await RedirectService.resolveRedirect(projectId, pathnameOnly);
    if (resolvedRedirect.targetPath && resolvedRedirect.type) {
      const statusCode = resolvedRedirect.type === 'MOVED_PERMANENTLY' ? 301 : 302;
      return new NextResponse(
        JSON.stringify({
          targetPath: resolvedRedirect.targetPath,
          type: resolvedRedirect.type,
          statusCode,
        }),
        {
          status: statusCode,
          headers: {
            'Content-Type': 'application/json',
            Location: resolvedRedirect.targetPath,
          },
        }
      );
    }

    // Unknown route returns 404
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  } catch {
    // Fail closed with generic response without leaking internal errors, paths or stack traces
    return NextResponse.json({ error: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
  }
}
