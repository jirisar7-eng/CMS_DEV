import {
  SearchIndexAdapter,
  SearchQueryInput,
  SearchResult,
  SearchError,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  SEARCH_MAX_QUERY_LENGTH,
  PageWithPublishedRevision,
} from './types';
import { InMemorySearchIndexAdapter } from './adapter';
import { generateSearchDocumentsFromPages, GenerateDocumentsOptions } from './rebuild';

/**
 * SearchService
 * Core domain service managing search execution, query validation, and index rebuilding.
 * Enforces project isolation and provider-neutrality.
 */
export class SearchService {
  constructor(private readonly adapter: SearchIndexAdapter = new InMemorySearchIndexAdapter()) {}

  /**
   * Executes a search query with strict project context, normalization, and bounded pagination.
   */
  async search(input: SearchQueryInput): Promise<SearchResult> {
    // 1. Strict projectId validation
    if (!input.projectId || typeof input.projectId !== 'string' || !input.projectId.trim()) {
      throw new SearchError('INVALID_PROJECT_ID', 'Project ID is required and cannot be empty');
    }
    const cleanProjectId = input.projectId.trim();

    // 2. Query normalization and validation
    if (!input.query || typeof input.query !== 'string' || !input.query.trim()) {
      throw new SearchError('INVALID_QUERY', 'Search query cannot be empty');
    }

    const normalizedQuery = input.query.trim().replace(/\s+/g, ' ');

    // 3. Query length limits
    if (normalizedQuery.length > SEARCH_MAX_QUERY_LENGTH) {
      throw new SearchError(
        'QUERY_TOO_LONG',
        `Search query exceeds maximum length of ${SEARCH_MAX_QUERY_LENGTH} characters`
      );
    }

    // 4. Bounded pagination
    let limit = SEARCH_DEFAULT_LIMIT;
    if (input.limit !== undefined) {
      if (typeof input.limit !== 'number' || !Number.isInteger(input.limit) || input.limit < 1) {
        throw new SearchError('INVALID_PAGINATION', 'Limit must be a positive integer');
      }
      limit = Math.min(input.limit, SEARCH_MAX_LIMIT);
    }

    let offset = 0;
    if (input.offset !== undefined) {
      if (typeof input.offset !== 'number' || !Number.isInteger(input.offset) || input.offset < 0) {
        throw new SearchError('INVALID_PAGINATION', 'Offset must be a non-negative integer');
      }
      offset = input.offset;
    }

    // 5. Delegate to provider-neutral adapter with validated, bounded parameters
    return this.adapter.search({
      projectId: cleanProjectId,
      query: normalizedQuery,
      limit,
      offset,
      locale: input.locale,
    });
  }

  /**
   * Rebuilds the search index for a project from published CMS content.
   * Generates documents using canonical routing paths and replaces the index via the adapter.
   */
  async rebuildIndexForPages(
    projectId: string,
    pages: PageWithPublishedRevision[],
    options?: GenerateDocumentsOptions
  ): Promise<{ indexedCount: number }> {
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      throw new SearchError('INVALID_PROJECT_ID', 'Project ID is required and cannot be empty');
    }

    const cleanProjectId = projectId.trim();
    const documents = generateSearchDocumentsFromPages(cleanProjectId, pages, options);

    return this.adapter.replaceProjectIndex(cleanProjectId, documents);
  }

  /**
   * Returns the count of indexed documents for a project.
   */
  async countProjectDocuments(projectId: string): Promise<number> {
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      throw new SearchError('INVALID_PROJECT_ID', 'Project ID is required and cannot be empty');
    }
    return this.adapter.countProjectDocuments(projectId.trim());
  }

  /**
   * Returns the underlying search index adapter.
   */
  getAdapter(): SearchIndexAdapter {
    return this.adapter;
  }
}
