import { PluginManifest, PluginCategory } from './contracts';

export const BUILTIN_PLUGIN_MANIFESTS: readonly PluginManifest[] = [
  {
    id: 'seo-analyzer',
    name: 'SEO Content Analyzer',
    version: '1.0.0',
    description: 'Automated SEO scoring, readability analysis, and metadata optimization for content entries.',
    category: 'SEO',
    author: 'Synthesis Core Team',
    license: 'MIT',
    minCmsVersion: '1.0.0',
    capabilities: [
      {
        id: 'seo-score-panel',
        type: 'UI_PANEL',
        name: 'SEO Score Panel',
        description: 'Displays real-time SEO metrics inside the editor.',
      },
    ],
    hooks: [
      {
        name: 'content:before_publish',
        target: 'seo-analyzer:validate',
      },
    ],
    requiredPermissions: ['seo.read'],
    requiredEntitlements: ['content.plugins'],
    configSchema: {
      fields: [
        {
          key: 'targetKeywordDensity',
          label: 'Target Keyword Density (%)',
          type: 'number',
          defaultValue: 2.5,
          required: false,
        },
        {
          key: 'enableReadabilityScore',
          label: 'Enable Readability Index',
          type: 'boolean',
          defaultValue: true,
          required: false,
        },
      ],
    },
    isCore: false,
  },
  {
    id: 'form-builder-pro',
    name: 'Form Builder Pro',
    version: '1.1.0',
    description: 'Visual drag-and-drop form creation with validation rules and submission routing.',
    category: 'CONTENT',
    author: { name: 'Synthesis Extensions', email: 'plugins@synthesis.dev' },
    license: 'Commercial',
    minCmsVersion: '1.0.0',
    capabilities: [
      {
        id: 'form-composer-block',
        type: 'COMPOSER_BLOCK',
        name: 'Interactive Form Block',
        description: 'Renders dynamic forms within page layouts.',
      },
    ],
    requiredPermissions: ['content.create'],
    requiredEntitlements: ['advancedPlugins'],
    configSchema: {
      fields: [
        {
          key: 'maxSubmissionsPerDay',
          label: 'Daily Submission Limit',
          type: 'number',
          defaultValue: 1000,
          required: false,
        },
      ],
    },
    isCore: false,
  },
  {
    id: 'analytics-integration',
    name: 'Analytics Integration Pack',
    version: '2.0.0',
    description: 'Real-time traffic telemetry and privacy-friendly visitor stats.',
    category: 'ANALYTICS',
    author: 'Synthesis Core Team',
    license: 'MIT',
    minCmsVersion: '1.0.0',
    capabilities: [
      {
        id: 'analytics-dashboard-panel',
        type: 'UI_PANEL',
        name: 'Analytics Telemetry',
        description: 'Dashboard panel for visitor analytics.',
      },
    ],
    requiredPermissions: ['admin.access'],
    requiredEntitlements: ['labs.beta_plugins'],
    isCore: false,
    experimental: true,
  },
  {
    id: 'webhook-dispatcher',
    name: 'Webhook Event Dispatcher',
    version: '1.0.0',
    description: 'Subscribes to content lifecycle events and dispatches HTTP payloads to external webhooks.',
    category: 'INTEGRATION',
    author: 'Synthesis Core Team',
    license: 'MIT',
    minCmsVersion: '1.0.0',
    capabilities: [
      {
        id: 'webhook-event-hook',
        type: 'HOOK',
        name: 'Lifecycle Event Forwarder',
        description: 'Emits webhook events upon content publication.',
      },
    ],
    hooks: [
      {
        name: 'content:after_publish',
        target: 'webhook-dispatcher:publish',
        priority: 10,
      },
    ],
    requiredPermissions: ['system.manage'],
    requiredEntitlements: ['advancedPlugins'],
    isCore: false,
  },
  {
    id: 'custom-export-pack',
    name: 'Custom Export & Migration Pack',
    version: '1.0.0',
    description: 'Exports content collections to CSV, JSON Schema, and static ZIP bundles.',
    category: 'UTILITY',
    author: 'Community Contributor',
    license: 'MIT',
    dependencies: [
      {
        pluginId: 'seo-analyzer',
        versionRange: '^1.0.0',
        optional: true,
      },
    ],
    capabilities: [
      {
        id: 'export-api',
        type: 'REST_API',
        name: 'Export Endpoint',
        description: 'REST API for structured content export.',
      },
    ],
    requiredPermissions: ['content.view'],
    isCore: false,
  },
];

export class PluginRegistry {
  private readonly manifests = new Map<string, PluginManifest>();

  constructor(initialManifests: readonly PluginManifest[] = BUILTIN_PLUGIN_MANIFESTS) {
    for (const manifest of initialManifests) {
      this.registerPlugin(manifest);
    }
  }

  public registerPlugin(manifest: PluginManifest): void {
    if (!manifest || !manifest.id) {
      throw new Error('Invalid plugin manifest: missing id');
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
    for (const manifest of BUILTIN_PLUGIN_MANIFESTS) {
      this.registerPlugin(manifest);
    }
  }
}

export const globalPluginRegistry = new PluginRegistry();
