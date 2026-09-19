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
  license: 'MIT',
  lifecycle: {
    state: 'STABLE',
  },
  compatibility: {
    minCmsVersion: '1.0.0',
  },
  isCore: false,
};

const sampleFormPlugin: PluginManifest = {
  id: 'form-builder',
  name: 'Form Builder',
  version: '1.0.0',
  description: 'Visual form builder extension.',
  type: 'COMMUNITY',
  category: 'CONTENT',
  author: { name: 'Community Contributor', email: 'dev@example.com' },
  license: 'Apache-2.0',
  isCore: false,
};

describe('SYN-PLUGIN-001: Plugin Manifest & Registry Foundation', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  describe('1. Empty Production Registry Default', () => {
    it('verifies production registry is empty by default', () => {
      assert.strictEqual(globalPluginRegistry.getAllPlugins().length, 0);
      assert.strictEqual(registry.getAllPlugins().length, 0);
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

  describe('3. Unknown Top-Level Field & Function/Executable Value Rejection', () => {
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

  describe('4. Dependency Kind, INTEGRATION Dependency & Version Range Validation', () => {
    it('rejects manifest with invalid dependency kind', () => {
      const invalidKindManifest: any = {
        ...sampleSeoPlugin,
        id: 'invalid-dep-plugin',
        dependencies: [
          {
            pluginId: 'some-plugin',
            kind: 'INVALID_KIND',
          },
        ],
      };

      const result = validatePluginManifest(invalidKindManifest);
      assert.strictEqual(result.valid, false);
      assert.ok(result.issues.some((i) => i.code === 'INVALID_DEPENDENCY_KIND'));
    });

    it('accepts INTEGRATION dependency kind without triggering required cycle fail-closed', () => {
      const integrationPlugin: PluginManifest = {
        ...sampleSeoPlugin,
        id: 'integration-plugin-a',
        dependencies: [
          {
            pluginId: 'integration-plugin-b',
            kind: 'INTEGRATION',
          },
        ],
      };

      const integrationPluginB: PluginManifest = {
        ...sampleSeoPlugin,
        id: 'integration-plugin-b',
        dependencies: [
          {
            pluginId: 'integration-plugin-a',
            kind: 'INTEGRATION',
          },
        ],
      };

      const validationA = validatePluginManifest(integrationPlugin);
      assert.strictEqual(validationA.valid, true);

      registry.registerPlugin(integrationPlugin);
      registry.registerPlugin(integrationPluginB);

      // INTEGRATION kind dependencies are not REQUIRED, so cycle check remains valid
      const depCheck = validatePluginDependencies('integration-plugin-a', registry);
      assert.strictEqual(depCheck.valid, true);
    });

    it('rejects dependency with invalid version range syntax', () => {
      const invalidRangeManifest: PluginManifest = {
        ...sampleSeoPlugin,
        id: 'bad-range-plugin',
        dependencies: [
          {
            pluginId: 'seo-analyzer',
            kind: 'REQUIRED',
            versionRange: 'invalid-range-format-!!!',
          },
        ],
      };

      const result = validatePluginManifest(invalidRangeManifest);
      assert.strictEqual(result.valid, false);
      assert.ok(result.issues.some((i) => i.code === 'INVALID_VERSION_RANGE'));
    });
  });

  describe('5. Core Isolation & Secrets Security Boundaries', () => {
    it('rejects manifest attempting to register as a Core Module', () => {
      const coreAttempt: any = {
        ...sampleSeoPlugin,
        id: 'core-pages-attempt',
        isCore: true,
      };

      const result = validatePluginManifest(coreAttempt);
      assert.strictEqual(result.valid, false);
      assert.ok(result.issues.some((i) => i.code === 'MANIFEST_CORE_NOT_ALLOWED'));
    });

    it('rejects manifest containing secret tokens', () => {
      const secretManifest: PluginManifest = {
        ...sampleSeoPlugin,
        id: 'secret-leak-plugin',
        homepage: 'https://example.com?api_key=sk_live_123456789',
      };

      const result = validatePluginManifest(secretManifest);
      assert.strictEqual(result.valid, false);
      assert.ok(result.issues.some((i) => i.code === 'MANIFEST_CONTAINS_SECRETS'));
    });
  });

  describe('6. REQUIRED Dependency Resolution & Cycle Detection (Fail-Closed)', () => {
    it('detects missing REQUIRED dependencies', () => {
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

    it('detects REQUIRED dependency cycles and fails closed', () => {
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
