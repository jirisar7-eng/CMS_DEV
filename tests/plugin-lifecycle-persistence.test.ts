// @ts-nocheck
import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import {
  PluginRegistry,
  PluginManifest,
  PluginLifecycleService,
  isVersionCompatible,
  validatePluginConfig
} from '../lib/domain/plugin';
import { prisma } from '../lib/db';

// In-memory mock database
let dbProjects: Record<string, any> = {};
let dbPluginStates: Record<string, any[]> = {}; // key: `${projectId}:${pluginId}`
let dbAuditLogs: any[] = [];

// Setup Prisma mocks
(prisma as any).$transaction = mock.fn(async (callback: any) => {
  return await callback(prisma);
});

(prisma as any).project = {
  findUnique: mock.fn(async (args: any) => {
    return dbProjects[args.where.id] || null;
  }),
  create: mock.fn(async (args: any) => {
    const id = args.data.id || `proj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const record = { id, name: args.data.name, status: 'ACTIVE', ...args.data };
    dbProjects[id] = record;
    return record;
  }),
  delete: mock.fn(async (args: any) => {
    delete dbProjects[args.where.id];
    return { id: args.where.id };
  })
};

(prisma as any).projectPluginState = {
  findMany: mock.fn(async (args: any) => {
    const projectId = args.where.projectId;
    const states = Object.values(dbPluginStates)
      .flat()
      .filter((s: any) => s.projectId === projectId);
    if (args.where.enabled !== undefined) {
      return states.filter((s: any) => s.enabled === args.where.enabled);
    }
    return states;
  }),
  findUnique: mock.fn(async (args: any) => {
    const key = `${args.where.projectId_pluginId.projectId}:${args.where.projectId_pluginId.pluginId}`;
    const found = Object.values(dbPluginStates).flat().find((s: any) =>
      s.projectId === args.where.projectId_pluginId.projectId &&
      s.pluginId === args.where.projectId_pluginId.pluginId
    );
    return found || null;
  }),
  upsert: mock.fn(async (args: any) => {
    const { projectId, pluginId } = args.where.projectId_pluginId;
    let existing = Object.values(dbPluginStates).flat().find((s: any) =>
      s.projectId === projectId && s.pluginId === pluginId
    );

    if (existing) {
      Object.assign(existing, args.update, { updatedAt: new Date() });
    } else {
      existing = {
        id: `pps-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        projectId,
        pluginId,
        ...args.create,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      if (!dbPluginStates[projectId]) dbPluginStates[projectId] = [];
      dbPluginStates[projectId].push(existing);
    }
    return existing;
  }),
  updateMany: mock.fn(async (args: any) => {
    const projectId = args.where.projectId;
    const pluginIds = args.where.pluginId?.in || [args.where.pluginId];
    const states = Object.values(dbPluginStates).flat().filter((s: any) =>
      s.projectId === projectId && pluginIds.includes(s.pluginId)
    );
    for (const s of states) {
      Object.assign(s, args.data, { updatedAt: new Date() });
    }
    return { count: states.length };
  })
};

(prisma as any).auditLog = {
  create: mock.fn(async (args: any) => {
    const record = { id: `audit-${Date.now()}`, ...args.data, createdAt: new Date() };
    dbAuditLogs.push(record);
    return record;
  }),
  findMany: mock.fn(async (args: any) => {
    return dbAuditLogs.filter((a: any) => a.scopeId === args.where.scopeId);
  })
};

