/**
 * Synthesis CMS - Page Domain Model
 * Defines strongly-typed interfaces for CMS Pages, tree nodes, statuses, capabilities, and detail views.
 */

export type PageStatus =
  | 'Koncept'
  | 'Ke kontrole'
  | 'Schváleno'
  | 'Naplánováno'
  | 'Publikováno'
  | 'Archivováno';

export type PageVisibility = 'Veřejná' | 'Neveřejná (přes odkaz)' | 'Chráněná heslem' | 'Interní (pouze CMS)';

export type PageActionType =
  | 'open'
  | 'edit'
  | 'preview'
  | 'duplicate'
  | 'move'
  | 'archive'
  | 'save'
  | 'publish'
  | 'submit_review';

export interface PageAuthor {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface PageCapabilities {
  canOpen: boolean;
  canEdit: boolean;
  canPreview: boolean;
  canDuplicate: boolean;
  canMove: boolean;
  canArchive: boolean;
  canPublish?: boolean;
  canSave?: boolean;
  canSubmitReview?: boolean;
}

export interface PageSummary {
  id: string;
  title: string;
  slug: string;
  path: string;
  status: PageStatus;
  parentId: string | null;
  author: PageAuthor;
  updatedAt: string; // ISO 8601 string
  locale: string;
  order: number;
  capabilities: PageCapabilities;
}

export interface PageTreeNode extends PageSummary {
  children: PageTreeNode[];
  level: number;
  isExpanded?: boolean;
}

export interface PageFilterCriteria {
  searchQuery: string;
  status: PageStatus | 'Všechny';
  sortBy: 'updatedAt' | 'title' | 'order';
  sortDirection: 'asc' | 'desc';
}

export interface PageSEO {
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  noIndex: boolean;
  ogImage: string;
}

export interface PageNavigationSettings {
  showInMainNavigation: boolean;
  showInFooter: boolean;
  navigationLabel: string;
  order: number;
}

export interface PageRevision {
  id: string;
  version: string;
  createdAt: string;
  author: PageAuthor;
  note: string;
  status: PageStatus;
}

/**
 * Canonical Content Block Model (SYN-DESIGN-010)
 * Editor-independent, structured block tree.
 * Canonical content storage is strictly block-based; Markdown is never canonical storage.
 */
export type ContentBlockType =
  | 'heading'
  | 'paragraph'
  | 'rich_text'
  | 'image'
  | 'columns'
  | 'callout'
  | 'quote'
  | 'button'
  | 'divider'
  | 'module_embed';

/**
 * Validated payload for module_embed blocks.
 * Arbitrary HTML/JS or unvalidated scripts are strictly forbidden.
 */
export interface ModuleEmbedPayload {
  moduleId: string; // Registered identifier in Synthesis Module Registry
  schemaVersion: string; // Registered module schema version
  parameters: Record<string, string | number | boolean | null>;
  fallbackText?: string; // Safe textual fallback if module is unknown/unrendered
}

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  order: number;
  data: Record<string, unknown>;
  children?: ContentBlock[];
}

export interface PageContent {
  version: number;
  schemaVersion: string;
  blocks: ContentBlock[];
}

export interface PageActivityLog {
  id: string;
  timestamp: string;
  actor: PageAuthor;
  action: string;
  details?: string;
}

export interface PageDetail extends PageSummary {
  description: string;
  visibility: PageVisibility;
  content: PageContent;
  seo: PageSEO;
  navigation: PageNavigationSettings;
  revisions: PageRevision[];
  activity: PageActivityLog[];
  templateId: string;
}

export interface CreatePageInput {
  title: string;
  slug: string;
  parentId: string | null;
  description?: string;
  status: PageStatus;
  visibility: PageVisibility;
  content?: PageContent;
}

export interface UpdatePageInput {
  title?: string;
  slug?: string;
  parentId?: string | null;
  description?: string;
  status?: PageStatus;
  visibility?: PageVisibility;
  content?: PageContent;
  seo?: Partial<PageSEO>;
  navigation?: Partial<PageNavigationSettings>;
}

export interface PagesRepository {
  getPages(criteria?: Partial<PageFilterCriteria>): Promise<PageSummary[]>;
  getPageTree(): Promise<PageTreeNode[]>;
  getPageById(id: string): Promise<PageDetail | null>;
  createPage(input: CreatePageInput): Promise<PageDetail>;
  updatePage(id: string, input: UpdatePageInput): Promise<PageDetail>;
  archivePage(id: string): Promise<boolean>;
  duplicatePage(id: string): Promise<PageSummary>;
}

// Canonical repository provider abstraction for UI consumers
export { pagesRepository } from './pagesFixture';

