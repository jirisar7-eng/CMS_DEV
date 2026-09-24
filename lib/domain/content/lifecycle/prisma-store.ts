let defaultPrisma: any;
function getDefaultPrisma(): any {
  if (defaultPrisma === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      defaultPrisma = require('@/lib/db').prisma;
    } catch {
      defaultPrisma = null;
    }
  }
  return defaultPrisma;
}
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  ContentLifecycleStore,
  CreatePageWithDraftParams,
  UpdateDraftRevisionAtomicParams,
  TransitionRevisionStatusAtomicParams,
  ClaimRevisionLockAtomicParams,
  CreateDraftRevisionFromSourceParams,
  SetPageDraftRevisionPointerParams,
  CreatePublishedReleaseParams,
  CreateReleaseItemParams,
  SetPublishedPagePointersAtomicParams,
  SetScheduledPublishAtomicParams,
  ClearScheduledPublishAtomicParams,
  SetScheduledPublishedPagePointersAtomicParams,
  SetUnpublishedPagePointersAtomicParams,
  PublishedReleaseLineage,
  CreateRollbackReleaseParams,
  SetRollbackPublishedPointerAtomicParams,
  SetDraftFromPublishedPointerAtomicParams,
  RecordLifecycleAuditParams,
  LifecycleRevisionReadProjection,
  extractMediaReferences,
} from './store';
import {
  LifecyclePage,
  LifecyclePageRevision,
  LifecycleContentRelease,
  LifecycleContentReleaseItem,
  ContentReleaseStatus,
  ContentLifecycleError,
} from './types';
import { PageContent } from '../contracts';
async function safeLogAudit(params: any): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const auditModule = require('@/lib/auth/audit');
    if (auditModule?.logAudit) {
      await auditModule.logAudit(params);
    }
  } catch {
    // In isolated test environments
  }
}

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

export class PrismaContentLifecycleStore implements ContentLifecycleStore {
  constructor(private readonly db: PrismaClientOrTx = getDefaultPrisma()) {}

  async transaction<T>(fn: (txStore: ContentLifecycleStore) => Promise<T>): Promise<T> {
    if ('$transaction' in this.db && typeof (this.db as PrismaClient).$transaction === 'function') {
      return (this.db as PrismaClient).$transaction(async (tx: any) => {
        const txStore = new PrismaContentLifecycleStore(tx);
        return fn(txStore);
      });
    }
    // Already in transaction
    return fn(this);
  }

  async findPageById(projectId: string, pageId: string): Promise<LifecyclePage | null> {
    const page = await (this.db as any).page.findFirst({
      where: {
        id: pageId,
        projectId,
      },
    });
    if (!page) return null;
    return this.mapPage(page);
  }

  async findUserStatus(userId: string): Promise<string | null> {
    const user = await (this.db as any).user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    return user?.status ?? null;
  }

  async createPageWithDraft(
    params: CreatePageWithDraftParams
  ): Promise<{ page: LifecyclePage; revision: LifecyclePageRevision }> {
    try {
      // 1. Create page
      const page = await (this.db as any).page.create({
        data: {
          projectId: params.projectId,
          key: params.key,
          parentId: params.parentId,
        },
      });

      // 2. Create revision #1 DRAFT
      const revision = await (this.db as any).pageRevision.create({
        data: {
          pageId: page.id,
          revisionNumber: 1,
          status: 'DRAFT',
          title: params.title,
          slug: params.slug,
          locale: params.locale,
          description: params.description,
          visibility: params.visibility,
          content: params.content as unknown as Prisma.InputJsonValue,
          seo: {},
          navigation: {},
          schemaVersion: params.schemaVersion,
          lockVersion: 1,
          createdById: params.actorId,
        },
      });

      // 3. Pointer integrity check in code
      if (revision.pageId !== page.id) {
        throw new ContentLifecycleError('POINTER_INTEGRITY_VIOLATION', 'Revision does not belong to page');
      }

      // 4. Update page draftRevisionId
      const updatedPage = await (this.db as any).page.update({
        where: { id: page.id },
        data: { draftRevisionId: revision.id },
      });

      return {
        page: this.mapPage(updatedPage),
        revision: this.mapRevision(revision),
      };
    } catch (err: any) {
      if (err instanceof ContentLifecycleError) {
        throw err;
      }
      if (err.code === 'P2002') {
        throw new ContentLifecycleError('KEY_CONFLICT', `A page with key '${params.key}' already exists in this project.`);
      }
      throw err;
    }
  }

