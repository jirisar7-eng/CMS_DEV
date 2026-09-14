/**
 * SYNTHESIS CMS — NAVIGATION IN-MEMORY REPOSITORY
 * Provides isolated mock state and complete CRUD / tree operations
 * for Navigation Sets and Items.
 */

import {
  NavigationSet,
  NavigationItem,
  CreateNavigationSetInput,
  CreateNavigationItemInput,
  UpdateNavigationItemInput,
  BrokenPageReference,
} from './types';
import {
  isSafeUrl,
  sanitizeLabel,
  flattenAndCalculateDepths,
  MAX_NAVIGATION_DEPTH,
} from './validation';

const INITIAL_SETS: NavigationSet[] = [
  {
    id: 'navset-header',
    projectId: 'synthesis-main',
    key: 'header',
    name: 'Hlavní menu (Záhlaví)',
    context: 'HEADER',
    status: 'PUBLISHED',
    version: 3,
    updatedAt: '2026-09-14T08:30:00Z',
    description: 'Primární navigační lišta v záhlaví všech veřejných stránek.',
    items: [
      {
        id: 'nav-item-1',
        parentId: null,
        type: 'PAGE',
        label: 'Domů',
        pageId: 'page-home',
        visibility: true,
        openInNewTab: false,
        order: 1,
      },
      {
        id: 'nav-item-2',
        parentId: null,
        type: 'PAGE',
        label: 'O projektu',
        pageId: 'page-about',
        visibility: true,
        openInNewTab: false,
        order: 2,
      },
      {
        id: 'nav-item-3',
        parentId: 'nav-item-2',
        type: 'PAGE',
        label: 'Studio & Vývoj',
        pageId: 'page-about-team',
        visibility: true,
        openInNewTab: false,
        order: 1,
      },
      {
        id: 'nav-item-4',
        parentId: 'nav-item-2',
        type: 'PAGE',
        label: 'Historie a vize',
        pageId: 'page-about-history',
        visibility: true,
        openInNewTab: false,
        order: 2,
      },
      {
        id: 'nav-item-5',
        parentId: 'nav-item-2',
        type: 'PAGE',
        label: 'Výroční zpráva (starý odkaz)',
        pageId: 'page-deleted-old', // Deliberate broken reference for demonstration!
        visibility: true,
        openInNewTab: false,
        order: 3,
      },
      {
        id: 'nav-item-6',
        parentId: null,
        type: 'PAGE',
        label: 'Služby',
        pageId: 'page-services',
        visibility: true,
        openInNewTab: false,
        order: 3,
      },
      {
        id: 'nav-item-7',
        parentId: 'nav-item-6',
        type: 'PAGE',
        label: 'Cloudová řešení',
        pageId: 'page-services-cloud',
        visibility: true,
        openInNewTab: false,
        order: 1,
      },
      {
        id: 'nav-item-8',
        parentId: 'nav-item-6',
        type: 'PAGE',
        label: 'Bezpečnostní audit',
        pageId: 'page-services-security',
        visibility: true,
        openInNewTab: false,
        order: 2,
      },
      {
        id: 'nav-item-9',
        parentId: null,
        type: 'PAGE',
        label: 'Články',
        pageId: 'page-articles',
        visibility: true,
        openInNewTab: false,
        order: 4,
      },
      {
        id: 'nav-item-10',
        parentId: null,
        type: 'EXTERNAL_LINK',
        label: 'GitHub repozitář',
        externalUrl: 'https://github.com/jirisar7-eng/CMS_DEV',
        visibility: true,
        openInNewTab: true,
        order: 5,
      },
      {
        id: 'nav-item-11',
        parentId: null,
        type: 'ANCHOR',
        label: 'Kontakt',
        anchor: '#kontakt',
        visibility: true,
        openInNewTab: false,
        order: 6,
      },
    ],
  },
  {
    id: 'navset-footer',
    projectId: 'synthesis-main',
    key: 'footer',
    name: 'Patička webu (Footer)',
    context: 'FOOTER',
    status: 'PUBLISHED',
    version: 2,
    updatedAt: '2026-09-13T19:15:00Z',
    description: 'Strukturované sloupce odkazů ve spodní části webu.',
    items: [
      {
        id: 'nav-foot-g1',
        parentId: null,
        type: 'GROUP',
        label: 'Rychlé odkazy',
        visibility: true,
        openInNewTab: false,
        order: 1,
      },
      {
        id: 'nav-foot-1',
        parentId: 'nav-foot-g1',
        type: 'PAGE',
        label: 'Úvodní stránka',
        pageId: 'page-home',
        visibility: true,
        openInNewTab: false,
        order: 1,
      },
      {
        id: 'nav-foot-2',
        parentId: 'nav-foot-g1',
        type: 'PAGE',
        label: 'O projektu',
        pageId: 'page-about',
        visibility: true,
        openInNewTab: false,
        order: 2,
      },
      {
        id: 'nav-foot-3',
        parentId: 'nav-foot-g1',
        type: 'PAGE',
        label: 'Služby a řešení',
        pageId: 'page-services',
        visibility: true,
        openInNewTab: false,
        order: 3,
      },
      {
        id: 'nav-foot-g2',
        parentId: null,
        type: 'GROUP',
        label: 'Zdroje & Vývoj',
        visibility: true,
        openInNewTab: false,
        order: 2,
      },
      {
        id: 'nav-foot-4',
        parentId: 'nav-foot-g2',
        type: 'PAGE',
        label: 'Články a novinky',
        pageId: 'page-articles',
        visibility: true,
        openInNewTab: false,
        order: 1,
      },
      {
        id: 'nav-foot-5',
        parentId: 'nav-foot-g2',
        type: 'EXTERNAL_LINK',
        label: 'Zdrojový kód (GitHub)',
        externalUrl: 'https://github.com/jirisar7-eng/CMS_DEV',
        visibility: true,
        openInNewTab: true,
        order: 2,
      },
      {
        id: 'nav-foot-g3',
        parentId: null,
        type: 'GROUP',
        label: 'Právní informace',
        visibility: true,
        openInNewTab: false,
        order: 3,
      },
      {
        id: 'nav-foot-6',
        parentId: 'nav-foot-g3',
        type: 'ANCHOR',
        label: 'Zásady ochrany soukromí',
        anchor: '#soukromi',
        visibility: true,
        openInNewTab: false,
        order: 1,
      },
    ],
  },
  {
    id: 'navset-mobile',
    projectId: 'synthesis-main',
    key: 'mobile',
    name: 'Mobilní navigace (Drawer)',
    context: 'MOBILE',
    status: 'PUBLISHED',
    version: 1,
    updatedAt: '2026-09-12T10:00:00Z',
    description: 'Kompaktní menu optimalizované pro dotyková zařízení a mobilní zobrazení.',
    items: [
      {
        id: 'nav-mob-1',
        parentId: null,
        type: 'PAGE',
        label: 'Domů',
        pageId: 'page-home',
        visibility: true,
        openInNewTab: false,
        order: 1,
      },
      {
        id: 'nav-mob-2',
        parentId: null,
        type: 'PAGE',
        label: 'O projektu',
        pageId: 'page-about',
        visibility: true,
        openInNewTab: false,
        order: 2,
      },
      {
        id: 'nav-mob-3',
        parentId: 'nav-mob-2',
        type: 'PAGE',
        label: 'Studio & Vývoj',
        pageId: 'page-about-team',
        visibility: true,
        openInNewTab: false,
        order: 1,
      },
      {
        id: 'nav-mob-4',
        parentId: null,
        type: 'PAGE',
        label: 'Služby',
        pageId: 'page-services',
        visibility: true,
        openInNewTab: false,
        order: 3,
      },
      {
        id: 'nav-mob-5',
        parentId: null,
        type: 'ANCHOR',
        label: 'Kontaktovat studio',
        anchor: '#kontakt',
        visibility: true,
        openInNewTab: false,
        order: 4,
      },
    ],
  },
  {
    id: 'navset-portal',
    projectId: 'synthesis-main',
    key: 'portal',
    name: 'Partnerský portál (Portal)',
    context: 'PORTAL',
    status: 'DRAFT',
    version: 1,
    updatedAt: '2026-09-10T14:20:00Z',
    description: 'Navigace pro interní klientskou a vývojářskou sekci.',
    items: [
      {
        id: 'nav-port-1',
        parentId: null,
        type: 'EXTERNAL_LINK',
        label: 'Přehled portálu',
        externalUrl: 'https://portal.synthesis.local',
        visibility: true,
        openInNewTab: false,
        order: 1,
      },
      {
        id: 'nav-port-2',
        parentId: null,
        type: 'EXTERNAL_LINK',
        label: 'API dokumentace',
        externalUrl: 'https://docs.synthesis.local',
        visibility: true,
        openInNewTab: true,
        order: 2,
      },
    ],
  },
];

