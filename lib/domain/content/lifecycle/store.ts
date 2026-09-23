import {
  LifecyclePage,
  LifecyclePageRevision,
  LifecycleContentRelease,
  LifecycleContentReleaseItem,
  ContentReleaseStatus,
} from './types';
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
  publishedAt?: Date | null;
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

export interface CreatePublishedReleaseParams {
  projectId: string;
  status: ContentReleaseStatus;
  createdById: string;
  publishedAt: Date;
}

export interface CreateReleaseItemParams {
  releaseId: string;
  pageId: string;
  revisionId: string;
  previousRevisionId: string | null;
}

export interface SetPublishedPagePointersAtomicParams {
  projectId: string;
  pageId: string;
  expectedDraftRevisionId: string;
  expectedPreviousPublishedRevisionId: string | null;
  newPublishedRevisionId: string;
  updatedAt?: Date;
}

export interface SetScheduledPublishAtomicParams {
  projectId: string;
  pageId: string;
  expectedDraftRevisionId: string;
  scheduledRevisionId: string;
  scheduledPublishAt: Date;
  scheduledById: string;
  updatedAt?: Date;
}

export interface ClearScheduledPublishAtomicParams {
  projectId: string;
  pageId: string;
  expectedScheduledRevisionId: string;
  expectedScheduledPublishAt: Date;
  expectedScheduledById: string;
  updatedAt?: Date;
}

export interface SetScheduledPublishedPagePointersAtomicParams {
  projectId: string;
  pageId: string;
  expectedDraftRevisionId: string;
  expectedPreviousPublishedRevisionId: string | null;
  expectedScheduledRevisionId: string;
  expectedScheduledPublishAt: Date;
  expectedScheduledById: string;
  newPublishedRevisionId: string;
  updatedAt?: Date;
}

export interface SetUnpublishedPagePointersAtomicParams {
  projectId: string;
  pageId: string;
  expectedPublishedRevisionId: string;
  expectedDraftRevisionId: string | null;
  newDraftRevisionId: string;
  updatedAt: Date;
}

export interface PublishedReleaseLineage {
  release: LifecycleContentRelease;
  item: LifecycleContentReleaseItem;
}

export interface CreateRollbackReleaseParams {
  projectId: string;
  createdById: string;
  rolledBackAt: Date;
}

export interface SetRollbackPublishedPointerAtomicParams {
  projectId: string;
  pageId: string;
  expectedPublishedRevisionId: string;
  targetPublishedRevisionId: string;
  updatedAt: Date;
}

export interface SetDraftFromPublishedPointerAtomicParams {
  projectId: string;
  pageId: string;
  expectedPublishedRevisionId: string;
  newDraftRevisionId: string;
  updatedAt?: Date;
}

export interface RecordLifecycleAuditParams {
  action:
    | 'CONTENT_PAGE_CREATED'
    | 'CONTENT_DRAFT_UPDATED'
    | 'CONTENT_REVIEW_SUBMITTED'
    | 'CONTENT_CHANGES_REQUESTED'
    | 'CONTENT_REVIEW_APPROVED'
    | 'CONTENT_RELEASE_PUBLISHED'
    | 'CONTENT_RELEASE_ROLLED_BACK'
    | 'CONTENT_DRAFT_REOPENED'
    | 'CONTENT_PUBLISH_SCHEDULED'
    | 'CONTENT_PUBLISH_SCHEDULE_CANCELLED'
    | 'CONTENT_PAGE_UNPUBLISHED';
  scopeType: 'PROJECT';
  scopeId: string;
  resourceType: 'PAGE' | 'PAGE_REVISION' | 'CONTENT_RELEASE';
  resourceId: string;
  actorId: string;
  metadata: Record<string, unknown>;
}

export interface LifecycleRevisionReadProjection extends LifecyclePageRevision {
  pageTitle?: string;
  pageSlug?: string;
  draftRevisionId: string | null;
  publishedRevisionId: string | null;
  scheduledRevisionId: string | null;
  scheduledPublishAt: Date | null;
}

export interface ContentLifecycleStore {
  transaction<T>(fn: (txStore: ContentLifecycleStore) => Promise<T>): Promise<T>;
  findPageById(projectId: string, pageId: string): Promise<LifecyclePage | null>;
  findUserStatus?(userId: string): Promise<string | null>;
  createPageWithDraft(params: CreatePageWithDraftParams): Promise<{ page: LifecyclePage; revision: LifecyclePageRevision }>;
  findRevisionById(revisionId: string): Promise<LifecyclePageRevision | null>;
  updateDraftRevisionAtomic(params: UpdateDraftRevisionAtomicParams): Promise<{ updated: boolean; revision?: LifecyclePageRevision }>;
  transitionRevisionStatusAtomic(params: TransitionRevisionStatusAtomicParams): Promise<{ updated: boolean; revision?: LifecyclePageRevision }>;
  claimRevisionLockAtomic(params: ClaimRevisionLockAtomicParams): Promise<{ updated: boolean; revision?: LifecyclePageRevision }>;
  getNextRevisionNumber(pageId: string): Promise<number>;
  createDraftRevisionFromSource(params: CreateDraftRevisionFromSourceParams): Promise<LifecyclePageRevision>;
  setPageDraftRevisionPointer(params: SetPageDraftRevisionPointerParams): Promise<LifecyclePage>;
  touchPageUpdatedAt(projectId: string, pageId: string): Promise<LifecyclePage>;
  createPublishedRelease(params: CreatePublishedReleaseParams): Promise<LifecycleContentRelease>;
  createReleaseItem(params: CreateReleaseItemParams): Promise<LifecycleContentReleaseItem>;
  setPublishedPagePointersAtomic(params: SetPublishedPagePointersAtomicParams): Promise<{ updated: boolean; page?: LifecyclePage }>;
  setScheduledPublishAtomic?(params: SetScheduledPublishAtomicParams): Promise<{ updated: boolean; page?: LifecyclePage }>;
  clearScheduledPublishAtomic?(params: ClearScheduledPublishAtomicParams): Promise<{ updated: boolean; page?: LifecyclePage }>;
  setScheduledPublishedPagePointersAtomic?(params: SetScheduledPublishedPagePointersAtomicParams): Promise<{ updated: boolean; page?: LifecyclePage }>;
  setUnpublishedPagePointersAtomic?(params: SetUnpublishedPagePointersAtomicParams): Promise<{ updated: boolean; page?: LifecyclePage }>;
  findPublishedReleaseLineage?(projectId: string, pageId: string, revisionId: string): Promise<PublishedReleaseLineage[]>;
  createRollbackRelease?(params: CreateRollbackReleaseParams): Promise<LifecycleContentRelease>;
  setRollbackPublishedPointerAtomic?(params: SetRollbackPublishedPointerAtomicParams): Promise<{ updated: boolean; page?: LifecyclePage }>;
  setDraftFromPublishedPointerAtomic?(params: SetDraftFromPublishedPointerAtomicParams): Promise<{ updated: boolean; page?: LifecyclePage }>;
  listProjectReleases?(projectId: string): Promise<Array<{
    release: LifecycleContentRelease;
    items: Array<LifecycleContentReleaseItem & { pageTitle?: string; pageSlug?: string }>;
  }>>;
  listProjectRevisions?(projectId: string, pageId?: string): Promise<LifecycleRevisionReadProjection[]>;
  recordAudit(params: RecordLifecycleAuditParams): Promise<void>;
}
