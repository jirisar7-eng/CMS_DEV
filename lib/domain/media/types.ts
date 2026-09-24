/**
 * SYNTHESIS CMS — MEDIA DOMAIN TYPES
 * Editor-independent MediaAsset, Provider Contracts & Safety Model
 */

export type MediaType = 'image' | 'vector' | 'document' | 'video' | 'audio' | 'archive' | 'other';

export type MediaStatus =
  | 'DRAFT'
  | 'READY'
  | 'PUBLISHED'
  | 'ARCHIVED'
  | 'QUARANTINED'
  | 'ready'
  | 'processing'
  | 'archived'
  | 'failed';

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
  pipelineId?: string;
  scannerId?: string;
  scannerReason?: string;
  contentVerified?: boolean;
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
  ): Promise<{ storageKey: string; sizeBytes: number }>;
  delete(storageKey: string): Promise<void>;

  // Pluggable S3/MinIO conceptual capabilities
  putObject(
    key: string,
    data: Buffer | Uint8Array | Blob,
    options: { mimeType: string; sizeBytes: number; checksumSha256: string }
  ): Promise<void>;
  getObject(key: string): Promise<{ data: Buffer | Uint8Array | Blob; mimeType: string; sizeBytes: number }>;
  deleteObject(key: string): Promise<void>;
  getSignedReadUrl(key: string, expirySeconds?: number): Promise<string>;
  exists(key: string): Promise<boolean>;
}

export type MalwareScanResultStatus =
  | 'CLEAN'
  | 'INFECTED'
  | 'TIMEOUT'
  | 'CONNECTION_FAILED'
  | 'MALFORMED_RESPONSE'
  | 'CONFIGURATION_MISSING';

export interface MalwareScanResult {
  clean: boolean;
  status: MalwareScanResultStatus;
  threat?: string;
  reasonCode?: string;
  scannedAt: string;
  scannerId: string;
  checksumSha256?: string;
}

/**
 * MalwareScanner Interface (Pluggable abstraction: ClamAV, VirusTotal, etc.)
 */
export interface MalwareScanner {
  id: string;
  name: string;
  scan(file: { name: string; type: string; size: number; data?: Buffer | Uint8Array | Blob | ArrayBuffer }): Promise<MalwareScanResult>;
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

/**
 * Generic Media Asset Version Lifecycle Types
 */
export type MediaAssetVersionStatus =
  | 'DRAFT'
  | 'READY'
  | 'PUBLISHED' | 'published'
  | 'ARCHIVED' | 'archived'
  | 'QUARANTINED'
  | 'draft'
  | 'validated'
  | 'superseded'
  | 'rejected';

export interface MediaAssetVersionSecurity {
  validated?: boolean;
  pipelineId?: string;
  validatedAt?: string;
  reasonCode?: string;
  sourceChecksumSha256?: string;
  canonicalChecksumSha256?: string;
  // Extended exact security evidence preserved across lifecycle:
  scanned?: boolean;
  clean?: boolean;
  threat?: string;
  activeContent?: boolean;
  contentVerified?: boolean;
  scannerId?: string;
  scannerReason?: string;
  checksumSha256?: string;
  scannedAt?: string;
}

export interface MediaAssetVersion {
  id: string;
  assetId: string;
  versionNumber: number;
  status: MediaAssetVersionStatus;
  mimeType: string;
  sizeBytes: number;
  storageKey?: string;
  createdAt: string;
  updatedAt: string;
  security: MediaAssetVersionSecurity;
  originalFilename?: string; // Original filename only as safe metadata, never storage path
}

/**
 * Generic Persistence-Capable MediaRepository Contract
 */
export interface IMediaRepository {
  createAsset(assetInput: Omit<MediaAsset, 'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'usageReferences'>): Promise<MediaAsset> | MediaAsset;
  getById(id: string, projectId: string): Promise<MediaAsset | undefined> | MediaAsset | undefined;
  list(projectId: string, filters?: MediaFilterOptions): Promise<MediaAsset[]> | MediaAsset[];
  updateMetadata(id: string, metadata: Partial<MediaMetadata>, projectId: string): Promise<MediaAsset | undefined> | MediaAsset | undefined;
  updateUrl(id: string, url: string, projectId: string): Promise<MediaAsset | undefined> | MediaAsset | undefined;
  createVersion(assetId: string, versionInput: Omit<MediaAssetVersion, 'id' | 'versionNumber' | 'createdAt' | 'updatedAt' | 'assetId'>, projectId: string): Promise<MediaAssetVersion> | MediaAssetVersion;
  listVersions(assetId: string, projectId: string): Promise<MediaAssetVersion[]> | MediaAssetVersion[];
  setCurrentVersion(assetId: string, versionId: string, projectId: string): Promise<MediaAsset | undefined> | MediaAsset | undefined;
  replaceAsset?(
    assetId: string,
    newRecord: {
      storageKey: string;
      filename: string;
      mimeType: string;
      mediaType: MediaType;
      sizeBytes: number;
      status: MediaStatus;
      security: MediaSecurityInfo;
    },
    versionToCreate: Omit<MediaAssetVersion, 'id' | 'versionNumber' | 'createdAt' | 'updatedAt' | 'assetId'>,
    projectId: string
  ): Promise<MediaAsset>;
  changeStatus(id: string, status: MediaStatus, projectId: string): Promise<MediaAsset | undefined> | MediaAsset | undefined;
  addUsageReference(assetId: string, reference: Omit<MediaUsageReference, 'id' | 'usedAt'>, projectId: string): Promise<MediaUsageReference> | MediaUsageReference;
  removeUsageReference(assetId: string, referenceId: string, projectId: string): Promise<void> | void;
  listUsageReferences(assetId: string, projectId: string): Promise<MediaUsageReference[]> | MediaUsageReference[];
  isDeletionAllowed(id: string, projectId: string): Promise<boolean> | boolean;
  archiveAsset(id: string, projectId: string): Promise<MediaAsset | undefined> | MediaAsset | undefined;
  deleteAsset(id: string, projectId: string): Promise<void> | void;
}