export class InMemoryNavigationRepository {
  private sets: NavigationSet[] = JSON.parse(JSON.stringify(INITIAL_SETS));

  async getNavigationSets(projectId = 'synthesis-main'): Promise<NavigationSet[]> {
    return JSON.parse(JSON.stringify(this.sets.filter((s) => s.projectId === projectId)));
  }

  async getNavigationSetById(id: string): Promise<NavigationSet | null> {
    const found = this.sets.find((s) => s.id === id);
    if (!found) return null;
    return JSON.parse(JSON.stringify(found));
  }

  async getNavigationSetByKey(key: string, projectId = 'synthesis-main'): Promise<NavigationSet | null> {
    const found = this.sets.find((s) => s.key === key && s.projectId === projectId);
    if (!found) return null;
    return JSON.parse(JSON.stringify(found));
  }

  async createNavigationSet(input: CreateNavigationSetInput): Promise<NavigationSet> {
    const existing = this.sets.find((s) => s.key === input.key);
    if (existing) {
      throw new Error(`Navigační sada s klíčem „${input.key}“ již existuje.`);
    }

    const newSet: NavigationSet = {
      id: `navset-${Date.now()}`,
      projectId: input.projectId || 'synthesis-main',
      key: input.key.trim().toLowerCase(),
      name: sanitizeLabel(input.name),
      context: input.context,
      description: input.description?.trim() || '',
      items: [],
      status: 'DRAFT',
      version: 1,
      updatedAt: new Date().toISOString(),
    };

    this.sets.push(newSet);
    return JSON.parse(JSON.stringify(newSet));
  }

