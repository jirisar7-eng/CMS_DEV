import { ContentLifecycleStore, hasMediaReferences } from './store';
import {
  ContentLifecycleError,
  CreatePageDraftInput,
  CreatePageDraftResult,
  UpdateDraftInput,
  UpdateDraftResult,
  SubmitForReviewInput,
  SubmitForReviewResult,
  ApproveReviewInput,
  ApproveReviewResult,
  RequestChangesInput,
  RequestChangesResult,
  PublishApprovedInput,
  PublishApprovedResult,
  SchedulePublishInput,
  SchedulePublishResult,
  CancelScheduledPublishInput,
  CancelScheduledPublishResult,
  PublishScheduledInput,
  PublishScheduledResult,
  UnpublishPageInput,
  UnpublishPageResult,
  RollbackPublishedInput,
  RollbackPublishedResult,
  CreateDraftFromPublishedInput,
  CreateDraftFromPublishedResult,
} from './types';
import { validatePageContent, validateSlugSegment } from '../validation';
import { PageContent } from '../contracts';
import type { PermissionKey } from '@/lib/auth/rbac';

export type PermissionChecker = (
  actorId: string,
  permission: PermissionKey,
  projectId: string | null
) => Promise<boolean>;

export interface ContentLifecycleServiceDependencies {
  store: ContentLifecycleStore;
  hasPermission: PermissionChecker;
}

const VALID_VISIBILITIES = new Set(['PUBLIC', 'UNLISTED', 'PASSWORD_PROTECTED', 'INTERNAL']);

export class ContentLifecycleService {
  private readonly store: ContentLifecycleStore;
  private readonly hasPermission: PermissionChecker;

  constructor(dependencies: ContentLifecycleServiceDependencies) {
    this.store = dependencies.store;
    this.hasPermission = dependencies.hasPermission;
  }

  async createPageDraft(input: CreatePageDraftInput): Promise<CreatePageDraftResult> {
    // 1. Context validation
    if (!input.actorId || !input.actorId.trim() || !input.projectId || !input.projectId.trim()) {
      throw new ContentLifecycleError('INVALID_INPUT', 'actorId and projectId are required');
    }
    const actorId = input.actorId.trim();
    const projectId = input.projectId.trim();

    // 2. Authorization check
    const allowed = await this.hasPermission(actorId, 'content.create', projectId);
    if (!allowed) {
      throw new ContentLifecycleError('FORBIDDEN', 'Permission content.create required');
    }

    // 3. Input validation
    if (typeof input.key !== 'string' || !input.key.trim() || input.key.length > 255) {
      throw new ContentLifecycleError('INVALID_INPUT', 'Invalid key');
    }
    const key = input.key.trim();

    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 255) {
      throw new ContentLifecycleError('INVALID_INPUT', 'Invalid title');
    }
    const title = input.title.trim();

    if (typeof input.locale !== 'string' || !input.locale.trim() || input.locale.length > 50) {
      throw new ContentLifecycleError('INVALID_INPUT', 'Invalid locale');
    }
    const locale = input.locale.trim();

    if (!VALID_VISIBILITIES.has(input.visibility)) {
      throw new ContentLifecycleError('INVALID_INPUT', 'Invalid visibility');
    }

    if (!validateSlugSegment(input.slug)) {
      throw new ContentLifecycleError('INVALID_INPUT', 'Invalid slug segment');
    }

    let validatedContent: PageContent;
    try {
      validatedContent = validatePageContent(input.content);
    } catch (err: any) {
      throw new ContentLifecycleError('INVALID_INPUT', `Invalid page content: ${err.message}`);
    }

    let description: string | null = null;
    if (input.description !== undefined && input.description !== null) {
      if (typeof input.description !== 'string' || input.description.length > 2000) {
        throw new ContentLifecycleError('INVALID_INPUT', 'Invalid description');
      }
      description = input.description;
    }

    let parentId: string | null = null;
    if (input.parentId !== undefined && input.parentId !== null && input.parentId.trim() !== '') {
      parentId = input.parentId.trim();
      // Parent Project Isolation check
      const parent = await this.store.findPageById(projectId, parentId);
      if (!parent) {
        throw new ContentLifecycleError('PARENT_SCOPE_VIOLATION', 'Parent page not found in this project');
      }
    }

