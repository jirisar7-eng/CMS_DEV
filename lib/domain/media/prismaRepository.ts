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
  MediaAssetVersionSecurity,
  MediaType
} from './types';
import { resolveMediaType } from './mockProviders';

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

  async createAsset(
    assetInput: Omit<MediaAsset, 'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'usageReferences'>
  ): Promise<MediaAsset> {
    const dbAsset = await this.prisma.mediaAsset.create({
      data: {
        storageKey: assetInput.storageKey,
        filename: assetInput.filename,
        mimeType: assetInput.mimeType,
        mediaType: assetInput.mediaType,
        sizeBytes: assetInput.sizeBytes,
        dimensions: assetInput.dimensions ? (assetInput.dimensions as any) : undefined,
        url: assetInput.url,
        status: assetInput.status,
        metadata: assetInput.metadata as any,
        projectId: assetInput.projectId,
        security: assetInput.security as any,
      },
      include: {
        usageReferences: true,
      },
    });
    return this.mapAsset(dbAsset);
  }

  async getById(id: string, projectId: string): Promise<MediaAsset | undefined> {
    if (!projectId) return undefined;
    const dbAsset = await this.prisma.mediaAsset.findFirst({
      where: {
        id,
        projectId,
      },
      include: {
        usageReferences: true,
      },
    });
    if (!dbAsset) return undefined;
    return this.mapAsset(dbAsset);
  }

  async list(projectId: string, filters?: MediaFilterOptions): Promise<MediaAsset[]>;
  async list(filters?: MediaFilterOptions, projectIdOrFilters?: string): Promise<MediaAsset[]>;
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
    if (!projectId) return undefined;
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
    projectId: string
  ): Promise<MediaAssetVersion> {
    if (!projectId) {
      throw new Error('projectId is required for createVersion');
    }
    const asset = await this.getById(assetId, projectId);
    if (!asset) {
      throw new Error(`Asset not found in project ${projectId}`);
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

  async listVersions(assetId: string, projectId: string): Promise<MediaAssetVersion[]> {
    if (!projectId) return [];
    const asset = await this.getById(assetId, projectId);
    if (!asset) return [];

    const dbVersions = await this.prisma.mediaAssetVersion.findMany({
      where: { assetId },
      orderBy: { versionNumber: 'desc' },
    });
    return dbVersions.map(v => this.mapVersion(v));
  }

  async replaceAsset(
    assetId: string,
    newRecord: {
      storageKey: string;
      filename: string;
      mimeType: string;
      mediaType: MediaType;
      sizeBytes: number;
      status: MediaStatus;
      security: MediaSecurityInfo;
    },
    previousVersion: Omit<MediaAssetVersion, 'id' | 'versionNumber' | 'createdAt' | 'updatedAt' | 'assetId'>,
    projectId: string
  ): Promise<MediaAsset> {
    if (!projectId) {
      throw new Error('projectId is required for replaceAsset');
    }
    const asset = await this.getById(assetId, projectId);
    if (!asset) {
      throw new Error(`Asset not found in project ${projectId}`);
    }

    return await this.prisma.$transaction(async (tx: any) => {
      const aggregate = await tx.mediaAssetVersion.aggregate({
        where: { assetId },
        _max: { versionNumber: true },
      });
      const nextVersion = (aggregate._max.versionNumber ?? 0) + 1;

      await tx.mediaAssetVersion.create({
        data: {
          assetId,
          versionNumber: nextVersion,
          status: previousVersion.status,
          mimeType: previousVersion.mimeType,
          sizeBytes: previousVersion.sizeBytes,
          storageKey: previousVersion.storageKey || null,
          security: previousVersion.security as any,
          originalFilename: previousVersion.originalFilename || null,
        },
      });

      const updated = await tx.mediaAsset.update({
        where: { id: assetId },
        data: {
          storageKey: newRecord.storageKey,
          filename: newRecord.filename,
          mimeType: newRecord.mimeType,
          mediaType: newRecord.mediaType,
          sizeBytes: newRecord.sizeBytes,
          status: newRecord.status,
          security: newRecord.security as any,
          updatedAt: new Date(),
        },
        include: {
          usageReferences: true,
        },
      });

      return this.mapAsset(updated);
    });
  }

  async setCurrentVersion(assetId: string, versionId: string, projectId: string): Promise<MediaAsset | undefined> {
    if (!projectId) return undefined;
    const asset = await this.getById(assetId, projectId);
    if (!asset) return undefined;

    const version = await this.prisma.mediaAssetVersion.findFirst({
      where: { id: versionId, assetId },
    });
    if (!version) return undefined;

    return await this.prisma.$transaction(async (tx: any) => {
      // 1. Snapshot current asset into a new MediaAssetVersion before switching
      const aggregate = await tx.mediaAssetVersion.aggregate({
        where: { assetId },
        _max: { versionNumber: true },
      });
      const nextVersion = (aggregate._max.versionNumber ?? 0) + 1;

      const currentSec = (asset.security as any) || {};
      const currentVersionSecurity: MediaAssetVersionSecurity = {
        ...currentSec,
        validated: currentSec.clean ?? false,
        validatedAt: currentSec.scannedAt || new Date().toISOString(),
        canonicalChecksumSha256: currentSec.checksumSha256,
        sourceChecksumSha256: currentSec.checksumSha256,
      };

      await tx.mediaAssetVersion.create({
        data: {
          assetId,
          versionNumber: nextVersion,
          status: asset.status,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          storageKey: asset.storageKey || null,
          security: currentVersionSecurity as any,
          originalFilename: asset.filename || null,
        },
      });

      // 2. Strict evaluation of target version security evidence
      const vSec = (version.security as any) || {};
      const isSvg = version.mimeType === 'image/svg+xml' || (version.originalFilename?.endsWith('.svg') ?? false);

      let targetStatus: MediaStatus = 'QUARANTINED';
      let assetSecurity: MediaSecurityInfo;

      if (isSvg) {
        const hasValidSvgEvidence = Boolean(
          vSec.pipelineId &&
          (vSec.clean === true || vSec.validated === true) &&
          !vSec.threat
        );

        if (hasValidSvgEvidence && version.status !== 'QUARANTINED' && version.status !== 'rejected') {
          targetStatus = version.status === 'PUBLISHED' ? 'READY' : (version.status as MediaStatus) || 'READY';
          assetSecurity = {
            scanned: true,
            clean: true,
            activeContent: true,
            checksumSha256: vSec.checksumSha256 || vSec.canonicalChecksumSha256 || '',
            scannedAt: vSec.scannedAt || vSec.validatedAt || new Date().toISOString(),
            pipelineId: vSec.pipelineId,
            scannerId: vSec.scannerId || 'svg-sanitizer-pipeline',
            scannerReason: vSec.scannerReason || 'CLEAN',
            contentVerified: true,
          };
        } else {
          targetStatus = 'QUARANTINED';
          assetSecurity = {
            scanned: vSec.scanned ?? vSec.validated ?? false,
            clean: false,
            threat: vSec.threat,
            activeContent: true,
            checksumSha256: vSec.checksumSha256 || vSec.canonicalChecksumSha256 || '',
            scannedAt: vSec.scannedAt || vSec.validatedAt || new Date().toISOString(),
            pipelineId: vSec.pipelineId,
            scannerId: vSec.scannerId,
            scannerReason: vSec.scannerReason || 'INSUFFICIENT_SECURITY_EVIDENCE',
            contentVerified: false,
          };
        }
      } else {
        const hasValidNonSvgEvidence = Boolean(
          vSec.contentVerified === true &&
          vSec.scanned === true &&
          vSec.clean === true &&
          vSec.scannerId === 'clamav' &&
          Boolean(vSec.checksumSha256 || vSec.canonicalChecksumSha256) &&
          !vSec.threat
        );

        if (hasValidNonSvgEvidence && version.status !== 'QUARANTINED' && version.status !== 'rejected') {
          targetStatus = version.status === 'PUBLISHED' ? 'READY' : (version.status as MediaStatus) || 'READY';
          assetSecurity = {
            scanned: true,
            clean: true,
            contentVerified: true,
            activeContent: false,
            checksumSha256: vSec.checksumSha256 || vSec.canonicalChecksumSha256 || '',
            scannedAt: vSec.scannedAt || vSec.validatedAt || new Date().toISOString(),
            scannerId: 'clamav',
            scannerReason: vSec.scannerReason || 'CLEAN',
          };
        } else {
          targetStatus = 'QUARANTINED';
          assetSecurity = {
            scanned: vSec.scanned ?? false,
            clean: false,
            contentVerified: vSec.contentVerified ?? false,
            threat: vSec.threat,
            activeContent: false,
            checksumSha256: vSec.checksumSha256 || vSec.canonicalChecksumSha256 || '',
            scannedAt: vSec.scannedAt || vSec.validatedAt || new Date().toISOString(),
            scannerId: vSec.scannerId,
            scannerReason: vSec.scannerReason || 'INSUFFICIENT_SECURITY_EVIDENCE',
          };
        }
      }

      const updated = await tx.mediaAsset.update({
        where: { id: assetId },
        data: {
          storageKey: version.storageKey || undefined,
          filename: version.originalFilename || asset.filename,
          mimeType: version.mimeType,
          mediaType: resolveMediaType(version.mimeType, version.originalFilename || asset.filename),
          sizeBytes: version.sizeBytes,
          status: targetStatus,
          security: assetSecurity as any,
          updatedAt: new Date(),
        },
        include: {
          usageReferences: true,
        },
      });

      return this.mapAsset(updated);
    });
  }

  async changeStatus(id: string, status: MediaStatus, projectId: string): Promise<MediaAsset | undefined> {
    if (!projectId) return undefined;
    const asset = await this.getById(id, projectId);
    if (!asset) return undefined;

    const updated = await this.prisma.mediaAsset.update({
      where: { id },
      data: { status },
      include: {
        usageReferences: true,
      },
    });
    return this.mapAsset(updated);
  }

  async addUsageReference(assetId: string, reference: Omit<MediaUsageReference, 'id' | 'usedAt'>, projectId: string): Promise<MediaUsageReference> {
    if (!projectId) {
      throw new Error('projectId is required for addUsageReference');
    }
    const asset = await this.getById(assetId, projectId);
    if (!asset) {
      throw new Error(`Asset ${assetId} not found in project ${projectId}`);
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

  async removeUsageReference(assetId: string, referenceId: string, projectId: string): Promise<void> {
    if (!projectId) return;
    const asset = await this.getById(assetId, projectId);
    if (!asset) return;

    await this.prisma.mediaUsageReference.delete({
      where: { id: referenceId },
    });

    const currentAsset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      select: { usageCount: true },
    });
    if (currentAsset) {
      await this.prisma.mediaAsset.update({
        where: { id: assetId },
        data: {
          usageCount: Math.max(0, (currentAsset.usageCount || 0) - 1),
        },
      });
    }
  }

  async listUsageReferences(assetId: string, projectId: string): Promise<MediaUsageReference[]> {
    if (!projectId) return [];
    const asset = await this.getById(assetId, projectId);
    if (!asset) return [];

    const dbRefs = await this.prisma.mediaUsageReference.findMany({
      where: { assetId },
      orderBy: { usedAt: 'desc' },
    });
    return dbRefs.map((r: any) => this.mapUsageReference(r));
  }

  async isDeletionAllowed(id: string, projectId: string): Promise<boolean> {
    if (!projectId) return false;
    const asset = await this.getById(id, projectId);
    if (!asset) return false;
    const statusUpper = (asset.status as string).toUpperCase();
    return asset.usageCount === 0 && statusUpper !== 'PUBLISHED';
  }

  async archiveAsset(id: string, projectId: string): Promise<MediaAsset | undefined> {
    return this.changeStatus(id, 'ARCHIVED', projectId);
  }

  async deleteAsset(id: string, projectId: string): Promise<void> {
    if (!projectId) {
      throw new Error('projectId is required for deleteAsset');
    }
    const allowed = await this.isDeletionAllowed(id, projectId);
    if (!allowed) {
      throw new Error('Deletion is not allowed for this asset (it is either published, still in use, or not found in project)');
    }
    await this.prisma.mediaAsset.delete({
      where: { id },
    });
  }
}
