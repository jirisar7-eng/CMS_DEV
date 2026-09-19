import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { MediaService } from '../lib/domain/media/service';
import { MediaRepository } from '../lib/domain/media/repository';
import { MockStorageProvider } from '../lib/domain/media/mockProviders';
import { IMediaRepository } from '../lib/domain/media/types';

describe('SYN-MEDIA-001B: Media Domain Project Isolation & Security', () => {
  let repo: IMediaRepository;
  let service: MediaService;

  beforeEach(() => {
    repo = new MediaRepository();
    service = new MediaService(repo, new MockStorageProvider());
  });

  describe('1. Project-Scoped Isolation across Repository and Service', () => {
    it('isolates media asset creation and retrieval by projectId', async () => {
      // Create asset in project-A
      const assetA = await service.uploadAsset(
        {
          name: 'photo-a.jpg',
          type: 'image/jpeg',
          size: 1024,
          data: Buffer.from('photo-a-data'),
        },
        { title: 'Photo A', altText: 'Alt A', description: 'Desc A' },
        'project-A'
      );

      assert.strictEqual(assetA.projectId, 'project-A');

      // Fetch with project-A should succeed
      const foundA = await service.getAsset(assetA.id, 'project-A');
      assert.ok(foundA);
      assert.strictEqual(foundA?.id, assetA.id);

      // Fetch with project-B MUST return undefined (fail-closed)
      const foundB = await service.getAsset(assetA.id, 'project-B');
      assert.strictEqual(foundB, undefined);
    });

    it('listAssets returns only assets belonging to the requested projectId', async () => {
      await service.uploadAsset(
        { name: 'a1.png', type: 'image/png', size: 500, data: Buffer.from('a1') },
        { title: 'A1' },
        'project-1'
      );
      await service.uploadAsset(
        { name: 'a2.png', type: 'image/png', size: 600, data: Buffer.from('a2') },
        { title: 'A2' },
        'project-1'
      );
      await service.uploadAsset(
        { name: 'b1.png', type: 'image/png', size: 700, data: Buffer.from('b1') },
        { title: 'B1' },
        'project-2'
      );

      const list1 = await service.listAssets('project-1');
      assert.strictEqual(list1.length, 2);
      assert.ok(list1.every((a) => a.projectId === 'project-1'));

      const list2 = await service.listAssets('project-2');
      assert.strictEqual(list2.length, 1);
      assert.strictEqual(list2[0].projectId, 'project-2');
    });

    it('updateMetadata fails closed if projectId does not match', async () => {
      const asset = await service.uploadAsset(
        { name: 'doc.pdf', type: 'application/pdf', size: 2000, data: Buffer.from('doc') },
        { title: 'Original Doc' },
        'project-1'
      );

      // Updating with wrong project-2 should return undefined
      const updatedWrong = await service.updateMetadata(asset.id, { title: 'Hacked Title' }, 'project-2');
      assert.strictEqual(updatedWrong, undefined);

      // Updating with correct project-1 succeeds
      const updatedCorrect = await service.updateMetadata(asset.id, { title: 'New Doc Title' }, 'project-1');
      assert.ok(updatedCorrect);
      assert.strictEqual(updatedCorrect?.metadata.title, 'New Doc Title');
    });

    it('deleteAsset fails closed if projectId does not match', async () => {
      const asset = await service.uploadAsset(
        { name: 'logo.png', type: 'image/png', size: 1000, data: Buffer.from('logo') },
        { title: 'Logo' },
        'project-1'
      );

      // Delete with wrong project
      await assert.rejects(
        async () => {
          await service.deleteAsset(asset.id, 'project-2');
        },
        /Deletion is not allowed for this asset/
      );

      // Asset should still exist in project-1
      const stillExists = await service.getAsset(asset.id, 'project-1');
      assert.ok(stillExists);

      // Delete with correct project succeeds
      await service.deleteAsset(asset.id, 'project-1');
      const gone = await service.getAsset(asset.id, 'project-1');
      assert.strictEqual(gone, undefined);
    });
  });

  describe('2. MIME Security & Quarantining Invariant', () => {
    it('non-SVG uploads are quarantined by default without verified scan', async () => {
      const imageAsset = await service.uploadAsset(
        { name: 'test.jpg', type: 'image/jpeg', size: 5000, data: Buffer.from('fake-jpg') },
        { title: 'Test JPG' },
        'project-1'
      );

      assert.strictEqual(imageAsset.status, 'QUARANTINED');
      assert.strictEqual(imageAsset.security.scanned, false);
      assert.strictEqual(imageAsset.security.clean, false);
    });

    it('SVG uploads with valid lifecycle pipeline produce clean READY asset', async () => {
      const validSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10 H 90 V 90 H 10 Z" fill="#000"/></svg>';
      const svgAsset = await service.uploadAsset(
        { name: 'icon.svg', type: 'image/svg+xml', size: validSvg.length, data: Buffer.from(validSvg) },
        { title: 'Test SVG Icon' },
        'project-1'
      );

      assert.strictEqual(svgAsset.status, 'READY');
      assert.strictEqual(svgAsset.security.scanned, true);
      assert.strictEqual(svgAsset.security.clean, true);
      assert.ok(svgAsset.security.pipelineId);
    });

    it('rejects disallowed file extensions', async () => {
      await assert.rejects(
        async () => {
          await service.uploadAsset(
            { name: 'malware.exe', type: 'application/x-msdownload', size: 100, data: Buffer.from('bad') },
            { title: 'Bad file' },
            'project-1'
          );
        },
        /Disallowed file extension/
      );
    });

    it('rejects files exceeding size limit', async () => {
      await assert.rejects(
        async () => {
          await service.uploadAsset(
            { name: 'giant.jpg', type: 'image/jpeg', size: 30 * 1024 * 1024, data: Buffer.alloc(100) },
            { title: 'Giant' },
            'project-1'
          );
        },
        /File size exceeds limit/
      );
    });
  });

  describe('3. Reference Integrity & Delete Protection', () => {
    it('blocks deletion of media asset with active references', async () => {
      const asset = await service.uploadAsset(
        { name: 'banner.png', type: 'image/png', size: 1000, data: Buffer.from('banner') },
        { title: 'Banner' },
        'project-1'
      );

      // Add a usage reference
      const found = await repo.getById(asset.id, 'project-1');
      assert.ok(found);
      found.usageCount = 1;
      found.usageReferences = [{
        id: 'ref-1',
        pageId: 'page-1',
        pageTitle: 'Homepage',
        pageSlug: 'home',
        blockId: 'b-1',
        blockType: 'hero',
        field: 'backgroundImage',
        usedAt: new Date().toISOString(),
      }];

      await assert.rejects(
        async () => {
          await service.deleteAsset(asset.id, 'project-1');
        },
        /Deletion is not allowed for this asset/
      );
    });
  });
});