  async findRevisionById(revisionId: string): Promise<LifecyclePageRevision | null> {
    const revision = await (this.db as any).pageRevision.findUnique({
      where: {
        id: revisionId,
      },
    });
    if (!revision) return null;
    return this.mapRevision(revision);
  }

  async updateDraftRevisionAtomic(
    params: UpdateDraftRevisionAtomicParams
  ): Promise<{ updated: boolean; revision?: LifecyclePageRevision }> {
    const updateData: Record<string, unknown> = {
      lockVersion: { increment: 1 },
    };
    if (params.data.title !== undefined) updateData.title = params.data.title;
    if (params.data.slug !== undefined) updateData.slug = params.data.slug;
    if (params.data.locale !== undefined) updateData.locale = params.data.locale;
    if (params.data.description !== undefined) updateData.description = params.data.description;
    if (params.data.visibility !== undefined) updateData.visibility = params.data.visibility;
    if (params.data.content !== undefined) updateData.content = params.data.content as unknown as Prisma.InputJsonValue;
    if (params.data.schemaVersion !== undefined) updateData.schemaVersion = params.data.schemaVersion;

    const result = await (this.db as any).pageRevision.updateMany({
      where: {
        id: params.revisionId,
        pageId: params.pageId,
        status: 'DRAFT',
        lockVersion: params.expectedLockVersion,
      },
      data: updateData,
    });

    if (result.count !== 1) {
      return { updated: false };
    }

    const updated = await this.findRevisionById(params.revisionId);
    return { updated: true, revision: updated ?? undefined };
  }

  async transitionRevisionStatusAtomic(
    params: TransitionRevisionStatusAtomicParams
  ): Promise<{ updated: boolean; revision?: LifecyclePageRevision }> {
    const updateData: Record<string, unknown> = {
      status: params.targetStatus,
      lockVersion: { increment: 1 },
    };
    if (params.submittedAt !== undefined) {
      updateData.submittedAt = params.submittedAt;
    }
    if (params.approvedAt !== undefined) {
      updateData.approvedAt = params.approvedAt;
    }
    if (params.publishedAt !== undefined) {
      updateData.publishedAt = params.publishedAt;
    }

    const result = await (this.db as any).pageRevision.updateMany({
      where: {
        id: params.revisionId,
        pageId: params.pageId,
        status: params.expectedStatus,
        lockVersion: params.expectedLockVersion,
      },
      data: updateData,
    });

    if (result.count !== 1) {
      return { updated: false };
    }

    const updated = await this.findRevisionById(params.revisionId);
    return { updated: true, revision: updated ?? undefined };
  }

  async claimRevisionLockAtomic(
    params: ClaimRevisionLockAtomicParams
  ): Promise<{ updated: boolean; revision?: LifecyclePageRevision }> {
    const result = await (this.db as any).pageRevision.updateMany({
      where: {
        id: params.revisionId,
        pageId: params.pageId,
        status: params.expectedStatus,
        lockVersion: params.expectedLockVersion,
      },
      data: {
        lockVersion: { increment: 1 },
      },
    });

    if (result.count !== 1) {
      return { updated: false };
    }

    const updated = await this.findRevisionById(params.revisionId);
    return { updated: true, revision: updated ?? undefined };
  }

  async getNextRevisionNumber(pageId: string): Promise<number> {
    const highest = await (this.db as any).pageRevision.findFirst({
      where: { pageId },
      orderBy: { revisionNumber: 'desc' },
      select: { revisionNumber: true },
    });
    return (highest?.revisionNumber ?? 0) + 1;
  }

