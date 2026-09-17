import {
  NavigationSet,
  NavigationItem,
  CreateNavigationSetInput,
  CreateNavigationItemInput,
  UpdateNavigationItemInput,
  BrokenPageReference,
} from './types';

class ApiNavigationRepository {
  private async fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`/api/admin/navigation${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Request failed with status ${response.status}`);
    }

    return response.json();
  }

  async getNavigationSets(): Promise<NavigationSet[]> {
    return this.fetchApi<NavigationSet[]>('/');
  }

  async createSet(input: CreateNavigationSetInput): Promise<NavigationSet> {
    return this.fetchApi<NavigationSet>('/', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updateSet(setId: string, updates: Partial<NavigationSet>): Promise<NavigationSet> {
    return this.fetchApi<NavigationSet>(`/${setId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async createItem(setId: string, input: CreateNavigationItemInput): Promise<NavigationSet> {
    return this.fetchApi<NavigationSet>(`/${setId}/items`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updateItem(setId: string, itemId: string, input: UpdateNavigationItemInput): Promise<NavigationSet> {
    return this.fetchApi<NavigationSet>(`/${setId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  async deleteItem(setId: string, itemId: string): Promise<NavigationSet> {
    return this.fetchApi<NavigationSet>(`/${setId}/items/${itemId}`, {
      method: 'DELETE',
    });
  }

  async moveItem(setId: string, itemId: string, direction: 'UP' | 'DOWN'): Promise<NavigationSet> {
    return this.fetchApi<NavigationSet>(`/${setId}/items/${itemId}/move`, {
      method: 'POST',
      body: JSON.stringify({ direction }),
    });
  }

  async indentItem(setId: string, itemId: string): Promise<NavigationSet> {
    return this.fetchApi<NavigationSet>(`/${setId}/items/${itemId}/indent`, {
      method: 'POST',
    });
  }

  async outdentItem(setId: string, itemId: string): Promise<NavigationSet> {
    return this.fetchApi<NavigationSet>(`/${setId}/items/${itemId}/outdent`, {
      method: 'POST',
    });
  }

  async toggleVisibility(setId: string, itemId: string): Promise<NavigationSet> {
    return this.fetchApi<NavigationSet>(`/${setId}/items/${itemId}/toggle-visibility`, {
      method: 'POST',
    });
  }

  checkBrokenReferences(items: NavigationItem[], availablePageIds: string[]): BrokenPageReference[] {
    // This is a UI helper, so we can keep it as is
    const broken: BrokenPageReference[] = [];
    const validSet = new Set(availablePageIds);

    // This method is called in the UI and usually receives a specific set's items
    items.forEach((item) => {
      if (item.type === 'PAGE' && item.pageId && !validSet.has(item.pageId)) {
        broken.push({
          itemId: item.id,
          itemLabel: item.label,
          pageId: item.pageId,
          navSetKey: 'unknown',
          navSetName: 'unknown',
        });
      }
    });

    return broken;
  }
}

export const navigationRepository = new ApiNavigationRepository();
