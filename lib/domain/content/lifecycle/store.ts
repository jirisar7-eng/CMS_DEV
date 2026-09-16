import { LifecyclePage, LifecyclePageRevision } from './types';
import { PageContent } from '../contracts';

export interface CreatePageWithDraftParams {
  projectId: string;
  key: string;
  parentId: string | null;
  actorId: string;
  title: string;
  slug: string;
  locale: string;
  description: string | null;
  visibility: LifecyclePageRevision['visibility'];
  content: PageContent;
  schemaVersion: string;
}

export interface UpdateDraftRevisionAtomicParams {
  pageId: string;
  revisionId: string;
  expectedLockVersion: number;
  data: {
    title?: string;
    slug?: string;
    locale?: string;
    description?: string | null;
    visibility?: LifecyclePageRevision['visibility'];
    content?: PageContent;
    schemaVersion?: string;
  };
}

export interface TransitionRevisionStatusAtomicParams {
  pageId: string;
  revisionId: string;
  expectedStatus: LifecyclePageRevision['status'];
  targetStatus: LifecyclePageRevision['status'];
  expectedLockVersion: number;
  submittedAt?: Date | null;
  approvedAt?: Date | null;
}

export interface ClaimRevisionLockAtomicParams {
  pageId: string;
  revisionId: string;
  expectedStatus: LifecyclePageRevision['status'];
  expectedLockVersion: number;
}

export interface CreateDraftRevisionFromSourceParams {
  pageId: string;
  revisionNumber: number;
  actorId: string;
  derivedFromRevisionId: string;
  sourceRevision: LifecyclePageRevision;
}

export interface SetPageDraftRevisionPointerParams {
  projectId: string;
  pageId: string;
  draftRevisionId: string;
}

export interface RecordLifecycleAuditParams {
  action:
    | 'CONTENT_PAGE_CREATED'
    | 'CONTENT_DRAFT_UPDATED'
    | 'CONTENT_REVIEW_SUBMITTED'
    | 'CONTENT_CHANGES_REQUESTED'
    | 'CONTENT_REVIEW_APPROVED';
  scopeType: 'PROJECT';
  scopeId: string;
  resourceType: 'PAGE' | 'PAGE_REVISION';
  resourceId: string;
  actorId: string;
  metadata: Record<string, unknown>;
}

export interface ContentLifecycleStore {
  transaction<T>(fn: (txStore: ContentLifecycleStore) => Promise<T>): Promise<T>;
  findPageById(projectId: string, pageId: string): Promise<LifecyclePage | null>;
  createPageWithDraft(params: CreatePageWithDraftParams): Promise<{ page: LifecyclePage; revision: LifecyclePageRevision }>;
  findRevisionById(revisionId: string): Promise<LifecyclePageRevision | null>;
  updateDraftRevisionAtomic(params: UpdateDraftRevisionAtomicParams): Promise<{ updated: boolean; revision?: LifecyclePageRevision }>;
  transitionRevisionStatusAtomic(params: TransitionRevisionStatusAtomicParams): Promise<{ updated: boolean; revision?: LifecyclePageRevision }>;
  claimRevisionLockAtomic(params: ClaimRevisionLockAtomicParams): Promise<{ updated: boolean; revision?: LifecyclePageRevision }>;
  getNextRevisionNumber(pageId: string): Promise<number>;
  createDraftRevisionFromSource(params: CreateDraftRevisionFromSourceParams): Promise<LifecyclePageRevision>;
  setPageDraftRevisionPointer(params: SetPageDraftRevisionPointerParams): Promise<LifecyclePage>;
  touchPageUpdatedAt(projectId: string, pageId: string): Promise<LifecyclePage>;
  recordAudit(params: RecordLifecycleAuditParams): Promise<void>;
}
