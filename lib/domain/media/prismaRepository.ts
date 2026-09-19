import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  IMediaRepository,
  MediaAsset,
  MediaAssetVersion,
  MediaUsageReference,
  MediaFilterOptions,
  MediaStatus,
  MediaMetadata,
  MediaDimensions,
  MediaSecurityInfo,
  MediaAssetVersionSecurity
} from './types';

export class PrismaMediaRepository implements IMediaRepository {
  private get prisma() {
    return prisma;
  }

  private mapAsset(dbAsset: any): MediaAsset {
    return {
      id: dbAsset.id,
      storageKey: dbAsset.storageKey,
      filename: dbAsset.filename,
      mimeType: dbAsset.mimeType,
      mediaType: dbAsset.mediaType as any,
      sizeBytes: dbAsset.sizeBytes,
      dimensions: dbAsset.dimensions ? (dbAsset.dimensions as MediaDimensions) : undefined,
      url: dbAsset.url,
      status: dbAsset.status as MediaStatus,
      metadata: dbAsset.metadata as MediaMetadata,
      projectId: dbAsset.projectId,
      createdAt: dbAsset.createdAt instanceof Date ? dbAsset.createdAt.toISOString() : dbAsset.createdAt,
      updatedAt: dbAsset.updatedAt instanceof Date ? dbAsset.updatedAt.toISOString() : dbAsset.updatedAt,
      usageCount: dbAsset.usageCount,
      usageReferences: (dbAsset.usageReferences || []).map(this.mapUsageReference),
      security: dbAsset.security as MediaSecurityInfo,
    };
  }

  private mapVersion(dbVersion: any): MediaAssetVersion {
    return {
      id: dbVersion.id,
      assetId: dbVersion.assetId,
      versionNumber: dbVersion.versionNumber,
      status: dbVersion.status as any,
      mimeType: dbVersion.mimeType,
      sizeBytes: dbVersion.sizeBytes,
      storageKey: dbVersion.storageKey || undefined,
      createdAt: dbVersion.createdAt instanceof Date ? dbVersion.createdAt.toISOString() : dbVersion.createdAt,
      updatedAt: dbVersion.updatedAt instanceof Date ? dbVersion.updatedAt.toISOString() : dbVersion.updatedAt,
      security: dbVersion.security as MediaAssetVersionSecurity,
      originalFilename: dbVersion.originalFilename || undefined,
    };
  }

  private mapUsageReference(dbRef: any): MediaUsageReference {
    return {
      id: dbRef.id,
      pageId: dbRef.pageId,
      pageTitle: dbRef.pageTitle,
      pageSlug: dbRef.pageSlug,
      blockId: dbRef.blockId || undefined,
      blockType: dbRef.blockType || undefined,
      field: dbRef.field || undefined,
      usedAt: dbRef.usedAt instanceof Date ? dbRef.usedAt.toISOString() : dbRef.usedAt,
    };
  }

  async createAsset(assetInput: Omit<MediaAsset, 'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'usageReferences'>): Promise<MediaAsset> {
    if (!assetInput.projectId) {
      throw new Error('projectId is required for creating a media asset');
    }
    const dbAsset = await this.prisma.mediaAsset.create({
      data: {
        storageKey: assetInput.storageKey,
        filename: assetInput.filename,
        mimeType: assetInput.mimeType,
        mediaType: assetInput.mediaType,
        sizeBytes: assetInput.sizeBytes,
        dimensions: (assetInput.dimensions as any) ?? Prisma.JsonNull,
        url: assetInput.url,
        status: assetInput.status,
        metadata: (assetInput.metadata as any) ?? Prisma.JsonNull,
        projectId: assetInput.projectId,
        security: (assetInput.security as any) ?? Prisma.JsonNull,
        usageCount: 0,
      },
      include: {
        usageReferences: true,
      },
    });
    return this.mapAsset(dbAsset);
  }

  async getById(id: string, projectId?: string): Promise<MediaAsset | undefined> {
    const where: Prisma.MediaAssetWhereUniqueInput = { id };
    const dbAsset = await this.prisma.mediaAsset.findUnique({
      where,
      include: {
        usageReferences: true,
      },
    });
    if (!dbAsset) return undefined;
    if (projectId && dbAsset.projectId !== projectId) {
      return undefined;
    }
    return this.mapAsset(dbAsset);
  }

