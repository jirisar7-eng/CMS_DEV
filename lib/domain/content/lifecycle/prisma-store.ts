import { prisma } from '@/lib/db';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  ContentLifecycleStore,
  CreatePageWithDraftParams,
  UpdateDraftRevisionAtomicParams,
  TransitionRevisionStatusAtomicParams,
  ClaimRevisionLockAtomicParams,
  CreateDraftRevisionFromSourceParams,
  SetPageDraftRevisionPointerParams,
  RecordLifecycleAuditParams,
} from './store';
import { LifecyclePage, LifecyclePageRevision, ContentLifecycleError } from './types';
import { PageContent } from '../contracts';
import { logAudit } from '@/lib/auth/audit';

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

export class PrismaContentLifecycleStore implements ContentLifecycleStore {
  constructor(private readonly db: PrismaClientOrTx = prisma) {}

  async transaction<T>(fn: (txStore: ContentLifecycleStore) => Promise<T>): Promise<T> {
    if ('$transaction' in this.db && typeof (this.db as PrismaClient).$transaction === 'function') {
      return (this.db as PrismaClient).$transaction(async (tx) => {
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

  async recordAudit(params: RecordLifecycleAuditParams): Promise<void> {
    await logAudit({
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
}
