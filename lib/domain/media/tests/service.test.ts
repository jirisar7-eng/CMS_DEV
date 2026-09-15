import assert from 'assert';
import { MediaService } from '../service';
import { MockStorageProvider } from '../mockProviders';
import { MediaRepository } from '../repository';
import { prepareSvgAssetDraft } from '../svgAssetLifecycle.server';
import { MediaAsset } from '../types';

const TESTS = [
  {
    id: 'svc-01-upload-valid-image',
    name: '1. Service successfully uploads valid non-SVG image',
    run: async () => {
      const mockRepo = new MediaRepository([]);
      const mockStorage = new MockStorageProvider();
      const service = new MediaService(mockRepo, mockStorage);

      const file = { name: 'test.jpg', type: 'image/jpeg', size: 1024, data: Buffer.from('fake-image-data') };
      const metadata = { title: 'Test Image', altText: 'Test', description: '', tags: [] };
      
      const asset = await service.uploadAsset(file, metadata, 'proj-1');
      assert.strictEqual(asset.mediaType, 'image');
      assert.strictEqual(asset.status, 'READY');
      assert.strictEqual(asset.security.activeContent, false);
      assert.strictEqual(typeof asset.security.checksumSha256, 'string');
    }
  },
  {
    id: 'svc-02-upload-svg-fail-closed',
    name: '2. Service fails closed on unsafe SVG upload',
    run: async () => {
      const mockRepo = new MediaRepository([]);
      const mockStorage = new MockStorageProvider();
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
      const mockStorage = new MockStorageProvider();
      const service = new MediaService(mockRepo, mockStorage);

      const safeSvg = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" /></svg>`;
      const file = { name: 'safe.svg', type: 'image/svg+xml', size: Buffer.byteLength(safeSvg), data: Buffer.from(safeSvg) };
      const metadata = { title: 'Safe SVG', altText: 'Test', description: '', tags: [] };
      
      const asset = await service.uploadAsset(file, metadata, 'proj-1');
      assert.strictEqual(asset.mediaType, 'vector');
      assert.strictEqual(asset.security.activeContent, true);
      assert.ok(asset.security.checksumSha256);
      assert.ok(asset.security.pipelineId);
    }
  },
  {
    id: 'svc-04-transition-quarantined',
    name: '4. Service rejects QUARANTINED -> PUBLISHED transition',
    run: async () => {
      const mockRepo = new MediaRepository([]);
      const mockStorage = new MockStorageProvider();
      const service = new MediaService(mockRepo, mockStorage);

      // Create an asset through repository to bypass service logic just to setup state
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
        assert.ok(err.message.includes('QUARANTINED to READY/PUBLISHED'));
      }
    }
  },
  {
    id: 'svc-05-rollback-on-db-fail',
    name: '5. Service deletes storage object if DB persist fails',
    run: async () => {
      const mockRepo = new MediaRepository([]);
      // Mock the repo to throw on createAsset
      mockRepo.createAsset = async () => {
        throw new Error('Database connection failed');
      };

      let deletedStorageKey: string | null = null;
      const mockStorage = new MockStorageProvider();
      // Override deleteObject to track calls
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
      const mockStorage = new MockStorageProvider();
      const service = new MediaService(mockRepo, mockStorage);

      const file = { name: 'test.jpg', type: 'image/jpeg', size: 1024, data: Buffer.from('fake-image-data') };
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