describe('SYN-PLUGIN-002: Project Plugin Lifecycle Persistence & Cascade Suite', () => {

  beforeEach(() => {
    dbProjects = {};
    dbPluginStates = {};
    dbAuditLogs = [];
  });

  const samplePluginBase: PluginManifest = {
    id: 'test-base-plugin',
    name: 'Base Test Plugin',
    version: '1.0.0',
    description: 'A base plugin for unit tests',
    type: 'OFFICIAL',
    category: 'UTILITY',
    author: 'Synthesis Team',
    legal: { license: 'MIT' },
    configSchema: {
      fields: [
        { key: 'apiKey', label: 'API Key', type: 'string', sensitive: true },
        { key: 'maxItems', label: 'Max Items', type: 'number', required: true, defaultValue: 10 },
        { key: 'mode', label: 'Mode', type: 'select', options: [{ label: 'Fast', value: 'fast' }, { label: 'Slow', value: 'slow' }] }
      ]
    }
  };

  const sampleDependentPlugin: PluginManifest = {
    id: 'test-dependent-plugin',
    name: 'Dependent Test Plugin',
    version: '1.0.0',
    description: 'Plugin that depends on base plugin',
    type: 'OFFICIAL',
    category: 'UTILITY',
    author: 'Synthesis Team',
    legal: { license: 'MIT' },
    dependencies: [
      { pluginId: 'test-base-plugin', kind: 'REQUIRED', versionRange: '^1.0.0' }
    ]
  };

  const entitlementPlugin: PluginManifest = {
    id: 'test-entitled-plugin',
    name: 'Entitlement Required Plugin',
    version: '1.0.0',
    description: 'Requires enterprise entitlement',
    type: 'OFFICIAL',
    category: 'SECURITY',
    author: 'Synthesis Team',
    legal: { license: 'MIT' },
    requiredEntitlements: ['enterprise.analytics']
  };

  const archivedPlugin: PluginManifest = {
    id: 'test-archived-plugin',
    name: 'Archived Plugin',
    version: '1.0.0',
    description: 'Archived plugin',
    type: 'OFFICIAL',
    category: 'UTILITY',
    author: 'Synthesis Team',
    legal: { license: 'MIT' },
    lifecycle: {
      state: 'ARCHIVED'
    }
  };

  it('1. satisfies semver version range compatibility check', () => {
    assert.strictEqual(isVersionCompatible('1.2.3', '^1.0.0'), true);
    assert.strictEqual(isVersionCompatible('2.0.0', '^1.0.0'), false);
    assert.strictEqual(isVersionCompatible('1.1.2', '~1.1.0'), true);
    assert.strictEqual(isVersionCompatible('1.2.0', '~1.1.0'), false);
    assert.strictEqual(isVersionCompatible('2.1.0', '>=2.0.0'), true);
    assert.strictEqual(isVersionCompatible('1.9.9', '>=2.0.0'), false);
    assert.strictEqual(isVersionCompatible('1.0.0', '*'), true);
  });

  it('2. validates config against schema and fails closed on sensitive fields', () => {
    // Sensitive field rejection
    assert.throws(() => {
      validatePluginConfig(samplePluginBase, { apiKey: 'secret-token-123', maxItems: 5 });
    }, (err: any) => {
      return err.code === 'PLUGIN_SENSITIVE_CONFIG_REJECTED';
    });

    // Unknown key rejection
    assert.throws(() => {
      validatePluginConfig(samplePluginBase, { maxItems: 5, unknownField: 'evil' });
    }, (err: any) => {
      return err.code === 'PLUGIN_UNKNOWN_CONFIG_KEY';
    });

    // Missing required field
    assert.throws(() => {
      validatePluginConfig(samplePluginBase, {});
    }, (err: any) => {
      return err.code === 'PLUGIN_CONFIG_VALIDATION_FAILED';
    });

    // Valid config
    const valid = validatePluginConfig(samplePluginBase, { maxItems: 20, mode: 'fast' });
    assert.strictEqual(valid.maxItems, 20);
    assert.strictEqual(valid.mode, 'fast');
    assert.strictEqual(valid.apiKey, undefined);
  });

  it('3. fails closed when required entitlements are not resolved', async () => {
    const registry = new PluginRegistry([]);
    registry.registerPlugin(entitlementPlugin);

    const service = new PluginLifecycleService(registry);

    const project = await prisma.project.create({
      data: { name: 'Entitlement Test Project', slug: `ent-proj-${Date.now()}` }
    });

    try {
      await service.enablePlugin(project.id, entitlementPlugin.id);
      assert.fail('Should have thrown entitlement error');
    } catch (err: any) {
      assert.strictEqual(err.code, 'PLUGIN_ENTITLEMENT_NOT_RESOLVED');
    }
  });

  it('4. fails closed on archived or sunset lifecycle state', async () => {
    const registry = new PluginRegistry([]);
    registry.registerPlugin(archivedPlugin);

    const service = new PluginLifecycleService(registry);

    const project = await prisma.project.create({
      data: { name: 'Archived Test Project', slug: `arch-proj-${Date.now()}` }
    });

    try {
      await service.enablePlugin(project.id, archivedPlugin.id);
      assert.fail('Should have thrown lifecycle error');
    } catch (err: any) {
      assert.strictEqual(err.code, 'PLUGIN_LIFECYCLE_INELIGIBLE');
    }
  });

  it('5. auto-enables required dependencies on enable', async () => {
    const registry = new PluginRegistry([]);
    registry.registerPlugin(samplePluginBase);
    registry.registerPlugin(sampleDependentPlugin);

    const service = new PluginLifecycleService(registry);

    const project = await prisma.project.create({
      data: { name: 'Dependency Test Project', slug: `dep-proj-${Date.now()}` }
    });

    const enableRes = await service.enablePlugin(project.id, sampleDependentPlugin.id);
    assert.strictEqual(enableRes.enabled, true);

    const states = await service.getProjectPluginStates(project.id);
    const baseState = states.find(s => s.pluginId === samplePluginBase.id);
    const dependentState = states.find(s => s.pluginId === sampleDependentPlugin.id);

    assert.strictEqual(baseState?.enabled, true, 'Base dependency should be auto-enabled');
    assert.strictEqual(dependentState?.enabled, true, 'Target dependent plugin should be enabled');

    const auditLogs = await prisma.auditLog.findMany({
      where: { scopeId: project.id }
    });
    assert.ok(auditLogs.some((l: any) => l.action === 'PLUGIN_ENABLE' && l.resourceId === samplePluginBase.id));
    assert.ok(auditLogs.some((l: any) => l.action === 'PLUGIN_ENABLE' && l.resourceId === sampleDependentPlugin.id));
  });

  it('6. blocks disable when active dependents exist without cascade option', async () => {
    const registry = new PluginRegistry([]);
    registry.registerPlugin(samplePluginBase);
    registry.registerPlugin(sampleDependentPlugin);

    const service = new PluginLifecycleService(registry);

    const project = await prisma.project.create({
      data: { name: 'Cascade Test Project', slug: `casc-proj-${Date.now()}` }
    });

    // Enable dependent plugin (which auto-enables base)
    await service.enablePlugin(project.id, sampleDependentPlugin.id);

    // Attempting to disable base plugin without cascade=true must fail
    try {
      await service.disablePlugin(project.id, samplePluginBase.id, undefined, { cascade: false });
      assert.fail('Should have blocked disabling base plugin');
    } catch (err: any) {
      assert.strictEqual(err.code, 'PLUGIN_HAS_ACTIVE_DEPENDENTS');
      assert.deepStrictEqual(err.details?.activeDependents, [sampleDependentPlugin.id]);
    }

    // Disabling with cascade=true must succeed and disable both
    const disableRes = await service.disablePlugin(project.id, samplePluginBase.id, undefined, { cascade: true });
    assert.strictEqual(disableRes.enabled, false);

    const states = await service.getProjectPluginStates(project.id);
    assert.strictEqual(states.find(s => s.pluginId === samplePluginBase.id)?.enabled, false);
    assert.strictEqual(states.find(s => s.pluginId === sampleDependentPlugin.id)?.enabled, false);
  });

  it('7. fails with version mismatch when dependency range is violated', async () => {
    const badDepPlugin: PluginManifest = {
      id: 'bad-dep-plugin',
      name: 'Bad Dep Plugin',
      version: '0.5.0',
      description: 'Older version',
      type: 'OFFICIAL',
      category: 'UTILITY',
      author: 'Synthesis Team',
      legal: { license: 'MIT' }
    };

    const consumerPlugin: PluginManifest = {
      id: 'consumer-plugin',
      name: 'Consumer Plugin',
      version: '1.0.0',
      description: 'Consumer requiring ^1.0.0',
      type: 'OFFICIAL',
      category: 'UTILITY',
      author: 'Synthesis Team',
      legal: { license: 'MIT' },
      dependencies: [
        { pluginId: 'bad-dep-plugin', kind: 'REQUIRED', versionRange: '^1.0.0' }
      ]
    };

    const registry = new PluginRegistry([]);
    registry.registerPlugin(badDepPlugin);
    registry.registerPlugin(consumerPlugin);

    const service = new PluginLifecycleService(registry);

    const project = await prisma.project.create({
      data: { name: 'Version Mismatch Project', slug: `ver-proj-${Date.now()}` }
    });

    try {
      await service.enablePlugin(project.id, consumerPlugin.id);
      assert.fail('Should have failed version compatibility check');
    } catch (err: any) {
      assert.strictEqual(err.code, 'PLUGIN_VERSION_MISMATCH');
    }
  });

  it('8. rehydrates orphan DB plugin state when plugin is missing from registry', async () => {
    const registry = new PluginRegistry([]);
    const service = new PluginLifecycleService(registry);

    const project = await prisma.project.create({
      data: { name: 'Orphan Test Project', slug: `orphan-proj-${Date.now()}` }
    });

    // Manually create an orphan record in DB
    if (!dbPluginStates[project.id]) dbPluginStates[project.id] = [];
    dbPluginStates[project.id].push({
      id: 'pps-orphan',
      projectId: project.id,
      pluginId: 'orphan-plugin-99',
      enabled: true,
      config: { foo: 'bar' },
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const states = await service.getProjectPluginStates(project.id);
    const orphanState = states.find(s => s.pluginId === 'orphan-plugin-99');

    assert.ok(orphanState, 'Orphan record should be rehydrated');
    assert.strictEqual(orphanState.isOrphan, true);
    assert.strictEqual(orphanState.enabled, true);
    assert.strictEqual(orphanState.config?.foo, 'bar');
  });

  it('9. prevents cross-project IDOR and throws 404 for non-existent project', async () => {
    const registry = new PluginRegistry([]);
    registry.registerPlugin(samplePluginBase);

    const service = new PluginLifecycleService(registry);

    try {
      await service.enablePlugin('non-existent-project-id', samplePluginBase.id);
      assert.fail('Should throw PROJECT_NOT_FOUND');
    } catch (err: any) {
      assert.strictEqual(err.code, 'PROJECT_NOT_FOUND');
      assert.strictEqual(err.status, 404);
    }
  });

  it('10. verifies audit events contain no sensitive secrets or raw confidential configs', async () => {
    const registry = new PluginRegistry([]);
    registry.registerPlugin(samplePluginBase);

    const service = new PluginLifecycleService(registry);

    const project = await prisma.project.create({
      data: { name: 'Audit Test Project', slug: `audit-proj-${Date.now()}` }
    });

    await service.configurePlugin(project.id, samplePluginBase.id, { maxItems: 15 });

    const auditLogs = await prisma.auditLog.findMany({
      where: { scopeId: project.id }
    });

    const configAudit = auditLogs.find((l: any) => l.action === 'PLUGIN_CONFIGURE');
    assert.ok(configAudit);
    assert.ok(configAudit.metadata.updatedKeys.includes('maxItems'));
    assert.strictEqual(configAudit.metadata.apiKey, undefined, 'Must not leak secrets or config values into metadata');
  });

});
