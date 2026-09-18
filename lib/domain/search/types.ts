/**
 * Synthesis CMS Search Domain Contracts (SYN-SEARCH-001)
 * Provider-neutral search foundation types, interfaces and error definitions.
 */

export const SEARCH_INDEX_VERSION = 1;
export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LIMIT = 50;
export const SEARCH_MAX_QUERY_LENGTH = 200;
export const SEARCH_MAX_BODY_TEXT_LENGTH = 100_000;

export type SearchErrorCode =
  | 'INVALID_PROJECT_ID'
  | 'INVALID_QUERY'
  | 'QUERY_TOO_LONG'
  | 'INVALID_PAGINATION'
  | 'ADAPTER_ERROR'
  | 'INDEX_REBUILD_ERROR';

export class SearchError extends Error {
  readonly code: SearchErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: SearchErrorCode, message: string, details?: Record<string, unknown>) {
    super(`[${code}] ${message}`);
    this.name = 'SearchError';
    this.code = code;
    this.details = details;
  }
}

export interface SearchIndexDocument {
  id?: string;
  projectId: string;
  pageId: string;
  revisionId: string;
  path: string;
  title: string;
  description: string | null;
  locale: string;
  bodyText: string;
  indexVersion: number;
  indexedAt?: Date;
  updatedAt?: Date;
}

export interface SearchQueryInput {
  projectId: string;
  query: string;
  limit?: number;
  offset?: number;
  locale?: string;
}

export interface SearchResultItem {
  pageId: string;
  revisionId: string;
  path: string;
  title: string;
  description: string | null;
  locale: string;
  snippet?: string;
  score?: number;
}

export interface SearchResult {
  items: SearchResultItem[];
  total: number;
  limit: number;
  offset: number;
  query: string;
  projectId: string;
}

export interface SearchIndexAdapter {
  replaceProjectIndex(projectId: string, documents: SearchIndexDocument[]): Promise<{ indexedCount: number }>;
  search(query: SearchQueryInput): Promise<SearchResult>;
  countProjectDocuments(projectId: string): Promise<number>;
}

export interface SearchPageRevisionData {
  id: string;
  pageId: string;
  revisionNumber: number;
  status: string;
  title: string;
  slug: string;
  locale: string;
  description: string | null;
  visibility: string;
  content: unknown;
  seo: unknown;
  navigation?: unknown;
  schemaVersion: string;
  publishedAt?: Date | null;
}

export interface PageWithPublishedRevision {
  id: string;
  projectId: string;
  key: string;
  parentId: string | null;
  sortOrder: number;
  draftRevisionId?: string | null;
  publishedRevisionId: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  publishedRevision?: SearchPageRevisionData | null;
}
