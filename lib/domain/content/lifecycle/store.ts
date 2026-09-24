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
  reconcilePageMediaUsage?(projectId: string, pageId: string): Promise<void>;
}

export interface ExtractedMediaReference {
  assetId: string;
  blockId?: string;
  blockType?: string;
  field?: string;
}

/**
 * Canonical block-type to media-bearing field paths allowlist.
 * Explicit and extensible for CMS 1.0 canonical component model.
 * Speculative future fields MUST NOT be added here.
 */
export const CANONICAL_MEDIA_FIELDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  image: Object.freeze(["url"]),
});

/**
 * Matches canonical media URL format: ^/api/media/<assetId>$
 * Rejects query strings, extra path segments, external origins,
 * protocol-relative URLs, substring matches, and surrounding prose.
 */
export function matchCanonicalMediaUrl(val: unknown): string | null {
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  const match = trimmed.match(/^\/api\/media\/([a-zA-Z0-9_\-]+)$/);
  return match ? match[1] : null;
}

function traverseBlocks(blocks: unknown, results: ExtractedMediaReference[]): void {
  if (!Array.isArray(blocks)) return;

  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    const bId = typeof b.id === "string" ? b.id : undefined;
    const bType = typeof b.type === "string" ? b.type : undefined;

    // Check media-bearing fields for this block type
    if (bType && CANONICAL_MEDIA_FIELDS[bType] && b.data && typeof b.data === "object") {
      const data = b.data as Record<string, unknown>;
      const allowedFields = CANONICAL_MEDIA_FIELDS[bType];
      for (const field of allowedFields) {
        const val = data[field];
        const assetId = matchCanonicalMediaUrl(val);
        if (assetId) {
          results.push({
            assetId,
            blockId: bId,
            blockType: bType,
            field,
          });
        }
      }
    }

    // Recursively discover nested blocks in:
    // 1. block.children (standard canonical nested blocks)
    if (Array.isArray(b.children)) {
      traverseBlocks(b.children, results);
    }

    // 2. columns / nested slots (e.g. block.zones for Puck editor format)
    if (b.zones && typeof b.zones === "object") {
      for (const zone of Object.values(b.zones as Record<string, unknown>)) {
        if (Array.isArray(zone)) {
          traverseBlocks(zone, results);
        }
      }
    }

    // 3. nested slot/column structures inside block.data (e.g. data.children, data.slots, data.columns)
    if (b.data && typeof b.data === "object") {
      const d = b.data as Record<string, unknown>;
      if (Array.isArray(d.children)) {
        traverseBlocks(d.children, results);
      }
      if (d.slots && typeof d.slots === "object") {
        if (Array.isArray(d.slots)) {
          traverseBlocks(d.slots, results);
        } else {
          for (const slotItem of Object.values(d.slots as Record<string, unknown>)) {
            if (Array.isArray(slotItem)) {
              traverseBlocks(slotItem, results);
            }
          }
        }
      }
      if (Array.isArray(d.columns)) {
        for (const col of d.columns) {
          if (Array.isArray(col)) {
            traverseBlocks(col, results);
          } else if (col && typeof col === "object") {
            const colObj = col as Record<string, unknown>;
            if (Array.isArray(colObj.blocks)) {
              traverseBlocks(colObj.blocks, results);
            } else if (Array.isArray(colObj.children)) {
              traverseBlocks(colObj.children, results);
            }
          }
        }
      }
    }
  }
}

export function extractMediaReferences(content: unknown): ExtractedMediaReference[] {
  if (!content || typeof content !== "object") return [];

  const rawResults: ExtractedMediaReference[] = [];
  const c = content as Record<string, unknown>;

  if (Array.isArray(c.blocks)) {
    traverseBlocks(c.blocks, rawResults);
  } else if (Array.isArray(content)) {
    traverseBlocks(content, rawResults);
  }

  const seen = new Set<string>();
  const deduplicated: ExtractedMediaReference[] = [];
  for (const ref of rawResults) {
    const key = `${ref.assetId}:::${ref.blockId || ""}:::${ref.field || ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(ref);
    }
  }

  return deduplicated;
}

export function hasMediaReferences(content: unknown): boolean {
  return extractMediaReferences(content).length > 0;
}
