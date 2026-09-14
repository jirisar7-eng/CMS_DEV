/**
 * SYNTHESIS CMS — MEDIA DOMAIN TYPES
 * Editor-independent MediaAsset, Provider Contracts & Safety Model
 */

export type MediaType = 'image' | 'vector' | 'document' | 'video' | 'audio' | 'archive' | 'other';

export type MediaStatus = 'ready' | 'processing' | 'archived' | 'failed';

export interface MediaDimensions {
  width: number;
  height: number;
  aspectRatio?: string;
}

export interface MediaUsageReference {
  id: string;
  pageId: string;
  pageTitle: string;
  pageSlug: string;
  blockId?: string;
  blockType?: string;
  field?: string;
  usedAt: string;
}

export interface MediaMetadata {
  altText: string;
  title: string;
  description: string;
  caption?: string;
  author?: string;
  tags: string[];
}

export interface MediaSecurityInfo {
  scanned: boolean;
  clean: boolean;
  threat?: string;
  activeContent: boolean; // e.g. SVG containing potential scripts
  checksumSha256: string;
  scannedAt: string;
}

export interface MediaAsset {
  id: string;
  storageKey: string; // Isolated UUID/hash, never direct filename or public filesystem path
  filename: string; // Original uploaded filename
  mimeType: string;
  mediaType: MediaType;
  sizeBytes: number;
  dimensions?: MediaDimensions;
  url: string; // Display/preview URL
  status: MediaStatus;
  metadata: MediaMetadata;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
  usageReferences: MediaUsageReference[];
  security: MediaSecurityInfo;
}

/**
 * StorageProvider Interface (Pluggable abstraction: S3, MinIO, R2, GCS, etc.)
 */
export interface StorageProvider {
  id: string;
  name: string;
  upload(
    file: { name: string; type: string; size: number; data?: Blob | ArrayBuffer },
    storageKey: string
  ): Promise<{ url: string; storageKey: string; sizeBytes: number }>;
  delete(storageKey: string): Promise<void>;
  getUrl(storageKey: string): Promise<string>;
}

/**
 * MalwareScanner Interface (Pluggable abstraction: ClamAV, VirusTotal, etc.)
 */
export interface MalwareScanner {
  id: string;
  name: string;
  scan(file: { name: string; type: string; size: number; data?: Blob | ArrayBuffer }): Promise<{
    clean: boolean;
    threat?: string;
    scannedAt: string;
  }>;
}

/**
 * Upload Validation & Security Policy
 */
export interface UploadPolicy {
  maxSizeBytes: number; // e.g. 25MB
  allowedMimeTypes: string[];
  disallowedExtensions: string[];
  requireAltForImages: boolean;
}

export interface UploadPipelineResult {
  success: boolean;
  asset?: MediaAsset;
  error?: string;
  stageFailed?: 'validation' | 'malware_scan' | 'storage' | 'metadata';
}

/**
 * Permissions
 */
export type MediaPermission =
  | 'media.view'
  | 'media.upload'
  | 'media.use'
  | 'media.edit'
  | 'media.replace'
  | 'media.archive'
  | 'media.delete';

/**
 * Filtering & Sorting
 */
export type MediaSortOption =
  | 'createdAt_desc'
  | 'createdAt_asc'
  | 'title_asc'
  | 'title_desc'
  | 'size_desc'
  | 'size_asc'
  | 'usage_desc';

export interface MediaFilterOptions {
  search?: string;
  mediaType?: MediaType | 'all';
  status?: MediaStatus | 'all';
  tag?: string;
  sort?: MediaSortOption;
}
