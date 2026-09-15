import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from '../../../prisma/schema.d';
import contractJson from '../../../prisma/schema.json' with { type: 'json' };

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

let dbInstance: ReturnType<typeof postgres<Contract>> | null = null;

export function getDbClient() {
  if (!dbInstance) {
    const url = process.env['DATABASE_URL'];
    if (!url) {
      throw new Error('DATABASE_URL is not defined in the environment');
    }
    dbInstance = postgres<Contract>({
      contractJson: contractJson as any,
      url,
    });
  }
  return dbInstance;
}

export class PrismaMediaRepository implements IMediaRepository {
  private get db() {
    return getDbClient();
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
    const dbAsset = await this.db.orm.public.MediaAsset.create({
      storageKey: assetInput.storageKey,
      filename: assetInput.filename,
      mimeType: assetInput.mimeType,
      mediaType: assetInput.mediaType,
      sizeBytes: assetInput.sizeBytes,
      dimensions: assetInput.dimensions ? (assetInput.dimensions as any) : null,
      url: assetInput.url,
      status: assetInput.status,
      metadata: assetInput.metadata as any,
      projectId: assetInput.projectId,
      security: assetInput.security as any,
      usageCount: 0,
    });
    return this.mapAsset({ ...dbAsset, usageReferences: [] });
  }

  async getById(id: string): Promise<MediaAsset | undefined> {
    const dbAsset = await this.db.orm.public.MediaAsset
      .where({ id })
      .include('usageReferences', (ref) => ref)
      .first();
    if (!dbAsset) return undefined;
    return this.mapAsset(dbAsset);
  }

  async list(filters?: MediaFilterOptions): Promise<MediaAsset[]> {
    let query = this.db.orm.public.MediaAsset.include('usageReferences', (ref) => ref);

    if (filters) {
      if (filters.status && filters.status !== 'all') {
        const statusVal = filters.status;
        query = query.where((a) => a.status.eq(statusVal));
      }
      if (filters.mediaType && filters.mediaType !== 'all') {
        const mediaTypeVal = filters.mediaType;
        query = query.where((a) => a.mediaType.eq(mediaTypeVal));
      }
      if (filters.search) {
        const searchVal = `%${filters.search}%`;
        query = query.where((a) => a.filename.ilike(searchVal));
      }
    }

    let sortChain = query.orderBy((a) => a.createdAt.desc());
    if (filters?.sort) {
      switch (filters.sort) {
        case 'createdAt_asc':
          sortChain = query.orderBy((a) => a.createdAt.asc());
          break;
        case 'createdAt_desc':
          sortChain = query.orderBy((a) => a.createdAt.desc());
          break;
        case 'size_asc':
          sortChain = query.orderBy((a) => a.sizeBytes.asc());
          break;
        case 'size_desc':
          sortChain = query.orderBy((a) => a.sizeBytes.desc());
          break;
        case 'usage_desc':
          sortChain = query.orderBy((a) => a.usageCount.desc());
          break;
        default:
          sortChain = query.orderBy((a) => a.createdAt.desc());
          break;
      }
    }

    const dbAssets = await sortChain.all();
    return dbAssets.map(asset => this.mapAsset(asset));
  }

  async updateMetadata(id: string, metadata: Partial<MediaMetadata>): Promise<MediaAsset | undefined> {
    const current = await this.getById(id);
    if (!current) return undefined;

    const mergedMetadata = {
      ...current.metadata,
      ...metadata,
    };

    await this.db.orm.public.MediaAsset
      .where({ id })
      .update({
        metadata: mergedMetadata as any,
      });

    return this.getById(id);
  }

  async createVersion(
    assetId: string,
    versionInput: Omit<MediaAssetVersion, 'id' | 'versionNumber' | 'createdAt' | 'updatedAt' | 'assetId'>
  ): Promise<MediaAssetVersion> {
    const aggregate = await this.db.orm.public.MediaAssetVersion
      .where({ assetId })
      .aggregate((a) => ({
        maxVersion: a.max('versionNumber'),
      }));

    const nextVersion = (aggregate.maxVersion ?? 0) + 1;

    const dbVersion = await this.db.orm.public.MediaAssetVersion.create({
      assetId,
      versionNumber: nextVersion,
      status: versionInput.status,
      mimeType: versionInput.mimeType,
      sizeBytes: versionInput.sizeBytes,
      storageKey: versionInput.storageKey || null,
      security: versionInput.security as any,
      originalFilename: versionInput.originalFilename || null,
    });

    return this.mapVersion(dbVersion);
  }

  async listVersions(assetId: string): Promise<MediaAssetVersion[]> {
    const dbVersions = await this.db.orm.public.MediaAssetVersion
      .where({ assetId })
      .orderBy((v) => v.versionNumber.desc())
      .all();
    return dbVersions.map(v => this.mapVersion(v));
  }

  async setCurrentVersion(assetId: string, versionId: string): Promise<MediaAsset | undefined> {
    const version = await this.db.orm.public.MediaAssetVersion
      .where({ id: versionId, assetId })
      .first();
    if (!version) return undefined;

    await this.db.orm.public.MediaAsset
      .where({ id: assetId })
      .update({
        storageKey: version.storageKey || undefined,
        mimeType: version.mimeType,
        sizeBytes: version.sizeBytes,
      });

    return this.getById(assetId);
  }

  async changeStatus(id: string, status: MediaStatus): Promise<MediaAsset | undefined> {
    await this.db.orm.public.MediaAsset
      .where({ id })
      .update({
        status,
      });
    return this.getById(id);
  }

  async addUsageReference(assetId: string, reference: Omit<MediaUsageReference, 'id' | 'usedAt'>): Promise<MediaUsageReference> {
    const dbRef = await this.db.orm.public.MediaUsageReference.create({
      assetId,
      pageId: reference.pageId,
      pageTitle: reference.pageTitle,
      pageSlug: reference.pageSlug,
      blockId: reference.blockId || null,
      blockType: reference.blockType || null,
      field: reference.field || null,
    });

    const asset = await this.getById(assetId);
    if (asset) {
      await this.db.orm.public.MediaAsset
        .where({ id: assetId })
        .update({
          usageCount: (asset.usageCount || 0) + 1,
        });
    }

    return this.mapUsageReference(dbRef);
  }

  async removeUsageReference(assetId: string, referenceId: string): Promise<void> {
    await this.db.orm.public.MediaUsageReference
      .where({ id: referenceId })
      .delete();

    const asset = await this.getById(assetId);
    if (asset) {
      await this.db.orm.public.MediaAsset
        .where({ id: assetId })
        .update({
          usageCount: Math.max(0, (asset.usageCount || 0) - 1),
        });
    }
  }

  async listUsageReferences(assetId: string): Promise<MediaUsageReference[]> {
    const dbRefs = await this.db.orm.public.MediaUsageReference
      .where({ assetId })
      .orderBy((r) => r.usedAt.desc())
      .all();
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

    await this.db.orm.public.MediaAsset
      .where({ id })
      .delete();
  }
}