  async list(projectIdOrFilters?: string | MediaFilterOptions, filtersArg?: MediaFilterOptions): Promise<MediaAsset[]> {
    let projectId: string | undefined;
    let filters: MediaFilterOptions | undefined;

    if (typeof projectIdOrFilters === 'string') {
      projectId = projectIdOrFilters;
      filters = filtersArg;
    } else {
      filters = projectIdOrFilters;
    }

    const where: Prisma.MediaAssetWhereInput = {};

    if (projectId) {
      where.projectId = projectId;
    }

    if (filters) {
      if (filters.status && filters.status !== 'all') {
        where.status = filters.status;
      }
      if (filters.mediaType && filters.mediaType !== 'all') {
        where.mediaType = filters.mediaType;
      }
      if (filters.search) {
        where.filename = {
          contains: filters.search,
          mode: 'insensitive',
        };
      }
    }

    let orderBy: Prisma.MediaAssetOrderByWithRelationInput = { createdAt: 'desc' };
    if (filters?.sort) {
      switch (filters.sort) {
        case 'createdAt_asc':
          orderBy = { createdAt: 'asc' };
          break;
        case 'createdAt_desc':
          orderBy = { createdAt: 'desc' };
          break;
        case 'size_asc':
          orderBy = { sizeBytes: 'asc' };
          break;
        case 'size_desc':
          orderBy = { sizeBytes: 'desc' };
          break;
        case 'usage_desc':
          orderBy = { usageCount: 'desc' };
          break;
        default:
          orderBy = { createdAt: 'desc' };
          break;
      }
    }

    const dbAssets = await this.prisma.mediaAsset.findMany({
      where,
      orderBy,
      include: {
        usageReferences: true,
      },
    });

    return dbAssets.map(asset => this.mapAsset(asset));
  }

  async updateUrl(id: string, url: string, projectId?: string): Promise<MediaAsset | undefined> {
    if (projectId) {
      const existing = await this.getById(id, projectId);
      if (!existing) return undefined;
    }

    const updated = await this.prisma.mediaAsset.update({
      where: { id },
      data: { url },
      include: {
        usageReferences: true,
      },
    });
    return this.mapAsset(updated);
  }

  async updateMetadata(id: string, metadata: Partial<MediaMetadata>, projectId?: string): Promise<MediaAsset | undefined> {
    const current = await this.getById(id, projectId);
    if (!current) return undefined;

    const mergedMetadata = {
      ...current.metadata,
      ...metadata,
    };

    const updated = await this.prisma.mediaAsset.update({
      where: { id },
      data: {
        metadata: mergedMetadata as any,
      },
      include: {
        usageReferences: true,
      },
    });

    return this.mapAsset(updated);
  }

  async createVersion(
    assetId: string,
    versionInput: Omit<MediaAssetVersion, 'id' | 'versionNumber' | 'createdAt' | 'updatedAt' | 'assetId'>,
    projectId?: string
  ): Promise<MediaAssetVersion> {
    if (projectId) {
      const asset = await this.getById(assetId, projectId);
      if (!asset) {
        throw new Error(`Asset not found in project ${projectId}`);
      }
    }

    const aggregate = await this.prisma.mediaAssetVersion.aggregate({
      where: { assetId },
      _max: { versionNumber: true },
    });
    const nextVersion = (aggregate._max.versionNumber ?? 0) + 1;

    const dbVersion = await this.prisma.mediaAssetVersion.create({
      data: {
        assetId,
        versionNumber: nextVersion,
        status: versionInput.status,
        mimeType: versionInput.mimeType,
        sizeBytes: versionInput.sizeBytes,
        storageKey: versionInput.storageKey || null,
        security: versionInput.security as any,
        originalFilename: versionInput.originalFilename || null,
      },
    });

    return this.mapVersion(dbVersion);
  }

  async listVersions(assetId: string, projectId?: string): Promise<MediaAssetVersion[]> {
    if (projectId) {
      const asset = await this.getById(assetId, projectId);
      if (!asset) return [];
    }

    const dbVersions = await this.prisma.mediaAssetVersion.findMany({
      where: { assetId },
      orderBy: { versionNumber: 'desc' },
    });
    return dbVersions.map(v => this.mapVersion(v));
  }

