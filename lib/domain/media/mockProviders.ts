import { StorageProvider, MalwareScanner, MalwareScanResult, UploadPolicy, MediaType } from './types';

export const DEFAULT_UPLOAD_POLICY: UploadPolicy = {
  maxSizeBytes: 25 * 1024 * 1024, // 25 MB
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif',
    'image/svg+xml',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'video/mp4',
    'video/webm',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
  ],
  disallowedExtensions: [
    'exe', 'bat', 'cmd', 'sh', 'php', 'phtml', 'js', 'mjs', 'ts', 'jsx', 'tsx',
    'py', 'rb', 'pl', 'jar', 'vbs', 'scr', 'msi', 'com', 'bin', 'dll', 'so',
  ],
  requireAltForImages: true,
};

export function resolveMediaType(mimeType: string, filename: string): MediaType {
  const mime = mimeType.toLowerCase();
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (mime === 'image/svg+xml' || ext === 'svg') {
    return 'vector';
  }
  if (mime.startsWith('image/')) {
    return 'image';
  }
  if (mime.startsWith('video/')) {
    return 'video';
  }
  if (mime.startsWith('audio/')) {
    return 'audio';
  }
  if (
    mime === 'application/pdf' ||
    mime.includes('word') ||
    mime.includes('document') ||
    mime.includes('sheet') ||
    mime.includes('excel') ||
    mime.includes('text/') ||
    ['pdf', 'docx', 'xlsx', 'txt', 'csv', 'md'].includes(ext)
  ) {
    return 'document';
  }
  if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext)) {
    return 'archive';
  }
  return 'other';
}

export class MockStorageProvider implements StorageProvider {
  id = 'mock-storage-provider';
  name = 'In-Memory Mock Storage Adapter';

  async upload(
    file: { name: string; type: string; size: number; data?: Blob | ArrayBuffer },
    storageKey: string
  ): Promise<{ storageKey: string; sizeBytes: number }> {
    // Generate a simulated object URL for preview
    let url = '';
    if (file.type.startsWith('image/')) {
      // Return a stable placeholder or data URL
      url = `https://picsum.photos/seed/${encodeURIComponent(storageKey)}/1200/800`;
    } else {
      url = `/mock-storage/${storageKey}/${encodeURIComponent(file.name)}`;
    }

    return {
      storageKey,
      sizeBytes: file.size,
    };
  }

  async delete(storageKey: string): Promise<void> {
    // Simulated deletion
    return Promise.resolve();
  }

  async putObject(
    key: string,
    data: Buffer | Uint8Array | Blob,
    options: { mimeType: string; sizeBytes: number; checksumSha256: string }
  ): Promise<void> {
    return Promise.resolve();
  }

  async getObject(key: string): Promise<{ data: Buffer | Uint8Array | Blob; mimeType: string; sizeBytes: number }> {
    const data = typeof Buffer !== 'undefined' ? Buffer.from('mock-data') : new Uint8Array();
    return {
      data,
      mimeType: 'application/octet-stream',
      sizeBytes: 9,
    };
  }

  async deleteObject(key: string): Promise<void> {
    return Promise.resolve();
  }

  async getSignedReadUrl(key: string, expirySeconds?: number): Promise<string> {
    return `https://picsum.photos/seed/${encodeURIComponent(key)}/1200/800?expires=${expirySeconds || 900}`;
  }

  async exists(key: string): Promise<boolean> {
    return true;
  }
}

export class MockMalwareScanner implements MalwareScanner {
  id = 'mock-malware-scanner';
  name = 'In-Memory Security Scanner';

  async scan(file: { name: string; type: string; size: number; data?: Buffer | Uint8Array | Blob | ArrayBuffer }): Promise<MalwareScanResult> {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (DEFAULT_UPLOAD_POLICY.disallowedExtensions.includes(ext)) {
      return {
        clean: false,
        status: 'INFECTED',
        threat: `Potenciálně nebezpečná spustitelná přípona: .${ext}`,
        reasonCode: 'DISALLOWED_EXTENSION',
        scannedAt: new Date().toISOString(),
        scannerId: this.id,
      };
    }

    return {
      clean: true,
      status: 'CLEAN',
      scannedAt: new Date().toISOString(),
      scannerId: this.id,
    };
  }
}
