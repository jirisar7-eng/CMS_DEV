import { randomUUID } from 'crypto';
import {
  MediaAsset,
  MediaMetadata,
  MediaFilterOptions,
  IMediaRepository,
  StorageProvider,
  MediaStatus,
  MediaUsageReference,
} from './types';
import { resolveMediaType, DEFAULT_UPLOAD_POLICY } from './mockProviders';
import { prepareSvgAssetDraft } from './svgAssetLifecycle.server';

export class MediaService {
  constructor(
    private readonly repository: IMediaRepository,
    private readonly storageProvider: StorageProvider
  ) {}

  async uploadAsset(
    file: { name: string; type: string; size: number; data: Buffer },
    metadata: MediaMetadata,
    projectId: string
  ): Promise<MediaAsset> {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (DEFAULT_UPLOAD_POLICY.disallowedExtensions.includes(ext)) {
      throw new Error(`Disallowed file extension: .${ext}`);
    }
    if (file.size > DEFAULT_UPLOAD_POLICY.maxSizeBytes) {
      throw new Error(`File size exceeds limit of ${DEFAULT_UPLOAD_POLICY.maxSizeBytes} bytes`);
    }

    if (!file.type || !DEFAULT_UPLOAD_POLICY.allowedMimeTypes.includes(file.type)) {
      throw new Error(`MIME type not allowed or empty: ${file.type}`);
    }

    const storageKey = `ast_${randomUUID()}`;
    const mediaType = resolveMediaType(file.type, file.name);

    let finalData = file.data;
    let finalSize = file.size;
    let status: MediaStatus = 'QUARANTINED';
    let securityInfo: any = {
      scanned: false,
      clean: false,
      activeContent: false,
      checksumSha256: '',
      scannedAt: new Date().toISOString(),
    };

    if (mediaType === 'vector' || file.type === 'image/svg+xml' || ext === 'svg') {
      const rawSvg = file.data.toString('utf8');
      const draftResult = prepareSvgAssetDraft(rawSvg);
      if (!draftResult.success) {
        throw new Error(`SVG Security Validation Failed [${draftResult.stage}]: ${draftResult.message}`);
      }
      finalData = Buffer.from(draftResult.canonicalSvg, 'utf8');
      finalSize = draftResult.sizeBytes;
      status = 'READY'; // SVG has valid pipeline evidence
      securityInfo = {
        scanned: true,
        clean: true,
        activeContent: true, // SVG
        checksumSha256: draftResult.canonicalChecksumSha256,
        scannedAt: new Date().toISOString(),
        pipelineId: draftResult.pipelineId,
      };
    } else {
      // Calculate SHA256 for non-SVG
      const crypto = await import('crypto');
      securityInfo.checksumSha256 = crypto.createHash('sha256').update(finalData).digest('hex');
    }

    // Upload to storage
    await this.storageProvider.putObject(storageKey, finalData, {
      mimeType: file.type,
      sizeBytes: finalSize,
      checksumSha256: securityInfo.checksumSha256,
    });

    // Persist in DB
    try {
      let asset = await this.repository.createAsset({
        storageKey,
        filename: file.name,
        mimeType: file.type,
        mediaType,
        sizeBytes: finalSize,
        url: '', // Temporary
        status,
        metadata,
        projectId,
        security: securityInfo,
      });
      
      const publicUrl = `/api/media/${asset.id}`;
      if (this.repository.updateUrl) {
        asset = (await this.repository.updateUrl(asset.id, publicUrl)) || asset;
      }
      return asset;
    } catch (err) {
      // Rollback storage if DB fails
      try {
        await this.storageProvider.deleteObject(storageKey);
      } catch (rollbackErr) {
        console.error(`Failed to rollback storage object ${storageKey} after DB failure:`, rollbackErr);
      }
      throw new Error(`Failed to persist asset to database: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async getAsset(id: string): Promise<MediaAsset | undefined> {
    return this.repository.getById(id);
  }

  async listAssets(filters?: MediaFilterOptions): Promise<MediaAsset[]> {
    return this.repository.list(filters);
  }

  async updateMetadata(id: string, metadata: Partial<MediaMetadata>): Promise<MediaAsset | undefined> {
    return this.repository.updateMetadata(id, metadata);
  }

  async changeStatus(id: string, status: MediaStatus): Promise<MediaAsset | undefined> {
    const asset = await this.repository.getById(id);
    if (!asset) {
      throw new Error('Asset not found');
    }

    const currentStatus = (asset.status as string).toUpperCase();
    const targetStatus = (status as string).toUpperCase();

    if (targetStatus === 'READY' || targetStatus === 'PUBLISHED') {
      const security = asset.security as any;
      if (!security?.scanned || !security?.clean) {
        throw new Error('Asset cannot be READY or PUBLISHED without successful security scan evidence');
      }

      if (asset.mediaType === 'vector' || asset.mimeType === 'image/svg+xml') {
        if (!security?.pipelineId) {
          throw new Error('SVG asset cannot be READY or PUBLISHED without successful security pipeline evidence');
        }
      }
    }

    return this.repository.changeStatus(id, status);
  }

  async deleteAsset(id: string): Promise<void> {
    // 1. Check if deletion is allowed
    const isAllowed = await this.repository.isDeletionAllowed(id);
    if (!isAllowed) {
      throw new Error('Deletion is not allowed for this asset (it is either published or still in use)');
    }

    const asset = await this.repository.getById(id);
    if (!asset) {
      throw new Error('Asset not found');
    }

    // 2. Delete from Storage FIRST to ensure fail-closed
    await this.storageProvider.deleteObject(asset.storageKey);

    // 3. Delete from DB (if this fails, it throws, so the caller knows it failed, avoiding a false sense of success)
    await this.repository.deleteAsset(id);
  }

  async getAssetDownload(id: string): Promise<{ data: Buffer; mimeType: string; sizeBytes: number; filename: string }> {
    const asset = await this.repository.getById(id);
    if (!asset) {
      throw new Error('Asset not found');
    }

    const objectData = await this.storageProvider.getObject(asset.storageKey);
    return {
      data: objectData.data as Buffer,
      mimeType: objectData.mimeType,
      sizeBytes: objectData.sizeBytes,
      filename: asset.filename,
    };
  }
}

import { PrismaMediaRepository } from './prismaRepository';
import { S3StorageProvider } from './s3StorageProvider';

// Singleton instance for the real runtime composition
export const mediaService = new MediaService(
  new PrismaMediaRepository(),
  new S3StorageProvider()
);
