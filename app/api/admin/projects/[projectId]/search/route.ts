import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import { getActiveProjectContext } from '@/lib/domain/pages-client/server-context';
import {
  PrismaSearchIndexAdapter,
  SearchService,
  SearchError,
  SEARCH_INDEX_VERSION,
  PageWithPublishedRevision,
} from '@/lib/domain/search';

/**
 * Admin Search API (SYN-SEARCH-001)
 * Administrative search status inspect and on-demand reindexing endpoint.
 */

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const params = await context.params;
    const { projectId } = params;

    // 1. Authenticate session
    const { user } = await getSession();
    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }

    // 2. Verify project context
    const projectContext = await getActiveProjectContext(projectId);
    if (projectContext.status !== 'PROJECT_VALID' || !projectContext.projectId) {
      const status = projectContext.status === 'PROJECT_NOT_FOUND' ? 404 : 403;
      return NextResponse.json({ error: projectContext.status }, { status });
    }

    // 3. Check search.read_admin permission
    const canReadAdmin = await hasPermission(user.id, 'search.read_admin', projectContext.projectId);
    if (!canReadAdmin) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 403 });
    }

    // 4. Count indexed documents
    const adapter = new PrismaSearchIndexAdapter();
    const searchService = new SearchService(adapter);
    const indexedDocuments = await searchService.countProjectDocuments(projectContext.projectId);

    return NextResponse.json(
      {
        projectId: projectContext.projectId,
        indexedDocuments,
        indexVersion: SEARCH_INDEX_VERSION,
      },
      { status: 200 }
    );
  } catch (err: any) {
    if (err instanceof SearchError && err.code === 'ADAPTER_ERROR') {
      return NextResponse.json(
        { error: 'SEARCH_UNAVAILABLE', message: 'Search service is temporarily unavailable' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const params = await context.params;
    const { projectId } = params;

    // 1. Authenticate session
    const { user } = await getSession();
    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }

    // 2. Verify project context
    const projectContext = await getActiveProjectContext(projectId);
    if (projectContext.status !== 'PROJECT_VALID' || !projectContext.projectId) {
      const status = projectContext.status === 'PROJECT_NOT_FOUND' ? 404 : 403;
      return NextResponse.json({ error: projectContext.status }, { status });
    }

    // 3. Check search.reindex permission
    const canReindex = await hasPermission(user.id, 'search.reindex', projectContext.projectId);
    if (!canReindex) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 403 });
    }

    // 4. Fetch pages strictly scoped to this projectId
    const pages = await prisma.page.findMany({
      where: { projectId: projectContext.projectId },
      include: {
        publishedRevision: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    // 5. Rebuild search index via domain service (fail-closed routing & validation)
    const adapter = new PrismaSearchIndexAdapter();
    const searchService = new SearchService(adapter);

    const { indexedCount } = await searchService.rebuildIndexForPages(
      projectContext.projectId,
      pages as unknown as PageWithPublishedRevision[]
    );

    return NextResponse.json(
      {
        projectId: projectContext.projectId,
        indexedCount,
      },
      { status: 200 }
    );
  } catch (err: any) {
    if (err instanceof SearchError && err.code === 'ADAPTER_ERROR') {
      return NextResponse.json(
        { error: 'SEARCH_UNAVAILABLE', message: 'Search service is temporarily unavailable' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
  }
}
