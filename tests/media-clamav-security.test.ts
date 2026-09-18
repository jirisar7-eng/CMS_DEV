// @ts-nocheck
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import net from 'net';
import Module from 'node:module';
import path from 'node:path';
import crypto from 'crypto';

// Alias resolution for tests
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === '@/lib/db') {
    return { prisma: {} };
  }
  if (id === '@aws-sdk/client-s3') {
    return { S3Client: class {}, PutObjectCommand: class {}, GetObjectCommand: class {}, DeleteObjectCommand: class {} };
  }
  if (id === '@aws-sdk/s3-request-presigner') {
    return { getSignedUrl: async () => 'https://mock-signed-url' };
  }
  if (id.startsWith('@/')) {
    const relativePath = id.slice(2);
    return originalRequire.call(this, path.resolve(__dirname, '..', relativePath));
  }
  return originalRequire.call(this, id);
};

import { ClamAvMalwareScanner } from '../lib/domain/media/clamAvScanner';
import { MediaService, getMediaService } from '../lib/domain/media/service';
import { MediaRepository } from '../lib/domain/media/repository';
import { MockStorageProvider } from '../lib/domain/media/mockProviders';

describe('SYN-MEDIA-001B: ClamAV Malware Scanner & Non-SVG Upload Pipeline', () => {
  let mockClamServer: net.Server | null = null;

  function createMockClamServer(handler: (socket: net.Socket, data: Buffer, done: () => void) => void): Promise<number> {
    return new Promise((resolve) => {
      mockClamServer = net.createServer((socket) => {
        let buf = Buffer.alloc(0);
        let responded = false;
        socket.on('data', (chunk) => {
          if (responded) return;
          buf = Buffer.concat([buf, chunk]);
          handler(socket, buf, () => { responded = true; });
        });
      });
      mockClamServer.listen(0, '127.0.0.1', () => {
        const addr = mockClamServer!.address() as net.AddressInfo;
        resolve(addr.port);
      });
    });
  }

  afterEach(async () => {
    if (mockClamServer) {
      await new Promise<void>((res) => mockClamServer!.close(() => res()));
      mockClamServer = null;
    }
  });

  describe('1. ClamAvMalwareScanner Socket & Protocol Tests', () => {
    it('sends valid INSTREAM framing (zINSTREAM\\0, big-endian length chunks, zero-length terminator)', async () => {
      let receivedBytes = Buffer.alloc(0);
      const port = await createMockClamServer((socket, data, done) => {
        receivedBytes = data;
        // Verify zINSTREAM command
        if (data.length >= 10 && data.subarray(0, 10).toString('utf8') === 'zINSTREAM\0') {
          done();
          socket.write('stream: OK\0');
          socket.end();
        }
      });

      const scanner = new ClamAvMalwareScanner({ host: '127.0.0.1', port, timeoutMs: 2000 });
      const sampleBuffer = Buffer.from('chunk-framing-test-data');
      const result = await scanner.scan({
        name: 'test.png',
        type: 'image/png',
        size: sampleBuffer.length,
        data: sampleBuffer,
      });

      assert.strictEqual(result.clean, true);
      assert.strictEqual(result.status, 'CLEAN');
      
      // Verify zINSTREAM command header
      assert.strictEqual(receivedBytes.subarray(0, 10).toString('utf8'), 'zINSTREAM\0');
      
      // Verify chunk length header (4 bytes big endian)
      const chunkLen = receivedBytes.readUInt32BE(10);
      assert.strictEqual(chunkLen, sampleBuffer.length);
      
      // Verify payload bytes
      const payload = receivedBytes.subarray(14, 14 + chunkLen);
      assert.strictEqual(payload.toString('utf8'), 'chunk-framing-test-data');

      // Verify zero-length chunk at end
      const zeroLen = receivedBytes.readUInt32BE(14 + chunkLen);
      assert.strictEqual(zeroLen, 0);
    });

    it('accumulates response correctly when clamd splits response across TCP packets', async () => {
      const port = await createMockClamServer((socket, data, done) => {
        if (data.length > 5) {
          done();
          socket.write('stream: O');
          setTimeout(() => {
            socket.write('K\0');
            socket.end();
          }, 50);
        }
      });

      const scanner = new ClamAvMalwareScanner({ host: '127.0.0.1', port, timeoutMs: 2000 });
      const result = await scanner.scan({
        name: 'test.png',
        type: 'image/png',
        size: 5,
        data: Buffer.from('hello'),
      });

      assert.strictEqual(result.clean, true);
      assert.strictEqual(result.status, 'CLEAN');
    });

    it('returns INFECTED when clamd responds with FOUND', async () => {
      const port = await createMockClamServer((socket, data, done) => {
        if (data.length > 5) {
          done();
          socket.write('stream: Eicar-Test-Signature FOUND\0');
          socket.end();
        }
      });

      const scanner = new ClamAvMalwareScanner({ host: '127.0.0.1', port, timeoutMs: 2000 });
      const result = await scanner.scan({
        name: 'virus.exe',
        type: 'application/octet-stream',
        size: 11,
        data: Buffer.from('virus-bytes'),
      });

      assert.strictEqual(result.clean, false);
      assert.strictEqual(result.status, 'INFECTED');
      assert.strictEqual(result.threat, 'Eicar-Test-Signature');
      assert.strictEqual(result.reasonCode, 'VIRUS_FOUND');
    });

    it('returns TIMEOUT when clamd does not respond in time', async () => {
      const port = await createMockClamServer(() => {
        // Do nothing, let timeout trigger
      });

      const scanner = new ClamAvMalwareScanner({ host: '127.0.0.1', port, timeoutMs: 200 });
      const result = await scanner.scan({
        name: 'slow.png',
        type: 'image/png',
        size: 5,
        data: Buffer.from('hello'),
      });

      assert.strictEqual(result.clean, false);
      assert.strictEqual(result.status, 'TIMEOUT');
      assert.strictEqual(result.reasonCode, 'SCAN_TIMEOUT');
    });

    it('returns CONNECTION_FAILED when host is unavailable / connection refused', async () => {
      const scanner = new ClamAvMalwareScanner({ host: '127.0.0.1', port: 59999, timeoutMs: 500 });
      const result = await scanner.scan({
        name: 'test.png',
        type: 'image/png',
        size: 5,
        data: Buffer.from('hello'),
      });

      assert.strictEqual(result.clean, false);
      assert.strictEqual(result.status, 'CONNECTION_FAILED');
      assert.strictEqual(result.reasonCode, 'CONNECTION_FAILED');
    });

    it('returns MALFORMED_RESPONSE on unknown ERROR or unexpected string', async () => {
      const port = await createMockClamServer((socket, data, done) => {
        if (data.length > 5) {
          done();
          socket.write('stream: Internal file read ERROR\0');
          socket.end();
        }
      });

      const scanner = new ClamAvMalwareScanner({ host: '127.0.0.1', port, timeoutMs: 2000 });
      const result = await scanner.scan({
        name: 'test.png',
        type: 'image/png',
        size: 5,
        data: Buffer.from('hello'),
      });

      assert.strictEqual(result.clean, false);
      assert.strictEqual(result.status, 'MALFORMED_RESPONSE');
      assert.strictEqual(result.reasonCode, 'SCANNER_ERROR');
    });

    it('returns CONFIGURATION_MISSING when host or port is unconfigured', async () => {
      const scanner = new ClamAvMalwareScanner({ host: '', port: 0 });
      const result = await scanner.scan({
        name: 'test.png',
        type: 'image/png',
        size: 5,
        data: Buffer.from('hello'),
      });

      assert.strictEqual(result.clean, false);
      assert.strictEqual(result.status, 'CONFIGURATION_MISSING');
      assert.strictEqual(result.reasonCode, 'CONFIGURATION_MISSING');
    });

    it('binds exact SHA256 checksum of scanned bytes', async () => {
      const port = await createMockClamServer((socket, data, done) => {
        if (data.length > 5) {
          done();
          socket.write('stream: OK\0');
          socket.end();
        }
      });

      const scanner = new ClamAvMalwareScanner({ host: '127.0.0.1', port, timeoutMs: 2000 });
      const testBytes = Buffer.from('exact-checksum-verification-data');
      const expectedSha256 = crypto.createHash('sha256').update(testBytes).digest('hex');

      const result = await scanner.scan({
        name: 'test.png',
        type: 'image/png',
        size: testBytes.length,
        data: testBytes,
      });

      assert.strictEqual(result.checksumSha256, expectedSha256);
    });

    it('ensures MockMalwareScanner is not used in production getMediaService', () => {
      const service = getMediaService();
      const scanner = (service as any).malwareScanner;
      assert.notStrictEqual(scanner?.id, 'mock-malware-scanner');
    });
  });

  describe('2. Content/MIME Verification & Non-SVG Security Pipeline', () => {
    it('promotes valid PNG with ClamAV CLEAN to READY', async () => {
      const port = await createMockClamServer((socket, data, done) => {
        if (data.length > 5) {
          done();
          socket.write('stream: OK\0');
          socket.end();
        }
      });

      const scanner = new ClamAvMalwareScanner({ host: '127.0.0.1', port, timeoutMs: 2000 });
      const repo = new MediaRepository();
      const service = new MediaService(repo, new MockStorageProvider(), scanner);

      // Valid PNG Magic Bytes: \x89PNG\r\n\x1a\n
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00]);

      const asset = await service.uploadAsset(
        { name: 'photo.png', type: 'image/png', size: pngHeader.length, data: pngHeader },
        { title: 'Valid PNG Photo' },
        'project-1'
      );

      assert.strictEqual(asset.status, 'READY');
      assert.strictEqual(asset.security.scanned, true);
      assert.strictEqual(asset.security.clean, true);
      assert.strictEqual(asset.security.contentVerified, true);
      assert.strictEqual(asset.security.scannerId, 'clamav');
      assert.ok(asset.security.checksumSha256);
    });

    it('quarantines upload when declared MIME is image/png but magic bytes are invalid (MIME spoof mismatch)', async () => {
      const port = await createMockClamServer((socket, data, done) => {
        if (data.length > 5) {
          done();
          socket.write('stream: OK\0');
          socket.end();
        }
      });

      const scanner = new ClamAvMalwareScanner({ host: '127.0.0.1', port, timeoutMs: 2000 });
      const repo = new MediaRepository();
      const service = new MediaService(repo, new MockStorageProvider(), scanner);

      // Fake PNG (actually plain ASCII text)
      const fakePng = Buffer.from('THIS_IS_NOT_A_PNG_FILE_HEADER');

      const asset = await service.uploadAsset(
        { name: 'fake.png', type: 'image/png', size: fakePng.length, data: fakePng },
        { title: 'Spoofed PNG' },
        'project-1'
      );

      // ClamAV CLEAN alone does NOT imply READY when content verification fails
      assert.strictEqual(asset.status, 'QUARANTINED');
      assert.strictEqual(asset.security.contentVerified, false);

      // Attempting to promote to READY/PUBLISHED fails closed
      await assert.rejects(
        async () => {
          await service.changeStatus(asset.id, 'READY', 'project-1');
        },
        /without successful content signature verification/
      );
    });

    it('quarantines unverified container formats (e.g., DOCX/XLSX) even if ClamAV returns CLEAN', async () => {
      const port = await createMockClamServer((socket, data, done) => {
        if (data.length > 5) {
          done();
          socket.write('stream: OK\0');
          socket.end();
        }
      });

      const scanner = new ClamAvMalwareScanner({ host: '127.0.0.1', port, timeoutMs: 2000 });
      const repo = new MediaRepository();
      const service = new MediaService(repo, new MockStorageProvider(), scanner);

      const docxBytes = Buffer.from('PK\x03\x04_mock_docx_container');

      const asset = await service.uploadAsset(
        {
          name: 'report.docx',
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: docxBytes.length,
          data: docxBytes,
        },
        { title: 'Unverified DOCX' },
        'project-1'
      );

      assert.strictEqual(asset.status, 'QUARANTINED');
      assert.strictEqual(asset.security.contentVerified, false);
    });

    it('quarantines non-SVG asset when ClamAV scan detects INFECTED file and blocks READY/PUBLISHED', async () => {
      const port = await createMockClamServer((socket, data, done) => {
        if (data.length > 5) {
          done();
          socket.write('stream: Win.Test.Eicar FOUND\0');
          socket.end();
        }
      });

      const scanner = new ClamAvMalwareScanner({ host: '127.0.0.1', port, timeoutMs: 2000 });
      const repo = new MediaRepository();
      const service = new MediaService(repo, new MockStorageProvider(), scanner);

      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

      const asset = await service.uploadAsset(
        { name: 'malware.png', type: 'image/png', size: pngHeader.length, data: pngHeader },
        { title: 'Infected Image' },
        'project-1'
      );

      assert.strictEqual(asset.status, 'QUARANTINED');
      assert.strictEqual(asset.security.clean, false);

      await assert.rejects(
        async () => {
          await service.changeStatus(asset.id, 'PUBLISHED', 'project-1');
        },
        /without successful security scan evidence/
      );
    });

    it('fails closed when scanner is unavailable or unconfigured', async () => {
      const repo = new MediaRepository();
      const service = new MediaService(repo, new MockStorageProvider());

      const pdfHeader = Buffer.from('%PDF-1.4_sample_data');

      const asset = await service.uploadAsset(
        { name: 'document.pdf', type: 'application/pdf', size: pdfHeader.length, data: pdfHeader },
        { title: 'Unscanned PDF' },
        'project-1'
      );

      assert.strictEqual(asset.status, 'QUARANTINED');
      assert.strictEqual(asset.security.scanned, false);
      assert.strictEqual(asset.security.clean, false);

      await assert.rejects(
        async () => {
          await service.changeStatus(asset.id, 'READY', 'project-1');
        },
        /without successful security scan evidence/
      );
    });
  });
});