  async createDraftRevisionFromSource(
    params: CreateDraftRevisionFromSourceParams
  ): Promise<LifecyclePageRevision> {
    const source = params.sourceRevision;
    try {
      const created = await (this.db as any).pageRevision.create({
        data: {
          pageId: params.pageId,
          revisionNumber: params.revisionNumber,
          status: 'DRAFT',
          title: source.title,
          slug: source.slug,
          locale: source.locale,
          description: source.description,
          visibility: source.visibility,
          content: source.content as unknown as Prisma.InputJsonValue,
          seo: source.seo as unknown as Prisma.InputJsonValue,
          navigation: source.navigation as unknown as Prisma.InputJsonValue,
          schemaVersion: source.schemaVersion,
          lockVersion: 1,
          createdById: params.actorId,
          derivedFromRevisionId: params.derivedFromRevisionId,
          submittedAt: null,
          approvedAt: null,
          publishedAt: null,
        },
      });
      return this.mapRevision(created);
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ContentLifecycleError('LOCK_CONFLICT', 'Revision number conflict due to concurrent operation');
      }
      throw err;
    }
  }

  async setPageDraftRevisionPointer(
    params: SetPageDraftRevisionPointerParams
  ): Promise<LifecyclePage> {
    const result = await (this.db as any).page.updateMany({
      where: {
        id: params.pageId,
        projectId: params.projectId,
      },
      data: {
        draftRevisionId: params.draftRevisionId,
        updatedAt: new Date(),
      },
    });

    if (result.count !== 1) {
      throw new ContentLifecycleError('PAGE_NOT_FOUND', 'Page not found in this project');
    }

    const page = await this.findPageById(params.projectId, params.pageId);
    if (!page) {
      throw new ContentLifecycleError('PAGE_NOT_FOUND', 'Page not found in this project');
    }
    return page;
  }

  async touchPageUpdatedAt(projectId: string, pageId: string): Promise<LifecyclePage> {
    const result = await (this.db as any).page.updateMany({
      where: {
        id: pageId,
        projectId,
      },
      data: { updatedAt: new Date() },
    });

    if (result.count !== 1) {
      throw new ContentLifecycleError('PAGE_NOT_FOUND', 'Page not found in this project');
    }

    const page = await this.findPageById(projectId, pageId);
    if (!page) {
      throw new ContentLifecycleError('PAGE_NOT_FOUND', 'Page not found in this project');
    }
    return page;
  }

  async createPublishedRelease(
    params: CreatePublishedReleaseParams
  ): Promise<LifecycleContentRelease> {
    const release = await (this.db as any).contentRelease.create({
      data: {
        projectId: params.projectId,
        status: params.status,
        createdById: params.createdById,
        publishedAt: params.publishedAt,
        rolledBackAt: null,
      },
    });
    return this.mapRelease(release);
  }

  async createReleaseItem(
    params: CreateReleaseItemParams
  ): Promise<LifecycleContentReleaseItem> {
    const item = await (this.db as any).contentReleaseItem.create({
      data: {
        releaseId: params.releaseId,
        pageId: params.pageId,
        revisionId: params.revisionId,
        previousRevisionId: params.previousRevisionId,
      },
    });
    return this.mapReleaseItem(item);
  }

  async setPublishedPagePointersAtomic(
    params: SetPublishedPagePointersAtomicParams
  ): Promise<{ updated: boolean; page?: LifecyclePage }> {
    const result = await (this.db as any).page.updateMany({
      where: {
        id: params.pageId,
        projectId: params.projectId,
        draftRevisionId: params.expectedDraftRevisionId,
        publishedRevisionId: params.expectedPreviousPublishedRevisionId,
      },
      data: {
        publishedRevisionId: params.newPublishedRevisionId,
        draftRevisionId: null,
        scheduledRevisionId: null,
        scheduledPublishAt: null,
        scheduledById: null,
        updatedAt: params.updatedAt ?? new Date(),
      },
    });

    if (result.count !== 1) {
      return { updated: false };
    }

    const page = await this.findPageById(params.projectId, params.pageId);
    return { updated: true, page: page ?? undefined };
  }

  async setScheduledPublishAtomic(
    params: SetScheduledPublishAtomicParams
  ): Promise<{ updated: boolean; page?: LifecyclePage }> {
    const result = await (this.db as any).page.updateMany({
      where: {
        id: params.pageId,
        projectId: params.projectId,
        draftRevisionId: params.expectedDraftRevisionId,
        scheduledRevisionId: null,
        scheduledPublishAt: null,
        scheduledById: null,
      },
      data: {
        scheduledRevisionId: params.scheduledRevisionId,
        scheduledPublishAt: params.scheduledPublishAt,
        scheduledById: params.scheduledById,
        updatedAt: params.updatedAt ?? new Date(),
      },
    });

    if (result.count !== 1) {
      return { updated: false };
    }

    const page = await this.findPageById(params.projectId, params.pageId);
    return { updated: true, page: page ?? undefined };
  }

  async clearScheduledPublishAtomic(
    params: ClearScheduledPublishAtomicParams
  ): Promise<{ updated: boolean; page?: LifecyclePage }> {
    const result = await (this.db as any).page.updateMany({
      where: {
        id: params.pageId,
        projectId: params.projectId,
        scheduledRevisionId: params.expectedScheduledRevisionId,
        scheduledPublishAt: params.expectedScheduledPublishAt,
        scheduledById: params.expectedScheduledById,
      },
      data: {
        scheduledRevisionId: null,
        scheduledPublishAt: null,
        scheduledById: null,
        updatedAt: params.updatedAt ?? new Date(),
      },
    });

    if (result.count !== 1) {
      return { updated: false };
    }

    const page = await this.findPageById(params.projectId, params.pageId);
    return { updated: true, page: page ?? undefined };
  }

  async setScheduledPublishedPagePointersAtomic(
    params: SetScheduledPublishedPagePointersAtomicParams
  ): Promise<{ updated: boolean; page?: LifecyclePage }> {
    const result = await (this.db as any).page.updateMany({
      where: {
        id: params.pageId,
        projectId: params.projectId,
        draftRevisionId: params.expectedDraftRevisionId,
        publishedRevisionId: params.expectedPreviousPublishedRevisionId,
        scheduledRevisionId: params.expectedScheduledRevisionId,
        scheduledPublishAt: params.expectedScheduledPublishAt,
        scheduledById: params.expectedScheduledById,
      },
      data: {
        publishedRevisionId: params.newPublishedRevisionId,
        draftRevisionId: null,
        scheduledRevisionId: null,
        scheduledPublishAt: null,
        scheduledById: null,
        updatedAt: params.updatedAt ?? new Date(),
      },
    });

    if (result.count !== 1) {
      return { updated: false };
    }

    const page = await this.findPageById(params.projectId, params.pageId);
    return { updated: true, page: page ?? undefined };
  }

  async setUnpublishedPagePointersAtomic(
    params: SetUnpublishedPagePointersAtomicParams
  ): Promise<{ updated: boolean; page?: LifecyclePage }> {
    const result = await (this.db as any).page.updateMany({
      where: {
        id: params.pageId,
        projectId: params.projectId,
        publishedRevisionId: params.expectedPublishedRevisionId,
        draftRevisionId: params.expectedDraftRevisionId,
      },
      data: {
        publishedRevisionId: null,
        draftRevisionId: params.newDraftRevisionId,
        updatedAt: params.updatedAt,
      },
    });

    if (result.count !== 1) {
      return { updated: false };
    }

    const page = await this.findPageById(params.projectId, params.pageId);
    return { updated: true, page: page ?? undefined };
  }

  async findPublishedReleaseLineage(
    projectId: string,
    pageId: string,
    revisionId: string
  ): Promise<PublishedReleaseLineage[]> {
    const items = await (this.db as any).contentReleaseItem.findMany({
      where: {
        pageId,
        revisionId,
        release: {
          projectId,
          status: 'PUBLISHED',
        },
      },
      include: {
        release: true,
      },
    });

    return items.map((item: any) => ({
      release: this.mapRelease(item.release),
      item: this.mapReleaseItem(item),
    }));
  }

  async createRollbackRelease(
    params: CreateRollbackReleaseParams
  ): Promise<LifecycleContentRelease> {
    const release = await (this.db as any).contentRelease.create({
      data: {
        projectId: params.projectId,
        status: 'ROLLED_BACK',
        createdById: params.createdById,
        publishedAt: null,
        rolledBackAt: params.rolledBackAt,
      },
    });
    return this.mapRelease(release);
  }

  async setRollbackPublishedPointerAtomic(
    params: SetRollbackPublishedPointerAtomicParams
  ): Promise<{ updated: boolean; page?: LifecyclePage }> {
    const result = await (this.db as any).page.updateMany({
      where: {
        id: params.pageId,
        projectId: params.projectId,
        draftRevisionId: null,
        publishedRevisionId: params.expectedPublishedRevisionId,
      },
      data: {
        publishedRevisionId: params.targetPublishedRevisionId,
        draftRevisionId: null,
        updatedAt: params.updatedAt,
      },
    });

    if (result.count !== 1) {
      return { updated: false };
    }

    const page = await this.findPageById(params.projectId, params.pageId);
    return { updated: true, page: page ?? undefined };
  }

  async setDraftFromPublishedPointerAtomic(
    params: SetDraftFromPublishedPointerAtomicParams
  ): Promise<{ updated: boolean; page?: LifecyclePage }> {
    const result = await (this.db as any).page.updateMany({
      where: {
        id: params.pageId,
        projectId: params.projectId,
        draftRevisionId: null,
        publishedRevisionId: params.expectedPublishedRevisionId,
      },
      data: {
        draftRevisionId: params.newDraftRevisionId,
        updatedAt: params.updatedAt ?? new Date(),
      },
    });

    if (result.count !== 1) {
      return { updated: false };
    }

    const page = await this.findPageById(params.projectId, params.pageId);
    return { updated: true, page: page ?? undefined };
  }

    async listProjectReleases(projectId: string): Promise<Array<{
    release: LifecycleContentRelease;
    items: Array<LifecycleContentReleaseItem & { pageTitle?: string; pageSlug?: string }>;
  }>> {
    const releases = await (this.db as any).contentRelease.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: {
            page: {
              select: {
                key: true,
                draftRevision: { select: { title: true, slug: true } },
                publishedRevision: { select: { title: true, slug: true } },
              },
            },
          },
        },
      },
    });

    return releases.map((rel: any) => ({
      release: this.mapRelease(rel),
      items: (rel.items || []).map((item: any) => {
        const title = item.page?.publishedRevision?.title || item.page?.draftRevision?.title || item.page?.key || item.pageId;
        const slug = item.page?.publishedRevision?.slug || item.page?.draftRevision?.slug || "";
        return {
          ...this.mapReleaseItem(item),
          pageTitle: title,
          pageSlug: slug,
        };
      }),
    }));
  }

  async listProjectRevisions(projectId: string, pageId?: string): Promise<LifecycleRevisionReadProjection[]> {
    const whereClause: any = {
      page: {
        projectId,
      },
    };
    if (pageId) {
      whereClause.pageId = pageId;
    }

    const revisions = await (this.db as any).pageRevision.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        page: {
          select: {
            key: true,
            draftRevisionId: true,
            publishedRevisionId: true,
            scheduledRevisionId: true,
            scheduledPublishAt: true,
            draftRevision: { select: { title: true, slug: true } },
            publishedRevision: { select: { title: true, slug: true } },
          },
        },
      },
    });

    return revisions.map((rev: any) => {
      const mapped = this.mapRevision(rev);
      const title = rev.title || rev.page?.publishedRevision?.title || rev.page?.draftRevision?.title || rev.page?.key || rev.pageId;
      const slug = rev.slug || rev.page?.publishedRevision?.slug || rev.page?.draftRevision?.slug || "";
      return {
        ...mapped,
        pageTitle: title,
        pageSlug: slug,
        draftRevisionId: rev.page?.draftRevisionId ?? null,
        publishedRevisionId: rev.page?.publishedRevisionId ?? null,
        scheduledRevisionId: rev.page?.scheduledRevisionId ?? null,
        scheduledPublishAt: rev.page?.scheduledPublishAt ?? null,
      };
    });
  }

  async recordAudit(params: RecordLifecycleAuditParams): Promise<void> {
    await safeLogAudit({
      action: params.action,
      scopeType: params.scopeType,
      scopeId: params.scopeId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      actorId: params.actorId,
      metadata: params.metadata,
      tx: this.db,
    });
  }

  private mapPage(raw: any): LifecyclePage {
    return {
      id: raw.id,
      projectId: raw.projectId,
      key: raw.key,
      parentId: raw.parentId,
      sortOrder: raw.sortOrder,
      draftRevisionId: raw.draftRevisionId,
      publishedRevisionId: raw.publishedRevisionId,
      scheduledRevisionId: raw.scheduledRevisionId ?? null,
      scheduledPublishAt: raw.scheduledPublishAt ?? null,
      scheduledById: raw.scheduledById ?? null,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  private mapRevision(raw: any): LifecyclePageRevision {
    return {
      id: raw.id,
      pageId: raw.pageId,
      revisionNumber: raw.revisionNumber,
      status: raw.status as LifecyclePageRevision['status'],
      title: raw.title,
      slug: raw.slug,
      locale: raw.locale,
      description: raw.description,
      visibility: raw.visibility as LifecyclePageRevision['visibility'],
      content: raw.content as unknown as PageContent,
      seo: (raw.seo || {}) as Record<string, unknown>,
      navigation: (raw.navigation || {}) as Record<string, unknown>,
      schemaVersion: raw.schemaVersion,
      lockVersion: raw.lockVersion,
      createdById: raw.createdById,
      createdAt: raw.createdAt,
      submittedAt: raw.submittedAt,
      approvedAt: raw.approvedAt,
      publishedAt: raw.publishedAt,
      derivedFromRevisionId: raw.derivedFromRevisionId,
    };
  }

  private mapRelease(raw: any): LifecycleContentRelease {
    return {
      id: raw.id,
      projectId: raw.projectId,
      status: raw.status as ContentReleaseStatus,
      createdById: raw.createdById,
      createdAt: raw.createdAt,
      publishedAt: raw.publishedAt,
      rolledBackAt: raw.rolledBackAt,
    };
  }

  private mapReleaseItem(raw: any): LifecycleContentReleaseItem {
    return {
      releaseId: raw.releaseId,
      pageId: raw.pageId,
      revisionId: raw.revisionId,
      previousRevisionId: raw.previousRevisionId,
    };
  }

  async reconcilePageMediaUsage(projectId: string, pageId: string): Promise<void> {
    // 1. Verify Page exists in projectId
    const page = await (this.db as any).page.findFirst({
      where: { id: pageId, projectId },
    });
    if (!page) {
      throw new ContentLifecycleError('PAGE_NOT_FOUND', `Page ${pageId} not found in project ${projectId}`);
    }

    // 2. Resolve current active pointer union
    const pointerRevisionIds = [
      page.publishedRevisionId,
      page.draftRevisionId,
      page.scheduledRevisionId,
    ].filter((id): id is string => Boolean(id));

    const uniqueRevisionIds = Array.from(new Set(pointerRevisionIds));

    // 3 & 4. Load those revisions and verify every resolved revision belongs to that exact Page
    let revisions: any[] = [];
    if (uniqueRevisionIds.length > 0) {
      revisions = await (this.db as any).pageRevision.findMany({
        where: { id: { in: uniqueRevisionIds } },
      });
      if (revisions.length !== uniqueRevisionIds.length) {
        throw new ContentLifecycleError('POINTER_INTEGRITY_VIOLATION', `One or more active revisions not found for page ${pageId}`);
      }
      for (const rev of revisions) {
        if (rev.pageId !== pageId) {
          throw new ContentLifecycleError('POINTER_INTEGRITY_VIOLATION', `Revision ${rev.id} does not belong to page ${pageId}`);
        }
      }
    }

    // 5. Extract CMS-owned media references from active revisions using documented precedence:
    // Precedence: 1. publishedRevision, 2. draftRevision, 3. scheduledRevision
    const desiredMap = new Map<string, {
      assetId: string;
      pageId: string;
      pageTitle: string;
      pageSlug: string;
      blockId?: string;
      blockType?: string;
      field?: string;
    }>();

    const revByPointer: Array<{ rev: any; precedence: number }> = [];
    if (page.publishedRevisionId) {
      const rev = revisions.find((r) => r.id === page.publishedRevisionId);
      if (rev) revByPointer.push({ rev, precedence: 1 });
    }
    if (page.draftRevisionId) {
      const rev = revisions.find((r) => r.id === page.draftRevisionId);
      if (rev) revByPointer.push({ rev, precedence: 2 });
    }
    if (page.scheduledRevisionId) {
      const rev = revisions.find((r) => r.id === page.scheduledRevisionId);
      if (rev) revByPointer.push({ rev, precedence: 3 });
    }

    // Sort by precedence (lower number = higher precedence)
    revByPointer.sort((a, b) => a.precedence - b.precedence);

    for (const { rev } of revByPointer) {
      const extracted = extractMediaReferences(rev.content);
      const title = rev.title || page.key;
      const slug = rev.slug || page.key;

      for (const ref of extracted) {
        const logicalKey = `${ref.assetId}:::${ref.blockId || ""}:::${ref.field || ""}`;
        if (!desiredMap.has(logicalKey)) {
          desiredMap.set(logicalKey, {
            assetId: ref.assetId,
            pageId,
            pageTitle: title,
            pageSlug: slug,
            blockId: ref.blockId,
            blockType: ref.blockType,
            field: ref.field,
          });
        }
      }
    }

    const desiredRefs = Array.from(desiredMap.values());
    const referencedAssetIds = Array.from(new Set(desiredRefs.map((r) => r.assetId)));

    // 6 & 7. For every assetId: verify MediaAsset exists and MediaAsset.projectId === Page.projectId
    if (referencedAssetIds.length > 0) {
      const assets = await (this.db as any).mediaAsset.findMany({
        where: { id: { in: referencedAssetIds } },
      });
      const foundAssetMap = new Map<string, any>(assets.map((a: any) => [a.id, a]));

      for (const assetId of referencedAssetIds) {
        const asset = foundAssetMap.get(assetId);
        if (!asset) {
          throw new ContentLifecycleError('INVALID_INPUT', `Media asset not found: ${assetId}`);
        }
        if (asset.projectId !== projectId) {
          throw new ContentLifecycleError('FORBIDDEN', `Media asset ${assetId} does not belong to project ${projectId}`);
        }
      }
    }

    // 8, 9, 10. Reconcile MediaUsageReference rows and recalculate usageCount
    const existingRefs = await (this.db as any).mediaUsageReference.findMany({
      where: { pageId },
    });

    const affectedAssetIds = new Set<string>();
    for (const r of existingRefs) affectedAssetIds.add(r.assetId);
    for (const r of desiredRefs) affectedAssetIds.add(r.assetId);

    // Delete existing rows for this page
    await (this.db as any).mediaUsageReference.deleteMany({
      where: { pageId },
    });

    // Create desired rows
    for (const r of desiredRefs) {
      await (this.db as any).mediaUsageReference.create({
        data: {
          assetId: r.assetId,
          pageId,
          pageTitle: r.pageTitle,
          pageSlug: r.pageSlug,
          blockId: r.blockId || null,
          blockType: r.blockType || null,
          field: r.field || null,
        },
      });
    }

    // Recalculate usageCount from ACTUAL MediaUsageReference rows for every affected asset
    for (const assetId of affectedAssetIds) {
      const actualCount = await (this.db as any).mediaUsageReference.count({
        where: { assetId },
      });
      await (this.db as any).mediaAsset.update({
        where: { id: assetId },
        data: { usageCount: actualCount },
      });
    }
  }

}