  async updateNavigationSet(id: string, input: Partial<NavigationSet>): Promise<NavigationSet> {
    const index = this.sets.findIndex((s) => s.id === id);
    if (index === -1) throw new Error('Navigační sada nebyla nalezena.');

    const current = this.sets[index];
    const updated: NavigationSet = {
      ...current,
      name: input.name ? sanitizeLabel(input.name) : current.name,
      description: input.description !== undefined ? input.description : current.description,
      context: input.context || current.context,
      status: input.status || current.status,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };

    this.sets[index] = updated;
    return JSON.parse(JSON.stringify(updated));
  }

  async deleteNavigationSet(id: string): Promise<boolean> {
    const index = this.sets.findIndex((s) => s.id === id);
    if (index === -1) return false;
    this.sets.splice(index, 1);
    return true;
  }

  async addItem(setId: string, itemInput: CreateNavigationItemInput): Promise<NavigationSet> {
    const targetSet = this.sets.find((s) => s.id === setId);
    if (!targetSet) throw new Error('Navigační sada nebyla nalezena.');

    const cleanLabel = sanitizeLabel(itemInput.label);
    if (!cleanLabel) throw new Error('Název položky nesmí být prázdný.');

    if (itemInput.type === 'EXTERNAL_LINK') {
      const urlCheck = isSafeUrl(itemInput.externalUrl);
      if (!urlCheck.safe) throw new Error(urlCheck.reason);
    }

    const siblings = targetSet.items.filter((i) => i.parentId === (itemInput.parentId || null));
    const nextOrder = siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) + 1 : 1;

