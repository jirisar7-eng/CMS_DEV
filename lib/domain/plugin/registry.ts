import { PluginManifest, PluginCategory } from './contracts';
import { validatePluginManifest } from './validator';

export const BUILTIN_PLUGIN_MANIFESTS: readonly PluginManifest[] = [];

export class PluginRegistry {
  private readonly manifests = new Map<string, PluginManifest>();

  constructor(initialManifests: readonly PluginManifest[] = BUILTIN_PLUGIN_MANIFESTS) {
    for (const manifest of initialManifests) {
      this.registerPlugin(manifest);
    }
  }

  public registerPlugin(manifest: PluginManifest): void {
    const validation = validatePluginManifest(manifest);
    if (!validation.valid) {
      const errorMsgs = validation.issues.map((i) => i.message).join('; ');
      throw new Error(`Invalid plugin manifest '${manifest?.id || 'unknown'}': ${errorMsgs}`);
    }

    if (this.manifests.has(manifest.id)) {
      throw new Error(
        `Duplicate plugin ID: Plugin '${manifest.id}' is already registered in registry.`
      );
    }

    this.manifests.set(manifest.id, JSON.parse(JSON.stringify(manifest)));
  }

  public unregisterPlugin(id: string): boolean {
    return this.manifests.delete(id);
  }

  public getPlugin(id: string): PluginManifest | undefined {
    const manifest = this.manifests.get(id);
    return manifest ? JSON.parse(JSON.stringify(manifest)) : undefined;
  }

  public getAllPlugins(): PluginManifest[] {
    return Array.from(this.manifests.values()).map((m) => JSON.parse(JSON.stringify(m)));
  }

  public getPluginsByCategory(category: PluginCategory): PluginManifest[] {
    return this.getAllPlugins().filter((m) => m.category === category);
  }

  public hasPlugin(id: string): boolean {
    return this.manifests.has(id);
  }

  public clearRegistry(): void {
    this.manifests.clear();
  }

  public resetToDefaults(): void {
    this.clearRegistry();
  }
}

export const globalPluginRegistry = new PluginRegistry();
