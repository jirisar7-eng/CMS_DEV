// @ts-nocheck
import Module from 'node:module';
import path from 'node:path';

// Patch Module resolution for dependencies not present in isolated fresh clone
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'saxes') {
    return path.resolve(__dirname, 'mock-saxes.js');
  }
  if (request === '@/lib/db') {
    return path.resolve(__dirname, 'mock-db.js');
  }
  if (request.startsWith('@/')) {
    const relativePath = request.slice(2);
    return path.resolve(__dirname, '..', relativePath);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === '@/lib/db') {
    return { prisma: {} };
  }
  if (id === '@prisma/client' || id.includes('.prisma/client')) {
    return { PrismaClient: class {}, Prisma: { JsonNull: null } };
  }
  if (id === '@aws-sdk/client-s3') {
    return { S3Client: class {}, PutObjectCommand: class {}, GetObjectCommand: class {}, DeleteObjectCommand: class {} };
  }
  if (id === '@aws-sdk/s3-request-presigner') {
    return { getSignedUrl: async () => 'https://mock-storage.s3.amazonaws.com/direct-signed-url' };
  }
  if (id === 'saxes' || id.endsWith('mock-saxes.js')) {
    try {
      return originalRequire.call(this, 'saxes');
    } catch {
      return {
        SaxesParser: class {
          on() {}
          write() { return this; }
          close() { return this; }
        },
      };
    }
  }
  if (id.startsWith('@/')) {
    const relativePath = id.slice(2);
    return originalRequire.call(this, path.resolve(__dirname, '..', relativePath));
  }
  return originalRequire.call(this, id);
};

import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';

import { MediaService } from '../lib/domain/media/service';
import { PrismaMediaRepository } from '../lib/domain/media/prismaRepository';
import {
  MediaAsset,
  MediaAssetVersion,
  IMediaRepository,
  StorageProvider,
  MalwareScanner,
  MalwareScanResult,
  MediaMetadata,
  MediaSecurityInfo,
  MediaAssetVersionSecurity,
} from '../lib/domain/media/types';

class MockInMemoryMediaRepository implements IMediaRepository {
  public assets: MediaAsset[] = [];
  public versions: MediaAssetVersion[] = [];
  public failNextReplace = false;

  async createAsset(assetInput: Omit<MediaAsset, 'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'usageReferences'>): Promise<MediaAsset> {
    const now = new Date().toISOString();
    const asset: MediaAsset = {
      ...assetInput,
      id: `ast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
      usageReferences: [],
    };
    this.assets.push(asset);
    return asset;
  }

  async getById(id: string, projectId: string): Promise<MediaAsset | undefined> {
    if (!projectId) return undefined;
    return this.assets.find(a => a.id === id && a.projectId === projectId);
  }

  async list(projectId: string): Promise<MediaAsset[]> {
    if (!projectId) return [];
    return this.assets.filter(a => a.projectId === projectId);
  }

  async updateMetadata(id: string, metadata: Partial<MediaMetadata>, projectId: string): Promise<MediaAsset | undefined> {
    const asset = await this.getById(id, projectId);
    if (!asset) return undefined;
    asset.metadata = { ...asset.metadata, ...metadata };
    asset.updatedAt = new Date().toISOString();
    return asset;
  }

  async updateUrl(id: string, url: string, projectId: string): Promise<MediaAsset | undefined> {
    const asset = await this.getById(id, projectId);
    if (!asset) return undefined;
    asset.url = url;
    asset.updatedAt = new Date().toISOString();
    return asset;
  }

  async createVersion(
    assetId: string,
    versionInput: Omit<MediaAssetVersion, 'id' | 'versionNumber' | 'createdAt' | 'updatedAt' | 'assetId'>,
    projectId: string
  ): Promise<MediaAssetVersion> {
    const asset = await this.getById(assetId, projectId);
    if (!asset) throw new Error(`Asset not found in project ${projectId}`);

    const existing = this.versions.filter(v => v.assetId === assetId);
    const versionNumber = existing.length + 1;
    const now = new Date().toISOString();
    const version: MediaAssetVersion = {
      ...versionInput,
      id: `ver-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      assetId,
      versionNumber,
      createdAt: now,
      updatedAt: now,
    };
    this.versions.push(version);
    return version;
  }

  async listVersions(assetId: string, projectId: string): Promise<MediaAssetVersion[]> {
    if (!projectId) return [];
    const asset = await this.getById(assetId, projectId);
    if (!asset) return [];
    return this.versions.filter(v => v.assetId === assetId).sort((a, b) => b.versionNumber - a.versionNumber);
  }