    const newItem: NavigationItem = {
      id: `nav-item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      parentId: itemInput.parentId || null,
      type: itemInput.type,
      label: cleanLabel,
      pageId: itemInput.type === 'PAGE' ? itemInput.pageId || null : null,
      externalUrl: itemInput.type === 'EXTERNAL_LINK' ? itemInput.externalUrl || null : null,
      anchor: itemInput.type === 'ANCHOR' ? itemInput.anchor || null : null,
      icon: itemInput.icon || null,
      visibility: itemInput.visibility !== undefined ? itemInput.visibility : true,
      openInNewTab: itemInput.openInNewTab || false,
      order: nextOrder,
    };

    targetSet.items.push(newItem);
    targetSet.version += 1;
    targetSet.updatedAt = new Date().toISOString();

    return JSON.parse(JSON.stringify(targetSet));
  }

  async updateItem(setId: string, itemId: string, input: UpdateNavigationItemInput): Promise<NavigationSet> {
    const targetSet = this.sets.find((s) => s.id === setId);
    if (!targetSet) throw new Error('Navigační sada nebyla nalezena.');

    const itemIndex = targetSet.items.findIndex((i) => i.id === itemId);
    if (itemIndex === -1) throw new Error('Položka navigace nebyla nalezena.');

    const current = targetSet.items[itemIndex];

    if (input.label !== undefined) {
      const clean = sanitizeLabel(input.label);
      if (!clean) throw new Error('Název položky nesmí být prázdný.');
      current.label = clean;
    }

    if (input.type !== undefined) {
      current.type = input.type;
    }

    if (input.externalUrl !== undefined) {
      if (current.type === 'EXTERNAL_LINK' && input.externalUrl) {
        const urlCheck = isSafeUrl(input.externalUrl);
        if (!urlCheck.safe) throw new Error(urlCheck.reason);
      }
      current.externalUrl = input.externalUrl;
    }

    if (input.pageId !== undefined) {
      current.pageId = input.pageId;
    }

    if (input.anchor !== undefined) {
      current.anchor = input.anchor;
    }

    if (input.icon !== undefined) {
      current.icon = input.icon;
    }

    if (input.visibility !== undefined) {
      current.visibility = input.visibility;
    }

    if (input.openInNewTab !== undefined) {
      current.openInNewTab = input.openInNewTab;
    }

    if (input.parentId !== undefined) {
      // Prevent making an item child of itself
      if (input.parentId === itemId) {
        throw new Error('Položka nemůže být rodičem sama sobě.');
      }
      current.parentId = input.parentId;
    }

    if (input.order !== undefined) {
      current.order = input.order;
    }

    targetSet.version += 1;
    targetSet.updatedAt = new Date().toISOString();

    return JSON.parse(JSON.stringify(targetSet));
  }

  async deleteItem(setId: string, itemId: string): Promise<NavigationSet> {
    const targetSet = this.sets.find((s) => s.id === setId);
    if (!targetSet) throw new Error('Navigační sada nebyla nalezena.');

    // Find all descendants to delete or re-parent
    const toDeleteIds = new Set<string>([itemId]);
    let added = true;
    while (added) {
      added = false;
      targetSet.items.forEach((item) => {
        if (item.parentId && toDeleteIds.has(item.parentId) && !toDeleteIds.has(item.id)) {
          toDeleteIds.add(item.id);
          added = true;
        }
      });
    }

    targetSet.items = targetSet.items.filter((item) => !toDeleteIds.has(item.id));
    targetSet.version += 1;
    targetSet.updatedAt = new Date().toISOString();

    return JSON.parse(JSON.stringify(targetSet));
  }

  async moveItem(setId: string, itemId: string, direction: 'UP' | 'DOWN'): Promise<NavigationSet> {
    const targetSet = this.sets.find((s) => s.id === setId);
    if (!targetSet) throw new Error('Navigační sada nebyla nalezena.');

    // Flatten tree to get visual order
    const { flatItems } = flattenAndCalculateDepths(targetSet.items);
    const currentIndex = flatItems.findIndex((i) => i.id === itemId);
    if (currentIndex === -1) throw new Error('Položka nebyla nalezena.');

    const currentItem = flatItems[currentIndex];
    // Find sibling items with the same parentId
    const siblings = flatItems.filter((i) => i.parentId === currentItem.parentId);
    const siblingIndex = siblings.findIndex((i) => i.id === itemId);

    if (direction === 'UP' && siblingIndex > 0) {
      const targetSibling = siblings[siblingIndex - 1];
      const tempOrder = currentItem.order;
      currentItem.order = targetSibling.order;
      targetSibling.order = tempOrder;

      // Update real items
      const realCurrent = targetSet.items.find((i) => i.id === currentItem.id);
      const realTarget = targetSet.items.find((i) => i.id === targetSibling.id);
      if (realCurrent && realTarget) {
        realCurrent.order = currentItem.order;
        realTarget.order = targetSibling.order;
      }
    } else if (direction === 'DOWN' && siblingIndex < siblings.length - 1) {
      const targetSibling = siblings[siblingIndex + 1];
      const tempOrder = currentItem.order;
      currentItem.order = targetSibling.order;
      targetSibling.order = tempOrder;

      // Update real items
      const realCurrent = targetSet.items.find((i) => i.id === currentItem.id);
      const realTarget = targetSet.items.find((i) => i.id === targetSibling.id);
      if (realCurrent && realTarget) {
        realCurrent.order = currentItem.order;
        realTarget.order = targetSibling.order;
      }
    }

    targetSet.version += 1;
    targetSet.updatedAt = new Date().toISOString();
    return JSON.parse(JSON.stringify(targetSet));
  }

  async indentItem(setId: string, itemId: string): Promise<NavigationSet> {
    const targetSet = this.sets.find((s) => s.id === setId);
    if (!targetSet) throw new Error('Navigační sada nebyla nalezena.');

    const { flatItems } = flattenAndCalculateDepths(targetSet.items);
    const currentIndex = flatItems.findIndex((i) => i.id === itemId);
    if (currentIndex === -1) throw new Error('Položka nebyla nalezena.');

    const currentItem = flatItems[currentIndex];
    const currentDepth = currentItem.depth || 0;

    if (currentDepth >= MAX_NAVIGATION_DEPTH) {
      throw new Error(`Dosažena maximální úroveň zanoření (${MAX_NAVIGATION_DEPTH}).`);
    }

    // Find preceding sibling with the same parentId
    const siblings = flatItems.filter((i) => i.parentId === currentItem.parentId);
    const siblingIndex = siblings.findIndex((i) => i.id === itemId);

    if (siblingIndex <= 0) {
      throw new Error('Položku nelze zanořit, protože před ní není žádná nadřazená položka ve stejné úrovni.');
    }

    const previousSibling = siblings[siblingIndex - 1];
    const realItem = targetSet.items.find((i) => i.id === itemId);
    if (!realItem) throw new Error('Položka nebyla nalezena.');

    realItem.parentId = previousSibling.id;
    // Set order to end of new parent's children
    const newSiblings = targetSet.items.filter((i) => i.parentId === previousSibling.id && i.id !== itemId);
    realItem.order = newSiblings.length > 0 ? Math.max(...newSiblings.map((s) => s.order)) + 1 : 1;

    targetSet.version += 1;
    targetSet.updatedAt = new Date().toISOString();
    return JSON.parse(JSON.stringify(targetSet));
  }

  async outdentItem(setId: string, itemId: string): Promise<NavigationSet> {
    const targetSet = this.sets.find((s) => s.id === setId);
    if (!targetSet) throw new Error('Navigační sada nebyla nalezena.');

    const realItem = targetSet.items.find((i) => i.id === itemId);
    if (!realItem) throw new Error('Položka nebyla nalezena.');

    if (!realItem.parentId) {
      throw new Error('Položka se již nachází v nejvyšší (kořenové) úrovni.');
    }

    const parentItem = targetSet.items.find((i) => i.id === realItem.parentId);
    // New parent is parent's parent
    realItem.parentId = parentItem ? parentItem.parentId : null;
    realItem.order = (parentItem?.order || 0) + 1;

    targetSet.version += 1;
    targetSet.updatedAt = new Date().toISOString();
    return JSON.parse(JSON.stringify(targetSet));
  }

  async toggleVisibility(setId: string, itemId: string): Promise<NavigationSet> {
    const targetSet = this.sets.find((s) => s.id === setId);
    if (!targetSet) throw new Error('Navigační sada nebyla nalezena.');

    const realItem = targetSet.items.find((i) => i.id === itemId);
    if (!realItem) throw new Error('Položka nebyla nalezena.');

    realItem.visibility = !realItem.visibility;
    targetSet.version += 1;
    targetSet.updatedAt = new Date().toISOString();

    return JSON.parse(JSON.stringify(targetSet));
  }

  checkBrokenReferences(items: NavigationItem[], availablePageIds: string[]): BrokenPageReference[] {
    const broken: BrokenPageReference[] = [];
    const validSet = new Set(availablePageIds);

    this.sets.forEach((set) => {
      set.items.forEach((item) => {
        if (item.type === 'PAGE' && item.pageId && !validSet.has(item.pageId)) {
          broken.push({
            itemId: item.id,
            itemLabel: item.label,
            pageId: item.pageId,
            navSetKey: set.key,
            navSetName: set.name,
          });
        }
      });
    });

    return broken;
  }
}

// Export singleton instance
export const navigationRepository = new InMemoryNavigationRepository();
