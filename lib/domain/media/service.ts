import { randomUUID } from 'crypto';
import {
  MediaAsset,
  MediaMetadata,
  MediaFilterOptions,
  IMediaRepository,
  StorageProvider,
  MalwareScanner,
  MediaStatus,
  MediaUsageReference,
} from './types';
import { resolveMediaType, DEFAULT_UPLOAD_POLICY } from './mockProviders';
import { prepareSvgAssetDraft } from './svgAssetLifecycle.server';
import { verifyContentMime } from './contentVerification';

export class MediaService {
  constructor(
    private readonly repository: IMediaRepository,
    private readonly storageProvider: StorageProvider,
    private readonly malwareScanner?: MalwareScanner
  ) {}

  async uploadAsset(
    file: { name: string; type: string; size: number; data: Buffer },
    metadata: Partial<MediaMetadata> & { title: string },
    projectId: string
  ): Promise<MediaAsset> {
    if (!projectId) {
      throw new Error('projectId is required for uploading an asset');
    }
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

    const fullMetadata: MediaMetadata = {
      title: metadata.title,
      altText: metadata.altText || '',
      description: metadata.description || '',
      tags: metadata.tags || [],
      caption: metadata.caption,
      author: metadata.author,
    };

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

      let clamResult: any = null;
      if (this.malwareScanner) {
        clamResult = await this.malwareScanner.scan({
          name: file.name,
          type: file.type,
          size: finalSize,
          data: finalData,
        });
      }

      if (clamResult && !clamResult.clean) {
        status = 'QUARANTINED';
        securityInfo = {
          scanned: true,
          clean: false,
          threat: 'Malware detected in SVG',
          activeContent: true,
          checksumSha256: draftResult.canonicalChecksumSha256,
          scannedAt: new Date().toISOString(),
          pipelineId: draftResult.pipelineId,
          scannerId: clamResult.scannerId,
          scannerReason: clamResult.status,
        };
      } else {
        status = 'READY'; // SVG has valid SVG pipeline evidence
        securityInfo = {
          scanned: true,
          clean: true,
          activeContent: true, // SVG
          checksumSha256: draftResult.canonicalChecksumSha256,
          scannedAt: new Date().toISOString(),
          pipelineId: draftResult.pipelineId,
          scannerId: clamResult?.scannerId || 'svg-sanitizer-pipeline',
          scannerReason: 'CLEAN',
        };
      }
    } else {
      // Non-SVG Security Pipeline
      const crypto = await import('crypto');
      const checksumSha256 = crypto.createHash('sha256').update(finalData).digest('hex');

      // Step 1: Server-side Content/MIME Magic Bytes Verification
      const contentCheck = verifyContentMime(finalData, file.type, file.name);

      if (!contentCheck.valid) {
        status = 'QUARANTINED';
        securityInfo = {
          scanned: false,
          clean: false,
          contentVerified: false,
          activeContent: false,
          checksumSha256,
          scannedAt: new Date().toISOString(),
          scannerReason: contentCheck.reasonCode || 'CONTENT_VERIFICATION_FAILED',
        };
      } else if (this.malwareScanner) {
        // Step 2: Malware Scan actual bytes
        const scanResult = await this.malwareScanner.scan({
          name: file.name,
          type: file.type,
          size: finalSize,
          data: finalData,
        });

        if (scanResult.clean && scanResult.status === 'CLEAN') {
          status = 'READY';
          securityInfo = {
            scanned: true,
            clean: true,
            contentVerified: true,
            activeContent: false,
            checksumSha256: scanResult.checksumSha256 || checksumSha256,
            scannedAt: scanResult.scannedAt,
            scannerId: scanResult.scannerId,
            scannerReason: scanResult.status,
          };
        } else {
          status = 'QUARANTINED';
          securityInfo = {
            scanned: scanResult.status === 'INFECTED',
            clean: false,
            contentVerified: true,
            threat: scanResult.status === 'INFECTED' ? 'Malware detected' : undefined,
            activeContent: false,
            checksumSha256: scanResult.checksumSha256 || checksumSha256,
            scannedAt: scanResult.scannedAt || new Date().toISOString(),
            scannerId: scanResult.scannerId,
            scannerReason: scanResult.status || scanResult.reasonCode || 'SCAN_FAILED',
          };
        }
      } else {
        status = 'QUARANTINED';
        securityInfo = {
          scanned: false,
          clean: false,
          contentVerified: true,
          activeContent: false,
          checksumSha256,
          scannedAt: new Date().toISOString(),
          scannerReason: 'NO_SCANNER_CONFIGURED',
        };
      }
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
        metadata: fullMetadata,
        projectId,
        security: securityInfo,
      });
      
      const publicUrl = `/api/media/${asset.id}`;
      if (this.repository.updateUrl) {
        asset = (await this.repository.updateUrl(asset.id, publicUrl, projectId)) || asset;
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

  async getAsset(id: string, projectId?: string): Promise<MediaAsset | undefined> {
    return this.repository.getById(id, projectId);
  }

  async listAssets(projectIdOrFilters?: string | MediaFilterOptions, filtersArg?: MediaFilterOptions): Promise<MediaAsset[]> {
    return this.repository.list(projectIdOrFilters as any, filtersArg);
  }

  async updateMetadata(id: string, metadata: Partial<MediaMetadata>, projectId?: string): Promise<MediaAsset | undefined> {
    return this.repository.updateMetadata(id, metadata, projectId);
  }

  async changeStatus(id: string, status: MediaStatus, projectId?: string): Promise<MediaAsset | undefined> {
    const asset = await this.repository.getById(id, projectId);
    if (!asset) {
      throw new Error('Asset not found');
    }

    const currentStatus = (asset.status as string).toUpperCase();
    const targetStatus = (status as string).toUpperCase();

    if (targetStatus === 'READY' || targetStatus === 'PUBLISHED') {
      const security = asset.security as any;

      if (asset.mediaType === 'vector' || asset.mimeType === 'image/svg+xml') {
        if (!security?.scanned || !security?.clean) {
          throw new Error('SVG asset cannot be READY or PUBLISHED without successful security scan evidence');
        }
        if (!security?.pipelineId) {
          throw new Error('SVG asset cannot be READY or PUBLISHED without successful security pipeline evidence');
        }
      } else {
        if (!security?.contentVerified) {
          throw new Error('Non-SVG asset cannot be READY or PUBLISHED without successful content signature verification');
        }
        if (!security?.scanned || !security?.clean) {
          throw new Error('Asset cannot be READY or PUBLISHED without successful security scan evidence');
        }
        if (!security?.scannerId || security?.scannerId !== 'clamav') {
          throw new Error('Non-SVG asset cannot be READY or PUBLISHED without valid ClamAV malware scanner evidence');
        }
        if (!security?.checksumSha256) {
          throw new Error('Non-SVG asset cannot be READY or PUBLISHED without valid checksum evidence');
        }
      }
    }

    return this.repository.changeStatus(id, status, projectId);
  }

  async archiveAsset(id: string, projectId: string) {
    return this.changeStatus(id, 'ARCHIVED', projectId);
  }

  async restoreAsset(id: string, projectId: string) {
    return this.changeStatus(id, 'DRAFT', projectId);
  }

  async deleteAsset(id: string, projectId?: string): Promise<void> {
    // 1. Check if deletion is allowed
    const isAllowed = await this.repository.isDeletionAllowed(id, projectId);
    if (!isAllowed) {
      throw new Error('Deletion is not allowed for this asset (it is either published, still in use, or not found in project)');
    }

    const asset = await this.repository.getById(id, projectId);
    if (!asset) {
      throw new Error('Asset not found');
    }

    // 2. Load storage object BEFORE deletion for compensation
    let backupObject: { data: Buffer | Uint8Array | Blob; mimeType: string; sizeBytes: number } | null = null;
    try {
      backupObject = await this.storageProvider.getObject(asset.storageKey);
    } catch (err) {
      throw new Error(`Failed to retrieve storage object for compensation backup: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 3. Delete from Storage FIRST to ensure fail-closed
    await this.storageProvider.deleteObject(asset.storageKey);

    // 4. Delete from DB 
    try {
      await this.repository.deleteAsset(id, projectId);
    } catch (dbErr) {
      // Rollback: restore the storage object
      try {
        await this.storageProvider.putObject(asset.storageKey, backupObject.data, {
          mimeType: backupObject.mimeType,
          sizeBytes: backupObject.sizeBytes,
          checksumSha256: asset.security.checksumSha256,
        });
      } catch (restoreErr) {
        throw new Error(`DATA_INTEGRITY_ERROR: DB delete failed AND storage compensation failed. Asset DB record is intact but storage is lost for key ${asset.storageKey}. DB Err: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}. Restore Err: ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`);
      }
      
      throw new Error(`Failed to delete asset from database: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
    }
  }

  async getAssetDownload(id: string, projectId?: string): Promise<{ data: Buffer; mimeType: string; sizeBytes: number; filename: string }> {
    const asset = await this.repository.getById(id, projectId);
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

let defaultMediaServiceInstance: MediaService | null = null;

// Singleton instance getter for the real runtime composition
export function getMediaService(): MediaService {
  if (!defaultMediaServiceInstance) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaMediaRepository } = require('./prismaRepository');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { S3StorageProvider } = require('./s3StorageProvider');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ClamAvMalwareScanner } = require('./clamAvScanner');

    let scanner: MalwareScanner | undefined = undefined;
    if (process.env.CMS_MALWARE_SCANNER === 'clamav' || process.env.CMS_CLAMAV_HOST) {
      scanner = new ClamAvMalwareScanner();
    } else {
      // Production runtime composition: if ClamAV is configured via env, scanner is used.
      // If unconfigured, scanner is ClamAvMalwareScanner (which fails closed with CONFIGURATION_MISSING on scan).
      scanner = new ClamAvMalwareScanner();
    }

    defaultMediaServiceInstance = new MediaService(
      new PrismaMediaRepository(),
      new S3StorageProvider(),
      scanner
    );
  }
  return defaultMediaServiceInstance;
}

export const mediaService = {
  uploadAsset: (...args: Parameters<MediaService['uploadAsset']>) => getMediaService().uploadAsset(...args),
  replaceAsset: (...args: Parameters<MediaService['replaceAsset']>) => getMediaService().replaceAsset(...args),
  getAsset: (...args: Parameters<MediaService['getAsset']>) => getMediaService().getAsset(...args),
  getAssetByStorageKey: (...args: Parameters<MediaService['getAssetByStorageKey']>) => getMediaService().getAssetByStorageKey(...args),
  listAssets: (...args: Parameters<MediaService['listAssets']>) => getMediaService().listAssets(...args),
  updateMetadata: (...args: Parameters<MediaService['updateMetadata']>) => getMediaService().updateMetadata(...args),
  archiveAsset: (...args: Parameters<MediaService['archiveAsset']>) => getMediaService().archiveAsset(...args),
  restoreAsset: (...args: Parameters<MediaService['restoreAsset']>) => getMediaService().restoreAsset(...args),
  deleteAsset: (...args: Parameters<MediaService['deleteAsset']>) => getMediaService().deleteAsset(...args),
  getAssetDownload: (...args: Parameters<MediaService['getAssetDownload']>) => getMediaService().getAssetDownload(...args),
};