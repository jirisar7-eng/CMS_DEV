import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  PluginRegistry,
  globalPluginRegistry,
  validatePluginManifest,
  validatePluginDependencies,
  PluginManifest,
} from '../lib/domain/plugin';

// Test Fixtures
const sampleSeoPlugin: PluginManifest = {
  id: 'seo-analyzer',
  name: 'SEO Content Analyzer',
  version: '1.0.0',
  description: 'Automated SEO scoring and readability analysis.',
  type: 'OFFICIAL',
  category: 'SEO',
  author: 'Synthesis Core Team',
  legal: {
    license: 'MIT',
    termsUrl: 'https://example.com/terms',
    privacyUrl: 'https://example.com/privacy',
  },
  lifecycle: {
    state: 'STABLE',
  },
  compatibility: {
    minCmsVersion: '1.0.0',
  },
  isCore: false,
};

describe('SYN-PLUGIN-001: Plugin Manifest & Registry Foundation', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  describe('1. Empty Production Registry Default & Foundation Boundary', () => {
    it('verifies production registry is empty by default', () => {
      assert.strictEqual(globalPluginRegistry.getAllPlugins().length, 0);
      assert.strictEqual(registry.getAllPlugins().length, 0);
    });

    it('verifies registry has no lifecycle/removal API (unregister, clear, reset)', () => {
      assert.strictEqual((registry as any).unregisterPlugin, undefined);
      assert.strictEqual((registry as any).clearRegistry, undefined);
      assert.strictEqual((registry as any).resetToDefaults, undefined);
    });
  });

  describe('2. Registry Operations & Duplicate ID Rejection', () => {
    it('registers valid manifest and retrieves a deep clone copy', () => {
      registry.registerPlugin(sampleSeoPlugin);
      assert.strictEqual(registry.hasPlugin('seo-analyzer'), true);

      const retrieved = registry.getPlugin('seo-analyzer');
      assert.ok(retrieved);
      assert.strictEqual(retrieved?.name, 'SEO Content Analyzer');

      // Test immutability
      if (retrieved) {
        retrieved.name = 'MUTATED_NAME';
      }
      assert.strictEqual(registry.getPlugin('seo-analyzer')?.name, 'SEO Content Analyzer');
    });

    it('fails closed when registering duplicate plugin ID', () => {
      registry.registerPlugin(sampleSeoPlugin);
      assert.throws(
        () => registry.registerPlugin(sampleSeoPlugin),
        /Duplicate plugin ID/
      );
    });
  });

  describe('3. Legal Metadata & URL Validation', () => {
    it('validates legal metadata with valid URLs successfully', () => {
      const validLegalManifest: PluginManifest = {
        ...sampleSeoPlugin,
        legal: {
          license: 'Apache-2.0',
          termsUrl: 'https://example.com/terms',
          privacyUrl: 'https://example.com/privacy',
          securityPolicyUrl: 'https://example.com/security',
        },
      };

      const result = validatePluginManifest(validLegalManifest);
      assert.strictEqual(result.valid, true);
    });

    it('rejects manifest missing required legal metadata for OFFICIAL type', () => {
      const noLegalManifest: any = {
        ...sampleSeoPlugin,
        legal: undefined,
      };

      const result = validatePluginManifest(noLegalManifest);
      assert.strictEqual(result.valid, false);
      assert.ok(result.issues.some((i) => i.code === 'LEGAL_REQUIRED'));
    });

    it('rejects manifest with invalid legal URLs', () => {
      const invalidUrlManifest: any = {
        ...sampleSeoPlugin,
        legal: {
          license: 'MIT',
          termsUrl: 'not-a-valid-url',
        },
      };

      const result = validatePluginManifest(invalidUrlManifest);
      assert.strictEqual(result.valid, false);
      assert.ok(result.issues.some((i) => i.code === 'INVALID_LEGAL_URL'));
    });
  });

  describe('4. EXPERIMENTAL via PluginType Only', () => {
    it('supports EXPERIMENTAL plugins solely via PluginType without boolean flags', () => {
      const experimentalManifest: PluginManifest = {
        ...sampleSeoPlugin,
        id: 'exp-feature',
        type: 'EXPERIMENTAL',
      };

      const result = validatePluginManifest(experimentalManifest);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(experimentalManifest.type, 'EXPERIMENTAL');
      assert.strictEqual((experimentalManifest as any).experimental, undefined);
    });
  });

  describe('5. Unknown Top-Level Field & Function/Executable Value Rejection', () => {
    it('rejects manifest with unknown top-level field', () => {
      const invalidManifest: any = {
        ...sampleSeoPlugin,
        unknownField: 'disallowed_value',
      };

      const result = validatePluginManifest(invalidManifest);
      assert.strictEqual(result.valid, false);
      assert.ok(result.issues.some((i) => i.code === 'UNKNOWN_TOP_LEVEL_FIELD'));

      assert.throws(() => registry.registerPlugin(invalidManifest), /Unknown top-level field/);
    });

    it('rejects manifest containing executable function values', () => {
      const fnManifest: any = {
        ...sampleSeoPlugin,
        author: (() => 'executable_code') as any,
      };

      const result = validatePluginManifest(fnManifest);
      assert.strictEqual(result.valid, false);
      assert.ok(result.issues.some((i) => i.code === 'UNSUPPORTED_DATA_TYPE'));
      assert.throws(() => registry.registerPlugin(fnManifest), /Prohibited non-data type/);
    });
  });

  describe('6. Dependency Validation with Explicit Registry Parameter', () => {
    it('requires explicit registry parameter for validatePluginDependencies', () => {
      assert.throws(
        () => validatePluginDependencies('seo-analyzer', undefined as any),
        /explicitly provided/
      );
    });

    it('detects missing REQUIRED dependencies using explicit registry', () => {
      const dependentPlugin: PluginManifest = {
        ...sampleSeoPlugin,
        id: 'dep-plugin',
        dependencies: [
          {
            pluginId: 'non-existent-plugin',
            kind: 'REQUIRED',
          },
        ],
      };

      registry.registerPlugin(dependentPlugin);
      const check = validatePluginDependencies('dep-plugin', registry);
      assert.strictEqual(check.valid, false);
      assert.deepStrictEqual(check.missingDependencies, ['non-existent-plugin']);
    });

    it('detects REQUIRED dependency cycles using explicit registry', () => {
      const pluginA: PluginManifest = {
        ...sampleSeoPlugin,
        id: 'cycle-a',
        dependencies: [{ pluginId: 'cycle-b', kind: 'REQUIRED' }],
      };

      const pluginB: PluginManifest = {
        ...sampleSeoPlugin,
        id: 'cycle-b',
        dependencies: [{ pluginId: 'cycle-a', kind: 'REQUIRED' }],
      };

      registry.registerPlugin(pluginA);
      registry.registerPlugin(pluginB);

      const check = validatePluginDependencies('cycle-a', registry);
      assert.strictEqual(check.valid, false);
      assert.ok(check.circularDependencies.length > 0);
      assert.ok(check.issues.some((i) => i.code === 'CIRCULAR_DEPENDENCY'));
    });
  });
});
