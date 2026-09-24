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
    return { getSignedUrl: async () => 'https://mock-signed-url' };
  }
  if (id === 'saxes' || id.endsWith('mock-saxes.js')) {
    return {
      SaxesParser: class {
        on() {}
        write() {}
        close() {}
      },
    };
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
import {
  MediaAsset,
  MediaAssetVersion,
  IMediaRepository,
  StorageProvider,
  MalwareScanner,
  MalwareScanResult,
  MediaMetadata,
  MediaSecurityInfo,
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
    return this.versions.filter(v => v.assetId === assetId);
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

    const version = this.versions.find(v => v.id === versionId && v.assetId === assetId);
    if (!version) return undefined;

    const vSec = version.security as any;
    const isSvg = version.mimeType === 'image/svg+xml';

    const assetSecurity: MediaSecurityInfo = {
      scanned: vSec?.scanned ?? vSec?.validated ?? false,
      clean: vSec?.clean ?? vSec?.validated ?? false,
      threat: vSec?.threat,
      activeContent: vSec?.activeContent ?? isSvg,
      checksumSha256: vSec?.checksumSha256 || vSec?.canonicalChecksumSha256 || vSec?.sourceChecksumSha256 || '',
      scannedAt: vSec?.scannedAt || vSec?.validatedAt || new Date().toISOString(),
      pipelineId: vSec?.pipelineId,
      scannerId: vSec?.scannerId || (isSvg ? 'svg-sanitizer-pipeline' : undefined),
      scannerReason: vSec?.scannerReason || vSec?.reasonCode || (vSec?.clean ? 'CLEAN' : undefined),
      contentVerified: vSec?.contentVerified ?? (isSvg ? true : (vSec?.validated ?? false)),
    };

    const targetStatus = (!assetSecurity.clean || version.status === 'QUARANTINED' || version.status === 'rejected')
      ? 'QUARANTINED'
      : (version.status === 'PUBLISHED' ? 'READY' : version.status) || 'READY';

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
    asset.updatedAt = new Date().toISOString();
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
    return `https://storage.mock.synthesis.local/files/${key}`;
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

describe('SYN-MEDIA-002 Phase A: Secure Media Replace & Version Safety Lifecycle', () => {
  const projectId = 'proj-media-test-001';

  it('1. Clean replacement succeeds, preserving asset ID, projectId, and metadata while getting a new storageKey and version record', async () => {
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
    assert.strictEqual(replacedAsset.metadata.title, 'Hero Banner', 'Metadata title must be preserved');
    assert.strictEqual(replacedAsset.metadata.altText, 'Homepage hero image', 'Metadata altText must be preserved');
    assert.deepStrictEqual(replacedAsset.metadata.tags, ['hero', 'v1'], 'Metadata tags must be preserved');
    assert.strictEqual(replacedAsset.filename, 'hero_v2.png');
    assert.strictEqual(replacedAsset.status, 'READY');
    assert.notStrictEqual(replacedAsset.storageKey, oldStorageKey, 'Replacement MUST receive a NEW storageKey');

    assert.strictEqual(await storageProvider.exists(oldStorageKey), true, 'Old storage object must not be deleted');
    assert.strictEqual(await storageProvider.exists(replacedAsset.storageKey), true, 'New storage object must exist');

    const versions = await service.listVersions(initialAssetId, projectId);
    assert.strictEqual(versions.length, 1, 'Exactly one historical version must be recorded');
    assert.strictEqual(versions[0].versionNumber, 1);
    assert.strictEqual(versions[0].storageKey, oldStorageKey, 'Historical version must reference the old storageKey');
    assert.strictEqual(versions[0].originalFilename, 'hero.png');
  });

  it('2. Replacement security evidence matches new file bytes exactly', async () => {
    const repository = new MockInMemoryMediaRepository();
    const storageProvider = new MockTrackingStorageProvider();
    const scanner = new MockDeterministicScanner();
    const service = new MediaService(repository, storageProvider, scanner);

    const initialAsset = await service.uploadAsset(
      { name: 'logo.png', type: 'image/png', size: VALID_PNG_BUFFER.length, data: VALID_PNG_BUFFER },
      { title: 'Company Logo' },
      projectId
    );

    const replacedAsset = await service.replaceAsset(
      initialAsset.id,
      { name: 'logo_new.png', type: 'image/png', size: VALID_PNG_BUFFER_V2.length, data: VALID_PNG_BUFFER_V2 },
      projectId
    );

    const expectedNewHash = crypto.createHash('sha256').update(VALID_PNG_BUFFER_V2).digest('hex');
    assert.strictEqual(replacedAsset.security.checksumSha256, expectedNewHash);
    assert.strictEqual(replacedAsset.security.contentVerified, true);
    assert.strictEqual(replacedAsset.security.clean, true);
    assert.strictEqual(replacedAsset.security.scannerId, 'clamav');
  });

  it('3. MIME spoof cannot become READY during replacement and is QUARANTINED', async () => {
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

  it('4. Scanner failure is fail-closed (QUARANTINED) on replacement', async () => {
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

  it('5. Cross-project replacement is strictly rejected (fail-closed)', async () => {
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
      /Media asset not found in project/,
      'Cross-project replacement must be rejected'
    );
  });

  it('6. Replacement of PUBLISHED asset is strictly rejected', async () => {
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
      /Cannot replace a PUBLISHED media asset/,
      'PUBLISHED asset replacement must be blocked'
    );
  });

  it('7. DB failure after new-object upload deletes ONLY new object and leaves previous asset intact', async () => {
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
    assert.strictEqual(storageProvider.deletedKeys.length, 1, 'Only one object (the newly uploaded one) should be cleaned up');
    assert.notStrictEqual(storageProvider.deletedKeys[0], oldStorageKey, 'Old storage key must NOT be deleted');

    const currentAssetInDb = await service.getAsset(initialAsset.id, projectId);
    assert.strictEqual(currentAssetInDb?.filename, 'stable.png');
    assert.strictEqual(currentAssetInDb?.storageKey, oldStorageKey);
  });

  it('8. Version listing and access is project-scoped', async () => {
    const repository = new MockInMemoryMediaRepository();
    const storageProvider = new MockTrackingStorageProvider();
    const scanner = new MockDeterministicScanner();
    const service = new MediaService(repository, storageProvider, scanner);

    const asset = await service.uploadAsset(
      { name: 'scoped.png', type: 'image/png', size: VALID_PNG_BUFFER.length, data: VALID_PNG_BUFFER },
      { title: 'Scoped Asset' },
      projectId
    );

    await service.replaceAsset(
      asset.id,
      { name: 'scoped_v2.png', type: 'image/png', size: VALID_PNG_BUFFER_V2.length, data: VALID_PNG_BUFFER_V2 },
      projectId
    );

    const ownVersions = await service.listVersions(asset.id, projectId);
    assert.strictEqual(ownVersions.length, 1);

    await assert.rejects(
      async () => {
        await service.listVersions(asset.id, 'foreign-project-999');
      },
      /Media asset not found in project/
    );
  });

  it('9. Selecting/restoring a historical version restores matching security metadata and prevents stale security leakage', async () => {
    const repository = new MockInMemoryMediaRepository();
    const storageProvider = new MockTrackingStorageProvider();
    const scanner = new MockDeterministicScanner();
    const service = new MediaService(repository, storageProvider, scanner);

    const v1Hash = crypto.createHash('sha256').update(VALID_PNG_BUFFER).digest('hex');

    const initialAsset = await service.uploadAsset(
      { name: 'art_v1.png', type: 'image/png', size: VALID_PNG_BUFFER.length, data: VALID_PNG_BUFFER },
      { title: 'Art V1' },
      projectId
    );

    await service.replaceAsset(
      initialAsset.id,
      { name: 'art_v2.png', type: 'image/png', size: VALID_PNG_BUFFER_V2.length, data: VALID_PNG_BUFFER_V2 },
      projectId
    );

    const versions = await service.listVersions(initialAsset.id, projectId);
    assert.strictEqual(versions.length, 1);
    const v1Record = versions[0];

    const restored = await service.setCurrentVersion(initialAsset.id, v1Record.id, projectId);

    assert.ok(restored);
    assert.strictEqual(restored.storageKey, v1Record.storageKey);
    assert.strictEqual(restored.filename, 'art_v1.png');
    assert.strictEqual(restored.security.checksumSha256, v1Hash, 'Restored asset MUST receive matching V1 checksum');
    assert.strictEqual(restored.security.clean, true);
  });

  it('10. Stale security evidence cannot make unsafe historical version publishable', async () => {
    const repository = new MockInMemoryMediaRepository();
    const storageProvider = new MockTrackingStorageProvider();
    const scanner = new MockDeterministicScanner();
    const service = new MediaService(repository, storageProvider, scanner);

    const initialAsset = await service.uploadAsset(
      { name: 'clean_base.png', type: 'image/png', size: VALID_PNG_BUFFER.length, data: VALID_PNG_BUFFER },
      { title: 'Clean Base' },
      projectId
    );

    const quarantinedVer = await service.createVersion(
      initialAsset.id,
      {
        status: 'QUARANTINED',
        mimeType: 'image/png',
        sizeBytes: 100,
        storageKey: 'ast_unsafe_key',
        security: {
          validated: false,
          pipelineId: 'quarantined-pipeline',
          validatedAt: new Date().toISOString(),
          reasonCode: 'INFECTED',
          sourceChecksumSha256: 'bad_hash',
          canonicalChecksumSha256: 'bad_hash',
        },
        originalFilename: 'infected_payload.png',
      },
      projectId
    );

    const restoredQuarantined = await service.setCurrentVersion(initialAsset.id, quarantinedVer.id, projectId);
    assert.ok(restoredQuarantined);
    assert.strictEqual(restoredQuarantined.status, 'QUARANTINED', 'Restoring unsafe version MUST set asset status to QUARANTINED');
    assert.strictEqual(restoredQuarantined.security.clean, false);

    await assert.rejects(
      async () => {
        await service.changeStatus(initialAsset.id, 'PUBLISHED', projectId);
      },
      /cannot be READY or PUBLISHED/i,
      'Unsafe historical version must fail closed against publication'
    );
  });
});
