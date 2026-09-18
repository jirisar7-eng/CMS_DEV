import {
  SearchIndexAdapter,
  SearchIndexDocument,
  SearchQueryInput,
  SearchResult,
  SearchResultItem,
  SearchError,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
} from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const require: any;

/**
 * In-memory implementation of SearchIndexAdapter.
 * Used for testing, offline execution, and provider-neutral domain verification.
 */
export class InMemorySearchIndexAdapter implements SearchIndexAdapter {
  private documentsByProject = new Map<string, SearchIndexDocument[]>();

  async replaceProjectIndex(
    projectId: string,
    documents: SearchIndexDocument[]
  ): Promise<{ indexedCount: number }> {
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      throw new SearchError('INVALID_PROJECT_ID', 'Project ID is required');
    }

    const cleanId = projectId.trim();
    // Defensive copy: verify all documents belong strictly to this projectId
    const verifiedDocs: SearchIndexDocument[] = [];
    for (const doc of documents) {
      if (doc.projectId !== cleanId) {
        throw new SearchError(
          'ADAPTER_ERROR',
          `Document with pageId ${doc.pageId} has cross-project mismatch (${doc.projectId} vs ${cleanId})`
        );
      }
      verifiedDocs.push({ ...doc });
    }

    this.documentsByProject.set(cleanId, verifiedDocs);
    return { indexedCount: verifiedDocs.length };
  }

  async search(query: SearchQueryInput): Promise<SearchResult> {
    if (!query.projectId || typeof query.projectId !== 'string' || !query.projectId.trim()) {
      throw new SearchError('INVALID_PROJECT_ID', 'Project ID is required');
    }

    const projectId = query.projectId.trim();
    const rawQuery = query.query ? query.query.trim() : '';
    if (!rawQuery) {
      throw new SearchError('INVALID_QUERY', 'Search query cannot be empty');
    }

    const docs = this.documentsByProject.get(projectId) || [];
    const queryTokens = rawQuery.toLowerCase().split(/\s+/).filter(Boolean);

    let matching = docs;
    if (query.locale) {
      matching = matching.filter(d => d.locale === query.locale);
    }

    const scoredItems: Array<{ item: SearchResultItem; score: number }> = [];

    for (const doc of matching) {
      const titleLower = doc.title.toLowerCase();
      const descLower = (doc.description || '').toLowerCase();
      const bodyLower = doc.bodyText.toLowerCase();

      let matchCount = 0;
      let score = 0;

      for (const token of queryTokens) {
        let tokenMatched = false;

        if (titleLower.includes(token)) {
          score += 10;
          tokenMatched = true;
        }
        if (descLower.includes(token)) {
          score += 5;
          tokenMatched = true;
        }
        if (bodyLower.includes(token)) {
          score += 2;
          tokenMatched = true;
        }

        if (tokenMatched) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        // Boost if all tokens matched
        if (matchCount === queryTokens.length) {
          score += 20;
        }

        const snippet = this.generateSnippet(doc.bodyText || doc.description || '', queryTokens);

        scoredItems.push({
          score,
          item: {
            pageId: doc.pageId,
            revisionId: doc.revisionId,
            path: doc.path,
            title: doc.title,
            description: doc.description,
            locale: doc.locale,
            snippet,
            score,
          },
        });
      }
    }

    // Sort by score descending, then title ascending
    scoredItems.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));

    const total = scoredItems.length;
    const limit = Math.min(
      Math.max(1, query.limit ?? SEARCH_DEFAULT_LIMIT),
      SEARCH_MAX_LIMIT
    );
    const offset = Math.max(0, query.offset ?? 0);

    const items = scoredItems.slice(offset, offset + limit).map(s => s.item);

    return {
      items,
      total,
      limit,
      offset,
      query: rawQuery,
      projectId,
    };
  }

  async countProjectDocuments(projectId: string): Promise<number> {
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      throw new SearchError('INVALID_PROJECT_ID', 'Project ID is required');
    }
    return this.documentsByProject.get(projectId.trim())?.length ?? 0;
  }

  private generateSnippet(text: string, tokens: string[], maxLength: number = 160): string {
    if (!text) return '';
    const textLower = text.toLowerCase();
    let bestIndex = -1;

    for (const token of tokens) {
      const idx = textLower.indexOf(token);
      if (idx !== -1 && (bestIndex === -1 || idx < bestIndex)) {
        bestIndex = idx;
      }
    }

    if (bestIndex === -1) {
      return text.length <= maxLength ? text : text.slice(0, maxLength).trim() + '...';
    }

    const start = Math.max(0, bestIndex - 40);
    const end = Math.min(text.length, start + maxLength);
    let snippet = text.slice(start, end).trim();
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';
    return snippet;
  }

  // Helper for test cleanup
  clear(): void {
    this.documentsByProject.clear();
  }

  // Helper to inspect current index in tests
  getDocuments(projectId: string): SearchIndexDocument[] {
    return [...(this.documentsByProject.get(projectId.trim()) || [])];
  }
}

