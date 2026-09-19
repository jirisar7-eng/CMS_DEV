import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  PluginRegistry,
  BUILTIN_PLUGIN_MANIFESTS,
  validatePluginManifest,
  validatePluginDependencies,
  PluginManifest,
} from '../lib/domain/plugin';

describe('SYN-PLUGIN-001: Plugin Manifest & Registry Foundation', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry(BUILTIN_PLUGIN_MANIFESTS);
  });

  describe('1. Core Module Isolation & Builtin Manifests', () => {
    it('registers builtin extension plugins and enforces Core Module != Plugin', () => {
      const plugins = registry.getAllPlugins();
      assert.ok(plugins.length >= 5);

      for (const plugin of plugins) {
        assert.notStrictEqual(plugin.isCore, true);
        assert.strictEqual(plugin.isCore, false);
        // Ensure core modules like Core Pages / Media / Audit are NOT registered
        assert.notStrictEqual(plugin.id, 'core-pages');
        assert.notStrictEqual(plugin.id, 'media-library');
        assert.notStrictEqual(plugin.id, 'audit-logging');

        const validation = validatePluginManifest(plugin);
        assert.strictEqual(validation.valid, true, `Manifest ${plugin.id} should be valid`);
      }
    });
  });

  describe('2. Registry Operations & Immutability', () => {
    it('supports query, filter, unregister, clear, and reset operations', () => {
      assert.strictEqual(registry.hasPlugin('seo-analyzer'), true);
      const seoPlugin = registry.getPlugin('seo-analyzer');
      assert.ok(seoPlugin);
      assert.strictEqual(seoPlugin?.name, 'SEO Content Analyzer');

      const seoCategoryPlugins = registry.getPluginsByCategory('SEO');
      assert.ok(seoCategoryPlugins.some((p) => p.id === 'seo-analyzer'));

      // Test immutability (deep clone)
      if (seoPlugin) {
        seoPlugin.name = 'MUTATED_NAME';
      }
      assert.strictEqual(registry.getPlugin('seo-analyzer')?.name, 'SEO Content Analyzer');

      // Test unregister
      assert.strictEqual(registry.unregisterPlugin('seo-analyzer'), true);
      assert.strictEqual(registry.hasPlugin('seo-analyzer'), false);

      // Test resetToDefaults
      registry.resetToDefaults();
      assert.strictEqual(registry.hasPlugin('seo-analyzer'), true);
    });
  });

  describe('3. Manifest Security & Schema Validation', () => {
    it('rejects manifest attempting to register as a Core Module', () => {
      const coreAttempt: any = {
        id: 'core-pages-plugin',
        name: 'Core Pages',
        version: '1.0.0',
        description: 'Attempting to register core module as plugin',
        category: 'CONTENT',
        author: 'Admin',
        isCore: true,
      };

      const result = validatePluginManifest(coreAttempt);
      assert.strictEqual(result.valid, false);
      assert.ok(result.issues.some((i) => i.code === 'MANIFEST_CORE_NOT_ALLOWED'));
    });

    it('rejects manifests containing hardcoded secrets or secret defaults', () => {
      const secretManifest: any = {
        id: 'secret-plugin',
        name: 'Secret Plugin',
        version: '1.0.0',
        description: 'Plugin with raw secrets',
        category: 'UTILITY',
        author: 'Attacker',
        homepage: 'https://example.com?key=sk_live_1234567890abcdef',
        isCore: false,
      };

      const result = validatePluginManifest(secretManifest);
      assert.strictEqual(result.valid, false);
      assert.ok(result.issues.some((i) => i.code === 'MANIFEST_CONTAINS_SECRETS'));
    });

    it('rejects sensitive config fields with hardcoded secret defaultValue', () => {
      const sensitiveConfigManifest: any = {
        id: 'api-plugin',
        name: 'API Plugin',
        version: '1.0.0',
        description: 'Plugin with default secret value',
        category: 'UTILITY',
        author: 'Dev',
        configSchema: {
          fields: [
            {
              key: 'apiKey',
              label: 'API Key',
              type: 'string',
              sensitive: true,
              defaultValue: 'sk_live_999999999',
            },
          ],
        },
        isCore: false,
      };

      const result = validatePluginManifest(sensitiveConfigManifest);
      assert.strictEqual(result.valid, false);
      assert.ok(result.issues.some((i) => i.code === 'MANIFEST_CONTAINS_SECRETS'));
    });

    it('rejects manifests containing dynamic code execution strings', () => {
      const evalManifest: any = {
        id: 'eval-plugin',
        name: 'Eval Plugin',
        version: '1.0.0',
        description: 'Plugin trying to execute eval() string',
        category: 'UTILITY',
        author: 'Hacker',
        homepage: 'javascript:eval("alert(1)")',
        isCore: false,
      };

      const result = validatePluginManifest(evalManifest);
      assert.strictEqual(result.valid, false);
      assert.ok(result.issues.some((i) => i.code === 'UNSAFE_CODE_EXECUTION'));
    });
  });

  describe('4. Required Dependency Resolution & Cycle Detection (Fail-Closed)', () => {
    it('detects missing required dependencies', () => {
      const dependentPlugin: PluginManifest = {
        id: 'dependent-plugin',
        name: 'Dependent Plugin',
        version: '1.0.0',
        description: 'Requires non-existent plugin',
        category: 'UTILITY',
        author: 'Dev',
        dependencies: [
          {
            pluginId: 'non-existent-plugin',
            optional: false,
          },
        ],
        isCore: false,
      };

      registry.registerPlugin(dependentPlugin);
      const check = validatePluginDependencies('dependent-plugin', registry);
      assert.strictEqual(check.valid, false);
      assert.deepStrictEqual(check.missingDependencies, ['non-existent-plugin']);
    });

    it('detects 2-node REQUIRED dependency cycles and fails closed', () => {
      const pluginA: PluginManifest = {
        id: 'plugin-a',
        name: 'Plugin A',
        version: '1.0.0',
        description: 'Cycle node A',
        category: 'UTILITY',
        author: 'Dev',
        dependencies: [{ pluginId: 'plugin-b', optional: false }],
        isCore: false,
      };

      const pluginB: PluginManifest = {
        id: 'plugin-b',
        name: 'Plugin B',
        version: '1.0.0',
        description: 'Cycle node B',
        category: 'UTILITY',
        author: 'Dev',
        dependencies: [{ pluginId: 'plugin-a', optional: false }],
        isCore: false,
      };

      registry.registerPlugin(pluginA);
      registry.registerPlugin(pluginB);

      const checkA = validatePluginDependencies('plugin-a', registry);
      assert.strictEqual(checkA.valid, false);
      assert.ok(checkA.circularDependencies.length > 0);
      assert.ok(checkA.issues.some((i) => i.code === 'CIRCULAR_DEPENDENCY'));
    });

    it('detects multi-node REQUIRED dependency cycles', () => {
      const pluginX: PluginManifest = {
        id: 'plugin-x',
        name: 'Plugin X',
        version: '1.0.0',
        description: 'Cycle node X',
        category: 'UTILITY',
        author: 'Dev',
        dependencies: [{ pluginId: 'plugin-y', optional: false }],
        isCore: false,
      };

      const pluginY: PluginManifest = {
        id: 'plugin-y',
        name: 'Plugin Y',
        version: '1.0.0',
        description: 'Cycle node Y',
        category: 'UTILITY',
        author: 'Dev',
        dependencies: [{ pluginId: 'plugin-z', optional: false }],
        isCore: false,
      };

      const pluginZ: PluginManifest = {
        id: 'plugin-z',
        name: 'Plugin Z',
        version: '1.0.0',
        description: 'Cycle node Z',
        category: 'UTILITY',
        author: 'Dev',
        dependencies: [{ pluginId: 'plugin-x', optional: false }],
        isCore: false,
      };

      registry.registerPlugin(pluginX);
      registry.registerPlugin(pluginY);
      registry.registerPlugin(pluginZ);

      const checkX = validatePluginDependencies('plugin-x', registry);
      assert.strictEqual(checkX.valid, false);
      assert.ok(checkX.circularDependencies.length > 0);
    });

    it('allows optional dependencies without triggering cycle errors', () => {
      const pluginOptA: PluginManifest = {
        id: 'plugin-opta',
        name: 'Plugin Optional A',
        version: '1.0.0',
        description: 'Optional dep A',
        category: 'UTILITY',
        author: 'Dev',
        dependencies: [{ pluginId: 'plugin-optb', optional: true }],
        isCore: false,
      };

      const pluginOptB: PluginManifest = {
        id: 'plugin-optb',
        name: 'Plugin Optional B',
        version: '1.0.0',
        description: 'Optional dep B',
        category: 'UTILITY',
        author: 'Dev',
        dependencies: [{ pluginId: 'plugin-opta', optional: true }],
        isCore: false,
      };

      registry.registerPlugin(pluginOptA);
      registry.registerPlugin(pluginOptB);

      const check = validatePluginDependencies('plugin-opta', registry);
      assert.strictEqual(check.valid, true);
      assert.strictEqual(check.circularDependencies.length, 0);
    });
  });
});