  async setCurrentVersion(assetId: string, versionId: string, projectId?: string): Promise<MediaAsset | undefined> {
    if (projectId) {
      const asset = await this.getById(assetId, projectId);
      if (!asset) return undefined;
    }

    const version = await this.prisma.mediaAssetVersion.findFirst({
      where: { id: versionId, assetId },
    });
    if (!version) return undefined;

    const updated = await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: {
        storageKey: version.storageKey || undefined,
        mimeType: version.mimeType,
        sizeBytes: version.sizeBytes,
      },
      include: {
        usageReferences: true,
      },
    });

    return this.mapAsset(updated);
  }

  async changeStatus(id: string, status: MediaStatus, projectId?: string): Promise<MediaAsset | undefined> {
    if (projectId) {
      const asset = await this.getById(id, projectId);
      if (!asset) return undefined;
    }

    const updated = await this.prisma.mediaAsset.update({
      where: { id },
      data: { status },
      include: {
        usageReferences: true,
      },
    });
    return this.mapAsset(updated);
  }

  async addUsageReference(assetId: string, reference: Omit<MediaUsageReference, 'id' | 'usedAt'>, projectId?: string): Promise<MediaUsageReference> {
    const asset = await this.getById(assetId, projectId);
    if (!asset) {
      throw new Error(`Asset ${assetId} not found in project ${projectId || 'any'}`);
    }

    // Verify referenced Page belongs to the same project
    const page = await this.prisma.page.findUnique({
      where: { id: reference.pageId },
      select: { projectId: true },
    });

    if (!page || page.projectId !== asset.projectId) {
      throw new Error(`Referenced page ${reference.pageId} does not belong to the same project as the media asset (${asset.projectId})`);
    }

    const dbRef = await this.prisma.mediaUsageReference.create({
      data: {
        assetId,
        pageId: reference.pageId,
        pageTitle: reference.pageTitle,
        pageSlug: reference.pageSlug,
        blockId: reference.blockId || null,
        blockType: reference.blockType || null,
        field: reference.field || null,
      },
    });

    await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: {
        usageCount: {
          increment: 1,
        },
      },
    });

    return this.mapUsageReference(dbRef);
  }

  async removeUsageReference(assetId: string, referenceId: string, projectId?: string): Promise<void> {
    if (projectId) {
      const asset = await this.getById(assetId, projectId);
      if (!asset) return;
    }

    await this.prisma.mediaUsageReference.delete({
      where: { id: referenceId },
    });

    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      select: { usageCount: true },
    });

    if (asset) {
      await this.prisma.mediaAsset.update({
        where: { id: assetId },
        data: {
          usageCount: Math.max(0, (asset.usageCount || 0) - 1),
        },
      });
    }
  }

  async listUsageReferences(assetId: string, projectId?: string): Promise<MediaUsageReference[]> {
    if (projectId) {
      const asset = await this.getById(assetId, projectId);
      if (!asset) return [];
    }

    const dbRefs = await this.prisma.mediaUsageReference.findMany({
      where: { assetId },
      orderBy: { usedAt: 'desc' },
    });
    return dbRefs.map(r => this.mapUsageReference(r));
  }

  async isDeletionAllowed(id: string, projectId?: string): Promise<boolean> {
    const asset = await this.getById(id, projectId);
    if (!asset) return false;
    const statusUpper = (asset.status as string).toUpperCase();
    return asset.usageCount === 0 && statusUpper !== 'PUBLISHED';
  }

  async archiveAsset(id: string, projectId?: string): Promise<MediaAsset | undefined> {
    return this.changeStatus(id, 'ARCHIVED', projectId);
  }

  async deleteAsset(id: string, projectId?: string): Promise<void> {
    const allowed = await this.isDeletionAllowed(id, projectId);
    if (!allowed) {
      throw new Error('Deletion is not allowed for this asset (it is either published, still in use, or not found in project)');
    }
    await this.prisma.mediaAsset.delete({
      where: { id },
    });
  }
}
