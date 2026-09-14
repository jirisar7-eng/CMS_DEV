import { StorageProvider, MalwareScanner, UploadPolicy, MediaType } from './types';

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
  ): Promise<{ url: string; storageKey: string; sizeBytes: number }> {
    // Generate a simulated object URL for preview
    let url = '';
    if (file.type.startsWith('image/')) {
      // Return a stable placeholder or data URL
      url = `https://picsum.photos/seed/${encodeURIComponent(storageKey)}/1200/800`;
    } else {
      url = `/mock-storage/${storageKey}/${encodeURIComponent(file.name)}`;
    }

    return {
      url,
      storageKey,
      sizeBytes: file.size,
    };
  }

  async delete(storageKey: string): Promise<void> {
    // Simulated deletion
    return Promise.resolve();
  }

  async getUrl(storageKey: string): Promise<string> {
    return `https://picsum.photos/seed/${encodeURIComponent(storageKey)}/1200/800`;
  }
}

export class MockMalwareScanner implements MalwareScanner {
  id = 'mock-malware-scanner';
  name = 'In-Memory Security Scanner';

  async scan(file: { name: string; type: string; size: number; data?: Blob | ArrayBuffer }): Promise<{
    clean: boolean;
    threat?: string;
    scannedAt: string;
  }> {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (DEFAULT_UPLOAD_POLICY.disallowedExtensions.includes(ext)) {
      return {
        clean: false,
        threat: `Potenciálně nebezpečná spustitelná přípona: .${ext}`,
        scannedAt: new Date().toISOString(),
      };
    }

    return {
      clean: true,
      scannedAt: new Date().toISOString(),
    };
  }
}
