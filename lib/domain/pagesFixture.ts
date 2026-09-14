import {
  PageSummary,
  PageTreeNode,
  PageFilterCriteria,
  PageDetail,
  CreatePageInput,
  UpdatePageInput,
  PagesRepository,
  PageStatus,
} from './pages';

/**
 * Isolated Fixture Adapter for Pages
 * Provides mock data strictly decoupled from UI components.
 * Can be completely substituted by a future API/Repository client without touching UI.
 */

const INITIAL_PAGES_FIXTURE: PageDetail[] = [
  {
    id: 'page-home',
    title: 'Úvodní stránka',
    slug: '',
    path: '/',
    status: 'Publikováno',
    parentId: null,
    author: { id: 'usr-1', name: 'Jan Novák' },
    updatedAt: '2026-09-12T14:32:00Z',
    locale: 'cs-CZ',
    order: 1,
    description: 'Hlavní uvítací stránka portálu Synthesis CMS.',
    visibility: 'Veřejná',
    content: {
      version: 1,
      schemaVersion: 'syn-block-v1',
      blocks: [
        {
          id: 'blk-home-1',
          type: 'heading',
          order: 0,
          data: { level: 1, text: 'Vítejte v Synthesis CMS' },
        },
        {
          id: 'blk-home-2',
          type: 'paragraph',
          order: 1,
          data: {
            text: 'Komplexní platforma pro správu digitálního obsahu, modulární bloky a centralizované publikování.',
          },
        },
        {
          id: 'blk-home-3',
          type: 'callout',
          order: 2,
          data: {
            variant: 'info',
            text: 'Tento obsah je uložen v kanonickém blokovém stromu podle specifikace SYN-DESIGN-010.',
          },
        },
      ],
    },
    templateId: 'tpl-home',
    seo: {
      metaTitle: 'Synthesis CMS | Hlavní portál',
      metaDescription: 'Oficiální portál modulární platformy Synthesis.',
      canonicalUrl: 'https://synthesis.local/',
      noIndex: false,
      ogImage: '/images/og-home.png',
    },
    navigation: {
      showInMainNavigation: true,
      showInFooter: false,
      navigationLabel: 'Domů',
      order: 1,
    },
    revisions: [
      {
        id: 'rev-home-2',
        version: 'v1.1',
        createdAt: '2026-09-12T14:32:00Z',
        author: { id: 'usr-1', name: 'Jan Novák' },
        note: 'Aktualizace hlavního sloganu a hero sekce',
        status: 'Publikováno',
      },
      {
        id: 'rev-home-1',
        version: 'v1.0',
        createdAt: '2026-08-01T10:00:00Z',
        author: { id: 'usr-1', name: 'Jan Novák' },
        note: 'Prvotní vytvoření stránky',
        status: 'Publikováno',
      },
    ],
    activity: [
      {
        id: 'act-home-1',
        timestamp: '2026-09-12T14:32:00Z',
        actor: { id: 'usr-1', name: 'Jan Novák' },
        action: 'Publikování změn',
        details: 'Verze v1.1 byla úspěšně nasazena do produkčního zobrazení.',
      },
      {
        id: 'act-home-2',
        timestamp: '2026-09-12T14:10:00Z',
        actor: { id: 'usr-1', name: 'Jan Novák' },
        action: 'Úprava obsahu',
        details: 'Změna textu v hlavičce.',
      },
    ],
    capabilities: {
      canOpen: true,
      canEdit: true,
      canPreview: true,
      canDuplicate: true,
      canMove: false, // Root home cannot be moved under subpages
      canArchive: false, // Root home cannot be archived
      canPublish: true,
      canSave: true,
      canSubmitReview: false,
    },
  },
  {
    id: 'page-about',
    title: 'O projektu',
    slug: 'o-projektu',
    path: '/o-projektu',
    status: 'Publikováno',
    parentId: null,
    author: { id: 'usr-2', name: 'Eva Dvořáková' },
    updatedAt: '2026-09-10T09:15:00Z',
    locale: 'cs-CZ',
    order: 2,
    description: 'Informace o vizi, technologickém zázemí a poslání platformy Synthesis.',
    visibility: 'Veřejná',
    content: {
      version: 1,
      schemaVersion: 'syn-block-v1',
      blocks: [
        {
          id: 'blk-about-1',
          type: 'heading',
          order: 0,
          data: { level: 2, text: 'O platformě Synthesis' },
        },
        {
          id: 'blk-about-2',
          type: 'paragraph',
          order: 1,
          data: {
            text: 'Synthesis je osobní AI-assisted vývojové studio Jiřího Šára zaměřené na bezpečnost, stabilitu a modulární architekturu.',
          },
        },
      ],
    },
    templateId: 'tpl-standard',
    seo: {
      metaTitle: 'O projektu | Synthesis CMS',
      metaDescription: 'Vše o projektu a technologiích.',
      canonicalUrl: 'https://synthesis.local/o-projektu',
      noIndex: false,
      ogImage: '/images/og-about.png',
    },
    navigation: {
      showInMainNavigation: true,
      showInFooter: true,
      navigationLabel: 'O projektu',
      order: 2,
    },
    revisions: [
      {
        id: 'rev-about-1',
        version: 'v1.0',
        createdAt: '2026-09-10T09:15:00Z',
        author: { id: 'usr-2', name: 'Eva Dvořáková' },
        note: 'Publikace představení projektu',
        status: 'Publikováno',
      },
    ],
    activity: [
      {
        id: 'act-about-1',
        timestamp: '2026-09-10T09:15:00Z',
        actor: { id: 'usr-2', name: 'Eva Dvořáková' },
        action: 'Publikování',
        details: 'Stránka schválena a publikována.',
      },
    ],
    capabilities: {
      canOpen: true,
      canEdit: true,
      canPreview: true,
      canDuplicate: true,
      canMove: true,
      canArchive: true,
      canPublish: true,
      canSave: true,
      canSubmitReview: false,
    },
  },
  {
    id: 'page-about-team',
    title: 'Studio & Vývoj',
    slug: 'studio',
    path: '/o-projektu/studio',
    status: 'Publikováno',
    parentId: 'page-about',
    author: { id: 'usr-2', name: 'Eva Dvořáková' },
    updatedAt: '2026-09-08T16:20:00Z',
    locale: 'cs-CZ',
    order: 1,
    description: 'Představení vývojového konceptu a technologického zázemí.',
    visibility: 'Veřejná',
    content: {
      version: 1,
      schemaVersion: 'syn-block-v1',
      blocks: [
        {
          id: 'blk-team-1',
          type: 'heading',
          order: 0,
          data: { level: 3, text: 'Studio & Vývoj' },
        },
        {
          id: 'blk-team-2',
          type: 'paragraph',
          order: 1,
          data: {
            text: 'Osobní vývojové studio Jiřího Šára s využitím specializovaných AI asistentů pro architekturu, bezpečnost a frontend.',
          },
        },
      ],
    },
    templateId: 'tpl-team',
    seo: {
      metaTitle: 'Studio & Vývoj | Synthesis CMS',
      metaDescription: 'Vývojové zázemí a koncept studia Synthesis.',
      canonicalUrl: 'https://synthesis.local/o-projektu/studio',
      noIndex: false,
      ogImage: '',
    },
    navigation: {
      showInMainNavigation: true,
      showInFooter: false,
      navigationLabel: 'Studio',
      order: 1,
    },
    revisions: [],
    activity: [],
    capabilities: {
      canOpen: true,
      canEdit: true,
      canPreview: true,
      canDuplicate: true,
      canMove: true,
      canArchive: true,
      canPublish: true,
      canSave: true,
      canSubmitReview: false,
    },
  },
  {
    id: 'page-about-history',
    title: 'Historie a vize',
    slug: 'historie',
    path: '/o-projektu/historie',
    status: 'Schváleno',
    parentId: 'page-about',
    author: { id: 'usr-3', name: 'Petr Svoboda' },
    updatedAt: '2026-09-07T11:45:00Z',
    locale: 'cs-CZ',
    order: 2,
    description: 'Vývoj ekosystému od roku 2024 po současnost.',
    visibility: 'Veřejná',
    content: {
      version: 1,
      schemaVersion: 'syn-block-v1',
      blocks: [
        {
          id: 'blk-hist-1',
          type: 'heading',
          order: 0,
          data: { level: 3, text: 'Historie a vize' },
        },
        {
          id: 'blk-hist-2',
          type: 'paragraph',
          order: 1,
          data: {
            text: 'Od raných prototypů po robustní modulární platformu.',
          },
        },
      ],
    },
    templateId: 'tpl-standard',
    seo: {
      metaTitle: 'Historie a vize | Synthesis',
      metaDescription: 'Cesta platformy Synthesis.',
      canonicalUrl: 'https://synthesis.local/o-projektu/historie',
      noIndex: false,
      ogImage: '',
    },
    navigation: {
      showInMainNavigation: false,
      showInFooter: true,
      navigationLabel: 'Historie',
      order: 2,
    },
    revisions: [],
    activity: [],
    capabilities: {
      canOpen: true,
      canEdit: true,
      canPreview: true,
      canDuplicate: true,
      canMove: true,
      canArchive: true,
      canPublish: true,
      canSave: true,
      canSubmitReview: false,
    },
  },
  {
    id: 'page-services',
    title: 'Služby a moduly',
    slug: 'sluzby',
    path: '/sluzby',
    status: 'Publikováno',
    parentId: null,
    author: { id: 'usr-1', name: 'Jan Novák' },
    updatedAt: '2026-09-11T13:00:00Z',
    locale: 'cs-CZ',
    order: 3,
    description: 'Přehled poskytovaných modulů a systémových služeb.',
    visibility: 'Veřejná',
    content: {
      version: 1,
      schemaVersion: 'syn-block-v1',
      blocks: [
        {
          id: 'blk-serv-1',
          type: 'heading',
          order: 0,
          data: { level: 2, text: 'Moduly a služby' },
        },
        {
          id: 'blk-serv-2',
          type: 'paragraph',
          order: 1,
          data: {
            text: 'Plně integrované moduly pro publikaci a správu.',
          },
        },
      ],
    },
    templateId: 'tpl-standard',
    seo: {
      metaTitle: 'Služby a moduly | Synthesis CMS',
      metaDescription: 'Modulární architektura pro váš web.',
      canonicalUrl: 'https://synthesis.local/sluzby',
      noIndex: false,
      ogImage: '',
    },
    navigation: {
      showInMainNavigation: true,
      showInFooter: true,
      navigationLabel: 'Služby',
      order: 3,
    },
    revisions: [],
    activity: [],
    capabilities: {
      canOpen: true,
      canEdit: true,
      canPreview: true,
      canDuplicate: true,
      canMove: true,
      canArchive: true,
      canPublish: true,
      canSave: true,
      canSubmitReview: false,
    },
  },
  {
    id: 'page-services-cloud',
    title: 'Cloudová infrastruktura',
    slug: 'cloud',
    path: '/sluzby/cloud',
    status: 'Publikováno',
    parentId: 'page-services',
    author: { id: 'usr-1', name: 'Jan Novák' },
    updatedAt: '2026-09-13T08:10:00Z',
    locale: 'cs-CZ',
    order: 1,
    description: 'Zajištění vysoké dostupnosti a škálovatelnosti.',
    visibility: 'Veřejná',
    content: {
      version: 1,
      schemaVersion: 'syn-block-v1',
      blocks: [
        {
          id: 'blk-cloud-1',
          type: 'heading',
          order: 0,
          data: { level: 3, text: 'Cloudová infrastruktura' },
        },
        {
          id: 'blk-cloud-2',
          type: 'paragraph',
          order: 1,
          data: {
            text: 'Kontejnerizace a automatické škálování.',
          },
        },
      ],
    },
    templateId: 'tpl-standard',
    seo: {
      metaTitle: 'Cloudová infrastruktura | Synthesis',
      metaDescription: 'Cloudové služby.',
      canonicalUrl: 'https://synthesis.local/sluzby/cloud',
      noIndex: false,
      ogImage: '',
    },
    navigation: {
      showInMainNavigation: true,
      showInFooter: false,
      navigationLabel: 'Cloud',
      order: 1,
    },
    revisions: [],
    activity: [],
    capabilities: {
      canOpen: true,
      canEdit: true,
      canPreview: true,
      canDuplicate: true,
      canMove: true,
      canArchive: true,
      canPublish: true,
      canSave: true,
      canSubmitReview: false,
    },
  },
  {
    id: 'page-services-security',
    title: 'Bezpečnostní audit',
    slug: 'bezpecnost',
    path: '/sluzby/bezpecnost',
    status: 'Ke kontrole',
    parentId: 'page-services',
    author: { id: 'usr-3', name: 'Petr Svoboda' },
    updatedAt: '2026-09-13T10:25:00Z',
    locale: 'cs-CZ',
    order: 2,
    description: 'Standardy Zero Trust a RBAC ověření.',
    visibility: 'Interní (pouze CMS)',
    content: {
      version: 1,
      schemaVersion: 'syn-block-v1',
      blocks: [
        {
          id: 'blk-sec-1',
          type: 'heading',
          order: 0,
          data: { level: 3, text: 'Bezpečnostní audit a kontrola' },
        },
        {
          id: 'blk-sec-2',
          type: 'paragraph',
          order: 1,
          data: {
            text: 'Probíhá revize nových politik autorizace a zero-trust perimetru.',
          },
        },
      ],
    },
    templateId: 'tpl-standard',
    seo: {
      metaTitle: 'Bezpečnostní audit | Synthesis',
      metaDescription: 'Bezpečnost na prvním místě.',
      canonicalUrl: 'https://synthesis.local/sluzby/bezpecnost',
      noIndex: true,
      ogImage: '',
    },
    navigation: {
      showInMainNavigation: false,
      showInFooter: false,
      navigationLabel: 'Bezpečnost',
      order: 2,
    },
    revisions: [],
    activity: [],
    capabilities: {
      canOpen: true,
      canEdit: true,
      canPreview: true,
      canDuplicate: true,
      canMove: true,
      canArchive: true,
      canPublish: false,
      canSave: true,
      canSubmitReview: true,
    },
  },
  {
    id: 'page-articles',
    title: 'Články a novinky',
    slug: 'clanky',
    path: '/clanky',
    status: 'Publikováno',
    parentId: null,
    author: { id: 'usr-2', name: 'Eva Dvořáková' },
    updatedAt: '2026-09-09T18:40:00Z',
    locale: 'cs-CZ',
    order: 4,
    description: 'Aktuality ze světa platformy Synthesis.',
    visibility: 'Veřejná',
    content: {
      version: 1,
      schemaVersion: 'syn-block-v1',
      blocks: [
        {
          id: 'blk-art-1',
          type: 'heading',
          order: 0,
          data: { level: 2, text: 'Články a novinky' },
        },
        {
          id: 'blk-art-2',
          type: 'paragraph',
          order: 1,
          data: {
            text: 'Přehled nejnovějších zpráv a aktualit z ekosystému Synthesis.',
          },
        },
      ],
    },
    templateId: 'tpl-blog',
    seo: {
      metaTitle: 'Články a novinky | Synthesis',
      metaDescription: 'Aktuality a blogové příspěvky.',
      canonicalUrl: 'https://synthesis.local/clanky',
      noIndex: false,
      ogImage: '',
    },
    navigation: {
      showInMainNavigation: true,
      showInFooter: true,
      navigationLabel: 'Články',
      order: 4,
    },
    revisions: [],
    activity: [],
    capabilities: {
      canOpen: true,
      canEdit: true,
      canPreview: true,
      canDuplicate: true,
      canMove: true,
      canArchive: true,
      canPublish: true,
      canSave: true,
      canSubmitReview: false,
    },
  },
  {
    id: 'page-articles-autumn',
    title: 'Podzimní kampaň 2026',
    slug: 'podzim-2026',
    path: '/clanky/podzim-2026',
    status: 'Naplánováno',
    parentId: 'page-articles',
    author: { id: 'usr-2', name: 'Eva Dvořáková' },
    updatedAt: '2026-09-13T11:05:00Z',
    locale: 'cs-CZ',
    order: 1,
    description: 'Příprava marketingových podkladů na 4. kvartál 2026.',
    visibility: 'Neveřejná (přes odkaz)',
    content: {
      version: 1,
      schemaVersion: 'syn-block-v1',
      blocks: [
        {
          id: 'blk-aut-1',
          type: 'heading',
          order: 0,
          data: { level: 3, text: 'Podzimní kampaň 2026' },
        },
        {
          id: 'blk-aut-2',
          type: 'paragraph',
          order: 1,
          data: {
            text: 'Naplánováno ke spuštění 1. října 2026.',
          },
        },
      ],
    },
    templateId: 'tpl-standard',
    seo: {
      metaTitle: 'Podzimní kampaň 2026 | Synthesis',
      metaDescription: 'Nové funkce podzimního releasu.',
      canonicalUrl: 'https://synthesis.local/clanky/podzim-2026',
      noIndex: false,
      ogImage: '',
    },
    navigation: {
      showInMainNavigation: false,
      showInFooter: false,
      navigationLabel: 'Kampaň 2026',
      order: 1,
    },
    revisions: [],
    activity: [],
    capabilities: {
      canOpen: true,
      canEdit: true,
      canPreview: true,
      canDuplicate: true,
      canMove: true,
      canArchive: true,
      canPublish: true,
      canSave: true,
      canSubmitReview: false,
    },
  },
  {
    id: 'page-contact',
    title: 'Kontakt',
    slug: 'kontakt',
    path: '/kontakt',
    status: 'Publikováno',
    parentId: null,
    author: { id: 'usr-2', name: 'Eva Dvořáková' },
    updatedAt: '2026-09-01T12:00:00Z',
    locale: 'cs-CZ',
    order: 5,
    description: 'Kontaktní údaje, sídlo a formulář pro dotazy.',
    visibility: 'Veřejná',
    content: {
      version: 1,
      schemaVersion: 'syn-block-v1',
      blocks: [
        {
          id: 'blk-cnt-1',
          type: 'heading',
          order: 0,
          data: { level: 2, text: 'Kontaktujte nás' },
        },
        {
          id: 'blk-cnt-2',
          type: 'paragraph',
          order: 1,
          data: {
            text: 'Jsme vám k dispozici na adrese info@synthesis.local.',
          },
        },
      ],
    },
    templateId: 'tpl-contact',
    seo: {
      metaTitle: 'Kontakt | Synthesis CMS',
      metaDescription: 'Kontaktní formulář a adresa.',
      canonicalUrl: 'https://synthesis.local/kontakt',
      noIndex: false,
      ogImage: '',
    },
    navigation: {
      showInMainNavigation: true,
      showInFooter: true,
      navigationLabel: 'Kontakt',
      order: 5,
    },
    revisions: [],
    activity: [],
    capabilities: {
      canOpen: true,
      canEdit: true,
      canPreview: true,
      canDuplicate: true,
      canMove: true,
      canArchive: true,
      canPublish: true,
      canSave: true,
      canSubmitReview: false,
    },
  },
  {
    id: 'page-archive-2025',
    title: 'Výroční zpráva 2025',
    slug: 'vyrocni-zprava-2025',
    path: '/o-projektu/vyrocni-zprava-2025',
    status: 'Archivováno',
    parentId: 'page-about',
    author: { id: 'usr-1', name: 'Jan Novák' },
    updatedAt: '2026-01-15T10:00:00Z',
    locale: 'cs-CZ',
    order: 3,
    description: 'Archivní dokument za předchozí účetní období.',
    visibility: 'Interní (pouze CMS)',
    content: {
      version: 1,
      schemaVersion: 'syn-block-v1',
      blocks: [
        {
          id: 'blk-arch-1',
          type: 'heading',
          order: 0,
          data: { level: 3, text: 'Výroční zpráva 2025' },
        },
        {
          id: 'blk-arch-2',
          type: 'paragraph',
          order: 1,
          data: {
            text: 'Tento dokument je archivován pro interní referenci.',
          },
        },
      ],
    },
    templateId: 'tpl-standard',
    seo: {
      metaTitle: 'Výroční zpráva 2025 | Archiv',
      metaDescription: 'Archivní zpráva.',
      canonicalUrl: 'https://synthesis.local/o-projektu/vyrocni-zprava-2025',
      noIndex: true,
      ogImage: '',
    },
    navigation: {
      showInMainNavigation: false,
      showInFooter: false,
      navigationLabel: 'Zpráva 2025',
      order: 3,
    },
    revisions: [],
    activity: [],
    capabilities: {
      canOpen: true,
      canEdit: true,
      canPreview: true,
      canDuplicate: true,
      canMove: true,
      canArchive: false, // already archived
      canPublish: false,
      canSave: true,
      canSubmitReview: false,
    },
  },
];

