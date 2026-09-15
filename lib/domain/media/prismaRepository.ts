import { PrismaClient, Prisma } from '@prisma/client';
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

let prismaInstance: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    const url = process.env['DATABASE_URL'];
    if (!url) {
      throw new Error('DATABASE_URL is not defined in the environment');
    }
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

export class PrismaMediaRepository implements IMediaRepository {
  private get prisma(): PrismaClient {
    return getPrismaClient();
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

  async getById(id: string): Promise<MediaAsset | undefined> {
    const dbAsset = await this.prisma.mediaAsset.findUnique({
      where: { id },
      include: {
        usageReferences: true,
      },
    });
    if (!dbAsset) return undefined;
    return this.mapAsset(dbAsset);
  }

  async list(filters?: MediaFilterOptions): Promise<MediaAsset[]> {
    const where: Prisma.MediaAssetWhereInput = {};

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

  async updateUrl(id: string, url: string): Promise<MediaAsset | undefined> {
    const updated = await this.prisma.mediaAsset.update({
      where: { id },
      data: { url },
      include: {
        usageReferences: true,
      },
    });
    return this.mapAsset(updated);
  }

  async updateMetadata(id: string, metadata: Partial<MediaMetadata>): Promise<MediaAsset | undefined> {
    const current = await this.getById(id);
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
    versionInput: Omit<MediaAssetVersion, 'id' | 'versionNumber' | 'createdAt' | 'updatedAt' | 'assetId'>
  ): Promise<MediaAssetVersion> {
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

  async listVersions(assetId: string): Promise<MediaAssetVersion[]> {
    const dbVersions = await this.prisma.mediaAssetVersion.findMany({
      where: { assetId },
      orderBy: { versionNumber: 'desc' },
    });
    return dbVersions.map(v => this.mapVersion(v));
  }

  async setCurrentVersion(assetId: string, versionId: string): Promise<MediaAsset | undefined> {
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

  async changeStatus(id: string, status: MediaStatus): Promise<MediaAsset | undefined> {
    const updated = await this.prisma.mediaAsset.update({
      where: { id },
      data: { status },
      include: {
        usageReferences: true,
      },
    });
    return this.mapAsset(updated);
  }

  async addUsageReference(assetId: string, reference: Omit<MediaUsageReference, 'id' | 'usedAt'>): Promise<MediaUsageReference> {
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

  async removeUsageReference(assetId: string, referenceId: string): Promise<void> {
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

  async listUsageReferences(assetId: string): Promise<MediaUsageReference[]> {
    const dbRefs = await this.prisma.mediaUsageReference.findMany({
      where: { assetId },
      orderBy: { usedAt: 'desc' },
    });
    return dbRefs.map(r => this.mapUsageReference(r));
  }

  async isDeletionAllowed(id: string): Promise<boolean> {
    const asset = await this.getById(id);
    if (!asset) return false;
    return asset.usageCount === 0 && (asset.status as string) !== 'PUBLISHED' && (asset.status as string) !== 'published';
  }

  async archiveAsset(id: string): Promise<MediaAsset | undefined> {
    return this.changeStatus(id, 'ARCHIVED');
  }

  async deleteAsset(id: string): Promise<void> {
    const allowed = await this.isDeletionAllowed(id);
    if (!allowed) {
      throw new Error('Deletion is not allowed for this asset (it is either published or still in use)');
    }
    await this.prisma.mediaAsset.delete({
      where: { id },
    });
  }
}
