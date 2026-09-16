import { PageContent } from '../contracts';

export type ContentLifecycleErrorCode =
  | 'INVALID_INPUT'
  | 'FORBIDDEN'
  | 'PAGE_NOT_FOUND'
  | 'PARENT_SCOPE_VIOLATION'
  | 'NO_DRAFT'
  | 'DRAFT_STATE_INVALID'
  | 'LOCK_CONFLICT'
  | 'POINTER_INTEGRITY_VIOLATION'
  | 'KEY_CONFLICT'
  | 'STATE_TRANSITION_INVALID';

export class ContentLifecycleError extends Error {
  readonly code: ContentLifecycleErrorCode;
  readonly details?: unknown;

  constructor(code: ContentLifecycleErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ContentLifecycleError';
    this.code = code;
    this.details = details;
  }
}

export type PageRevisionStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED';
export type PageVisibility = 'PUBLIC' | 'UNLISTED' | 'PASSWORD_PROTECTED' | 'INTERNAL';

export interface LifecyclePage {
  id: string;
  projectId: string;
  key: string;
  parentId: string | null;
  sortOrder: number;
  draftRevisionId: string | null;
  publishedRevisionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LifecyclePageRevision {
  id: string;
  pageId: string;
  revisionNumber: number;
  status: PageRevisionStatus;
  title: string;
  slug: string;
  locale: string;
  description: string | null;
  visibility: PageVisibility;
  content: PageContent;
  seo: Record<string, unknown>;
  navigation: Record<string, unknown>;
  schemaVersion: string;
  lockVersion: number;
  createdById: string | null;
  createdAt: Date;
  submittedAt: Date | null;
  approvedAt: Date | null;
  publishedAt: Date | null;
  derivedFromRevisionId: string | null;
}

export interface CreatePageDraftInput {
  actorId: string;
  projectId: string;
  key: string;
  title: string;
  slug: string;
  locale: string;
  visibility: PageVisibility;
  content: PageContent | unknown;
  parentId?: string | null;
  description?: string | null;
}

export interface UpdateDraftInput {
  actorId: string;
  projectId: string;
  pageId: string;
  expectedLockVersion: number;
  title?: string;
  slug?: string;
  locale?: string;
  description?: string | null;
  visibility?: PageVisibility;
  content?: PageContent | unknown;
}

export interface CreatePageDraftResult {
  page: LifecyclePage;
  revision: LifecyclePageRevision;
}

export interface UpdateDraftResult {
  page: LifecyclePage;
  revision: LifecyclePageRevision;
}

export interface SubmitForReviewInput {
  actorId: string;
  projectId: string;
  pageId: string;
  expectedLockVersion: number;
}

export interface SubmitForReviewResult {
  page: LifecyclePage;
  revision: LifecyclePageRevision;
}

export interface ApproveReviewInput {
  actorId: string;
  projectId: string;
  pageId: string;
  expectedLockVersion: number;
}

export interface ApproveReviewResult {
  page: LifecyclePage;
  revision: LifecyclePageRevision;
}

export interface RequestChangesInput {
  actorId: string;
  projectId: string;
  pageId: string;
  expectedLockVersion: number;
}

export interface RequestChangesResult {
  page: LifecyclePage;
  newDraftRevision: LifecyclePageRevision;
  reviewRevision: LifecyclePageRevision;
}

export type ContentReleaseStatus = 'DRAFT' | 'PUBLISHED' | 'ROLLED_BACK';

export interface LifecycleContentRelease {
  id: string;
  projectId: string;
  status: ContentReleaseStatus;
  createdById: string | null;
  createdAt: Date;
  publishedAt: Date | null;
  rolledBackAt: Date | null;
}

export interface LifecycleContentReleaseItem {
  releaseId: string;
  pageId: string;
  revisionId: string;
  previousRevisionId: string | null;
}

export interface PublishApprovedInput {
  actorId: string;
  projectId: string;
  pageId: string;
  expectedLockVersion: number;
}

export interface PublishApprovedResult {
  page: LifecyclePage;
  revision: LifecyclePageRevision;
  release: LifecycleContentRelease;
  releaseItem: LifecycleContentReleaseItem;
}

