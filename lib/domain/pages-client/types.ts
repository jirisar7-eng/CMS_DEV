import type {
  PageDetail,
  PageSummary,
  PageTreeNode,
  PageContent,
  PageFilterCriteria,
  PageVisibility,
  PageStatus,
} from '../pages';

export type {
  PageDetail,
  PageSummary,
  PageTreeNode,
  PageContent,
  PageFilterCriteria,
  PageVisibility,
  PageStatus,
};

export type CanonicalVisibility =
  | 'PUBLIC'
  | 'UNLISTED'
  | 'PASSWORD_PROTECTED'
  | 'INTERNAL';

export interface AdminPageLifecycleState {
  activeRevisionId: string;
  revisionNumber: number;
  lockVersion: number;
  status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED';
  draftRevisionId: string | null;
  publishedRevisionId: string | null;
}

export interface AdminPageDetailResult {
  page: PageDetail;
  lifecycle: AdminPageLifecycleState;
}

export interface CreateAdminPageDraftInput {
  title: string;
  slug: string;
  locale?: string;
  visibility: PageVisibility | CanonicalVisibility;
  content?: PageContent;
  parentId?: string | null;
  description?: string;
  key?: string;
}

export interface UpdateAdminPageDraftInput {
  title?: string;
  slug?: string;
  locale?: string;
  description?: string;
  visibility?: PageVisibility | CanonicalVisibility;
  content?: PageContent;
}

export interface AdminPageMutationResult {
  pageId: string;
  revisionId: string;
  revisionNumber: number;
  lockVersion: number;
  status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED';
}

export interface AdminPagePublishResult extends AdminPageMutationResult {
  releaseId: string;
}

export interface AdminPageRollbackResult {
  pageId: string;
  fromRevisionId: string;
  restoredRevisionId: string;
  restoredRevisionNumber: number;
  status: 'PUBLISHED';
  rollbackReleaseId: string;
}

export interface AdminPageReopenDraftResult {
  pageId: string;
  publishedRevisionId: string;
  draft: {
    revisionId: string;
    revisionNumber: number;
    lockVersion: number;
    status: 'DRAFT';
    derivedFromRevisionId: string;
  };
}

export interface AdminPageRequestChangesResult {
  pageId: string;
  reviewRevisionId: string;
  draft: {
    revisionId: string;
    revisionNumber: number;
    lockVersion: number;
    status: 'DRAFT';
    derivedFromRevisionId?: string | null;
  };
}

export interface AdminPagesClient {
  readonly projectId: string;

  getPages(criteria?: Partial<PageFilterCriteria>): Promise<PageSummary[]>;
  getPageTree(): Promise<PageTreeNode[]>;
  getPageById(pageId: string): Promise<AdminPageDetailResult>;

  createPageDraft(
    input: CreateAdminPageDraftInput
  ): Promise<AdminPageMutationResult>;
  updateDraft(
    pageId: string,
    expectedLockVersion: number,
    input: UpdateAdminPageDraftInput
  ): Promise<AdminPageMutationResult>;

  submitForReview(
    pageId: string,
    expectedLockVersion: number
  ): Promise<AdminPageMutationResult>;
  requestChanges(
    pageId: string,
    expectedLockVersion: number
  ): Promise<AdminPageRequestChangesResult>;
  approveReview(
    pageId: string,
    expectedLockVersion: number
  ): Promise<AdminPageMutationResult>;
  publishApproved(
    pageId: string,
    expectedLockVersion: number
  ): Promise<AdminPagePublishResult>;
  rollbackPublished(
    pageId: string,
    expectedPublishedRevisionId: string
  ): Promise<AdminPageRollbackResult>;
  reopenDraft(
    pageId: string,
    expectedPublishedRevisionId: string
  ): Promise<AdminPageReopenDraftResult>;
}