/**
 * Minimal interface for Prisma Client operations needed by the PrismaSearchIndexAdapter.
 */
export interface PrismaClientLike {
  searchDocument: {
    deleteMany(args: { where: { projectId: string } }): Promise<unknown>;
    createMany(args: { data: SearchIndexDocument[] }): Promise<{ count: number }>;
    findMany(args: {
      where: Record<string, unknown>;
      take?: number;
      skip?: number;
      orderBy?: Record<string, unknown>;
    }): Promise<SearchIndexDocument[]>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
  };
  $transaction<T>(fn: (tx: PrismaClientLike) => Promise<T>): Promise<T>;
}

/**
 * Database adapter backed by Prisma SearchDocument model.
 */
export class PrismaSearchIndexAdapter implements SearchIndexAdapter {
  constructor(private prisma?: PrismaClientLike) {}

  private getPrisma(): PrismaClientLike {
    if (this.prisma) {
      return this.prisma;
    }
    try {
      // Lazy load to avoid hard dependency failure in test-only or non-db environments
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const dbModule = require('@/lib/db');
      return dbModule.prisma as PrismaClientLike;
    } catch {
      throw new SearchError(
        'ADAPTER_ERROR',
        'Prisma client is not available. Pass an instance or ensure @/lib/db is configured.'
      );
    }
  }

  async replaceProjectIndex(
    projectId: string,
    documents: SearchIndexDocument[]
  ): Promise<{ indexedCount: number }> {
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      throw new SearchError('INVALID_PROJECT_ID', 'Project ID is required');
    }

    const cleanId = projectId.trim();
    const client = this.getPrisma();

    for (const doc of documents) {
      if (doc.projectId !== cleanId) {
        throw new SearchError(
          'ADAPTER_ERROR',
          `Cross-project document rejected: ${doc.projectId} !== ${cleanId}`
        );
      }
    }

    try {
      await client.$transaction(async (tx) => {
        await tx.searchDocument.deleteMany({
          where: { projectId: cleanId },
        });

        if (documents.length > 0) {
          await tx.searchDocument.createMany({
            data: documents.map(d => ({
              ...d,
              projectId: cleanId,
            })),
          });
        }
      });

      return { indexedCount: documents.length };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new SearchError('ADAPTER_ERROR', `Failed to replace search index: ${msg}`);
    }
  }

  async search(query: SearchQueryInput): Promise<SearchResult> {
    if (!query.projectId || typeof query.projectId !== 'string' || !query.projectId.trim()) {
      throw new SearchError('INVALID_PROJECT_ID', 'Project ID is required');
    }

    const projectId = query.projectId.trim();
    const rawQuery = query.query ? query.query.trim() : '';
    if (!rawQuery) {
      throw new SearchError('INVALID_QUERY', 'Search query cannot be empty');
    }

    const client = this.getPrisma();
    const limit = Math.min(
      Math.max(1, query.limit ?? SEARCH_DEFAULT_LIMIT),
      SEARCH_MAX_LIMIT
    );
    const offset = Math.max(0, query.offset ?? 0);

    const where: Record<string, unknown> = {
      projectId,
      ...(query.locale ? { locale: query.locale } : {}),
      OR: [
        { title: { contains: rawQuery, mode: 'insensitive' } },
        { description: { contains: rawQuery, mode: 'insensitive' } },
        { bodyText: { contains: rawQuery, mode: 'insensitive' } },
      ],
    };

    try {
      const [total, docs] = await Promise.all([
        client.searchDocument.count({ where }),
        client.searchDocument.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { title: 'asc' },
        }),
      ]);

      const items: SearchResultItem[] = docs.map((d: SearchIndexDocument) => ({
        pageId: d.pageId,
        revisionId: d.revisionId,
        path: d.path,
        title: d.title,
        description: d.description,
        locale: d.locale,
      }));

      return {
        items,
        total,
        limit,
        offset,
        query: rawQuery,
        projectId,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new SearchError('ADAPTER_ERROR', `Failed to execute search query: ${msg}`);
    }
  }

  async countProjectDocuments(projectId: string): Promise<number> {
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      throw new SearchError('INVALID_PROJECT_ID', 'Project ID is required');
    }
    const client = this.getPrisma();
    try {
      return await client.searchDocument.count({
        where: { projectId: projectId.trim() },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new SearchError('ADAPTER_ERROR', `Failed to count search documents: ${msg}`);
    }
  }
}