class FixturePagesRepository implements PagesRepository {
  private pages: PageDetail[] = [...INITIAL_PAGES_FIXTURE];

  async getPages(criteria?: Partial<PageFilterCriteria>): Promise<PageSummary[]> {
    await new Promise((resolve) => setTimeout(resolve, 30));

    let result = [...this.pages];

    if (criteria?.searchQuery) {
      const q = criteria.searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          p.path.toLowerCase().includes(q)
      );
    }

    if (criteria?.status && criteria.status !== 'Všechny') {
      result = result.filter((p) => p.status === criteria.status);
    }

    if (criteria?.sortBy === 'title') {
      result.sort((a, b) =>
        criteria.sortDirection === 'desc'
          ? b.title.localeCompare(a.title)
          : a.title.localeCompare(b.title)
      );
    } else if (criteria?.sortBy === 'updatedAt') {
      result.sort((a, b) =>
        criteria.sortDirection === 'desc'
          ? new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          : new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
      );
    } else {
      result.sort((a, b) => a.order - b.order);
    }

    // Return summaries
    return result.map(({ description, visibility, content, seo, navigation, revisions, activity, templateId, ...summary }) => summary);
  }

  async getPageTree(): Promise<PageTreeNode[]> {
    await new Promise((resolve) => setTimeout(resolve, 30));

    const map = new Map<string, PageTreeNode>();
    const roots: PageTreeNode[] = [];

    // Create node wrappers
    this.pages.forEach((p) => {
      const { description, visibility, content, seo, navigation, revisions, activity, templateId, ...summary } = p;
      map.set(p.id, {
        ...summary,
        children: [],
        level: 0,
        isExpanded: true,
      });
    });

    // Link parents & children
    this.pages.forEach((p) => {
      const node = map.get(p.id)!;
      if (p.parentId && map.has(p.parentId)) {
        const parent = map.get(p.parentId)!;
        node.level = parent.level + 1;
        parent.children.push(node);
      } else {
        node.level = 0;
        roots.push(node);
      }
    });

    return roots;
  }

  async getPageById(id: string): Promise<PageDetail | null> {
    await new Promise((resolve) => setTimeout(resolve, 30));
    const page = this.pages.find((p) => p.id === id);
    if (!page) return null;
    return JSON.parse(JSON.stringify(page));
  }

  async createPage(input: CreatePageInput): Promise<PageDetail> {
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Construct path based on parent
    let parentPath = '';
    if (input.parentId) {
      const parent = this.pages.find((p) => p.id === input.parentId);
      if (parent) {
        parentPath = parent.path === '/' ? '' : parent.path;
      }
    }
    const cleanSlug = input.slug.replace(/^\/+|\/+$/g, '');
    const path = `${parentPath}/${cleanSlug}`;

    const newPage: PageDetail = {
      id: `page-${Date.now()}`,
      title: input.title.trim(),
      slug: cleanSlug,
      path: path || '/',
      status: input.status || 'Koncept',
      parentId: input.parentId || null,
      author: { id: 'usr-current', name: 'Administrátor' },
      updatedAt: new Date().toISOString(),
      locale: 'cs-CZ',
      order: this.pages.length + 1,
      description: input.description || '',
      visibility: input.visibility || 'Veřejná',
      content: input.content || {
        version: 1,
        schemaVersion: 'syn-block-v1',
        blocks: [
          {
            id: `blk-${Date.now()}-1`,
            type: 'heading',
            order: 0,
            data: { level: 1, text: input.title.trim() },
          },
          {
            id: `blk-${Date.now()}-2`,
            type: 'paragraph',
            order: 1,
            data: {
              text: input.description || 'Nová stránka připravená k sestavení blokového obsahu.',
            },
          },
        ],
      },
      templateId: 'tpl-standard',
      seo: {
        metaTitle: `${input.title.trim()} | Synthesis CMS`,
        metaDescription: input.description || '',
        canonicalUrl: `https://synthesis.local${path}`,
        noIndex: false,
        ogImage: '',
      },
      navigation: {
        showInMainNavigation: false,
        showInFooter: false,
        navigationLabel: input.title.trim(),
        order: 10,
      },
      revisions: [
        {
          id: `rev-${Date.now()}-1`,
          version: 'v0.1',
          createdAt: new Date().toISOString(),
          author: { id: 'usr-current', name: 'Administrátor' },
          note: 'Vytvoření nového konceptu stránky',
          status: input.status || 'Koncept',
        },
      ],
      activity: [
        {
          id: `act-${Date.now()}-1`,
          timestamp: new Date().toISOString(),
          actor: { id: 'usr-current', name: 'Administrátor' },
          action: 'Vytvoření stránky',
          details: `Stránka byla vytvořena se stavem ${input.status || 'Koncept'}.`,
        },
      ],
      capabilities: {
        canOpen: true,
        canEdit: true,
        canPreview: true,
        canDuplicate: true,
        canMove: true,
        canArchive: true,
        canPublish: true,
        canSave: true,
        canSubmitReview: true,
      },
    };

    this.pages.unshift(newPage);
    return newPage;
  }

  async updatePage(id: string, input: UpdatePageInput): Promise<PageDetail> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const index = this.pages.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error('Stránka nenalezena');
    }

    const current = this.pages[index];

    // Recompute path if slug or parentId changed
    let path = current.path;
    const parentId = input.parentId !== undefined ? input.parentId : current.parentId;
    const slug = input.slug !== undefined ? input.slug.replace(/^\/+|\/+$/g, '') : current.slug;

    if (input.slug !== undefined || input.parentId !== undefined) {
      let parentPath = '';
      if (parentId) {
        const parent = this.pages.find((p) => p.id === parentId);
        if (parent) {
          parentPath = parent.path === '/' ? '' : parent.path;
        }
      }
      path = `${parentPath}/${slug}`;
      if (path === '') path = '/';
    }

    const updated: PageDetail = {
      ...current,
      title: input.title !== undefined ? input.title.trim() : current.title,
      slug,
      path,
      parentId,
      description: input.description !== undefined ? input.description : current.description,
      status: input.status !== undefined ? input.status : current.status,
      visibility: input.visibility !== undefined ? input.visibility : current.visibility,
      content: input.content !== undefined ? input.content : current.content,
      seo: input.seo ? { ...current.seo, ...input.seo } : current.seo,
      navigation: input.navigation ? { ...current.navigation, ...input.navigation } : current.navigation,
      updatedAt: new Date().toISOString(),
    };

    // Append activity log
    updated.activity = [
      {
        id: `act-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: { id: 'usr-current', name: 'Administrátor' },
        action: input.status && input.status !== current.status ? `Změna stavu na ${input.status}` : 'Uložení změn',
        details: 'Aktualizace metadat a nastavení stránky.',
      },
      ...current.activity,
    ];

    this.pages[index] = updated;
    return JSON.parse(JSON.stringify(updated));
  }

  async archivePage(id: string): Promise<boolean> {
    const page = this.pages.find((p) => p.id === id);
    if (!page || !page.capabilities.canArchive) return false;
    page.status = 'Archivováno';
    page.capabilities.canArchive = false;
    page.updatedAt = new Date().toISOString();
    return true;
  }

  async duplicatePage(id: string): Promise<PageSummary> {
    const page = this.pages.find((p) => p.id === id);
    if (!page) throw new Error('Stránka nenalezena');
    const newPage: PageDetail = {
      ...page,
      id: `page-${Date.now()}`,
      title: `${page.title} (kopie)`,
      slug: `${page.slug}-kopie`,
      path: `${page.path}-kopie`,
      status: 'Koncept',
      updatedAt: new Date().toISOString(),
      capabilities: {
        ...page.capabilities,
        canArchive: true,
        canMove: true,
        canPublish: true,
        canSave: true,
        canSubmitReview: true,
      },
    };
    this.pages.push(newPage);
    return newPage;
  }
}

// Export singleton instance
export const pagesRepository: PagesRepository = new FixturePagesRepository();
