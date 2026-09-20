import { prisma } from '@/lib/db';
import { logAudit } from '@/lib/auth/audit';
import { globalPluginRegistry, PluginRegistry } from './registry';
import { PluginManifest, ProjectPluginStateView } from './contracts';
import { Prisma } from '@prisma/client';

export class PluginServiceError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: any;

  constructor(code: string, message: string, status = 400, details?: any) {
    super(message);
    this.name = 'PluginServiceError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Checks whether targetVersion satisfies a version range expression.
 * Handles semver range patterns (*, 1.0.0, >=1.0.0, ^1.0.0, ~1.0.0, etc.)
 */
export function isVersionCompatible(targetVersion: string, range?: string): boolean {
  if (!range || range === '*' || range === '') return true;

  const parse = (v: string) => {
    const parts = v.replace(/^[^0-9]*/, '').split('.').map(n => parseInt(n, 10) || 0);
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  };

  const [tMajor, tMinor, tPatch] = parse(targetVersion);
  const cleanRange = range.trim();

  // Exact match
  if (/^\d+\.\d+\.\d+$/.test(cleanRange)) {
    const [rMajor, rMinor, rPatch] = parse(cleanRange);
    return tMajor === rMajor && tMinor === rMinor && tPatch === rPatch;
  }

  // Caret ^ (same major, target >= range)
  if (cleanRange.startsWith('^')) {
    const [rMajor, rMinor, rPatch] = parse(cleanRange);
    if (tMajor !== rMajor) return false;
    if (tMinor < rMinor) return false;
    if (tMinor === rMinor && tPatch < rPatch) return false;
    return true;
  }

  // Tilde ~ (same major and minor, target >= range)
  if (cleanRange.startsWith('~')) {
    const [rMajor, rMinor, rPatch] = parse(cleanRange);
    if (tMajor !== rMajor || tMinor !== rMinor) return false;
    if (tPatch < rPatch) return false;
    return true;
  }

  // Greater than or equal >=
  if (cleanRange.startsWith('>=')) {
    const [rMajor, rMinor, rPatch] = parse(cleanRange);
    if (tMajor > rMajor) return true;
    if (tMajor === rMajor && tMinor > rMinor) return true;
    if (tMajor === rMajor && tMinor === rMinor && tPatch >= rPatch) return true;
    return false;
  }

  // Default fallback: string equality or true if unknown format
  return targetVersion === cleanRange;
}

export function validatePluginConfig(
  manifest: PluginManifest,
  config?: Record<string, any>
): Record<string, any> {
  const schema = manifest.configSchema;
  const fields = schema?.fields || [];
  const fieldMap = new Map(fields.map(f => [f.key, f]));

  const providedConfig = config || {};

  // 1. Fail closed on sensitive fields
  for (const field of fields) {
    if (field.sensitive) {
      if (providedConfig[field.key] !== undefined && providedConfig[field.key] !== null) {
        throw new PluginServiceError(
          'PLUGIN_SENSITIVE_CONFIG_REJECTED',
          `Sensitive config field '${field.key}' cannot be stored in ProjectPluginState. Sensitive values must use Credential Vault.`,
          400
        );
      }
    }
  }

  // 2. Reject unknown keys
  const providedKeys = Object.keys(providedConfig);
  for (const key of providedKeys) {
    if (!fieldMap.has(key)) {
      throw new PluginServiceError(
        'PLUGIN_UNKNOWN_CONFIG_KEY',
        `Unknown config key '${key}' not defined in configSchema for plugin '${manifest.id}'.`,
        400
      );
    }
  }

  // 3. Validate types and required fields
  const cleanConfig: Record<string, any> = {};

  for (const field of fields) {
    if (field.sensitive) continue; // sensitive fields skipped

    const val = providedConfig[field.key];

    if (val === undefined || val === null || val === '') {
      if (field.required) {
        throw new PluginServiceError(
          'PLUGIN_CONFIG_VALIDATION_FAILED',
          `Required config field '${field.key}' is missing for plugin '${manifest.id}'.`,
          400
        );
      }
      if (field.defaultValue !== undefined) {
        cleanConfig[field.key] = field.defaultValue;
      }
      continue;
    }

    // Type validation
    if (field.type === 'string') {
      if (typeof val !== 'string') {
        throw new PluginServiceError(
          'PLUGIN_CONFIG_VALIDATION_FAILED',
          `Config field '${field.key}' must be a string.`,
          400
        );
      }
    } else if (field.type === 'number') {
      if (typeof val !== 'number' || Number.isNaN(val)) {
        throw new PluginServiceError(
          'PLUGIN_CONFIG_VALIDATION_FAILED',
          `Config field '${field.key}' must be a number.`,
          400
        );
      }
    } else if (field.type === 'boolean') {
      if (typeof val !== 'boolean') {
        throw new PluginServiceError(
          'PLUGIN_CONFIG_VALIDATION_FAILED',
          `Config field '${field.key}' must be a boolean.`,
          400
        );
      }
    } else if (field.type === 'select') {
      if (field.options && field.options.length > 0) {
        const allowed = field.options.map(o => o.value);
        if (!allowed.includes(val)) {
          throw new PluginServiceError(
            'PLUGIN_CONFIG_VALIDATION_FAILED',
            `Invalid option '${val}' for config field '${field.key}'. Allowed: ${allowed.join(', ')}`,
            400
          );
        }
      }
    } else if (field.type === 'multiselect') {
      if (!Array.isArray(val)) {
        throw new PluginServiceError(
          'PLUGIN_CONFIG_VALIDATION_FAILED',
          `Config field '${field.key}' must be an array of string values.`,
          400
        );
      }
      if (field.options && field.options.length > 0) {
        const allowed = field.options.map(o => o.value);
        for (const item of val) {
          if (!allowed.includes(item)) {
            throw new PluginServiceError(
              'PLUGIN_CONFIG_VALIDATION_FAILED',
              `Invalid multiselect option '${item}' for field '${field.key}'.`,
              400
            );
          }
        }
      }
    }

    cleanConfig[field.key] = val;
  }

  return cleanConfig;
}

export class PluginLifecycleService {
  private registry: PluginRegistry;

  constructor(registry: PluginRegistry = globalPluginRegistry) {
    this.registry = registry;
  }

  public async getProjectPluginStates(projectId: string): Promise<ProjectPluginStateView[]> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new PluginServiceError('PROJECT_NOT_FOUND', `Project '${projectId}' not found`, 404);
    }

    const dbStates = await prisma.projectPluginState.findMany({
      where: { projectId },
    });
    const dbStateMap = new Map(dbStates.map(s => [s.pluginId, s]));

    const allRegistered = this.registry.getAllPlugins();
    const registeredIds = new Set(allRegistered.map(p => p.id));

    const results: ProjectPluginStateView[] = allRegistered.map(manifest => {
      const dbState = dbStateMap.get(manifest.id);
      return {
        pluginId: manifest.id,
        projectId,
        enabled: dbState?.enabled ?? false,
        config: (dbState?.config as Record<string, any>) || null,
        enabledAt: dbState?.enabledAt?.toISOString() || null,
        enabledById: dbState?.enabledById || null,
        manifest,
        isOrphan: false,
      };
    });

    // Check for orphan DB records
    for (const [pluginId, dbState] of dbStateMap.entries()) {
      if (!registeredIds.has(pluginId)) {
        results.push({
          pluginId,
          projectId,
          enabled: dbState.enabled,
          config: (dbState.config as Record<string, any>) || null,
          enabledAt: dbState.enabledAt?.toISOString() || null,
          enabledById: dbState.enabledById || null,
          manifest: undefined,
          isOrphan: true,
        });
      }
    }

    return results;
  }

  public async enablePlugin(
    projectId: string,
    pluginId: string,
    actorId?: string,
    config?: Record<string, any>
  ): Promise<ProjectPluginStateView> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new PluginServiceError('PROJECT_NOT_FOUND', `Project '${projectId}' not found`, 404);
    }

    const manifest = this.registry.getPlugin(pluginId);
    if (!manifest) {
      throw new PluginServiceError(
        'PLUGIN_NOT_FOUND',
        `Plugin '${pluginId}' is not registered in the global PluginRegistry.`,
        404
      );
    }

    // Check lifecycle
    if (manifest.lifecycle?.state === 'ARCHIVED') {
      throw new PluginServiceError(
        'PLUGIN_LIFECYCLE_INELIGIBLE',
        `Plugin '${pluginId}' is ARCHIVED and cannot be enabled.`,
        400
      );
    }
    if (manifest.lifecycle?.state === 'DEPRECATED' && manifest.lifecycle.sunsetAt) {
      if (new Date(manifest.lifecycle.sunsetAt) <= new Date()) {
        throw new PluginServiceError(
          'PLUGIN_LIFECYCLE_INELIGIBLE',
          `Plugin '${pluginId}' has passed its sunset date (${manifest.lifecycle.sunsetAt}) and cannot be enabled.`,
          400
        );
      }
    }

    // Check entitlements
    if (manifest.requiredEntitlements && manifest.requiredEntitlements.length > 0) {
      throw new PluginServiceError(
        'PLUGIN_ENTITLEMENT_NOT_RESOLVED',
        `Plugin '${pluginId}' requires entitlements [${manifest.requiredEntitlements.join(', ')}], but no entitlement engine is resolved.`,
        403
      );
    }

    // Validate config
    const validatedConfig = validatePluginConfig(manifest, config);

    // Compute required dependency closure
    const requiredClosure = this.computeRequiredDependencyClosure(manifest.id);

    // Atomic transaction for dependency closure + target plugin enable
    return await prisma.$transaction(async (tx) => {
      // 1. Auto-enable required dependencies
      for (const depId of requiredClosure) {
        if (depId === pluginId) continue; // Target handled separately

        const depManifest = this.registry.getPlugin(depId);
        if (!depManifest) {
          throw new PluginServiceError(
            'PLUGIN_NOT_FOUND',
            `Required dependency plugin '${depId}' is not registered in global PluginRegistry.`,
            400
          );
        }

        // Check dep lifecycle
        if (depManifest.lifecycle?.state === 'ARCHIVED') {
          throw new PluginServiceError(
            'PLUGIN_LIFECYCLE_INELIGIBLE',
            `Required dependency plugin '${depId}' is ARCHIVED and cannot be enabled.`,
            400
          );
        }

        const existingDepState = await tx.projectPluginState.findUnique({
          where: { projectId_pluginId: { projectId, pluginId: depId } },
        });

        if (!existingDepState || !existingDepState.enabled) {
          await tx.projectPluginState.upsert({
            where: { projectId_pluginId: { projectId, pluginId: depId } },
            create: {
              projectId,
              pluginId: depId,
              enabled: true,
              enabledAt: new Date(),
              enabledById: actorId || null,
            },
            update: {
              enabled: true,
              enabledAt: new Date(),
              enabledById: actorId || null,
            },
          });

          await logAudit({
            action: 'PLUGIN_ENABLE',
            scopeType: 'PROJECT',
            scopeId: projectId,
            resourceType: 'PLUGIN',
            resourceId: depId,
            metadata: { pluginId: depId, autoEnabledFor: pluginId },
            actorId,
            tx,
          });
        }
      }

      // 2. Enable target plugin
      const state = await tx.projectPluginState.upsert({
        where: { projectId_pluginId: { projectId, pluginId } },
        create: {
          projectId,
          pluginId,
          enabled: true,
          config: Object.keys(validatedConfig).length > 0 ? validatedConfig : Prisma.JsonNull,
          enabledAt: new Date(),
          enabledById: actorId || null,
        },
        update: {
          enabled: true,
          config: Object.keys(validatedConfig).length > 0 ? validatedConfig : Prisma.JsonNull,
          enabledAt: new Date(),
          enabledById: actorId || null,
        },
      });

      await logAudit({
        action: 'PLUGIN_ENABLE',
        scopeType: 'PROJECT',
        scopeId: projectId,
        resourceType: 'PLUGIN',
        resourceId: pluginId,
        metadata: { pluginId },
        actorId,
        tx,
      });

      return {
        pluginId: state.pluginId,
        projectId: state.projectId,
        enabled: state.enabled,
        config: (state.config as Record<string, any>) || null,
        enabledAt: state.enabledAt?.toISOString() || null,
        enabledById: state.enabledById || null,
        manifest,
        isOrphan: false,
      };
    });
  }

  public async disablePlugin(
    projectId: string,
    pluginId: string,
    actorId?: string,
    options?: { cascade?: boolean }
  ): Promise<ProjectPluginStateView> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new PluginServiceError('PROJECT_NOT_FOUND', `Project '${projectId}' not found`, 404);
    }

    // Get active plugins for project
    const activeStates = await prisma.projectPluginState.findMany({
      where: { projectId, enabled: true },
    });
    const activePluginIds = new Set(activeStates.map(s => s.pluginId));

    if (!activePluginIds.has(pluginId)) {
      // Already disabled, just return current state
      const dbState = await prisma.projectPluginState.findUnique({
        where: { projectId_pluginId: { projectId, pluginId } },
      });
      const manifest = this.registry.getPlugin(pluginId);
      return {
        pluginId,
        projectId,
        enabled: false,
        config: (dbState?.config as Record<string, any>) || null,
        enabledAt: dbState?.enabledAt?.toISOString() || null,
        enabledById: dbState?.enabledById || null,
        manifest,
        isOrphan: !manifest,
      };
    }

    // Check dependent active plugins
    const activeDependents = this.findActiveDependents(projectId, pluginId, activePluginIds);

    if (activeDependents.length > 0) {
      if (options?.cascade !== true) {
        throw new PluginServiceError(
          'PLUGIN_HAS_ACTIVE_DEPENDENTS',
          `Cannot disable plugin '${pluginId}' because active dependent plugins exist: [${activeDependents.join(', ')}]. Explicit cascade confirmation is required.`,
          400,
          { activeDependents }
        );
      }
    }

    // Compute cascade disable list (dependent plugins first, then pluginId)
    const disableList = [...activeDependents, pluginId];

    return await prisma.$transaction(async (tx) => {
      for (const pId of disableList) {
        const state = await tx.projectPluginState.upsert({
          where: { projectId_pluginId: { projectId, pluginId: pId } },
          create: {
            projectId,
            pluginId: pId,
            enabled: false,
          },
          update: {
            enabled: false,
          },
        });

        await logAudit({
          action: 'PLUGIN_DISABLE',
          scopeType: 'PROJECT',
          scopeId: projectId,
          resourceType: 'PLUGIN',
          resourceId: pId,
          metadata: { pluginId: pId, cascadedFrom: pId !== pluginId ? pluginId : undefined },
          actorId,
          tx,
        });
      }

      const finalState = await tx.projectPluginState.findUnique({
        where: { projectId_pluginId: { projectId, pluginId } },
      });

      const manifest = this.registry.getPlugin(pluginId);
      return {
        pluginId,
        projectId,
        enabled: false,
        config: (finalState?.config as Record<string, any>) || null,
        enabledAt: finalState?.enabledAt?.toISOString() || null,
        enabledById: finalState?.enabledById || null,
        manifest,
        isOrphan: !manifest,
      };
    });
  }

  public async configurePlugin(
    projectId: string,
    pluginId: string,
    config: Record<string, any>,
    actorId?: string
  ): Promise<ProjectPluginStateView> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new PluginServiceError('PROJECT_NOT_FOUND', `Project '${projectId}' not found`, 404);
    }

    const manifest = this.registry.getPlugin(pluginId);
    if (!manifest) {
      throw new PluginServiceError(
        'PLUGIN_NOT_FOUND',
        `Plugin '${pluginId}' is not registered in global PluginRegistry.`,
        404
      );
    }

    const validatedConfig = validatePluginConfig(manifest, config);

    return await prisma.$transaction(async (tx) => {
      const state = await tx.projectPluginState.upsert({
        where: { projectId_pluginId: { projectId, pluginId } },
        create: {
          projectId,
          pluginId,
          enabled: false,
          config: Object.keys(validatedConfig).length > 0 ? validatedConfig : Prisma.JsonNull,
        },
        update: {
          config: Object.keys(validatedConfig).length > 0 ? validatedConfig : Prisma.JsonNull,
        },
      });

      await logAudit({
        action: 'PLUGIN_CONFIGURE',
        scopeType: 'PROJECT',
        scopeId: projectId,
        resourceType: 'PLUGIN',
        resourceId: pluginId,
        metadata: { pluginId, updatedKeys: Object.keys(validatedConfig) },
        actorId,
        tx,
      });

      return {
        pluginId: state.pluginId,
        projectId: state.projectId,
        enabled: state.enabled,
        config: (state.config as Record<string, any>) || null,
        enabledAt: state.enabledAt?.toISOString() || null,
        enabledById: state.enabledById || null,
        manifest,
        isOrphan: false,
      };
    });
  }

  private computeRequiredDependencyClosure(pluginId: string, visited = new Set<string>()): string[] {
    if (visited.has(pluginId)) return [];
    visited.add(pluginId);

    const manifest = this.registry.getPlugin(pluginId);
    if (!manifest) {
      throw new PluginServiceError(
        'PLUGIN_NOT_FOUND',
        `Required dependency plugin '${pluginId}' is not registered in global PluginRegistry.`,
        400
      );
    }

    const result: string[] = [];
    const requiredDeps = (manifest.dependencies || []).filter(d => d.kind === 'REQUIRED');

    for (const dep of requiredDeps) {
      const depManifest = this.registry.getPlugin(dep.pluginId);
      if (!depManifest) {
        throw new PluginServiceError(
          'PLUGIN_NOT_FOUND',
          `Required dependency plugin '${dep.pluginId}' is not registered in global PluginRegistry.`,
          400
        );
      }

      // Check version compatibility
      if (dep.versionRange && !isVersionCompatible(depManifest.version, dep.versionRange)) {
        throw new PluginServiceError(
          'PLUGIN_VERSION_MISMATCH',
          `Required dependency '${dep.pluginId}' version '${depManifest.version}' does not satisfy range '${dep.versionRange}'.`,
          400
        );
      }

      // Sub-dependencies
      const subClosure = this.computeRequiredDependencyClosure(dep.pluginId, visited);
      for (const sub of subClosure) {
        if (!result.includes(sub)) result.push(sub);
      }
      if (!result.includes(dep.pluginId)) result.push(dep.pluginId);
    }

    return result;
  }

  private findActiveDependents(projectId: string, pluginId: string, activePluginIds: Set<string>): string[] {
    const dependents: string[] = [];

    for (const activeId of activePluginIds) {
      if (activeId === pluginId) continue;
      const manifest = this.registry.getPlugin(activeId);
      if (!manifest) continue;

      const hasRequiredDep = (manifest.dependencies || []).some(
        d => d.pluginId === pluginId && d.kind === 'REQUIRED'
      );
      if (hasRequiredDep) {
        dependents.push(activeId);
      }
    }

    return dependents;
  }
}

export const pluginLifecycleService = new PluginLifecycleService();
