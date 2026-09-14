/**
 * SYNTHESIS CMS — NAVIGATION DOMAIN MODEL
 * Strongly-typed interfaces for Navigation Sets, Navigation Items,
 * tree hierarchies, link validation, and permission capabilities.
 */

export type NavigationContext = 'HEADER' | 'FOOTER' | 'MOBILE' | 'PORTAL' | 'CUSTOM';

export type NavigationItemType = 'PAGE' | 'EXTERNAL_LINK' | 'ANCHOR' | 'GROUP';

export type NavigationSetStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type NavigationPermission =
  | 'navigation.view'
  | 'navigation.create'
  | 'navigation.edit'
  | 'navigation.reorder'
  | 'navigation.delete';

export interface NavigationItem {
  id: string;
  parentId: string | null;
  type: NavigationItemType;
  label: string;
  pageId?: string | null;
  externalUrl?: string | null;
  anchor?: string | null;
  icon?: string | null;
  visibility: boolean;
  openInNewTab: boolean;
  order: number;
  // Computed / UI tree presentation
  depth?: number;
  children?: NavigationItem[];
}

export interface NavigationSet {
  id: string;
  projectId: string;
  key: string;
  name: string;
  context: NavigationContext;
  items: NavigationItem[];
  status: NavigationSetStatus;
  version: number;
  updatedAt: string; // ISO 8601
  description?: string;
}

export interface CreateNavigationSetInput {
  projectId?: string;
  key: string;
  name: string;
  context: NavigationContext;
  description?: string;
}

export interface CreateNavigationItemInput {
  parentId?: string | null;
  type: NavigationItemType;
  label: string;
  pageId?: string | null;
  externalUrl?: string | null;
  anchor?: string | null;
  icon?: string | null;
  visibility?: boolean;
  openInNewTab?: boolean;
}

export interface UpdateNavigationItemInput {
  parentId?: string | null;
  type?: NavigationItemType;
  label?: string;
  pageId?: string | null;
  externalUrl?: string | null;
  anchor?: string | null;
  icon?: string | null;
  visibility?: boolean;
  openInNewTab?: boolean;
  order?: number;
}

export interface BrokenPageReference {
  itemId: string;
  itemLabel: string;
  pageId: string;
  navSetKey: string;
  navSetName: string;
}

export interface NavigationValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
