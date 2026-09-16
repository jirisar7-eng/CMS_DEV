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
}
