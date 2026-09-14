import {
  MediaAsset,
  MediaFilterOptions,
  MediaSortOption,
  MediaStatus,
  MediaType,
  UploadPipelineResult,
  IMediaRepository,
  MediaAssetVersion,
  MediaUsageReference,
  MediaMetadata,
} from './types';
import {
  DEFAULT_UPLOAD_POLICY,
  MockMalwareScanner,
  MockStorageProvider,
  resolveMediaType,
} from './mockProviders';

const INITIAL_MEDIA_FIXTURES: MediaAsset[] = [
  {
    id: 'media-hero-banner',
    storageKey: 'ast_9a7b1c3d-e4f5-4a6b-8c7d-0e1f2a3b4c5d',
    filename: 'hero-modern-architecture.webp',
    mimeType: 'image/webp',
    mediaType: 'image',
    sizeBytes: 482150, // ~482 KB
    dimensions: {
      width: 1920,
      height: 1080,
      aspectRatio: '16:9',
    },
    url: 'https://picsum.photos/seed/synthesis-hero-arch/1920/1080',
    status: 'ready',
    metadata: {
      title: 'Hero fotografie – Moderní architektura',
      altText: 'Prosklená minimalistická budova moderní architektury s modrým nebem',
      description: 'Hlavní vizuál na úvodní stránce pro sekci Hero banneru.',
      caption: 'Ilustrační fotografie moderního studia Synthesis',
      author: 'Jan Novák',
      tags: ['hero', 'homepage', 'architektura', 'banner'],
    },
    projectId: 'synthesis-main',
    createdAt: '2026-03-01T10:15:00Z',
    updatedAt: '2026-03-05T14:20:00Z',
    usageCount: 2,
    usageReferences: [
      {
        id: 'use-01',
        pageId: 'page-home',
        pageTitle: 'Úvodní stránka',
        pageSlug: '/',
        blockId: 'block-hero-01',
        blockType: 'HeroSection',
        field: 'backgroundImage',
        usedAt: '2026-03-01T10:30:00Z',
      },
      {
        id: 'use-02',
        pageId: 'page-about',
        pageTitle: 'O nás',
        pageSlug: '/o-nas',
        blockId: 'block-about-header',
        blockType: 'HeaderBanner',
        field: 'featuredImage',
        usedAt: '2026-03-02T11:00:00Z',
      },
    ],
    security: {
      scanned: true,
      clean: true,
      activeContent: false,
      checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      scannedAt: '2026-03-01T10:15:02Z',
    },
  },
  {
    id: 'media-brand-logo',
    storageKey: 'ast_1f2e3d4c-5b6a-7f8e-9d0c-1b2a3f4e5d6c',
    filename: 'synthesis-logo-mark.svg',
    mimeType: 'image/svg+xml',
    mediaType: 'vector',
    sizeBytes: 18450, // ~18 KB
    dimensions: {
      width: 512,
      height: 512,
      aspectRatio: '1:1',
    },
    url: 'https://picsum.photos/seed/synthesis-logo-vector/600/600',
    status: 'ready',
    metadata: {
      title: 'Oficiální vektorové logo Synthesis',
      altText: 'Geometrický emblém Synthesis v indigové barvě',
      description: 'Primární vektorový symbol pro hlavičku, patičku a faviconu.',
      author: 'Jiří Šár — Synthesis Studio',
      tags: ['logo', 'vektor', 'branding', 'header'],
    },
    projectId: 'synthesis-main',
    createdAt: '2026-02-15T08:00:00Z',
    updatedAt: '2026-02-15T08:00:00Z',
    usageCount: 3,
    usageReferences: [
      {
        id: 'use-03',
        pageId: 'page-home',
        pageTitle: 'Úvodní stránka',
        pageSlug: '/',
        blockId: 'block-header-nav',
        blockType: 'NavigationHeader',
        field: 'brandLogo',
        usedAt: '2026-02-15T09:00:00Z',
      },
      {
        id: 'use-04',
        pageId: 'page-contact',
        pageTitle: 'Kontakt',
        pageSlug: '/kontakt',
        blockId: 'block-contact-card',
        blockType: 'ContactCard',
        field: 'logoIcon',
        usedAt: '2026-02-16T14:30:00Z',
      },
      {
        id: 'use-05',
        pageId: 'page-pricing',
        pageTitle: 'Ceník služeb',
        pageSlug: '/cenik',
        blockId: 'block-pricing-header',
        blockType: 'PricingHeader',
        field: 'watermark',
        usedAt: '2026-02-18T16:00:00Z',
      },
    ],
    security: {
      scanned: true,
      clean: true,
      activeContent: true, // SVG flagged for sanitizer
      checksumSha256: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
      scannedAt: '2026-02-15T08:00:05Z',
    },
  },
  {
    id: 'media-team-photo',
    storageKey: 'ast_4d5e6f7a-8b9c-0d1e-2f3a-4b5c6d7e8f9a',
    filename: 'synthesis-core-engineering-team.jpg',
    mimeType: 'image/jpeg',
    mediaType: 'image',
    sizeBytes: 1245800, // ~1.2 MB
    dimensions: {
      width: 2400,
      height: 1600,
      aspectRatio: '3:2',
    },
    url: 'https://picsum.photos/seed/synthesis-team-photo/1600/1066',
    status: 'ready',
    metadata: {
      title: 'Vývojové zázemí Synthesis',
      altText: 'Pracovní prostředí vývojového studia Synthesis',
      description: 'Fotografie pro sekci O studiu a prezentaci projektů.',
      author: 'Jiří Šár',
      tags: ['studio', 'o-nas', 'vyvoj', 'pracoviste'],
    },
    projectId: 'synthesis-main',
    createdAt: '2026-03-03T11:45:00Z',
    updatedAt: '2026-03-03T11:45:00Z',
    usageCount: 1,
    usageReferences: [
      {
        id: 'use-06',
        pageId: 'page-about',
        pageTitle: 'O nás',
        pageSlug: '/o-nas',
        blockId: 'block-team-grid',
        blockType: 'TeamSection',
        field: 'teamGroupPhoto',
        usedAt: '2026-03-03T12:00:00Z',
      },
    ],
    security: {
      scanned: true,
      clean: true,
      activeContent: false,
      checksumSha256: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
      scannedAt: '2026-03-03T11:45:03Z',
    },
  },
  {
    id: 'media-pdf-catalog',
    storageKey: 'ast_7a8b9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d',
    filename: 'katalog-sluzeb-synthesis-2026.pdf',
    mimeType: 'application/pdf',
    mediaType: 'document',
    sizeBytes: 3840200, // ~3.8 MB
    url: '/mock-storage/ast_7a8b9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d/katalog-sluzeb-synthesis-2026.pdf',
    status: 'ready',
    metadata: {
      title: 'Katalog služeb a technických řešení 2026',
      altText: 'Dokument PDF s kompletním katalogem služeb Synthesis pro rok 2026',
      description: 'Oficiální PDF brožura ke stažení pro zájemce a partnery.',
      author: 'Jiří Šár',
      tags: ['katalog', 'pdf', 'ke-stazeni', 'sluzby'],
    },
    projectId: 'synthesis-main',
    createdAt: '2026-02-20T14:00:00Z',
    updatedAt: '2026-02-28T09:10:00Z',
    usageCount: 1,
    usageReferences: [
      {
        id: 'use-07',
        pageId: 'page-services',
        pageTitle: 'Služby a řešení',
        pageSlug: '/sluzby',
        blockId: 'block-download-cta',
        blockType: 'DownloadBox',
        field: 'attachmentFile',
        usedAt: '2026-02-28T09:30:00Z',
      },
    ],
    security: {
      scanned: true,
      clean: true,
      activeContent: false,
      checksumSha256: 'fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9',
      scannedAt: '2026-02-20T14:00:06Z',
    },
  },
  {
    id: 'media-gdpr-policy-doc',
    storageKey: 'ast_3b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e',
    filename: 'zasady-zpracovani-osobnich-udaju.pdf',
    mimeType: 'application/pdf',
    mediaType: 'document',
    sizeBytes: 420100, // ~420 KB
    url: '/mock-storage/ast_3b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e/zasady-zpracovani-osobnich-udaju.pdf',
    status: 'ready',
    metadata: {
      title: 'Zásady zpracování osobních údajů (GDPR)',
      altText: 'Právní dokument popisující ochranu osobních údajů v souladu s GDPR',
      description: 'Aktuální znění zásad ochrany soukromí.',
      author: 'Správce projektu',
      tags: ['gdpr', 'pravni', 'soukromi', 'dokument'],
    },
    projectId: 'synthesis-main',
    createdAt: '2026-01-10T09:00:00Z',
    updatedAt: '2026-01-10T09:00:00Z',
    usageCount: 1,
    usageReferences: [
      {
        id: 'use-08',
        pageId: 'page-gdpr',
        pageTitle: 'Ochrana osobních údajů',
        pageSlug: '/gdpr',
        blockId: 'block-gdpr-download',
        blockType: 'DownloadSection',
        field: 'pdfLink',
        usedAt: '2026-01-10T09:15:00Z',
      },
    ],
    security: {
      scanned: true,
      clean: true,
      activeContent: false,
      checksumSha256: '8f434346648f6b96df89dda901c5176b10e6d059612d556c4a4a485fa50ff48a',
      scannedAt: '2026-01-10T09:00:02Z',
    },
  },
  {
    id: 'media-feature-chart',
    storageKey: 'ast_6c7d8e9f-0a1b-2c3d-4e5f-6a7b8c9d0e1f',
    filename: 'infografika-vykonu-architektury.png',
    mimeType: 'image/png',
    mediaType: 'image',
    sizeBytes: 760400, // ~760 KB
    dimensions: {
      width: 1400,
      height: 900,
      aspectRatio: '14:9',
    },
    url: 'https://picsum.photos/seed/synthesis-chart-metrics/1400/900',
    status: 'ready',
    metadata: {
      title: 'Infografika výkonnostních metrik CMS',
      altText: 'Graf porovnávající odezvu a propustnost architektury Synthesis CMS',
      description: 'Ilustrativní technický graf pro prezentaci a případové studie.',
      author: 'Jan Novák',
      tags: ['graf', 'vykon', 'architektura', 'metriky'],
    },
    projectId: 'synthesis-main',
    createdAt: '2026-03-08T15:30:00Z',
    updatedAt: '2026-03-08T15:30:00Z',
    usageCount: 0, // Unused asset (safe for deletion)
    usageReferences: [],
    security: {
      scanned: true,
      clean: true,
      activeContent: false,
      checksumSha256: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
      scannedAt: '2026-03-08T15:30:03Z',
    },
  },
  {
    id: 'media-old-promo-banner',
    storageKey: 'ast_5e6f7a8b-9c0d-1e2f-3a4b-5c6d7e8f9a0b',
    filename: 'banner-konference-2025.webp',
    mimeType: 'image/webp',
    mediaType: 'image',
    sizeBytes: 340500,
    dimensions: {
      width: 1200,
      height: 630,
      aspectRatio: '1.91:1',
    },
    url: 'https://picsum.photos/seed/synthesis-old-promo/1200/630',
    status: 'archived',
    metadata: {
      title: 'Propagační banner konference 2025 (Archiv)',
      altText: 'Pozvánka na výroční konferenci 2025 s logem akce',
      description: 'Archivovaný propagační vizuál z loňského roku.',
      tags: ['archiv', 'banner', 'konference'],
    },
    projectId: 'synthesis-main',
    createdAt: '2025-10-01T10:00:00Z',
    updatedAt: '2026-01-05T09:00:00Z',
    usageCount: 0,
    usageReferences: [],
    security: {
      scanned: true,
      clean: true,
      activeContent: false,
      checksumSha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      scannedAt: '2025-10-01T10:00:05Z',
    },
  },
];

