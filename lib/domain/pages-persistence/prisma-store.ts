import 'server-only';

import { prisma } from '@/lib/db';
import { isDatabaseConfigured } from '@/lib/runtime/database';
import type { PrismaClient } from '@prisma/client';
import type { AdminPagesReadStore } from './store';
import type {
  PersistencePage,
  PersistencePageRevision,
  PersistenceUser,
  PersistenceAuditLog,
} from './types';
import { AdminPagesPersistenceError } from './types';

export class PrismaAdminPagesReadStore implements AdminPagesReadStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  private ensureDatabaseAvailable() {
    if (!isDatabaseConfigured()) {
      throw new AdminPagesPersistenceError(
        'DATABASE_UNAVAILABLE',
        'Database connection is not configured in the runtime environment'
      );
    }
  }

  async listProjectPages(projectId: string): Promise<PersistencePage[]> {
    this.ensureDatabaseAvailable();

    const pages = await this.db.page.findMany({
      where: { projectId },
      include: {
        draftRevision: true,
        publishedRevision: true,
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });

    return pages as unknown as PersistencePage[];
  }

  async getProjectPage(
    projectId: string,
    pageId: string
  ): Promise<PersistencePage | null> {
    this.ensureDatabaseAvailable();

    const page = await this.db.page.findFirst({
      where: {
        id: pageId,
        projectId,
      },
      include: {
        draftRevision: true,
        publishedRevision: true,
      },
    });

    return (page as unknown as PersistencePage) || null;
  }

  async getProjectRevision(
    pageId: string,
    revisionId: string
  ): Promise<PersistencePageRevision | null> {
    this.ensureDatabaseAvailable();

    const revision = await this.db.pageRevision.findFirst({
      where: {
        id: revisionId,
        pageId,
      },
    });

    return (revision as unknown as PersistencePageRevision) || null;
  }

  async listPageRevisions(pageId: string): Promise<PersistencePageRevision[]> {
    this.ensureDatabaseAvailable();

    const revisions = await this.db.pageRevision.findMany({
      where: {
        pageId,
      },
      orderBy: {
        revisionNumber: 'desc',
      },
    });

    return revisions as unknown as PersistencePageRevision[];
  }

  async getUsersByIds(userIds: string[]): Promise<Map<string, PersistenceUser>> {
    this.ensureDatabaseAvailable();

    const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
    const map = new Map<string, PersistenceUser>();

    if (uniqueIds.length === 0) {
      return map;
    }

    const users = await this.db.user.findMany({
      where: {
        id: { in: uniqueIds },
      },
      select: {
        id: true,
        displayName: true,
      },
    });

    for (const u of users) {
      map.set(u.id, u);
    }

    return map;
  }

  async listPageAuditEvents(
    projectId: string,
    pageId: string
  ): Promise<PersistenceAuditLog[]> {
    this.ensureDatabaseAvailable();

    const logs = await this.db.auditLog.findMany({
      where: {
        scopeType: 'PROJECT',
        scopeId: projectId,
      },
      include: {
        actor: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });

    const relevant = logs.filter((log) => {
      if (log.resourceId === pageId) return true;
      if (log.metadata && typeof log.metadata === 'object') {
        const meta = log.metadata as Record<string, unknown>;
        if (meta.pageId === pageId) return true;
      }
      return false;
    });

    return relevant as unknown as PersistenceAuditLog[];
  }
}