  async replaceAsset(
    assetId: string,
    newRecord: {
      storageKey: string;
      filename: string;
      mimeType: string;
      mediaType: any;
      sizeBytes: number;
      status: any;
      security: MediaSecurityInfo;
    },
    previousVersion: Omit<MediaAssetVersion, 'id' | 'versionNumber' | 'createdAt' | 'updatedAt' | 'assetId'>,
    projectId: string
  ): Promise<MediaAsset> {
    if (this.failNextReplace) {
      throw new Error('SIMULATED_DB_TRANSACTION_FAILURE');
    }
    const asset = await this.getById(assetId, projectId);
    if (!asset) throw new Error(`Asset not found in project ${projectId}`);

    await this.createVersion(assetId, previousVersion, projectId);

    asset.storageKey = newRecord.storageKey;
    asset.filename = newRecord.filename;
    asset.mimeType = newRecord.mimeType;
    asset.mediaType = newRecord.mediaType;
    asset.sizeBytes = newRecord.sizeBytes;
    asset.status = newRecord.status;
    asset.security = newRecord.security;
    asset.updatedAt = new Date().toISOString();
    return asset;
  }

  async setCurrentVersion(assetId: string, versionId: string, projectId: string): Promise<MediaAsset | undefined> {
    if (!projectId) return undefined;
    const asset = await this.getById(assetId, projectId);
    if (!asset) return undefined;
    if ((asset.status as string).toUpperCase() === "PUBLISHED") {
      throw new Error("Cannot restore version of a PUBLISHED media asset");
    }

    const version = this.versions.find(v => v.id === versionId && v.assetId === assetId);
    if (!version) return undefined;

    // 1. Snapshot current asset file into a new version before switching
    const existingVersions = this.versions.filter(v => v.assetId === assetId);
    const nextVersionNumber = existingVersions.length + 1;
    const now = new Date().toISOString();

    const currentSec = (asset.security as any) || {};
    const currentVersionSecurity: MediaAssetVersionSecurity = {
      ...currentSec,
      validated: currentSec.clean ?? false,
      validatedAt: currentSec.scannedAt || now,
      canonicalChecksumSha256: currentSec.checksumSha256,
      sourceChecksumSha256: currentSec.checksumSha256,
    };

    this.versions.push({
      id: `ver-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      assetId,
      versionNumber: nextVersionNumber,
      status: asset.status as any,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      storageKey: asset.storageKey,
      security: currentVersionSecurity,
      originalFilename: asset.filename,
      createdAt: now,
      updatedAt: now,
    });

    // 2. Strict evaluation of target version security evidence
    const vSec = (version.security as any) || {};
    const isSvg = version.mimeType === 'image/svg+xml' || (version.originalFilename?.endsWith('.svg') ?? false);

    let targetStatus: any = 'QUARANTINED';
    let assetSecurity: MediaSecurityInfo;

    if (isSvg) {
      const hasValidSvgEvidence = Boolean(
        vSec.pipelineId &&
        (vSec.clean === true || vSec.validated === true) &&
        !vSec.threat
      );

      if (hasValidSvgEvidence && version.status !== 'QUARANTINED' && version.status !== 'rejected') {
        targetStatus = version.status === 'PUBLISHED' ? 'READY' : version.status || 'READY';
        assetSecurity = {
          scanned: true,
          clean: true,
          activeContent: true,
          checksumSha256: vSec.checksumSha256 || vSec.canonicalChecksumSha256 || '',
          scannedAt: vSec.scannedAt || vSec.validatedAt || now,
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
          scannedAt: vSec.scannedAt || vSec.validatedAt || now,
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
        targetStatus = version.status === 'PUBLISHED' ? 'READY' : version.status || 'READY';
        assetSecurity = {
          scanned: true,
          clean: true,
          contentVerified: true,
          activeContent: false,
          checksumSha256: vSec.checksumSha256 || vSec.canonicalChecksumSha256 || '',
          scannedAt: vSec.scannedAt || vSec.validatedAt || now,
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
          scannedAt: vSec.scannedAt || vSec.validatedAt || now,
          scannerId: vSec.scannerId,
          scannerReason: vSec.scannerReason || 'INSUFFICIENT_SECURITY_EVIDENCE',
        };
      }
    }

    if (version.storageKey) {
      asset.storageKey = version.storageKey;
    }
    if (version.originalFilename) {
      asset.filename = version.originalFilename;
    }
    asset.mimeType = version.mimeType;
    asset.sizeBytes = version.sizeBytes;
    asset.status = targetStatus;
    asset.security = assetSecurity;
    asset.updatedAt = now;
    return asset;
  }

  async changeStatus(id: string, status: any, projectId: string): Promise<MediaAsset | undefined> {
    const asset = await this.getById(id, projectId);
    if (!asset) return undefined;
    asset.status = status;
    asset.updatedAt = new Date().toISOString();
    return asset;
  }

  async addUsageReference(): Promise<any> { throw new Error('Not implemented'); }
  async removeUsageReference(): Promise<void> { throw new Error('Not implemented'); }
  async listUsageReferences(): Promise<any[]> { return []; }
  async isDeletionAllowed(): Promise<boolean> { return true; }
  async archiveAsset(): Promise<any> { return undefined; }
  async deleteAsset(): Promise<void> {}
}

class MockTrackingStorageProvider implements StorageProvider {
  id = 'mock-storage';
  name = 'Mock Storage';
  public objects = new Map<string, { data: Buffer; mimeType: string; sizeBytes: number; checksumSha256: string }>();
  public deletedKeys: string[] = [];
  public putCalls: Array<{ key: string; sizeBytes: number }> = [];

  async upload(file: any, storageKey: string): Promise<{ storageKey: string; sizeBytes: number }> {
    this.objects.set(storageKey, {
      data: Buffer.from(file.data || ''),
      mimeType: file.type,
      sizeBytes: file.size,
      checksumSha256: 'mock-hash',
    });
    return { storageKey, sizeBytes: file.size };
  }

  async delete(storageKey: string): Promise<void> {
    await this.deleteObject(storageKey);
  }

  async putObject(
    key: string,
    data: Buffer | Uint8Array | Blob,
    options: { mimeType: string; sizeBytes: number; checksumSha256: string }
  ): Promise<void> {
    this.putCalls.push({ key, sizeBytes: options.sizeBytes });
    this.objects.set(key, {
      data: Buffer.isBuffer(data) ? data : Buffer.from(data as any),
      mimeType: options.mimeType,
      sizeBytes: options.sizeBytes,
      checksumSha256: options.checksumSha256,
    });
  }

  async getObject(key: string): Promise<{ data: Buffer | Uint8Array | Blob; mimeType: string; sizeBytes: number }> {
    const obj = this.objects.get(key);
    if (!obj) throw new Error(`Object not found for key ${key}`);
    return { data: obj.data, mimeType: obj.mimeType, sizeBytes: obj.sizeBytes };
  }

  async deleteObject(key: string): Promise<void> {
    this.deletedKeys.push(key);
    this.objects.delete(key);
  }

  async getSignedReadUrl(key: string): Promise<string> {
    return `https://mock-storage.s3.amazonaws.com/${key}?signed=true`;
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }
}

class MockDeterministicScanner implements MalwareScanner {
  id = 'clamav';
  name = 'Mock ClamAV Scanner';
  public shouldFail = false;
  public shouldDetectThreat = false;

  async scan(file: { name: string; type: string; size: number; data?: any }): Promise<MalwareScanResult> {
    if (this.shouldFail) {
      return {
        clean: false,
        status: 'CONNECTION_FAILED',
        scannerId: 'clamav',
        scannedAt: new Date().toISOString(),
        reasonCode: 'CLAMD_UNREACHABLE',
      };
    }
    if (this.shouldDetectThreat) {
      return {
        clean: false,
        status: 'INFECTED',
        threat: 'Eicar-Test-Signature',
        scannerId: 'clamav',
        scannedAt: new Date().toISOString(),
      };
    }
    const checksum = crypto.createHash('sha256').update(file.data || '').digest('hex');
    return {
      clean: true,
      status: 'CLEAN',
      scannerId: 'clamav',
      scannedAt: new Date().toISOString(),
      checksumSha256: checksum,
    };
  }
}

const VALID_PNG_BUFFER = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('IHDR-CHUNK-MOCK-PNG-PAYLOAD-V1'),
]);

