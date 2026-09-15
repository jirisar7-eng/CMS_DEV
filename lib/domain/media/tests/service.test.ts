import assert from 'assert';
import { MediaService } from '../service';
import { MockStorageProvider } from '../mockProviders';

class StatefulMockStorage extends MockStorageProvider {
  store = new Map<string, any>();
  async putObject(key: string, data: any, options: any) { this.store.set(key, { data, options }); }
  async getObject(key: string) { 
    if (!this.store.has(key)) throw new Error('Not found');
    return this.store.get(key).options;
  }
  async deleteObject(key: string) { this.store.delete(key); }
  async exists(key: string) { return this.store.has(key); }
}
import { MediaRepository } from '../repository';
import { prepareSvgAssetDraft } from '../svgAssetLifecycle.server';
import { MediaAsset } from '../types';
import { GET } from '../../../../app/api/media/[id]/route';
import { NextRequest } from 'next/server';

const TESTS = [
  {
    id: 'svc-01-upload-valid-image',
    name: '1. Service successfully uploads valid non-SVG image',
    run: async () => {
      const mockRepo = new MediaRepository([]);
      const mockStorage = new StatefulMockStorage();
      const service = new MediaService(mockRepo, mockStorage);

      const file = { name: 'test.jpg', type: 'image/jpeg', size: 1024, data: Buffer.from('fake-image-data') };
      const metadata = { title: 'Test Image', altText: 'Test', description: '', tags: [] };
      
      const asset = await service.uploadAsset(file, metadata, 'proj-1');
      assert.strictEqual(asset.mediaType, 'image');
      assert.strictEqual(asset.status, 'QUARANTINED', 'Non-SVG assets without real scanner must default to QUARANTINED');
      assert.strictEqual(asset.security.activeContent, false);
      assert.strictEqual(typeof asset.security.checksumSha256, 'string');
      assert.strictEqual(asset.security.scanned, false);
      assert.strictEqual(asset.security.clean, false);
    }
  },
  {
    id: 'svc-01b-upload-invalid-mime',
    name: '1b. Service fails closed on unknown MIME',
    run: async () => {
      const mockRepo = new MediaRepository([]);
      const mockStorage = new StatefulMockStorage();
      const service = new MediaService(mockRepo, mockStorage);

      const file = { name: 'test.unknown', type: 'application/unknown', size: 1024, data: Buffer.from('fake') };
      const metadata = { title: 'Test', altText: 'Test', description: '', tags: [] };
      
      try {
        await service.uploadAsset(file, metadata, 'proj-1');
        assert.fail('Should reject unknown MIME type');
      } catch (err) {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('MIME type not allowed'));
      }
    }
  },
  {
    id: 'svc-02-upload-svg-fail-closed',
    name: '2. Service fails closed on unsafe SVG upload',
    run: async () => {
      const mockRepo = new MediaRepository([]);
      const mockStorage = new StatefulMockStorage();
      const service = new MediaService(mockRepo, mockStorage);

      const unsafeSvg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert('xss')</script></svg>`;
      const file = { name: 'test.svg', type: 'image/svg+xml', size: Buffer.byteLength(unsafeSvg), data: Buffer.from(unsafeSvg) };
      const metadata = { title: 'Bad SVG', altText: 'Test', description: '', tags: [] };
      
      try {
        await service.uploadAsset(file, metadata, 'proj-1');
        assert.fail('Should have thrown error on unsafe SVG');
      } catch (err) {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('SVG Security Validation Failed'));
      }
    }
  },
  {
    id: 'svc-03-upload-svg-success',
    name: '3. Service succeeds on safe SVG and saves canonical checksum',
    run: async () => {
      const mockRepo = new MediaRepository([]);
      const mockStorage = new StatefulMockStorage();
      const service = new MediaService(mockRepo, mockStorage);

      const safeSvg = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" /></svg>`;
      const file = { name: 'safe.svg', type: 'image/svg+xml', size: Buffer.byteLength(safeSvg), data: Buffer.from(safeSvg) };
      const metadata = { title: 'Safe SVG', altText: 'Test', description: '', tags: [] };
      
      const asset = await service.uploadAsset(file, metadata, 'proj-1');
      assert.strictEqual(asset.mediaType, 'vector');
      assert.strictEqual(asset.status, 'READY', 'SVG with valid pipeline evidence should be READY');
      assert.strictEqual(asset.security.activeContent, true);
      assert.strictEqual(asset.security.scanned, true);
      assert.strictEqual(asset.security.clean, true);
      assert.ok(asset.security.checksumSha256);
      assert.ok(asset.security.pipelineId);
    }
  },
  {
    id: 'svc-04-transition-quarantined',
    name: '4. Service rejects QUARANTINED -> PUBLISHED transition',
    run: async () => {
      const mockRepo = new MediaRepository([]);
      const mockStorage = new StatefulMockStorage();
      const service = new MediaService(mockRepo, mockStorage);

      const asset = await mockRepo.createAsset({
        storageKey: 'ast_infected',
        filename: 'virus.exe',
        mimeType: 'application/octet-stream',
        mediaType: 'other',
        sizeBytes: 10000,
        url: 'https://example.com/virus.exe',
        status: 'QUARANTINED',
        metadata: { altText: '', title: 'Malware', description: '', tags: [] },
        projectId: 'proj-1',
        security: {
          scanned: true,
          clean: false,
          threat: 'Eicar',
          activeContent: false,
          checksumSha256: 'infectedsha',
          scannedAt: new Date().toISOString(),
        },
      });

      try {
        await service.changeStatus(asset.id, 'PUBLISHED');
        assert.fail('Should reject transition');
      } catch (err) {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('cannot be READY or PUBLISHED without successful security scan evidence'));
      }
    }
  },
  {
    id: 'svc-05-rollback-on-db-fail',
    name: '5. Service deletes storage object if DB persist fails',
    run: async () => {
      const mockRepo = new MediaRepository([]);
      mockRepo.createAsset = async () => {
        throw new Error('Database connection failed');
      };

      let deletedStorageKey: string | null = null;
      const mockStorage = new StatefulMockStorage();
      mockStorage.deleteObject = async (key: string) => {
        deletedStorageKey = key;
      };

      const service = new MediaService(mockRepo, mockStorage);

      const file = { name: 'test.jpg', type: 'image/jpeg', size: 1024, data: Buffer.from('fake-image-data') };
      const metadata = { title: 'Test Image', altText: 'Test', description: '', tags: [] };
      
      try {
        await service.uploadAsset(file, metadata, 'proj-1');
        assert.fail('Should have failed DB save');
      } catch (err) {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('persist asset to database'));
        assert.ok(deletedStorageKey, 'Storage object should have been deleted during rollback');
      }
    }
  },
  {
    id: 'svc-06-delete-asset-checks-usage',
    name: '6. Service checks usage before hard delete',
    run: async () => {
      const mockRepo = new MediaRepository([]);
      const mockStorage = new StatefulMockStorage();
      const service = new MediaService(mockRepo, mockStorage);

      const file = { name: 'safe.svg', type: 'image/svg+xml', size: 100, data: Buffer.from('<svg></svg>') };
      const metadata = { title: 'Test Image', altText: 'Test', description: '', tags: [] };
      const asset = await service.uploadAsset(file, metadata, 'proj-1');
      
      await mockRepo.addUsageReference(asset.id, {
        pageId: 'page-home',
        pageTitle: 'Home',
        pageSlug: '/',
      });

      try {
        await service.deleteAsset(asset.id);
        assert.fail('Should fail due to usage');
      } catch (err) {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('still in use'));
      }
    }
  },
  {
    id: 'svc-07-delete-storage-fail',
    name: '7. Service halts hard delete if storage deletion fails',
    run: async () => {
      const mockRepo = new MediaRepository([]);
      const mockStorage = new StatefulMockStorage();
      const service = new MediaService(mockRepo, mockStorage);

      const file = { name: 'safe.svg', type: 'image/svg+xml', size: 100, data: Buffer.from('<svg></svg>') };
      const metadata = { title: 'Test Image', altText: 'Test', description: '', tags: [] };
      const asset = await service.uploadAsset(file, metadata, 'proj-1');
      
      // Override storage to throw
      mockStorage.deleteObject = async (key: string) => {
        throw new Error('Storage outage');
      };

      try {
        await service.deleteAsset(asset.id);
        assert.fail('Should fail because storage failed');
      } catch (err) {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('Storage outage'));
      }

      // Assert DB asset still exists
      const dbAsset = await mockRepo.getById(asset.id);
      assert.ok(dbAsset, 'DB asset must remain intact if storage deletion fails');
    }
  },
  {
    id: 'svc-08-public-endpoint-tests',
    name: '8. Public endpoint blocks non-PUBLISHED assets',
    run: async () => {
      const { mediaService } = await import('../service');
      
      const originalGetAsset = mediaService.getAsset;
      const originalGetDownload = mediaService.getAssetDownload;

      try {
        mediaService.getAsset = async (id: string) => {
          if (id === 'draft') return { status: 'DRAFT' } as MediaAsset;
          if (id === 'quarantined') return { status: 'QUARANTINED' } as MediaAsset;
          if (id === 'ready') return { status: 'READY' } as MediaAsset;
          if (id === 'published') return { status: 'PUBLISHED' } as MediaAsset;
          return undefined;
        };
        
        mediaService.getAssetDownload = async (id: string) => {
          return { data: Buffer.from('data'), mimeType: 'image/jpeg', sizeBytes: 4, filename: 'test.jpg' };
        };

        const draftReq = new NextRequest('http://localhost/api/media/draft');
        const draftRes = await GET(draftReq, { params: Promise.resolve({ id: 'draft' }) });
        assert.strictEqual(draftRes.status, 403, 'DRAFT must be blocked publicly');

        const quarReq = new NextRequest('http://localhost/api/media/quarantined');
        const quarRes = await GET(quarReq, { params: Promise.resolve({ id: 'quarantined' }) });
        assert.strictEqual(quarRes.status, 403, 'QUARANTINED must be blocked publicly');

        const readyReq = new NextRequest('http://localhost/api/media/ready');
        const readyRes = await GET(readyReq, { params: Promise.resolve({ id: 'ready' }) });
        assert.strictEqual(readyRes.status, 403, 'READY must be blocked publicly');

        const pubReq = new NextRequest('http://localhost/api/media/published');
        const pubRes = await GET(pubReq, { params: Promise.resolve({ id: 'published' }) });
        assert.strictEqual(pubRes.status, 200, 'PUBLISHED must be allowed publicly');
      } finally {
        mediaService.getAsset = originalGetAsset;
        mediaService.getAssetDownload = originalGetDownload;
      }
    }
  },
  {
    id: 'svc-09-db-delete-failure-rollback',
    name: '9. Service restores storage object if DB delete fails',
    run: async () => {
      const mockRepo = new MediaRepository([]);
      const mockStorage = new StatefulMockStorage();
      const service = new MediaService(mockRepo, mockStorage);

      const file = { name: 'test.jpg', type: 'image/jpeg', size: 100, data: Buffer.from('data') };
      const metadata = { title: 'Test', altText: '', description: '', tags: [] };
      const asset = await service.uploadAsset(file, metadata, 'proj-1');
      
      const originalDeleteAsset = mockRepo.deleteAsset;
      mockRepo.deleteAsset = async (id: string) => {
        throw new Error('DB connection lost');
      };

      try {
        await service.deleteAsset(asset.id);
        assert.fail('Should fail on DB error');
      } catch (err) {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('Failed to delete asset from database'));
      }

      // Assert storage object is restored
      const exists = await mockStorage.exists(asset.storageKey);
      assert.ok(exists, 'Storage object must be restored if DB delete fails');
      
      mockRepo.deleteAsset = originalDeleteAsset;
    }
  },
  {
    id: 'svc-10-compensation-failure',
    name: '10. Service throws DATA_INTEGRITY_ERROR if compensation fails',
    run: async () => {
      const mockRepo = new MediaRepository([]);
      const mockStorage = new StatefulMockStorage();
      const service = new MediaService(mockRepo, mockStorage);

      const file = { name: 'test.jpg', type: 'image/jpeg', size: 100, data: Buffer.from('data') };
      const metadata = { title: 'Test', altText: '', description: '', tags: [] };
      const asset = await service.uploadAsset(file, metadata, 'proj-1');
      
      mockRepo.deleteAsset = async (id: string) => {
        throw new Error('DB error');
      };
      
      mockStorage.putObject = async (key: string, data: any, options: any) => {
        throw new Error('Storage outage during rollback');
      };

      try {
        await service.deleteAsset(asset.id);
        assert.fail('Should fail on DB error and compensation error');
      } catch (err) {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('DATA_INTEGRITY_ERROR'));
      }
    }
  },
  {
    id: 'svc-11-delete-success',
    name: '11. Service successfully removes both storage and DB',
    run: async () => {
      const mockRepo = new MediaRepository([]);
      const mockStorage = new StatefulMockStorage();
      const service = new MediaService(mockRepo, mockStorage);

      const file = { name: 'test.jpg', type: 'image/jpeg', size: 100, data: Buffer.from('data') };
      const metadata = { title: 'Test', altText: '', description: '', tags: [] };
      const asset = await service.uploadAsset(file, metadata, 'proj-1');

      await service.deleteAsset(asset.id);

      const existsInStorage = await mockStorage.exists(asset.storageKey);
      assert.strictEqual(existsInStorage, false, 'Storage object must be deleted');
      
      const dbAsset = await mockRepo.getById(asset.id);
      assert.strictEqual(dbAsset, undefined, 'DB record must be deleted');
    }
  }
];

export async function runServiceSuite(): Promise<{ total: number; passed: number; failed: number }> {
  console.log('=== Running Media Service Composition Tests ===');
  let passed = 0;
  let failed = 0;

  for (const t of TESTS) {

    try {
      await t.run();
      console.log(`[PASS] ${t.name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${t.name}:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  // Manually run test 8 here by calling GET? GET imports mediaService, which uses Prisma by default!
  // To avoid Prisma connection in tests, we skip it.
  
  console.log(`--- Result: ${passed} passed, ${failed} failed out of ${TESTS.length} ---`);
  return { total: TESTS.length, passed, failed };
}

// Auto-run if executed directly
if (process.argv[1]?.includes('service.test')) {
  runServiceSuite().then((result) => {
    if (result.failed > 0) {
      process.exit(1);
    }
  });
}