export class MediaRepository implements IMediaRepository {
  private assets: MediaAsset[];
  private versions: MediaAssetVersion[] = [];
  private storageProvider: MockStorageProvider;
  private malwareScanner: MockMalwareScanner;

  constructor(initialAssets: MediaAsset[] = INITIAL_MEDIA_FIXTURES) {
    this.assets = [...initialAssets];
    this.storageProvider = new MockStorageProvider();
    this.malwareScanner = new MockMalwareScanner();
  }

  getAll(): MediaAsset[] {
    return [...this.assets];
  }

  getById(id: string): MediaAsset | undefined {
    return this.assets.find(a => a.id === id);
  }

  filter(options: MediaFilterOptions = {}): MediaAsset[] {
    let result = [...this.assets];

    if (options.status && options.status !== 'all') {
      result = result.filter(a => a.status === options.status);
    }

    if (options.mediaType && options.mediaType !== 'all') {
      result = result.filter(a => a.mediaType === options.mediaType);
    }

    if (options.tag) {
      result = result.filter(a => a.metadata.tags.includes(options.tag!));
    }

    if (options.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      result = result.filter(
        a =>
          a.filename.toLowerCase().includes(q) ||
          a.metadata.title.toLowerCase().includes(q) ||
          a.metadata.altText.toLowerCase().includes(q) ||
          a.metadata.description.toLowerCase().includes(q) ||
          a.metadata.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    const sort = options.sort || 'createdAt_desc';
    result.sort((a, b) => {
      switch (sort) {
        case 'createdAt_desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'createdAt_asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'title_asc':
          return a.metadata.title.localeCompare(b.metadata.title, 'cs');
        case 'title_desc':
          return b.metadata.title.localeCompare(a.metadata.title, 'cs');
        case 'size_desc':
          return b.sizeBytes - a.sizeBytes;
        case 'size_asc':
          return a.sizeBytes - b.sizeBytes;
        case 'usage_desc':
          return b.usageCount - a.usageCount;
        default:
          return 0;
      }
    });

    return result;
  }

  /**
   * Safe upload pipeline simulation
   */
  async upload(params: {
    file: { name: string; type: string; size: number; data?: Blob | ArrayBuffer };
    metadata: {
      title?: string;
      altText?: string;
      description?: string;
      tags?: string[];
      author?: string;
    };
    projectId?: string;
  }): Promise<UploadPipelineResult> {
    const { file, metadata, projectId = 'synthesis-main' } = params;

    // 1. Validate size and extension
    if (file.size > DEFAULT_UPLOAD_POLICY.maxSizeBytes) {
      return {
        success: false,
        stageFailed: 'validation',
        error: `Soubor překračuje maximální povolenou velikost ${Math.round(DEFAULT_UPLOAD_POLICY.maxSizeBytes / (1024 * 1024))} MB.`,
      };
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (DEFAULT_UPLOAD_POLICY.disallowedExtensions.includes(ext)) {
      return {
        success: false,
        stageFailed: 'validation',
        error: `Soubory s příponou .${ext} jsou z bezpečnostních důvodů blokovány.`,
      };
    }

    // 2. Malware and active content scan
    const scanResult = await this.malwareScanner.scan(file);
    if (!scanResult.clean) {
      return {
        success: false,
        stageFailed: 'malware_scan',
        error: scanResult.threat || 'Bezpečnostní skener detekoval hrozbu v souboru.',
      };
    }

    // 3. Isolated storage key generation (UUID - NEVER direct user filename)
    const storageKey = `ast_${Math.random().toString(36).substring(2, 10)}-${Date.now().toString(36)}`;
    const storageResult = await this.storageProvider.upload(file, storageKey);

    const mediaType = resolveMediaType(file.type, file.name);
    const isSvg = file.type === 'image/svg+xml' || ext === 'svg';

    const now = new Date().toISOString();
    const newAsset: MediaAsset = {
      id: `media-${Date.now()}`,
      storageKey: storageResult.storageKey,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      mediaType,
      sizeBytes: file.size,
      dimensions: mediaType === 'image' ? { width: 1200, height: 800, aspectRatio: '3:2' } : undefined,
      url: storageResult.url,
      status: 'ready',
      metadata: {
        title: metadata.title || file.name.replace(/\.[^/.]+$/, ''),
        altText: metadata.altText || (mediaType === 'image' ? metadata.title || file.name : ''),
        description: metadata.description || '',
        author: metadata.author || '',
        tags: metadata.tags || [],
      },
      projectId,
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
      usageReferences: [],
      security: {
        scanned: true,
        clean: true,
        activeContent: isSvg,
        checksumSha256: `sha256_${Math.random().toString(36).substring(2, 15)}`,
        scannedAt: scanResult.scannedAt,
      },
    };

    this.assets.unshift(newAsset);

    return {
      success: true,
      asset: newAsset,
    };
  }

  /**
   * Update Asset Metadata (Title, ALT, Description, Tags)
   */
  updateMetadata(
    id: string,
    metadataUpdate: Partial<MediaAsset['metadata']>
  ): MediaAsset | undefined {
    const asset = this.getById(id);
    if (!asset) return undefined;

    asset.metadata = {
      ...asset.metadata,
      ...metadataUpdate,
    };
    asset.updatedAt = new Date().toISOString();
    return asset;
  }

  /**
   * Replace Asset file (preserves storage key reference to avoid breaking external links)
   */
  async replaceFile(
    id: string,
    file: { name: string; type: string; size: number; data?: Blob | ArrayBuffer }
  ): Promise<UploadPipelineResult> {
    const asset = this.getById(id);
    if (!asset) {
      return { success: false, error: 'Médium nebylo nalezeno.' };
    }

    // 1. Validate
    if (file.size > DEFAULT_UPLOAD_POLICY.maxSizeBytes) {
      return {
        success: false,
        stageFailed: 'validation',
        error: `Soubor překračuje maximální povolenou velikost ${Math.round(DEFAULT_UPLOAD_POLICY.maxSizeBytes / (1024 * 1024))} MB.`,
      };
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (DEFAULT_UPLOAD_POLICY.disallowedExtensions.includes(ext)) {
      return {
        success: false,
        stageFailed: 'validation',
        error: `Soubory s příponou .${ext} jsou blokovány.`,
      };
    }

    // 2. Scan
    const scan = await this.malwareScanner.scan(file);
    if (!scan.clean) {
      return {
        success: false,
        stageFailed: 'malware_scan',
        error: scan.threat || 'Bezpečnostní skener detekoval hrozbu.',
      };
    }

    // 3. Storage update (reusing storage key)
    const storageResult = await this.storageProvider.upload(file, asset.storageKey);

    asset.filename = file.name;
    asset.mimeType = file.type;
    asset.sizeBytes = file.size;
    asset.mediaType = resolveMediaType(file.type, file.name);
    asset.url = storageResult.url;
    asset.updatedAt = new Date().toISOString();
    asset.security.activeContent = file.type === 'image/svg+xml' || ext === 'svg';
    asset.security.scannedAt = scan.scannedAt;

    return {
      success: true,
      asset,
    };
  }

  /**
   * Archive asset
   */
  archive(id: string): MediaAsset | undefined {
    const asset = this.getById(id);
    if (!asset) return undefined;

    asset.status = 'archived';
    asset.updatedAt = new Date().toISOString();
    return asset;
  }

  /**
   * Restore asset from archive
   */
  restore(id: string): MediaAsset | undefined {
    const asset = this.getById(id);
    if (!asset) return undefined;

    asset.status = 'ready';
    asset.updatedAt = new Date().toISOString();
    return asset;
  }

  /**
   * Safe Delete: Checks usage references.
   * If usageCount > 0, deletion is BLOCKED to prevent broken references.
   */
  delete(id: string): { success: boolean; error?: string; references?: MediaAsset['usageReferences'] } {
    const asset = this.getById(id);
    if (!asset) {
      return { success: false, error: 'Médium nebylo nalezeno.' };
    }

    if (asset.usageCount > 0) {
      return {
        success: false,
        error: `Médium nelze smazat, protože je aktivně používáno na ${asset.usageCount} ${asset.usageCount === 1 ? 'místě' : 'místech'}. Pro vyřazení z knihovny použijte archivaci.`,
        references: asset.usageReferences,
      };
    }

    this.assets = this.assets.filter(a => a.id !== id);
    return { success: true };
  }

  async createAsset(assetInput: Omit<MediaAsset, 'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'usageReferences'>): Promise<MediaAsset> {
    const now = new Date().toISOString();
    const newAsset: MediaAsset = {
      ...assetInput,
      id: `media-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
      usageReferences: [],
    };
    this.assets.unshift(newAsset);
    return newAsset;
  }

  async list(filters?: MediaFilterOptions): Promise<MediaAsset[]> {
    return this.filter(filters);
  }

  async createVersion(assetId: string, versionInput: Omit<MediaAssetVersion, 'id' | 'versionNumber' | 'createdAt' | 'updatedAt' | 'assetId'>): Promise<MediaAssetVersion> {
    const existingVersions = this.versions.filter(v => v.assetId === assetId);
    const versionNumber = existingVersions.length + 1;
    const now = new Date().toISOString();
    const newVersion: MediaAssetVersion = {
      ...versionInput,
      id: `ver-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      assetId,
      versionNumber,
      createdAt: now,
      updatedAt: now,
    };
    this.versions.push(newVersion);
    return newVersion;
  }

  async listVersions(assetId: string): Promise<MediaAssetVersion[]> {
    return this.versions.filter(v => v.assetId === assetId);
  }

  async setCurrentVersion(assetId: string, versionId: string): Promise<MediaAsset | undefined> {
    const asset = this.getById(assetId);
    if (!asset) return undefined;
    const version = this.versions.find(v => v.id === versionId && v.assetId === assetId);
    if (!version) return undefined;

    // Update active version status
    this.versions.forEach(v => {
      if (v.assetId === assetId) {
        v.status = v.id === versionId ? 'PUBLISHED' : 'superseded';
      }
    });

    // Update asset properties to match the version
    if (version.storageKey) {
      asset.storageKey = version.storageKey;
    }
    asset.mimeType = version.mimeType;
    asset.sizeBytes = version.sizeBytes;
    asset.updatedAt = new Date().toISOString();
    return asset;
  }

  async changeStatus(id: string, status: MediaStatus): Promise<MediaAsset | undefined> {
    const asset = this.getById(id);
    if (!asset) return undefined;
    asset.status = status;
    asset.updatedAt = new Date().toISOString();
    return asset;
  }

  async addUsageReference(assetId: string, reference: Omit<MediaUsageReference, 'id' | 'usedAt'>): Promise<MediaUsageReference> {
    const asset = this.getById(assetId);
    if (!asset) throw new Error('Asset not found');
    const newRef: MediaUsageReference = {
      ...reference,
      id: `use-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      usedAt: new Date().toISOString(),
    };
    asset.usageReferences.push(newRef);
    asset.usageCount = asset.usageReferences.length;
    return newRef;
  }

  async removeUsageReference(assetId: string, referenceId: string): Promise<void> {
    const asset = this.getById(assetId);
    if (!asset) return;
    asset.usageReferences = asset.usageReferences.filter(r => r.id !== referenceId);
    asset.usageCount = asset.usageReferences.length;
  }

  async listUsageReferences(assetId: string): Promise<MediaUsageReference[]> {
    const asset = this.getById(assetId);
    if (!asset) return [];
    return [...asset.usageReferences];
  }

  async isDeletionAllowed(id: string): Promise<boolean> {
    const asset = this.getById(id);
    if (!asset) return false;
    return asset.usageCount === 0;
  }

  async archiveAsset(id: string): Promise<MediaAsset | undefined> {
    return this.archive(id);
  }

  async deleteAsset(id: string): Promise<void> {
    const allowed = await this.isDeletionAllowed(id);
    if (!allowed) {
      throw new Error(`Deletion blocked: Asset ${id} is actively referenced or does not exist.`);
    }
    this.assets = this.assets.filter(a => a.id !== id);
  }
}

// Singleton repository instance for in-memory Prototype session
export const mediaRepository = new MediaRepository();
