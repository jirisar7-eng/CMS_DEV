import {
  NavigationSet,
  NavigationItem,
  CreateNavigationSetInput,
  CreateNavigationItemInput,
  UpdateNavigationItemInput,
  BrokenPageReference,
} from "./types";

class ApiNavigationRepository {
  private async fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`/api/admin/navigation${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      let msg = errorData.error || `Request failed with status ${response.status}`;
      if (Array.isArray(errorData.errors) && errorData.errors.length > 0) {
        const detailList = errorData.errors
          .filter((e: unknown): e is string => typeof e === "string" && Boolean(e.trim()))
          .slice(0, 5)
          .join("; ");
        if (detailList) {
          msg = `${msg}: ${detailList}`;
        }
      }
      throw new Error(msg);
    }
    return response.json();
  }

  async getNavigationSets(): Promise<NavigationSet[]> {
    return this.fetchApi<NavigationSet[]>("/");
  }

  async createNavigationSet(input: CreateNavigationSetInput): Promise<NavigationSet> {
    return this.fetchApi<NavigationSet>("/", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateNavigationSet(setId: string, updates: { key?: string; name?: string; description?: string | null; context?: any }): Promise<NavigationSet> {
    // Only send allowed metadata fields; lifecycle state is managed via explicit endpoints
    const safePayload = {
      ...(updates.key !== undefined ? { key: updates.key } : {}),
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
      ...(updates.context !== undefined ? { context: updates.context } : {}),
    };
    return this.fetchApi<NavigationSet>(`/${setId}`, {
      method: "PATCH",
      body: JSON.stringify(safePayload),
    });
  }

  async publishNavigationSet(setId: string): Promise<NavigationSet> {
    return this.fetchApi<NavigationSet>(`/${setId}/publish`, {
      method: "POST",
    });
  }

  async unpublishNavigationSet(setId: string): Promise<NavigationSet> {
    return this.fetchApi<NavigationSet>(`/${setId}/unpublish`, {
      method: "POST",
    });
  }

  async archiveNavigationSet(setId: string): Promise<NavigationSet> {
    return this.fetchApi<NavigationSet>(`/${setId}/archive`, {
      method: "POST",
    });
  }

  async deleteNavigationSet(setId: string): Promise<boolean> {
    const res = await this.fetchApi<{ success: boolean }>(`/${setId}`, {
      method: "DELETE",
    });
    return res.success;
  }

  async addItem(setId: string, input: CreateNavigationItemInput): Promise<NavigationSet> {
    return this.fetchApi<NavigationSet>(`/${setId}/items`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateItem(setId: string, itemId: string, input: UpdateNavigationItemInput): Promise<NavigationSet> {
    return this.fetchApi<NavigationSet>(`/${setId}/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  async deleteItem(setId: string, itemId: string): Promise<NavigationSet> {
    return this.fetchApi<NavigationSet>(`/${setId}/items/${itemId}`, {
      method: "DELETE",
    });
  }

  async moveItem(setId: string, itemId: string, direction: "UP" | "DOWN"): Promise<NavigationSet> {
    return this.fetchApi<NavigationSet>(`/${setId}/items/${itemId}/move`, {
      method: "POST",
      body: JSON.stringify({ direction }),
    });
  }

  async indentItem(setId: string, itemId: string): Promise<NavigationSet> {
    return this.fetchApi<NavigationSet>(`/${setId}/items/${itemId}/indent`, {
      method: "POST",
    });
  }

  async outdentItem(setId: string, itemId: string): Promise<NavigationSet> {
    return this.fetchApi<NavigationSet>(`/${setId}/items/${itemId}/outdent`, {
      method: "POST",
    });
  }

  async toggleVisibility(setId: string, itemId: string): Promise<NavigationSet> {
    return this.fetchApi<NavigationSet>(`/${setId}/items/${itemId}/toggle-visibility`, {
      method: "POST",
    });
  }

  checkBrokenReferences(items: NavigationItem[], availablePageIds: string[], setKey: string = "unknown", setName: string = "unknown"): BrokenPageReference[] {
    const broken: BrokenPageReference[] = [];
    const validSet = new Set(availablePageIds);
    items.forEach((item) => {
      if (item.type === "PAGE" && item.pageId && !validSet.has(item.pageId)) {
        broken.push({
          itemId: item.id,
          itemLabel: item.label,
          pageId: item.pageId,
          navSetKey: setKey,
          navSetName: setName,
        });
      }
    });
    return broken;
  }
}

export const navigationRepository = new ApiNavigationRepository();
