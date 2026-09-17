import type {
  PageSummary,
  PageDetail,
  PageTreeNode,
  PageFilterCriteria,
  PageStatus,
  PageVisibility,
  PageCapabilities,
  PageSEO,
  PageNavigationSettings,
  PageRevision as UIPageRevision,
  PageActivityLog as UIPageActivityLog,
} from '../pages';
import type { PermissionKey } from '@/lib/auth/rbac';

export type AdminPagesErrorCode =
  | 'INVALID_INPUT'
  | 'DATABASE_UNAVAILABLE'
  | 'FORBIDDEN'
  | 'PAGE_NOT_FOUND'
  | 'PAGE_STATE_INVALID'
  | 'POINTER_INTEGRITY_VIOLATION'
  | 'HIERARCHY_INTEGRITY_VIOLATION'
  | 'CONTENT_INTEGRITY_VIOLATION';

export class AdminPagesPersistenceError extends Error {
  readonly code: AdminPagesErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: AdminPagesErrorCode, message: string, details?: Record<string, unknown>) {
    super(`[${code}] ${message}`);
    this.name = 'AdminPagesPersistenceError';
    this.code = code;
    this.details = details;
  }
}

export type PersistenceRevisionStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED';
export type PersistencePageVisibility = 'PUBLIC' | 'UNLISTED' | 'PASSWORD_PROTECTED' | 'INTERNAL';

export interface PersistencePage {
  id: string;
  projectId: string;
  key: string;
  parentId: string | null;
  sortOrder: number;
  draftRevisionId: string | null;
  publishedRevisionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  draftRevision?: PersistencePageRevision | null;
  publishedRevision?: PersistencePageRevision | null;
}

export interface PersistencePageRevision {
  id: string;
  pageId: string;
  revisionNumber: number;
  status: PersistenceRevisionStatus | string;
  title: string;
  slug: string;
  locale: string;
  description: string | null;
  visibility: PersistencePageVisibility | string;
  content: unknown;
  seo: unknown;
  navigation: unknown;
  schemaVersion: string;
  lockVersion: number;
  createdById: string | null;
  createdAt: Date;
  submittedAt: Date | null;
  approvedAt: Date | null;
  publishedAt: Date | null;
  derivedFromRevisionId: string | null;
}

export interface PersistenceUser {
  id: string;
  displayName: string | null;
}

export interface PersistenceAuditLog {
  id: string;
  actorId: string | null;
  action: string;
  scopeType: string;
  scopeId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  metadata: unknown;
  createdAt: Date;
  actor?: PersistenceUser | null;
}

export interface GetPagesParams {
  actorId: string;
  projectId: string;
  criteria?: Partial<PageFilterCriteria>;
}

export interface GetPageTreeParams {
  actorId: string;
  projectId: string;
}

export interface GetPageByIdParams {
  actorId: string;
  projectId: string;
  pageId: string;
}

export interface AdminPageLifecycleState {
  activeRevisionId: string;
  revisionNumber: number;
  lockVersion: number;
  status: PersistenceRevisionStatus;
  draftRevisionId: string | null;
  publishedRevisionId: string | null;
}

export interface PageDetailWithLifecycle {
  page: PageDetail;
  lifecycle: AdminPageLifecycleState;
}

export type PermissionChecker = (
  actorId: string,
  permission: PermissionKey,
  projectId: string
) => Promise<boolean>;

export type {
  PageSummary,
  PageDetail,
  PageTreeNode,
  PageFilterCriteria,
  PageStatus,
  PageVisibility,
  PageCapabilities,
  PageSEO,
  PageNavigationSettings,
  UIPageRevision,
  UIPageActivityLog,
};
