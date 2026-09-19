import fs from 'node:fs';
import path from 'node:path';
import {
  BasicCapabilityRecord,
  BasicSystemMap,
  InternalCapabilityRecord,
  InternalSystemMap,
  RawCapabilitiesRegistry,
  RawTasksRegistry,
  SystemMapAccessLevel,
  SystemMapRegistryError,
} from './types';

/**
 * Resolves the root directory containing the .synthesis directory.
 */
export function resolveSynthesisRoot(customRoot?: string): string {
  if (customRoot) {
    if (fs.existsSync(path.join(customRoot, '.synthesis', 'lineage', 'capabilities.json'))) {
      return customRoot;
    }
    throw new SystemMapRegistryError(`CANNOT_RESOLVE_SYNTHESIS_ROOT: Custom root '${customRoot}' does not contain .synthesis/lineage/capabilities.json`);
  }

  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, '.synthesis', 'lineage', 'capabilities.json'))) {
    return cwd;
  }

  const subpath = path.join(cwd, 'cms_web002');
  if (fs.existsSync(path.join(subpath, '.synthesis', 'lineage', 'capabilities.json'))) {
    return subpath;
  }

  // Check parent directory
  const parent = path.resolve(cwd, '..');
  if (fs.existsSync(path.join(parent, '.synthesis', 'lineage', 'capabilities.json'))) {
    return parent;
  }

  throw new SystemMapRegistryError('CANNOT_RESOLVE_SYNTHESIS_ROOT: .synthesis directory not found');
}

/**
 * Loads and validates raw capabilities registry from .synthesis/lineage/capabilities.json.
 */
export function loadCapabilitiesRegistry(customRoot?: string): RawCapabilitiesRegistry {
  try {
    const root = resolveSynthesisRoot(customRoot);
    const filePath = path.join(root, '.synthesis', 'lineage', 'capabilities.json');

    if (!fs.existsSync(filePath)) {
      throw new SystemMapRegistryError(`Capabilities registry file missing at: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.registry_version !== 'string' ||
      !Array.isArray(parsed.capabilities) ||
      parsed.capabilities.length === 0
    ) {
      throw new SystemMapRegistryError('Capabilities registry corrupted or invalid schema');
    }

    for (const cap of parsed.capabilities) {
      if (!cap.capability_id || typeof cap.capability_id !== 'string') {
        throw new SystemMapRegistryError(`Invalid capability record in registry: ${JSON.stringify(cap)}`);
      }
    }

    return parsed as RawCapabilitiesRegistry;
  } catch (error) {
    if (error instanceof SystemMapRegistryError) {
      throw error;
    }
    throw new SystemMapRegistryError('Failed to load capabilities registry', error);
  }
}

/**
 * Loads and validates raw tasks registry from .synthesis/lineage/tasks.json.
 */
export function loadTasksRegistry(customRoot?: string): RawTasksRegistry {
  try {
    const root = resolveSynthesisRoot(customRoot);
    const filePath = path.join(root, '.synthesis', 'lineage', 'tasks.json');

    if (!fs.existsSync(filePath)) {
      throw new SystemMapRegistryError(`Tasks registry file missing at: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.registry_version !== 'string' ||
      typeof parsed.total_tasks !== 'number' ||
      !Array.isArray(parsed.tasks)
    ) {
      throw new SystemMapRegistryError('Tasks registry corrupted or invalid schema');
    }

    return parsed as RawTasksRegistry;
  } catch (error) {
    if (error instanceof SystemMapRegistryError) {
      throw error;
    }
    throw new SystemMapRegistryError('Failed to load tasks registry', error);
  }
}

/**
 * Redacts raw capability records into safe, basic capability metadata.
 * Strips all internal file paths, DB model lists, API endpoints, security boundary labels,
 * task references, and Git commit hashes.
 */
export function redactToBasicCapability(raw: InternalCapabilityRecord): BasicCapabilityRecord {
  return {
    capability_id: raw.capability_id,
    visibility: raw.visibility,
    project_scoped: Boolean(raw.project_scoped),
    depends_on_capabilities: Array.isArray(raw.depends_on_capabilities)
      ? [...raw.depends_on_capabilities]
      : [],
  };
}

/**
 * Resolves the Basic System Map (for system_map.read_basic).
 */
export function resolveBasicSystemMap(customRoot?: string): BasicSystemMap {
  const capRegistry = loadCapabilitiesRegistry(customRoot);
  const basicCapabilities = capRegistry.capabilities.map(redactToBasicCapability);

  return {
    view: 'basic',
    registry_version: capRegistry.registry_version,
    total_capabilities: basicCapabilities.length,
    capabilities: basicCapabilities,
  };
}

/**
 * Resolves the Internal System Map with full fidelity (for system_map.read_internal).
 */
export function resolveInternalSystemMap(customRoot?: string): InternalSystemMap {
  const capRegistry = loadCapabilitiesRegistry(customRoot);
  const taskRegistry = loadTasksRegistry(customRoot);

  return {
    view: 'internal',
    registry_version: capRegistry.registry_version,
    total_capabilities: capRegistry.capabilities.length,
    capabilities: capRegistry.capabilities,
    total_tasks: taskRegistry.total_tasks,
    tasks: taskRegistry.tasks,
  };
}

/**
 * Unified resolver dispatches based on granted access level.
 */
export function resolveSystemMap(options: {
  accessLevel: SystemMapAccessLevel;
  customRoot?: string;
}): BasicSystemMap | InternalSystemMap {
  if (options.accessLevel === 'internal') {
    return resolveInternalSystemMap(options.customRoot);
  }
  return resolveBasicSystemMap(options.customRoot);
}
