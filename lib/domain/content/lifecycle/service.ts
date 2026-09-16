import { ContentLifecycleStore } from './store';
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
  RollbackPublishedInput,
  RollbackPublishedResult,
  CreateDraftFromPublishedInput,
  CreateDraftFromPublishedResult,
} from './types';
import { validatePageContent, validateSlugSegment } from '../validation';
import { PageContent } from '../contracts';
import { PermissionKey } from '@/lib/auth/rbac';

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

      return {
        page: pointerResult.page,
        revision: transitionResult.revision,
        release,
        releaseItem,
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

      return {
        page: pointerResult.page,
        publishedRevision: sourceRevision,
        draftRevision,
      };
    });
  }
}