    // 4. Atomic transaction
    return this.store.transaction(async (txStore) => {
      const { page, revision } = await txStore.createPageWithDraft({
        projectId,
        key,
        parentId,
        actorId,
        title,
        slug: input.slug,
        locale,
        description,
        visibility: input.visibility,
        content: validatedContent,
        schemaVersion: validatedContent.schemaVersion,
      });

      // Pointer integrity verification
      if (revision.pageId !== page.id || page.draftRevisionId !== revision.id) {
        throw new ContentLifecycleError(
          'POINTER_INTEGRITY_VIOLATION',
          'Pointer integrity violation between page and draft revision'
        );
      }

      // Record audit
      await txStore.recordAudit({
        action: 'CONTENT_PAGE_CREATED',
        scopeType: 'PROJECT',
        scopeId: projectId,
        resourceType: 'PAGE',
        resourceId: page.id,
        actorId,
        metadata: {
          pageId: page.id,
          revisionId: revision.id,
          revisionNumber: 1,
          lockVersion: 1,
          key: page.key,
          parentId: page.parentId ?? null,
        },
      });

      await this.reconcileMediaUsage(txStore, projectId, page.id, validatedContent);
      return { page, revision };
    });
  }

  async updateDraft(input: UpdateDraftInput): Promise<UpdateDraftResult> {
    // 1. Context validation
    if (
      !input.actorId ||
      !input.actorId.trim() ||
      !input.projectId ||
      !input.projectId.trim() ||
      !input.pageId ||
      !input.pageId.trim()
    ) {
      throw new ContentLifecycleError('INVALID_INPUT', 'actorId, projectId and pageId are required');
    }
    const actorId = input.actorId.trim();
    const projectId = input.projectId.trim();
    const pageId = input.pageId.trim();

    if (
      typeof input.expectedLockVersion !== 'number' ||
      !Number.isInteger(input.expectedLockVersion) ||
      input.expectedLockVersion < 1
    ) {
      throw new ContentLifecycleError('INVALID_INPUT', 'expectedLockVersion must be a positive integer');
    }

    // 2. Mutable fields presence
    const hasMutableField =
      input.title !== undefined ||
      input.slug !== undefined ||
      input.locale !== undefined ||
      input.description !== undefined ||
      input.visibility !== undefined ||
      input.content !== undefined;

    if (!hasMutableField) {
      throw new ContentLifecycleError('INVALID_INPUT', 'At least one mutable field must be provided');
    }

    // 3. Authorization check
    const allowed = await this.hasPermission(actorId, 'content.edit', projectId);
    if (!allowed) {
      throw new ContentLifecycleError('FORBIDDEN', 'Permission content.edit required');
    }

    // 4. Validate mutable fields before mutation
    const updateData: {
      title?: string;
      slug?: string;
      locale?: string;
      description?: string | null;
      visibility?: UpdateDraftInput['visibility'];
      content?: PageContent;
      schemaVersion?: string;
    } = {};
    const changedFields: string[] = [];

    if (input.title !== undefined) {
      if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 255) {
        throw new ContentLifecycleError('INVALID_INPUT', 'Invalid title');
      }
      updateData.title = input.title.trim();
      changedFields.push('title');
    }

    if (input.locale !== undefined) {
      if (typeof input.locale !== 'string' || !input.locale.trim() || input.locale.length > 50) {
        throw new ContentLifecycleError('INVALID_INPUT', 'Invalid locale');
      }
      updateData.locale = input.locale.trim();
      changedFields.push('locale');
    }

    if (input.slug !== undefined) {
      if (!validateSlugSegment(input.slug)) {
        throw new ContentLifecycleError('INVALID_INPUT', 'Invalid slug segment');
      }
      updateData.slug = input.slug;
      changedFields.push('slug');
    }

    if (input.visibility !== undefined) {
      if (!VALID_VISIBILITIES.has(input.visibility)) {
        throw new ContentLifecycleError('INVALID_INPUT', 'Invalid visibility');
      }
      updateData.visibility = input.visibility;
      changedFields.push('visibility');
    }

    if (input.description !== undefined) {
      if (input.description !== null && (typeof input.description !== 'string' || input.description.length > 2000)) {
        throw new ContentLifecycleError('INVALID_INPUT', 'Invalid description');
      }
      updateData.description = input.description;
      changedFields.push('description');
    }

    if (input.content !== undefined) {
      let validatedContent: PageContent;
      try {
        validatedContent = validatePageContent(input.content);
      } catch (err: any) {
        throw new ContentLifecycleError('INVALID_INPUT', `Invalid page content: ${err.message}`);
      }
      updateData.content = validatedContent;
      updateData.schemaVersion = validatedContent.schemaVersion;
      changedFields.push('content');
    }

    // 5. Atomic transaction
    return this.store.transaction(async (txStore) => {
      // Scoped page lookup
      const page = await txStore.findPageById(projectId, pageId);
      if (!page) {
        throw new ContentLifecycleError('PAGE_NOT_FOUND', 'Page not found in this project');
      }

      if (!page.draftRevisionId) {
        throw new ContentLifecycleError('NO_DRAFT', 'Page has no draft revision pointer');
      }

      const draftRevision = await txStore.findRevisionById(page.draftRevisionId);
      if (!draftRevision) {
        throw new ContentLifecycleError('NO_DRAFT', 'Draft revision not found');
      }

      // Pointer integrity
      if (draftRevision.id !== page.draftRevisionId || draftRevision.pageId !== page.id) {
        throw new ContentLifecycleError(
          'POINTER_INTEGRITY_VIOLATION',
          'Draft pointer does not match revision pageId'
        );
      }

      // Status check
      if (draftRevision.status !== 'DRAFT') {
        throw new ContentLifecycleError(
          'DRAFT_STATE_INVALID',
          `Cannot edit revision in ${draftRevision.status} status`
        );
      }

      // Optimistic lock conditional update
      const updateResult = await txStore.updateDraftRevisionAtomic({
        pageId: page.id,
        revisionId: draftRevision.id,
        expectedLockVersion: input.expectedLockVersion,
        data: updateData,
      });

      if (!updateResult.updated || !updateResult.revision) {
        throw new ContentLifecycleError(
          'LOCK_CONFLICT',
          'Revision was modified by another operation or expectedLockVersion mismatch'
        );
      }

      // Touch page.updatedAt
      const touchedPage = await txStore.touchPageUpdatedAt(projectId, page.id);

      // Record audit
      await txStore.recordAudit({
        action: 'CONTENT_DRAFT_UPDATED',
        scopeType: 'PROJECT',
        scopeId: projectId,
        resourceType: 'PAGE_REVISION',
        resourceId: draftRevision.id,
        actorId,
        metadata: {
          pageId: page.id,
          revisionId: draftRevision.id,
          revisionNumber: draftRevision.revisionNumber,
          lockVersion: updateResult.revision.lockVersion,
          changedFields,
        },
      });

      await this.reconcileMediaUsage(txStore, projectId, page.id, updateData.content as PageContent | undefined);
      return {
        page: touchedPage,
        revision: updateResult.revision,
      };
    });
  }

  async submitForReview(input: SubmitForReviewInput): Promise<SubmitForReviewResult> {
    // 1. Context validation
    if (
      !input.actorId ||
      !input.actorId.trim() ||
      !input.projectId ||
      !input.projectId.trim() ||
      !input.pageId ||
      !input.pageId.trim()
    ) {
      throw new ContentLifecycleError('INVALID_INPUT', 'actorId, projectId and pageId are required');
    }
    const actorId = input.actorId.trim();
    const projectId = input.projectId.trim();
    const pageId = input.pageId.trim();

    if (
      typeof input.expectedLockVersion !== 'number' ||
      !Number.isInteger(input.expectedLockVersion) ||
      input.expectedLockVersion < 1
    ) {
      throw new ContentLifecycleError('INVALID_INPUT', 'expectedLockVersion must be a positive integer');
    }

    // 2. Authorization check (content.edit)
    const allowed = await this.hasPermission(actorId, 'content.edit', projectId);
    if (!allowed) {
      throw new ContentLifecycleError('FORBIDDEN', 'Permission content.edit required');
    }

    // 3. Atomic transaction
    return this.store.transaction(async (txStore) => {
      // Scoped page lookup
      const page = await txStore.findPageById(projectId, pageId);
      if (!page) {
        throw new ContentLifecycleError('PAGE_NOT_FOUND', 'Page not found in this project');
      }

      if (!page.draftRevisionId) {
        throw new ContentLifecycleError('NO_DRAFT', 'Page has no draft revision pointer');
      }

      const activeRevision = await txStore.findRevisionById(page.draftRevisionId);
      if (!activeRevision) {
        throw new ContentLifecycleError('NO_DRAFT', 'Draft revision not found');
      }

      // Pointer integrity
      if (activeRevision.id !== page.draftRevisionId || activeRevision.pageId !== page.id) {
        throw new ContentLifecycleError(
          'POINTER_INTEGRITY_VIOLATION',
          'Draft pointer does not match revision pageId'
        );
      }

      // Status check (must be DRAFT)
      if (activeRevision.status !== 'DRAFT') {
        throw new ContentLifecycleError(
          'STATE_TRANSITION_INVALID',
          `Cannot submit revision in ${activeRevision.status} status for review`
        );
      }

      // Atomic transition
      const transitionResult = await txStore.transitionRevisionStatusAtomic({
        pageId: page.id,
        revisionId: activeRevision.id,
        expectedStatus: 'DRAFT',
        targetStatus: 'IN_REVIEW',
        expectedLockVersion: input.expectedLockVersion,
        submittedAt: new Date(),
      });

      if (!transitionResult.updated || !transitionResult.revision) {
        throw new ContentLifecycleError(
          'LOCK_CONFLICT',
          'Revision was modified by another operation or expectedLockVersion mismatch'
        );
      }

      // Touch page.updatedAt
      const touchedPage = await txStore.touchPageUpdatedAt(projectId, page.id);

      // Record audit
      await txStore.recordAudit({
        action: 'CONTENT_REVIEW_SUBMITTED',
        scopeType: 'PROJECT',
        scopeId: projectId,
        resourceType: 'PAGE_REVISION',
        resourceId: activeRevision.id,
        actorId,
        metadata: {
          pageId: page.id,
          revisionId: activeRevision.id,
          revisionNumber: activeRevision.revisionNumber,
          lockVersion: transitionResult.revision.lockVersion,
          fromStatus: 'DRAFT',
          toStatus: 'IN_REVIEW',
        },
      });

      return {
        page: touchedPage,
        revision: transitionResult.revision,
      };
    });
  }

  async approveReview(input: ApproveReviewInput): Promise<ApproveReviewResult> {
    // 1. Context validation
    if (
      !input.actorId ||
      !input.actorId.trim() ||
      !input.projectId ||
      !input.projectId.trim() ||
      !input.pageId ||
      !input.pageId.trim()
    ) {
      throw new ContentLifecycleError('INVALID_INPUT', 'actorId, projectId and pageId are required');
    }
    const actorId = input.actorId.trim();
    const projectId = input.projectId.trim();
    const pageId = input.pageId.trim();

    if (
      typeof input.expectedLockVersion !== 'number' ||
      !Number.isInteger(input.expectedLockVersion) ||
      input.expectedLockVersion < 1
    ) {
      throw new ContentLifecycleError('INVALID_INPUT', 'expectedLockVersion must be a positive integer');
    }

    // 2. Authorization check (content.approve)
    const allowed = await this.hasPermission(actorId, 'content.approve', projectId);
    if (!allowed) {
      throw new ContentLifecycleError('FORBIDDEN', 'Permission content.approve required');
    }

    // 3. Atomic transaction
    return this.store.transaction(async (txStore) => {
      // Scoped page lookup
      const page = await txStore.findPageById(projectId, pageId);
      if (!page) {
        throw new ContentLifecycleError('PAGE_NOT_FOUND', 'Page not found in this project');
      }

      if (!page.draftRevisionId) {
        throw new ContentLifecycleError('NO_DRAFT', 'Page has no draft revision pointer');
      }

      const activeRevision = await txStore.findRevisionById(page.draftRevisionId);
      if (!activeRevision) {
        throw new ContentLifecycleError('NO_DRAFT', 'Draft revision not found');
      }

      // Pointer integrity
      if (activeRevision.id !== page.draftRevisionId || activeRevision.pageId !== page.id) {
        throw new ContentLifecycleError(
          'POINTER_INTEGRITY_VIOLATION',
          'Draft pointer does not match revision pageId'
        );
      }

      // Status check (must be IN_REVIEW)
      if (activeRevision.status !== 'IN_REVIEW') {
        throw new ContentLifecycleError(
          'STATE_TRANSITION_INVALID',
          `Cannot approve revision in ${activeRevision.status} status`
        );
      }

      // Atomic transition
      const transitionResult = await txStore.transitionRevisionStatusAtomic({
        pageId: page.id,
        revisionId: activeRevision.id,
        expectedStatus: 'IN_REVIEW',
        targetStatus: 'APPROVED',
        expectedLockVersion: input.expectedLockVersion,
        approvedAt: new Date(),
      });

      if (!transitionResult.updated || !transitionResult.revision) {
        throw new ContentLifecycleError(
          'LOCK_CONFLICT',
          'Revision was modified by another operation or expectedLockVersion mismatch'
        );
      }

      // Touch page.updatedAt
      const touchedPage = await txStore.touchPageUpdatedAt(projectId, page.id);

      // Record audit
      await txStore.recordAudit({
        action: 'CONTENT_REVIEW_APPROVED',
        scopeType: 'PROJECT',
        scopeId: projectId,
        resourceType: 'PAGE_REVISION',
        resourceId: activeRevision.id,
        actorId,
        metadata: {
          pageId: page.id,
          revisionId: activeRevision.id,
          revisionNumber: activeRevision.revisionNumber,
          lockVersion: transitionResult.revision.lockVersion,
          fromStatus: 'IN_REVIEW',
          toStatus: 'APPROVED',
        },
      });

      return {
        page: touchedPage,
        revision: transitionResult.revision,
      };
    });
  }

  async requestChanges(input: RequestChangesInput): Promise<RequestChangesResult> {
    // 1. Context validation
    if (
      !input.actorId ||
      !input.actorId.trim() ||
      !input.projectId ||
      !input.projectId.trim() ||
      !input.pageId ||
      !input.pageId.trim()
    ) {
      throw new ContentLifecycleError('INVALID_INPUT', 'actorId, projectId and pageId are required');
    }
    const actorId = input.actorId.trim();
    const projectId = input.projectId.trim();
    const pageId = input.pageId.trim();

    if (
      typeof input.expectedLockVersion !== 'number' ||
      !Number.isInteger(input.expectedLockVersion) ||
      input.expectedLockVersion < 1
    ) {
      throw new ContentLifecycleError('INVALID_INPUT', 'expectedLockVersion must be a positive integer');
    }

    // 2. Authorization check (content.review)
    const allowed = await this.hasPermission(actorId, 'content.review', projectId);
    if (!allowed) {
      throw new ContentLifecycleError('FORBIDDEN', 'Permission content.review required');
    }

    // 3. Atomic transaction
    return this.store.transaction(async (txStore) => {
      // Scoped page lookup
      const page = await txStore.findPageById(projectId, pageId);
      if (!page) {
        throw new ContentLifecycleError('PAGE_NOT_FOUND', 'Page not found in this project');
      }

      if (!page.draftRevisionId) {
        throw new ContentLifecycleError('NO_DRAFT', 'Page has no draft revision pointer');
      }

      const activeRevision = await txStore.findRevisionById(page.draftRevisionId);
      if (!activeRevision) {
        throw new ContentLifecycleError('NO_DRAFT', 'Draft revision not found');
      }

      // Pointer integrity
      if (activeRevision.id !== page.draftRevisionId || activeRevision.pageId !== page.id) {
        throw new ContentLifecycleError(
          'POINTER_INTEGRITY_VIOLATION',
          'Draft pointer does not match revision pageId'
        );
      }

      // Status check (must be IN_REVIEW)
      if (activeRevision.status !== 'IN_REVIEW') {
        throw new ContentLifecycleError(
          'STATE_TRANSITION_INVALID',
          `Cannot request changes on revision in ${activeRevision.status} status`
        );
      }

      // Atomically claim lock on the IN_REVIEW revision
      const lockClaim = await txStore.claimRevisionLockAtomic({
        pageId: page.id,
        revisionId: activeRevision.id,
        expectedStatus: 'IN_REVIEW',
        expectedLockVersion: input.expectedLockVersion,
      });

      if (!lockClaim.updated || !lockClaim.revision) {
        throw new ContentLifecycleError(
          'LOCK_CONFLICT',
          'Revision was modified by another operation or expectedLockVersion mismatch'
        );
      }

      const updatedReviewRevision = lockClaim.revision;

      // Get next revision number
      const nextRevisionNumber = await txStore.getNextRevisionNumber(page.id);

      // Create new DRAFT revision copying snapshot fields
      const newDraft = await txStore.createDraftRevisionFromSource({
        pageId: page.id,
        revisionNumber: nextRevisionNumber,
        actorId,
        derivedFromRevisionId: activeRevision.id,
        sourceRevision: activeRevision,
      });

      // Move draftRevisionId pointer to new draft
      const updatedPage = await txStore.setPageDraftRevisionPointer({
        projectId,
        pageId: page.id,
        draftRevisionId: newDraft.id,
      });

      // Touch page.updatedAt
      const touchedPage = await txStore.touchPageUpdatedAt(projectId, page.id);

      // Record audit
      await txStore.recordAudit({
        action: 'CONTENT_CHANGES_REQUESTED',
        scopeType: 'PROJECT',
        scopeId: projectId,
        resourceType: 'PAGE_REVISION',
        resourceId: activeRevision.id,
        actorId,
        metadata: {
          pageId: page.id,
          revisionId: activeRevision.id,
          revisionNumber: activeRevision.revisionNumber,
          lockVersion: updatedReviewRevision.lockVersion,
          newDraftRevisionId: newDraft.id,
          newDraftRevisionNumber: newDraft.revisionNumber,
          fromStatus: 'IN_REVIEW',
          toStatus: 'IN_REVIEW',
        },
      });

      return {
        page: touchedPage,
        newDraftRevision: newDraft,
        reviewRevision: updatedReviewRevision,
      };
    });
  }

  async publishApproved(input: PublishApprovedInput): Promise<PublishApprovedResult> {
    // 1. Context validation
    if (
      !input.actorId ||
      !input.actorId.trim() ||
      !input.projectId ||
      !input.projectId.trim() ||
      !input.pageId ||
      !input.pageId.trim()
    ) {
      throw new ContentLifecycleError('INVALID_INPUT', 'actorId, projectId and pageId are required');
    }
    const actorId = input.actorId.trim();
    const projectId = input.projectId.trim();
    const pageId = input.pageId.trim();

    if (
      typeof input.expectedLockVersion !== 'number' ||
      !Number.isInteger(input.expectedLockVersion) ||
      input.expectedLockVersion < 1
    ) {
      throw new ContentLifecycleError('INVALID_INPUT', 'expectedLockVersion must be a positive integer');
    }

    // 2. Authorization check (content.publish)
    const allowed = await this.hasPermission(actorId, 'content.publish', projectId);
    if (!allowed) {
      throw new ContentLifecycleError('FORBIDDEN', 'Permission content.publish required');
    }

    // 3. Atomic transaction
    return this.store.transaction(async (txStore) => {
      // Scoped page lookup
      const page = await txStore.findPageById(projectId, pageId);
      if (!page) {
        throw new ContentLifecycleError('PAGE_NOT_FOUND', 'Page not found in this project');
      }

      // Active approved revision pointer
      if (!page.draftRevisionId) {
        throw new ContentLifecycleError('NO_DRAFT', 'Page has no active unpublished revision pointer');
      }

      const activeRevision = await txStore.findRevisionById(page.draftRevisionId);
      if (!activeRevision) {
        throw new ContentLifecycleError(
          'POINTER_INTEGRITY_VIOLATION',
          'Active draft pointer references non-existent revision'
        );
      }

      // Pointer integrity
      if (activeRevision.id !== page.draftRevisionId || activeRevision.pageId !== page.id) {
        throw new ContentLifecycleError(
          'POINTER_INTEGRITY_VIOLATION',
          'Active revision pointer does not match revision pageId'
        );
      }

      // Status check (must be APPROVED)
      if (activeRevision.status !== 'APPROVED') {
        throw new ContentLifecycleError(
          'STATE_TRANSITION_INVALID',
          `Cannot publish revision in ${activeRevision.status} status`
        );
      }

      // Previous published pointer validation
      const previousPublishedRevisionId = page.publishedRevisionId;
      if (previousPublishedRevisionId !== null) {
        const previousRevision = await txStore.findRevisionById(previousPublishedRevisionId);
        if (
          !previousRevision ||
          previousRevision.pageId !== page.id ||
          previousRevision.status !== 'PUBLISHED'
        ) {
          throw new ContentLifecycleError(
            'POINTER_INTEGRITY_VIOLATION',
            'Previous published revision pointer is invalid'
          );
        }
      }

      // Publish timestamp
      const publishedAt = new Date();

      // Atomic revision transition
      const transitionResult = await txStore.transitionRevisionStatusAtomic({
        pageId: page.id,
        revisionId: activeRevision.id,
        expectedStatus: 'APPROVED',
        targetStatus: 'PUBLISHED',
        expectedLockVersion: input.expectedLockVersion,
        publishedAt,
      });

      if (!transitionResult.updated || !transitionResult.revision) {
        throw new ContentLifecycleError(
          'LOCK_CONFLICT',
          'Revision was modified by another operation or expectedLockVersion mismatch'
        );
      }

      // Create ContentRelease
      const release = await txStore.createPublishedRelease({
        projectId,
        status: 'PUBLISHED',
        createdById: actorId,
        publishedAt,
      });

      // Create ContentReleaseItem
      const releaseItem = await txStore.createReleaseItem({
        releaseId: release.id,
        pageId: page.id,
        revisionId: activeRevision.id,
        previousRevisionId: previousPublishedRevisionId,
      });

      // Page pointer CAS
      const pointerResult = await txStore.setPublishedPagePointersAtomic({
        projectId,
        pageId: page.id,
        expectedDraftRevisionId: activeRevision.id,
        expectedPreviousPublishedRevisionId: previousPublishedRevisionId,
        newPublishedRevisionId: activeRevision.id,
        updatedAt: publishedAt,
      });

      if (!pointerResult.updated || !pointerResult.page) {
        throw new ContentLifecycleError(
          'LOCK_CONFLICT',
          'Page draft or published pointers changed concurrently'
        );
      }

      // Record audit inside transaction
      await txStore.recordAudit({
        action: 'CONTENT_RELEASE_PUBLISHED',
        scopeType: 'PROJECT',
        scopeId: projectId,
        resourceType: 'CONTENT_RELEASE',
        resourceId: release.id,
        actorId,
        metadata: {
          pageId: page.id,
          releaseId: release.id,
          revisionId: activeRevision.id,
          revisionNumber: activeRevision.revisionNumber,
          previousRevisionId: previousPublishedRevisionId,
          lockVersion: transitionResult.revision.lockVersion,
          fromStatus: 'APPROVED',
          toStatus: 'PUBLISHED',
        },
      });

      await this.reconcileMediaUsage(txStore, projectId, page.id);
      return {
        page: pointerResult.page,
        revision: transitionResult.revision,
        release,
        releaseItem,
      };
    });
  }

  async schedulePublish(input: SchedulePublishInput): Promise<SchedulePublishResult> {
    if (
      !input.actorId ||
      !input.actorId.trim() ||
      !input.projectId ||
      !input.projectId.trim() ||
      !input.pageId ||
      !input.pageId.trim()
    ) {
      throw new ContentLifecycleError(
        'INVALID_INPUT',
        'actorId, projectId and pageId are required'
      );
    }

    if (
      typeof input.expectedLockVersion !== 'number' ||
      !Number.isInteger(input.expectedLockVersion) ||
      input.expectedLockVersion < 1
    ) {
      throw new ContentLifecycleError(
        'INVALID_INPUT',
        'expectedLockVersion must be a positive integer'
      );
    }

    if (
      !(input.publishAt instanceof Date) ||
      Number.isNaN(input.publishAt.getTime()) ||
      input.publishAt.getTime() <= Date.now()
    ) {
      throw new ContentLifecycleError(
        'INVALID_INPUT',
        'publishAt must be a valid future date'
      );
    }

    const actorId = input.actorId.trim();
    const projectId = input.projectId.trim();
    const pageId = input.pageId.trim();

    const allowed = await this.hasPermission(actorId, 'content.publish', projectId);
    if (!allowed) {
      throw new ContentLifecycleError(
        'FORBIDDEN',
        'Permission content.publish required'
      );
    }

    return this.store.transaction(async (txStore) => {
      const page = await txStore.findPageById(projectId, pageId);
      if (!page) {
        throw new ContentLifecycleError(
          'PAGE_NOT_FOUND',
          'Page not found in this project'
        );
      }

      const scheduledRevisionId = page.scheduledRevisionId ?? null;
      const scheduledPublishAt = page.scheduledPublishAt ?? null;
      const scheduledById = page.scheduledById ?? null;
      const scheduleFields = [
        scheduledRevisionId,
        scheduledPublishAt,
        scheduledById,
      ];
      const populatedScheduleFields = scheduleFields.filter(
        (value) => value !== null
      ).length;

      if (populatedScheduleFields !== 0 && populatedScheduleFields !== 3) {
        throw new ContentLifecycleError(
          'POINTER_INTEGRITY_VIOLATION',
          'Page contains a partial publish schedule'
        );
      }

      if (populatedScheduleFields === 3) {
        throw new ContentLifecycleError(
          'STATE_TRANSITION_INVALID',
          'Page already has a scheduled publication'
        );
      }

      if (!page.draftRevisionId) {
        throw new ContentLifecycleError(
          'NO_DRAFT',
          'Page has no active unpublished revision pointer'
        );
      }

      const revision = await txStore.findRevisionById(page.draftRevisionId);
      if (
        !revision ||
        revision.id !== page.draftRevisionId ||
        revision.pageId !== page.id
      ) {
        throw new ContentLifecycleError(
          'POINTER_INTEGRITY_VIOLATION',
          'Active revision pointer is invalid'
        );
      }

      if (revision.status !== 'APPROVED') {
        throw new ContentLifecycleError(
          'STATE_TRANSITION_INVALID',
          `Cannot schedule revision in ${revision.status} status`
        );
      }

      if (revision.lockVersion !== input.expectedLockVersion) {
        throw new ContentLifecycleError(
          'LOCK_CONFLICT',
          'Revision was modified concurrently'
        );
      }

      if (!txStore.setScheduledPublishAtomic) {
        throw new Error('Store does not implement setScheduledPublishAtomic');
      }

      const pointerResult = await txStore.setScheduledPublishAtomic({
        projectId,
        pageId: page.id,
        expectedDraftRevisionId: revision.id,
        scheduledRevisionId: revision.id,
        scheduledPublishAt: input.publishAt,
        scheduledById: actorId,
      });

      if (!pointerResult.updated || !pointerResult.page) {
        throw new ContentLifecycleError(
          'LOCK_CONFLICT',
          'Page pointers or schedule changed concurrently'
        );
      }

      await txStore.recordAudit({
        action: 'CONTENT_PUBLISH_SCHEDULED',
        scopeType: 'PROJECT',
        scopeId: projectId,
        resourceType: 'PAGE',
        resourceId: page.id,
        actorId,
        metadata: {
          pageId: page.id,
          revisionId: revision.id,
          revisionNumber: revision.revisionNumber,
          lockVersion: revision.lockVersion,
          scheduledPublishAt: input.publishAt.toISOString(),
          scheduledById: actorId,
        },
      });

      await this.reconcileMediaUsage(txStore, projectId, page.id);
      return {
        page: pointerResult.page,
        revision,
      };
    });
  }

  async cancelScheduledPublish(
    input: CancelScheduledPublishInput
  ): Promise<CancelScheduledPublishResult> {
    if (
      !input.actorId ||
      !input.actorId.trim() ||
      !input.projectId ||
      !input.projectId.trim() ||
      !input.pageId ||
      !input.pageId.trim() ||
      !input.expectedScheduledRevisionId ||
      !input.expectedScheduledRevisionId.trim()
    ) {
      throw new ContentLifecycleError(
        'INVALID_INPUT',
        'actorId, projectId, pageId and expectedScheduledRevisionId are required'
      );
    }

    if (
      !(input.expectedScheduledPublishAt instanceof Date) ||
      Number.isNaN(input.expectedScheduledPublishAt.getTime())
    ) {
      throw new ContentLifecycleError(
        'INVALID_INPUT',
        'expectedScheduledPublishAt must be a valid date'
      );
    }

    const actorId = input.actorId.trim();
    const projectId = input.projectId.trim();
    const pageId = input.pageId.trim();
    const expectedScheduledRevisionId =
      input.expectedScheduledRevisionId.trim();

    const allowed = await this.hasPermission(actorId, 'content.publish', projectId);
    if (!allowed) {
      throw new ContentLifecycleError(
        'FORBIDDEN',
        'Permission content.publish required'
      );
    }

    return this.store.transaction(async (txStore) => {
      const page = await txStore.findPageById(projectId, pageId);
      if (!page) {
        throw new ContentLifecycleError(
          'PAGE_NOT_FOUND',
          'Page not found in this project'
        );
      }

      const scheduledRevisionId = page.scheduledRevisionId ?? null;
      const scheduledPublishAt = page.scheduledPublishAt ?? null;
      const scheduledById = page.scheduledById ?? null;
      const scheduleFields = [
        scheduledRevisionId,
        scheduledPublishAt,
        scheduledById,
      ];
      const populatedScheduleFields = scheduleFields.filter(
        (value) => value !== null
      ).length;

      if (populatedScheduleFields === 0) {
        throw new ContentLifecycleError(
          'STATE_TRANSITION_INVALID',
          'Page has no scheduled publication'
        );
      }

      if (populatedScheduleFields !== 3) {
        throw new ContentLifecycleError(
          'POINTER_INTEGRITY_VIOLATION',
          'Page contains a partial publish schedule'
        );
      }

      if (
        scheduledRevisionId !== expectedScheduledRevisionId ||
        scheduledPublishAt!.getTime() !==
          input.expectedScheduledPublishAt.getTime()
      ) {
        throw new ContentLifecycleError(
          'LOCK_CONFLICT',
          'Publish schedule changed concurrently'
        );
      }

      const revision = await txStore.findRevisionById(
        scheduledRevisionId!
      );
      if (
        !revision ||
        revision.id !== scheduledRevisionId ||
        revision.pageId !== page.id
      ) {
        throw new ContentLifecycleError(
          'POINTER_INTEGRITY_VIOLATION',
          'Scheduled revision pointer is invalid'
        );
      }

      if (!txStore.clearScheduledPublishAtomic) {
        throw new Error('Store does not implement clearScheduledPublishAtomic');
      }

      const pointerResult = await txStore.clearScheduledPublishAtomic({
        projectId,
        pageId: page.id,
        expectedScheduledRevisionId: scheduledRevisionId!,
        expectedScheduledPublishAt: scheduledPublishAt!,
        expectedScheduledById: scheduledById!,
      });

      if (!pointerResult.updated || !pointerResult.page) {
        throw new ContentLifecycleError(
          'LOCK_CONFLICT',
          'Publish schedule changed concurrently'
        );
      }

      await txStore.recordAudit({
        action: 'CONTENT_PUBLISH_SCHEDULE_CANCELLED',
        scopeType: 'PROJECT',
        scopeId: projectId,
        resourceType: 'PAGE',
        resourceId: page.id,
        actorId,
        metadata: {
          pageId: page.id,
          revisionId: revision.id,
          revisionNumber: revision.revisionNumber,
          scheduledPublishAt: scheduledPublishAt!.toISOString(),
          scheduledById,
          cancelledById: actorId,
        },
      });

      await this.reconcileMediaUsage(txStore, projectId, page.id);
      return {
        page: pointerResult.page,
      };
    });
  }

  async publishScheduled(
    input: PublishScheduledInput
  ): Promise<PublishScheduledResult> {
    if (
      !input.projectId?.trim() ||
      !input.pageId?.trim() ||
      !input.expectedScheduledRevisionId?.trim() ||
      !input.expectedScheduledById?.trim()
    ) {
      throw new ContentLifecycleError('INVALID_INPUT', 'Scheduled publish input is incomplete');
    }

    if (
      !Number.isInteger(input.expectedLockVersion) ||
      input.expectedLockVersion < 1 ||
      !(input.expectedScheduledPublishAt instanceof Date) ||
      Number.isNaN(input.expectedScheduledPublishAt.getTime())
    ) {
      throw new ContentLifecycleError('INVALID_INPUT', 'Scheduled publish CAS input is invalid');
    }

    const now = input.now ?? new Date();
    const projectId = input.projectId.trim();
    const pageId = input.pageId.trim();
    const revisionId = input.expectedScheduledRevisionId.trim();
    const scheduledById = input.expectedScheduledById.trim();

    return this.store.transaction(async (txStore) => {
      const page = await txStore.findPageById(projectId, pageId);
      if (!page) {
        throw new ContentLifecycleError('PAGE_NOT_FOUND', 'Page not found in this project');
      }

      const scheduledRevisionId = page.scheduledRevisionId ?? null;
      const scheduledPublishAt = page.scheduledPublishAt ?? null;
      const pageScheduledById = page.scheduledById ?? null;

      if (!scheduledRevisionId || !scheduledPublishAt || !pageScheduledById) {
        throw new ContentLifecycleError('STATE_TRANSITION_INVALID', 'Page has no complete publish schedule');
      }

      if (
        scheduledRevisionId !== revisionId ||
        scheduledPublishAt.getTime() !== input.expectedScheduledPublishAt.getTime() ||
        pageScheduledById !== scheduledById
      ) {
        throw new ContentLifecycleError('LOCK_CONFLICT', 'Publish schedule changed concurrently');
      }

      if (scheduledPublishAt.getTime() > now.getTime()) {
        throw new ContentLifecycleError('STATE_TRANSITION_INVALID', 'Scheduled publication is not due yet');
      }

      if (!txStore.findUserStatus) {
        throw new Error('Store does not implement findUserStatus');
      }

      const userStatus = await txStore.findUserStatus(scheduledById);
      if (userStatus !== 'ACTIVE') {
        throw new ContentLifecycleError('FORBIDDEN', 'Scheduled publisher is not active');
      }

      const allowed = await this.hasPermission(
        scheduledById,
        'content.publish',
        projectId
      );
      if (!allowed) {
        throw new ContentLifecycleError(
          'FORBIDDEN',
          'Scheduled publisher no longer has content.publish permission'
        );
      }

      if (page.draftRevisionId !== revisionId) {
        throw new ContentLifecycleError(
          'POINTER_INTEGRITY_VIOLATION',
          'Scheduled revision is not the active unpublished revision'
        );
      }

      const revision = await txStore.findRevisionById(revisionId);
      if (!revision || revision.pageId !== page.id) {
        throw new ContentLifecycleError(
          'POINTER_INTEGRITY_VIOLATION',
          'Scheduled revision pointer is invalid'
        );
      }

      if (revision.status !== 'APPROVED') {
        throw new ContentLifecycleError(
          'STATE_TRANSITION_INVALID',
          'Scheduled revision is no longer APPROVED'
        );
      }

      if (revision.lockVersion !== input.expectedLockVersion) {
        throw new ContentLifecycleError(
          'LOCK_CONFLICT',
          'Scheduled revision changed concurrently'
        );
      }

      const previousPublishedRevisionId = page.publishedRevisionId;

      if (previousPublishedRevisionId) {
        const previous = await txStore.findRevisionById(
          previousPublishedRevisionId
        );

        if (
          !previous ||
          previous.pageId !== page.id ||
          previous.status !== 'PUBLISHED'
        ) {
          throw new ContentLifecycleError(
            'POINTER_INTEGRITY_VIOLATION',
            'Previous published revision pointer is invalid'
          );
        }
      }

      const transition = await txStore.transitionRevisionStatusAtomic({
        pageId: page.id,
        revisionId: revision.id,
        expectedStatus: 'APPROVED',
        targetStatus: 'PUBLISHED',
        expectedLockVersion: input.expectedLockVersion,
        publishedAt: now,
      });

      if (!transition.updated || !transition.revision) {
        throw new ContentLifecycleError(
          'LOCK_CONFLICT',
          'Scheduled revision changed concurrently'
        );
      }

      const release = await txStore.createPublishedRelease({
        projectId,
        status: 'PUBLISHED',
        createdById: scheduledById,
        publishedAt: now,
      });

      const releaseItem = await txStore.createReleaseItem({
        releaseId: release.id,
        pageId: page.id,
        revisionId: revision.id,
        previousRevisionId: previousPublishedRevisionId,
      });

      if (!txStore.setScheduledPublishedPagePointersAtomic) {
        throw new Error(
          'Store does not implement setScheduledPublishedPagePointersAtomic'
        );
      }

      const pointerResult =
        await txStore.setScheduledPublishedPagePointersAtomic({
          projectId,
          pageId: page.id,
          expectedDraftRevisionId: revision.id,
          expectedPreviousPublishedRevisionId: previousPublishedRevisionId,
          expectedScheduledRevisionId: revisionId,
          expectedScheduledPublishAt: scheduledPublishAt,
          expectedScheduledById: scheduledById,
          newPublishedRevisionId: revision.id,
          updatedAt: now,
        });

      if (!pointerResult.updated || !pointerResult.page) {
        throw new ContentLifecycleError(
          'LOCK_CONFLICT',
          'Page pointers or publish schedule changed concurrently'
        );
      }

      await txStore.recordAudit({
        action: 'CONTENT_RELEASE_PUBLISHED',
        scopeType: 'PROJECT',
        scopeId: projectId,
        resourceType: 'CONTENT_RELEASE',
        resourceId: release.id,
        actorId: scheduledById,
        metadata: {
          pageId: page.id,
          releaseId: release.id,
          revisionId: revision.id,
          previousRevisionId: previousPublishedRevisionId,
          scheduled: true,
          scheduledPublishAt: scheduledPublishAt.toISOString(),
          scheduledById,
        },
      });

      await this.reconcileMediaUsage(txStore, projectId, page.id);
      return {
        page: pointerResult.page,
        revision: transition.revision,
        release,
        releaseItem,
      };
    });
  }

  async unpublish(
    input: UnpublishPageInput
  ): Promise<UnpublishPageResult> {
    if (
      !input.actorId?.trim() ||
      !input.projectId?.trim() ||
      !input.pageId?.trim() ||
      !input.expectedPublishedRevisionId?.trim()
    ) {
      throw new ContentLifecycleError(
        'INVALID_INPUT',
        'Unpublish input is incomplete'
      );
    }

    const actorId = input.actorId.trim();
    const projectId = input.projectId.trim();
    const pageId = input.pageId.trim();
    const expectedPublishedRevisionId =
      input.expectedPublishedRevisionId.trim();

    const allowed = await this.hasPermission(
      actorId,
      'content.publish',
      projectId
    );
    if (!allowed) {
      throw new ContentLifecycleError(
        'FORBIDDEN',
        'Permission content.publish required'
      );
    }

    return this.store.transaction(async (txStore) => {
      const page = await txStore.findPageById(projectId, pageId);
      if (!page) {
        throw new ContentLifecycleError(
          'PAGE_NOT_FOUND',
          'Page not found in this project'
        );
      }

      if (!page.publishedRevisionId) {
        throw new ContentLifecycleError(
          'NO_PUBLISHED_REVISION',
          'Page has no published revision'
        );
      }

      if (page.publishedRevisionId !== expectedPublishedRevisionId) {
        throw new ContentLifecycleError(
          'LOCK_CONFLICT',
          'Published revision changed concurrently'
        );
      }

      const publishedRevision =
        await txStore.findRevisionById(page.publishedRevisionId);

      if (
        !publishedRevision ||
        publishedRevision.pageId !== page.id ||
        publishedRevision.status !== 'PUBLISHED'
      ) {
        throw new ContentLifecycleError(
          'POINTER_INTEGRITY_VIOLATION',
          'Published revision pointer is invalid'
        );
      }

      let draftRevision;
      let createdDraft = false;

      if (page.draftRevisionId) {
        draftRevision =
          await txStore.findRevisionById(page.draftRevisionId);

        if (
          !draftRevision ||
          draftRevision.pageId !== page.id ||
          draftRevision.status === 'PUBLISHED'
        ) {
          throw new ContentLifecycleError(
            'POINTER_INTEGRITY_VIOLATION',
            'Active draft revision pointer is invalid'
          );
        }
      } else {
        const nextRevisionNumber =
          await txStore.getNextRevisionNumber(page.id);

        draftRevision =
          await txStore.createDraftRevisionFromSource({
            pageId: page.id,
            revisionNumber: nextRevisionNumber,
            actorId,
            derivedFromRevisionId: publishedRevision.id,
            sourceRevision: publishedRevision,
          });

        createdDraft = true;
      }

      if (!txStore.setUnpublishedPagePointersAtomic) {
        throw new Error(
          'Store does not implement setUnpublishedPagePointersAtomic'
        );
      }

      const unpublishedAt = new Date();

      const pointerResult =
        await txStore.setUnpublishedPagePointersAtomic({
          projectId,
          pageId: page.id,
          expectedPublishedRevisionId: publishedRevision.id,
          expectedDraftRevisionId: page.draftRevisionId,
          newDraftRevisionId: draftRevision.id,
          updatedAt: unpublishedAt,
        });

      if (!pointerResult.updated || !pointerResult.page) {
        throw new ContentLifecycleError(
          'LOCK_CONFLICT',
          'Page pointers changed concurrently'
        );
      }

      await txStore.recordAudit({
        action: 'CONTENT_PAGE_UNPUBLISHED',
        scopeType: 'PROJECT',
        scopeId: projectId,
        resourceType: 'PAGE',
        resourceId: page.id,
        actorId,
        metadata: {
          pageId: page.id,
          unpublishedRevisionId: publishedRevision.id,
          draftRevisionId: draftRevision.id,
          createdDraft,
        },
      });

      await this.reconcileMediaUsage(txStore, projectId, page.id);
      return {
        page: pointerResult.page,
        unpublishedRevision: publishedRevision,
        draftRevision,
        createdDraft,
      };
    });
  }

  async rollbackPublished(input: RollbackPublishedInput): Promise<RollbackPublishedResult> {
    // 1. Context validation
    if (
      !input.actorId ||
      !input.actorId.trim() ||
      !input.projectId ||
      !input.projectId.trim() ||
      !input.pageId ||
      !input.pageId.trim() ||
      !input.expectedPublishedRevisionId ||
      !input.expectedPublishedRevisionId.trim()
    ) {
      throw new ContentLifecycleError(
        'INVALID_INPUT',
        'actorId, projectId, pageId and expectedPublishedRevisionId are required'
      );
    }
    const actorId = input.actorId.trim();
    const projectId = input.projectId.trim();
    const pageId = input.pageId.trim();
    const expectedPublishedRevisionId = input.expectedPublishedRevisionId.trim();

    // 2. Authorization check (content.rollback)
    const allowed = await this.hasPermission(actorId, 'content.rollback', projectId);
    if (!allowed) {
      throw new ContentLifecycleError('FORBIDDEN', 'Permission content.rollback required');
    }

    // 3. Atomic transaction
    return this.store.transaction(async (txStore) => {
      if (
        !txStore.findPublishedReleaseLineage ||
        !txStore.createRollbackRelease ||
        !txStore.setRollbackPublishedPointerAtomic
      ) {
        throw new Error('Store does not implement rollback primitives');
      }

      // Scoped page lookup
      const page = await txStore.findPageById(projectId, pageId);
      if (!page) {
        throw new ContentLifecycleError('PAGE_NOT_FOUND', 'Page not found in this project');
      }

      // Active draft check (must be null)
      if (page.draftRevisionId !== null) {
        throw new ContentLifecycleError(
          'ACTIVE_DRAFT_EXISTS',
          'Cannot rollback while active draft revision exists'
        );
      }

      // Current published pointer check
      if (!page.publishedRevisionId) {
        throw new ContentLifecycleError('NO_PUBLISHED_REVISION', 'Page has no published revision');
      }

      if (page.publishedRevisionId !== expectedPublishedRevisionId) {
        throw new ContentLifecycleError('LOCK_CONFLICT', 'Published revision changed concurrently');
      }

      // Load current revision
      const currentRevision = await txStore.findRevisionById(page.publishedRevisionId);
      if (
        !currentRevision ||
        currentRevision.id !== page.publishedRevisionId ||
        currentRevision.pageId !== page.id ||
        currentRevision.status !== 'PUBLISHED'
      ) {
        throw new ContentLifecycleError(
          'POINTER_INTEGRITY_VIOLATION',
          'Current published revision pointer is invalid'
        );
      }

      // Find publish lineage
      const lineages = await txStore.findPublishedReleaseLineage(projectId, page.id, currentRevision.id);
      if (!lineages || lineages.length !== 1) {
        throw new ContentLifecycleError(
          'POINTER_INTEGRITY_VIOLATION',
          'Corrupt or ambiguous publish lineage records for current revision'
        );
      }

      const { release: sourcePublishRelease, item: sourcePublishReleaseItem } = lineages[0];
      const previousRevisionId = sourcePublishReleaseItem.previousRevisionId;

      if (!previousRevisionId) {
        throw new ContentLifecycleError('ROLLBACK_NOT_AVAILABLE', 'Cannot rollback first publication');
      }

      // Load previous revision
      const previousRevision = await txStore.findRevisionById(previousRevisionId);
      if (
        !previousRevision ||
        previousRevision.id !== previousRevisionId ||
        previousRevision.pageId !== page.id ||
        previousRevision.status !== 'PUBLISHED'
      ) {
        throw new ContentLifecycleError('POINTER_INTEGRITY_VIOLATION', 'Target rollback revision is invalid');
      }

      // Rollback timestamp
      const rolledBackAt = new Date();

      // Create new ContentRelease with status ROLLED_BACK
      const rollbackRelease = await txStore.createRollbackRelease({
        projectId,
        createdById: actorId,
        rolledBackAt,
      });

      // Create ContentReleaseItem
      const rollbackReleaseItem = await txStore.createReleaseItem({
        releaseId: rollbackRelease.id,
        pageId: page.id,
        revisionId: previousRevision.id,
        previousRevisionId: currentRevision.id,
      });

      // Page pointer CAS
      const pointerResult = await txStore.setRollbackPublishedPointerAtomic({
        projectId,
        pageId: page.id,
        expectedPublishedRevisionId: currentRevision.id,
        targetPublishedRevisionId: previousRevision.id,
        updatedAt: rolledBackAt,
      });

      if (!pointerResult.updated || !pointerResult.page) {
        throw new ContentLifecycleError(
          'LOCK_CONFLICT',
          'Concurrent change to page pointers during rollback'
        );
      }

      // Record audit inside transaction
      await txStore.recordAudit({
        action: 'CONTENT_RELEASE_ROLLED_BACK',
        scopeType: 'PROJECT',
        scopeId: projectId,
        resourceType: 'CONTENT_RELEASE',
        resourceId: rollbackRelease.id,
        actorId,
        metadata: {
          pageId: page.id,
          rollbackReleaseId: rollbackRelease.id,
          sourcePublishReleaseId: sourcePublishRelease.id,
          fromRevisionId: currentRevision.id,
          toRevisionId: previousRevision.id,
          fromRevisionNumber: currentRevision.revisionNumber,
          toRevisionNumber: previousRevision.revisionNumber,
        },
      });

      await this.reconcileMediaUsage(txStore, projectId, page.id);
      return {
        page: pointerResult.page,
        fromRevision: currentRevision,
        restoredRevision: previousRevision,
        sourcePublishRelease,
        sourcePublishReleaseItem,
        rollbackRelease,
        rollbackReleaseItem,
      };
    });
  }

  async createDraftFromPublished(
    input: CreateDraftFromPublishedInput
  ): Promise<CreateDraftFromPublishedResult> {
    // 1. Context validation
    if (
      !input.actorId ||
      !input.actorId.trim() ||
      !input.projectId ||
      !input.projectId.trim() ||
      !input.pageId ||
      !input.pageId.trim() ||
      !input.expectedPublishedRevisionId ||
      !input.expectedPublishedRevisionId.trim()
    ) {
      throw new ContentLifecycleError(
        'INVALID_INPUT',
        'actorId, projectId, pageId and expectedPublishedRevisionId are required'
      );
    }
    const actorId = input.actorId.trim();
    const projectId = input.projectId.trim();
    const pageId = input.pageId.trim();
    const expectedPublishedRevisionId = input.expectedPublishedRevisionId.trim();

    // 2. Authorization check (content.edit)
    const allowed = await this.hasPermission(actorId, 'content.edit', projectId);
    if (!allowed) {
      throw new ContentLifecycleError('FORBIDDEN', 'Permission content.edit required');
    }

    // 3. Atomic transaction
    return this.store.transaction(async (txStore) => {
      if (!txStore.setDraftFromPublishedPointerAtomic) {
        throw new Error('Store does not implement setDraftFromPublishedPointerAtomic');
      }

      // Scoped page lookup
      const page = await txStore.findPageById(projectId, pageId);
      if (!page) {
        throw new ContentLifecycleError('PAGE_NOT_FOUND', 'Page not found in this project');
      }

      // Require publishedRevisionId
      if (!page.publishedRevisionId) {
        throw new ContentLifecycleError('NO_PUBLISHED_REVISION', 'Page has no published revision');
      }

      if (page.publishedRevisionId !== expectedPublishedRevisionId) {
        throw new ContentLifecycleError('LOCK_CONFLICT', 'Published revision changed concurrently');
      }

      // Require draftRevisionId === null
      if (page.draftRevisionId !== null) {
        throw new ContentLifecycleError('ACTIVE_DRAFT_EXISTS', 'Active draft already exists on this page');
      }

      // Load published source revision
      const sourceRevision = await txStore.findRevisionById(page.publishedRevisionId);
      if (
        !sourceRevision ||
        sourceRevision.id !== page.publishedRevisionId ||
        sourceRevision.pageId !== page.id ||
        sourceRevision.status !== 'PUBLISHED'
      ) {
        throw new ContentLifecycleError(
          'POINTER_INTEGRITY_VIOLATION',
          'Published source revision pointer is invalid'
        );
      }

      // Get next revision number
      const nextRevisionNumber = await txStore.getNextRevisionNumber(page.id);

      // Create new draft revision from source
      const draftRevision = await txStore.createDraftRevisionFromSource({
        pageId: page.id,
        revisionNumber: nextRevisionNumber,
        actorId,
        derivedFromRevisionId: sourceRevision.id,
        sourceRevision,
      });

      // Atomically set draftRevisionId pointer
      const pointerResult = await txStore.setDraftFromPublishedPointerAtomic({
        projectId,
        pageId: page.id,
        expectedPublishedRevisionId: sourceRevision.id,
        newDraftRevisionId: draftRevision.id,
      });

      if (!pointerResult.updated || !pointerResult.page) {
        throw new ContentLifecycleError(
          'LOCK_CONFLICT',
          'Concurrent modification of page draft or published pointer'
        );
      }

      // Record audit
      await txStore.recordAudit({
        action: 'CONTENT_DRAFT_REOPENED',
        scopeType: 'PROJECT',
        scopeId: projectId,
        resourceType: 'PAGE_REVISION',
        resourceId: draftRevision.id,
        actorId,
        metadata: {
          pageId: page.id,
          sourcePublishedRevisionId: sourceRevision.id,
          newDraftRevisionId: draftRevision.id,
          newDraftRevisionNumber: draftRevision.revisionNumber,
          lockVersion: draftRevision.lockVersion,
        },
      });

      await this.reconcileMediaUsage(txStore, projectId, page.id);
      return {
        page: pointerResult.page,
        publishedRevision: sourceRevision,
        draftRevision,
      };
    });
  }

  async listReleases(params: { actorId: string; projectId: string }) {
    if (!params.actorId || !params.actorId.trim()) {
      throw new ContentLifecycleError("INVALID_INPUT", "actorId is required");
    }
    if (!params.projectId || !params.projectId.trim()) {
      throw new ContentLifecycleError("INVALID_INPUT", "projectId is required");
    }
    const actorId = params.actorId.trim();
    const projectId = params.projectId.trim();

    const allowed = await this.hasPermission(actorId, "content.view", projectId);
    if (!allowed) {
      throw new ContentLifecycleError("FORBIDDEN", "Permission content.view required");
    }

    if (!this.store.listProjectReleases) {
      throw new ContentLifecycleError("INVALID_INPUT", "Store implementation for listProjectReleases is missing");
    }
    return this.store.listProjectReleases(projectId);
  }

  async listRevisions(params: { actorId: string; projectId: string; pageId?: string }) {
    if (!params.actorId || !params.actorId.trim()) {
      throw new ContentLifecycleError("INVALID_INPUT", "actorId is required");
    }
    if (!params.projectId || !params.projectId.trim()) {
      throw new ContentLifecycleError("INVALID_INPUT", "projectId is required");
    }
    const actorId = params.actorId.trim();
    const projectId = params.projectId.trim();
    const pageId = params.pageId?.trim();

    const allowed = await this.hasPermission(actorId, "content.view", projectId);
    if (!allowed) {
      throw new ContentLifecycleError("FORBIDDEN", "Permission content.view required");
    }

    if (!this.store.listProjectRevisions) {
      throw new ContentLifecycleError("INVALID_INPUT", "Store implementation for listProjectRevisions is missing");
    }
    return this.store.listProjectRevisions(projectId, pageId);
  }

  private async reconcileMediaUsage(
    txStore: ContentLifecycleStore,
    projectId: string,
    pageId: string,
    contentToCheck?: PageContent
  ): Promise<void> {
    if (typeof txStore.reconcilePageMediaUsage === 'function') {
      await txStore.reconcilePageMediaUsage(projectId, pageId);
      return;
    }

    if (contentToCheck && hasMediaReferences(contentToCheck)) {
      throw new ContentLifecycleError(
        'POINTER_INTEGRITY_VIOLATION',
        'Media usage reconciliation unsupported by store for content containing media references'
      );
    }

    const page = await txStore.findPageById(projectId, pageId);
    if (page) {
      const activeIds = [page.publishedRevisionId, page.draftRevisionId, page.scheduledRevisionId].filter(Boolean) as string[];
      for (const revId of activeIds) {
        const rev = await txStore.findRevisionById(revId);
        if (rev && hasMediaReferences(rev.content)) {
          throw new ContentLifecycleError(
            'POINTER_INTEGRITY_VIOLATION',
            'Media usage reconciliation unsupported by store for content containing media references'
          );
        }
      }
    }
  }

}
