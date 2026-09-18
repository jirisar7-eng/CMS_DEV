import { NextResponse } from 'next/server';
import { resolvePublicProjectContext } from '@/lib/domain/navigation/public-context';
import { PrismaSearchIndexAdapter, SearchService, SearchError } from '@/lib/domain/search';

/**
 * Public Search API (SYN-SEARCH-001)
 * Safe, read-only public search endpoint.
 * Requires explicit, validated public project context.
 */
export async function GET(req: Request) {
  try {
    // 1. Resolve project context (fail-closed, never falls back to default project)
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

    // 2. Query parameter validation
    const queryParam = url.searchParams.get('q');
    if (queryParam === null || typeof queryParam !== 'string' || !queryParam.trim()) {
      return NextResponse.json(
        { error: 'INVALID_QUERY', message: 'Query parameter "q" is required and cannot be empty' },
        { status: 400 }
      );
    }

    const locale = url.searchParams.get('locale') || undefined;

    // Optional pagination parameters
    let limit: number | undefined = undefined;
    const limitParam = url.searchParams.get('limit');
    if (limitParam !== null) {
      const parsed = parseInt(limitParam, 10);
      if (isNaN(parsed) || parsed < 1) {
        return NextResponse.json(
          { error: 'INVALID_PAGINATION', message: 'Limit must be a positive integer' },
          { status: 400 }
        );
      }
      limit = parsed;
    }

    let offset: number | undefined = undefined;
    const offsetParam = url.searchParams.get('offset');
    if (offsetParam !== null) {
      const parsed = parseInt(offsetParam, 10);
      if (isNaN(parsed) || parsed < 0) {
        return NextResponse.json(
          { error: 'INVALID_PAGINATION', message: 'Offset must be a non-negative integer' },
          { status: 400 }
        );
      }
      offset = parsed;
    }

    // 3. Execute search via SearchService backed by PrismaSearchIndexAdapter
    const searchService = new SearchService(new PrismaSearchIndexAdapter());
    const result = await searchService.search({
      projectId,
      query: queryParam,
      locale,
      limit,
      offset,
    });

    // 4. Return safe public response (explicitly map only public fields, omit pageId & revisionId)
    const publicItems = result.items.map((item) => {
      const publicItem: {
        path: string;
        title: string;
        description: string | null;
        locale: string;
        snippet?: string;
        score?: number;
      } = {
        path: item.path,
        title: item.title,
        description: item.description,
        locale: item.locale,
      };

      if (typeof item.snippet === 'string') {
        publicItem.snippet = item.snippet;
      }
      if (typeof item.score === 'number') {
        publicItem.score = item.score;
      }

      return publicItem;
    });

    return NextResponse.json(
      {
        items: publicItems,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        query: result.query,
      },
      { status: 200 }
    );
  } catch (err: any) {
    if (err instanceof SearchError) {
      switch (err.code) {
        case 'INVALID_QUERY':
        case 'QUERY_TOO_LONG':
        case 'INVALID_PAGINATION':
          return NextResponse.json({ error: err.code, message: err.message }, { status: 400 });
        case 'INVALID_PROJECT_ID':
          return NextResponse.json({ error: 'PROJECT_NOT_FOUND' }, { status: 404 });
        case 'ADAPTER_ERROR':
          return NextResponse.json(
            { error: 'SEARCH_UNAVAILABLE', message: 'Search service is temporarily unavailable' },
            { status: 503 }
          );
        default:
          return NextResponse.json({ error: 'SEARCH_ERROR' }, { status: 500 });
      }
    }

    // Fail closed: never leak internal error messages, SQL details, or stack traces
    return NextResponse.json({ error: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
  }
}