const VALID_PNG_BUFFER_V2 = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('IHDR-CHUNK-MOCK-PNG-REPLACEMENT-PAYLOAD-V2'),
]);

const SPOOFED_PNG_BUFFER = Buffer.from('NOT_A_REAL_PNG_JUST_TEXT_PAYLOAD');

describe('SYN-MEDIA-002 Phase A1: Secure Media Replace & Version Safety Lifecycle', () => {
  const projectId = 'proj-media-test-001';

  it('1. Upload canonical URL is /api/media/<id> and does not store direct signed storage URL', async () => {
    const repository = new MockInMemoryMediaRepository();
    const storageProvider = new MockTrackingStorageProvider();
    const scanner = new MockDeterministicScanner();
    const service = new MediaService(repository, storageProvider, scanner);

    const asset = await service.uploadAsset(
      { name: 'document.png', type: 'image/png', size: VALID_PNG_BUFFER.length, data: VALID_PNG_BUFFER },
      { title: 'Guarded Document' },
      projectId
    );

    assert.strictEqual(asset.url, `/api/media/${asset.id}`, 'Canonical URL must be /api/media/<id>');
    assert.strictEqual(asset.url.includes('signed='), false, 'Canonical URL must NOT be a signed storage URL');
    assert.strictEqual(asset.url.includes('s3.amazonaws.com'), false, 'Canonical URL must NOT expose storage backend');
  });

  it('2. Repository without atomic replace support fails closed and leaves storage and DB unchanged', async () => {
    class RepoWithoutReplace extends MockInMemoryMediaRepository {
      replaceAsset = undefined;
    }
    const repository = new RepoWithoutReplace();
    const storageProvider = new MockTrackingStorageProvider();
    const scanner = new MockDeterministicScanner();
    const service = new MediaService(repository, storageProvider, scanner);

    const asset = await service.uploadAsset(
      { name: 'base.png', type: 'image/png', size: VALID_PNG_BUFFER.length, data: VALID_PNG_BUFFER },
      { title: 'Base' },
      projectId
    );

    const putCallsCountBefore = storageProvider.putCalls.length;
    const objectsCountBefore = storageProvider.objects.size;

    await assert.rejects(
      async () => {
        await service.replaceAsset(
          asset.id,
          { name: 'new.png', type: 'image/png', size: VALID_PNG_BUFFER_V2.length, data: VALID_PNG_BUFFER_V2 },
          projectId
        );
      },
      /Atomic replaceAsset operation is unsupported by repository/,
      'Must fail closed with unsupported error'
    );

    // Verify storage was untouched (no new put calls)
    assert.strictEqual(storageProvider.putCalls.length, putCallsCountBefore, 'No storage put should occur if unsupported');
    assert.strictEqual(storageProvider.objects.size, objectsCountBefore);

    // Verify DB asset unchanged
    const currentAsset = await service.getAsset(asset.id, projectId);
    assert.strictEqual(currentAsset?.filename, 'base.png');

    // Verify no versions were orphaned or created
    const versions = await service.listVersions(asset.id, projectId);
    assert.strictEqual(versions.length, 0);
  });

  it('3. Clean replacement succeeds, preserving asset ID, projectId, and metadata while getting a new storageKey and full security evidence', async () => {
    const repository = new MockInMemoryMediaRepository();
    const storageProvider = new MockTrackingStorageProvider();
    const scanner = new MockDeterministicScanner();
    const service = new MediaService(repository, storageProvider, scanner);

    const initialAsset = await service.uploadAsset(
      { name: 'hero.png', type: 'image/png', size: VALID_PNG_BUFFER.length, data: VALID_PNG_BUFFER },
      { title: 'Hero Banner', altText: 'Homepage hero image', description: 'Primary hero image', tags: ['hero', 'v1'] },
      projectId
    );

    assert.strictEqual(initialAsset.status, 'READY');
    const oldStorageKey = initialAsset.storageKey;
    const initialAssetId = initialAsset.id;

    const replacedAsset = await service.replaceAsset(
      initialAssetId,
      { name: 'hero_v2.png', type: 'image/png', size: VALID_PNG_BUFFER_V2.length, data: VALID_PNG_BUFFER_V2 },
      projectId
    );

    assert.strictEqual(replacedAsset.id, initialAssetId, 'MediaAsset.id must be strictly preserved');
    assert.strictEqual(replacedAsset.projectId, projectId, 'projectId must be strictly preserved');
    assert.strictEqual(replacedAsset.url, `/api/media/${initialAssetId}`, 'Guarded URL must be preserved');
    assert.strictEqual(replacedAsset.metadata.title, 'Hero Banner', 'Metadata title must be preserved');
    assert.strictEqual(replacedAsset.metadata.altText, 'Homepage hero image', 'Metadata altText must be preserved');
    assert.deepStrictEqual(replacedAsset.metadata.tags, ['hero', 'v1'], 'Metadata tags must be preserved');
    assert.strictEqual(replacedAsset.filename, 'hero_v2.png');
    assert.strictEqual(replacedAsset.status, 'READY');
    assert.notStrictEqual(replacedAsset.storageKey, oldStorageKey, 'Replacement MUST receive a NEW storageKey');

    // Verify version history has exact preserved security evidence
    const versions = await service.listVersions(initialAssetId, projectId);
    assert.strictEqual(versions.length, 1);
    assert.strictEqual(versions[0].versionNumber, 1);
    assert.strictEqual(versions[0].storageKey, oldStorageKey);
    assert.strictEqual(versions[0].originalFilename, 'hero.png');
    assert.strictEqual(versions[0].security.clean, true);
    assert.strictEqual(versions[0].security.scannerId, 'clamav');
    const expectedV1Hash = crypto.createHash('sha256').update(VALID_PNG_BUFFER).digest('hex');
    assert.strictEqual(versions[0].security.checksumSha256, expectedV1Hash);
  });

  it('4. MIME spoof cannot become READY during replacement and is QUARANTINED', async () => {
    const repository = new MockInMemoryMediaRepository();
    const storageProvider = new MockTrackingStorageProvider();
    const scanner = new MockDeterministicScanner();
    const service = new MediaService(repository, storageProvider, scanner);

    const initialAsset = await service.uploadAsset(
      { name: 'photo.png', type: 'image/png', size: VALID_PNG_BUFFER.length, data: VALID_PNG_BUFFER },
      { title: 'Valid Photo' },
      projectId
    );

    const replacedAsset = await service.replaceAsset(
      initialAsset.id,
      { name: 'photo_spoofed.png', type: 'image/png', size: SPOOFED_PNG_BUFFER.length, data: SPOOFED_PNG_BUFFER },
      projectId
    );

    assert.strictEqual(replacedAsset.status, 'QUARANTINED', 'MIME spoof must result in QUARANTINED status');
    assert.strictEqual(replacedAsset.security.contentVerified, false);
    assert.strictEqual(replacedAsset.security.clean, false);
  });

  it('5. Scanner failure is fail-closed (QUARANTINED) on replacement', async () => {
    const repository = new MockInMemoryMediaRepository();
    const storageProvider = new MockTrackingStorageProvider();
    const scanner = new MockDeterministicScanner();
    const service = new MediaService(repository, storageProvider, scanner);

    const initialAsset = await service.uploadAsset(
      { name: 'banner.png', type: 'image/png', size: VALID_PNG_BUFFER.length, data: VALID_PNG_BUFFER },
      { title: 'Banner' },
      projectId
    );

    scanner.shouldFail = true;

    const replacedAsset = await service.replaceAsset(
      initialAsset.id,
      { name: 'banner_v2.png', type: 'image/png', size: VALID_PNG_BUFFER_V2.length, data: VALID_PNG_BUFFER_V2 },
      projectId
    );

    assert.strictEqual(replacedAsset.status, 'QUARANTINED', 'Scanner failure must fail closed to QUARANTINED');
    assert.strictEqual(replacedAsset.security.clean, false);
    assert.strictEqual(replacedAsset.security.scannerReason, 'CONNECTION_FAILED');
  });

  it('6. Cross-project replacement and cross-project version restore are strictly rejected', async () => {
    const repository = new MockInMemoryMediaRepository();
    const storageProvider = new MockTrackingStorageProvider();
    const scanner = new MockDeterministicScanner();
    const service = new MediaService(repository, storageProvider, scanner);

    const assetProjA = await service.uploadAsset(
      { name: 'doc.png', type: 'image/png', size: VALID_PNG_BUFFER.length, data: VALID_PNG_BUFFER },
      { title: 'Project A Doc' },
      'project-AAA'
    );

    await assert.rejects(
      async () => {
        await service.replaceAsset(
          assetProjA.id,
          { name: 'doc_hijack.png', type: 'image/png', size: VALID_PNG_BUFFER_V2.length, data: VALID_PNG_BUFFER_V2 },
          'project-BBB'
        );
      },
      /Media asset not found in project/
    );

    await assert.rejects(
      async () => {
        await service.setCurrentVersion(assetProjA.id, 'some-version-id', 'project-BBB');
      },
      /Media asset not found in project/
    );
  });

  it('7. Replacement of PUBLISHED asset is strictly rejected', async () => {
    const repository = new MockInMemoryMediaRepository();
    const storageProvider = new MockTrackingStorageProvider();
    const scanner = new MockDeterministicScanner();
    const service = new MediaService(repository, storageProvider, scanner);

    const asset = await service.uploadAsset(
      { name: 'published_hero.png', type: 'image/png', size: VALID_PNG_BUFFER.length, data: VALID_PNG_BUFFER },
      { title: 'Published Hero' },
      projectId
    );

    await service.changeStatus(asset.id, 'PUBLISHED', projectId);

    await assert.rejects(
      async () => {
        await service.replaceAsset(
          asset.id,
          { name: 'new_published.png', type: 'image/png', size: VALID_PNG_BUFFER_V2.length, data: VALID_PNG_BUFFER_V2 },
          projectId
        );
      },
      /Cannot replace a PUBLISHED media asset/
    );
  });

  it('8. DB failure after new-object upload deletes ONLY new object and leaves previous asset intact', async () => {
    const repository = new MockInMemoryMediaRepository();
    const storageProvider = new MockTrackingStorageProvider();
    const scanner = new MockDeterministicScanner();
    const service = new MediaService(repository, storageProvider, scanner);

    const initialAsset = await service.uploadAsset(
      { name: 'stable.png', type: 'image/png', size: VALID_PNG_BUFFER.length, data: VALID_PNG_BUFFER },
      { title: 'Stable Asset' },
      projectId
    );
    const oldStorageKey = initialAsset.storageKey;

    repository.failNextReplace = true;

    await assert.rejects(
      async () => {
        await service.replaceAsset(
          initialAsset.id,
          { name: 'failed_rep.png', type: 'image/png', size: VALID_PNG_BUFFER_V2.length, data: VALID_PNG_BUFFER_V2 },
          projectId
        );
      },
      /Failed to update asset replacement in database/
    );

    assert.strictEqual(await storageProvider.exists(oldStorageKey), true, 'Old storage object MUST remain intact');
    assert.strictEqual(storageProvider.deletedKeys.length, 1);
    assert.notStrictEqual(storageProvider.deletedKeys[0], oldStorageKey);

    const currentAssetInDb = await service.getAsset(initialAsset.id, projectId);
    assert.strictEqual(currentAssetInDb?.filename, 'stable.png');
    assert.strictEqual(currentAssetInDb?.storageKey, oldStorageKey);
  });

  it('9. Restoring old version snapshots the previously current file: A -> B -> restore A keeps B in version history', async () => {
    const repository = new MockInMemoryMediaRepository();
    const storageProvider = new MockTrackingStorageProvider();
    const scanner = new MockDeterministicScanner();
    const service = new MediaService(repository, storageProvider, scanner);

    // Initial file A
    const assetA = await service.uploadAsset(
      { name: 'fileA.png', type: 'image/png', size: VALID_PNG_BUFFER.length, data: VALID_PNG_BUFFER },
      { title: 'File A' },
      projectId
    );
    const keyA = assetA.storageKey;

    // Replace with file B
    const assetB = await service.replaceAsset(
      assetA.id,
      { name: 'fileB.png', type: 'image/png', size: VALID_PNG_BUFFER_V2.length, data: VALID_PNG_BUFFER_V2 },
      projectId
    );
    const keyB = assetB.storageKey;

    // Version history after replace: contains file A as version 1
    let versions = await service.listVersions(assetA.id, projectId);
    assert.strictEqual(versions.length, 1);
    assert.strictEqual(versions[0].storageKey, keyA);
    assert.strictEqual(versions[0].originalFilename, 'fileA.png');
    const versionAId = versions[0].id;

    // Now restore file A
    const restoredA = await service.setCurrentVersion(assetA.id, versionAId, projectId);
    assert.ok(restoredA);
    assert.strictEqual(restoredA.storageKey, keyA);
    assert.strictEqual(restoredA.filename, 'fileA.png');

    // CRITICAL INVARIANT: File B MUST NOT be lost! It must now be represented in version history!
    versions = await service.listVersions(assetA.id, projectId);
    assert.strictEqual(versions.length, 2, 'Version history must have both versions');

    const fileBInHistory = versions.find(v => v.storageKey === keyB);
    assert.ok(fileBInHistory, 'File B must be preserved in version history');
    assert.strictEqual(fileBInHistory.originalFilename, 'fileB.png');
    assert.strictEqual(fileBInHistory.sizeBytes, VALID_PNG_BUFFER_V2.length);
  });

  it('10. Restore uses target version security evidence only; incomplete legacy version becomes QUARANTINED', async () => {
    const repository = new MockInMemoryMediaRepository();
    const storageProvider = new MockTrackingStorageProvider();
    const scanner = new MockDeterministicScanner();
    const service = new MediaService(repository, storageProvider, scanner);

    const initialAsset = await service.uploadAsset(
      { name: 'clean.png', type: 'image/png', size: VALID_PNG_BUFFER.length, data: VALID_PNG_BUFFER },
      { title: 'Clean' },
      projectId
    );

    // Create a legacy version lacking ClamAV evidence and contentVerified
    const legacyVersion = await service.createVersion(
      initialAsset.id,
      {
        status: 'READY',
        mimeType: 'image/png',
        sizeBytes: 100,
        storageKey: 'ast_legacy_key',
        security: {
          validated: true,
          pipelineId: 'ancient-pipeline',
          validatedAt: new Date().toISOString(),
          // Missing contentVerified, missing scannerId=clamav, missing checksum
        },
        originalFilename: 'legacy.png',
      },
      projectId
    );

    // Restore the legacy version
    const restored = await service.setCurrentVersion(initialAsset.id, legacyVersion.id, projectId);
    assert.ok(restored);

    // Must fail closed to QUARANTINED because non-SVG requires contentVerified + ClamAV evidence
    assert.strictEqual(restored.status, 'QUARANTINED', 'Incomplete legacy version must fail closed to QUARANTINED');
    assert.strictEqual(restored.security.clean, false);
    assert.strictEqual(restored.security.scannerReason, 'INSUFFICIENT_SECURITY_EVIDENCE');

    // Must be blocked from publication
    await assert.rejects(
      async () => {
        await service.changeStatus(initialAsset.id, 'PUBLISHED', projectId);
      },
      /cannot be READY or PUBLISHED/i
    );
  });

  it('11. Restoring version on PUBLISHED current asset is strictly rejected by service and repository mutation path', async () => {
    const repository = new MockInMemoryMediaRepository();
    const storageProvider = new MockTrackingStorageProvider();
    const scanner = new MockDeterministicScanner();
    const service = new MediaService(repository, storageProvider, scanner);

    const asset = await service.uploadAsset(
      { name: 'published_doc.png', type: 'image/png', size: VALID_PNG_BUFFER.length, data: VALID_PNG_BUFFER },
      { title: 'Published Doc' },
      projectId
    );

    // Create a previous version while asset is not published
    const v1 = await service.createVersion(
      asset.id,
      {
        status: 'READY',
        mimeType: 'image/png',
        sizeBytes: 1234,
        storageKey: 'ast_v1_key',
        security: {
          validated: true,
          contentVerified: true,
          scannerId: 'clamav',
          canonicalChecksumSha256: 'some-hash',
        },
        originalFilename: 'v1_doc.png',
      },
      projectId
    );

    // Publish current asset
    await service.changeStatus(asset.id, 'PUBLISHED', projectId);
    const publishedAsset = await service.getAsset(asset.id, projectId);
    assert.strictEqual(publishedAsset?.status, 'PUBLISHED');
    const originalStorageKey = publishedAsset?.storageKey;
    const originalSecurity = JSON.stringify(publishedAsset?.security);
    const initialVersions = await service.listVersions(asset.id, projectId);

    // Service-level reject
    await assert.rejects(
      async () => {
        await service.setCurrentVersion(asset.id, v1.id, projectId);
      },
      /Cannot restore version of a PUBLISHED media asset/
    );

    // Rejection created no new version snapshot
    const versionsAfterServiceReject = await service.listVersions(asset.id, projectId);
    assert.strictEqual(versionsAfterServiceReject.length, initialVersions.length);

    // Repository mutation path also directly rejects
    await assert.rejects(
      async () => {
        await repository.setCurrentVersion(asset.id, v1.id, projectId);
      },
      /Cannot restore version of a PUBLISHED media asset/
    );

    // Rejection created no new version snapshot
    const versionsAfterRepoReject = await service.listVersions(asset.id, projectId);
    assert.strictEqual(versionsAfterRepoReject.length, initialVersions.length);

    // Asset bytes and security remain strictly unchanged
    const assetAfter = await service.getAsset(asset.id, projectId);
    assert.strictEqual(assetAfter?.storageKey, originalStorageKey);
    assert.strictEqual(JSON.stringify(assetAfter?.security), originalSecurity);
    assert.strictEqual(assetAfter?.status, 'PUBLISHED');
  });

  it('11b. PrismaMediaRepository transaction guard independently rejects PUBLISHED restore with no snapshots or mutations', async () => {
    let transactionCreatedSnapshot = false;
    let transactionUpdatedAsset = false;

    const mockPrisma = {
      $transaction: async (fn: any) => {
        return fn({
          mediaAsset: {
            findFirst: async ({ where }: any) => {
              if (where.id === 'ast-pub-1' && where.projectId === projectId) {
                return {
                  id: 'ast-pub-1',
                  projectId,
                  status: 'PUBLISHED',
                  storageKey: 'original-pub-key',
                  filename: 'pub.png',
                  mimeType: 'image/png',
                  mediaType: 'image',
                  sizeBytes: 1000,
                  security: { clean: true, scanned: true, contentVerified: true, scannerId: 'clamav', checksumSha256: 'abc' },
                  usageReferences: [],
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };
              }
              return null;
            },
            update: async () => {
              transactionUpdatedAsset = true;
              return {};
            },
          },
          mediaAssetVersion: {
            findFirst: async () => {
              return {
                id: 'ver-old',
                assetId: 'ast-pub-1',
                storageKey: 'old-key',
                originalFilename: 'old.png',
                mimeType: 'image/png',
                sizeBytes: 800,
                status: 'READY',
                security: { clean: true, scanned: true, contentVerified: true, scannerId: 'clamav', checksumSha256: 'xyz' },
              };
            },
            aggregate: async () => ({ _max: { versionNumber: 1 } }),
            create: async () => {
              transactionCreatedSnapshot = true;
              return {};
            },
          },
        });
      },
    };

    const prismaRepo = new PrismaMediaRepository(mockPrisma);

    // Direct repository invocation fails closed on PUBLISHED asset
    await assert.rejects(
      async () => {
        await prismaRepo.setCurrentVersion('ast-pub-1', 'ver-old', projectId);
      },
      /Cannot restore version of a PUBLISHED media asset/
    );

    // Invariant: Guard executed before snapshot creation and update
    assert.strictEqual(transactionCreatedSnapshot, false, 'No version snapshot should be created on rejected PUBLISHED restore');
    assert.strictEqual(transactionUpdatedAsset, false, 'Asset must not be updated on rejected PUBLISHED restore');

    // Cross-project isolation: fails closed if asset not found in project
    await assert.rejects(
      async () => {
        await prismaRepo.setCurrentVersion('ast-pub-1', 'ver-old', 'wrong-project-xyz');
      },
      /Media asset not found in project wrong-project-xyz/
    );
  });

  it('11c. Service-level guard fails closed before repository is even invoked on PUBLISHED asset', async () => {
    let repoSetCurrentVersionCalled = false;
    const dummyRepo = {
      getById: async (id: string, projId: string) => {
        if (id === 'ast-pub-service' && projId === projectId) {
          return {
            id,
            projectId: projId,
            status: 'PUBLISHED',
            storageKey: 'pub-key',
            filename: 'pub.png',
            mimeType: 'image/png',
            mediaType: 'image' as any,
            sizeBytes: 1000,
            security: { scanned: true, clean: true, contentVerified: true, checksumSha256: 'hash' },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
        return undefined;
      },
      setCurrentVersion: async () => {
        repoSetCurrentVersionCalled = true;
        return undefined;
      },
    } as any;

    const storageProvider = new MockTrackingStorageProvider();
    const service = new MediaService(dummyRepo, storageProvider);

    await assert.rejects(
      async () => {
        await service.setCurrentVersion('ast-pub-service', 'ver-123', projectId);
      },
      /Cannot restore version of a PUBLISHED media asset/
    );

    assert.strictEqual(repoSetCurrentVersionCalled, false, 'Repository must not even be called when service guard triggers');
  });

  it('11d. PrismaMediaRepository transaction allows restore for non-PUBLISHED (READY) asset', async () => {
    let snapshotCreated = false;
    let updatedAssetData: any = null;

    const mockPrisma = {
      $transaction: async (fn: any) => {
        return fn({
          mediaAsset: {
            findFirst: async ({ where }: any) => {
              if (where.id === 'ast-ready-1' && where.projectId === projectId) {
                return {
                  id: 'ast-ready-1',
                  projectId,
                  status: 'READY',
                  storageKey: 'current-key',
                  filename: 'current.png',
                  mimeType: 'image/png',
                  mediaType: 'image',
                  sizeBytes: 1000,
                  security: { clean: true, scanned: true, contentVerified: true, scannerId: 'clamav', checksumSha256: 'abc' },
                  usageReferences: [],
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };
              }
              return null;
            },
            update: async ({ data }: any) => {
              updatedAssetData = data;
              return {
                id: 'ast-ready-1',
                projectId,
                ...data,
                usageReferences: [],
                createdAt: new Date(),
                updatedAt: new Date(),
              };
            },
          },
          mediaAssetVersion: {
            findFirst: async ({ where }: any) => {
              if (where.id === 'ver-target' && where.assetId === 'ast-ready-1') {
                return {
                  id: 'ver-target',
                  assetId: 'ast-ready-1',
                  storageKey: 'restored-target-key',
                  originalFilename: 'target.png',
                  mimeType: 'image/png',
                  sizeBytes: 800,
                  status: 'READY',
                  security: { clean: true, scanned: true, contentVerified: true, scannerId: 'clamav', checksumSha256: 'xyz' },
                };
              }
              return null;
            },
            aggregate: async () => ({ _max: { versionNumber: 2 } }),
            create: async () => {
              snapshotCreated = true;
              return {};
            },
          },
        });
      },
    };

    const prismaRepo = new PrismaMediaRepository(mockPrisma);
    const restored = await prismaRepo.setCurrentVersion('ast-ready-1', 'ver-target', projectId);

    assert.ok(restored);
    assert.strictEqual(snapshotCreated, true, 'Snapshot must be created on successful restore');
    assert.strictEqual(updatedAssetData.storageKey, 'restored-target-key');
    assert.strictEqual(updatedAssetData.status, 'READY');
  });

  it('12. Restoring version preserves canonical URL /api/media/<id> and no direct storage URL becomes canonical', async () => {
    const repository = new MockInMemoryMediaRepository();
    const storageProvider = new MockTrackingStorageProvider();
    const scanner = new MockDeterministicScanner();
    const service = new MediaService(repository, storageProvider, scanner);

    const asset = await service.uploadAsset(
      { name: 'test.png', type: 'image/png', size: VALID_PNG_BUFFER.length, data: VALID_PNG_BUFFER },
      { title: 'Test Asset' },
      projectId
    );

    const replaced = await service.replaceAsset(
      asset.id,
      { name: 'test_v2.png', type: 'image/png', size: VALID_PNG_BUFFER_V2.length, data: VALID_PNG_BUFFER_V2 },
      projectId
    );

    assert.strictEqual(replaced.url, `/api/media/${asset.id}`);
    assert.doesNotMatch(replaced.url, /s3\.amazonaws\.com|https?:\/\//);

    const versions = await service.listVersions(asset.id, projectId);
    const restored = await service.setCurrentVersion(asset.id, versions[0].id, projectId);
    assert.ok(restored);
    assert.strictEqual(restored.url, `/api/media/${asset.id}`);
    assert.doesNotMatch(restored.url, /s3\.amazonaws\.com|https?:\/\//);
  });
});
