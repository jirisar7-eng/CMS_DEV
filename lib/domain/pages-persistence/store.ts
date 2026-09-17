import type {
  PersistencePage,
  PersistencePageRevision,
  PersistenceUser,
  PersistenceAuditLog,
} from './types';

export interface AdminPagesReadStore {
  /**
   * List all pages belonging strictly to the specified project.
   * MUST include draftRevision and publishedRevision relations if present.
   */
  listProjectPages(projectId: string): Promise<PersistencePage[]>;

  /**
   * Retrieve a single page strictly scoped to the specified project.
   * MUST NOT perform unscoped reads.
   */
  getProjectPage(projectId: string, pageId: string): Promise<PersistencePage | null>;

  /**
   * Retrieve a specific revision strictly scoped to its pageId.
   */
  getProjectRevision(pageId: string, revisionId: string): Promise<PersistencePageRevision | null>;

  /**
   * List all revisions for a page, ordered descending by revisionNumber.
   */
  listPageRevisions(pageId: string): Promise<PersistencePageRevision[]>;

  /**
   * Batch lookup of users by their IDs for safe display name presentation.
   */
  getUsersByIds(userIds: string[]): Promise<Map<string, PersistenceUser>>;

  /**
   * List project-scoped audit events associated with the specified page.
   */
  listPageAuditEvents(projectId: string, pageId: string): Promise<PersistenceAuditLog[]>;
}
