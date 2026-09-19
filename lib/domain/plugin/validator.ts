import {
  PluginManifest,
  ManifestValidationResult,
  DependencyCheckResult,
  ValidationIssue,
  PluginCategory,
} from './contracts';
import { PluginRegistry, globalPluginRegistry } from './registry';

const VALID_CATEGORIES: PluginCategory[] = [
  'SEO',
  'MARKETING',
  'ANALYTICS',
  'INTEGRATION',
  'UTILITY',
  'CONTENT',
  'WORKFLOW',
  'SECURITY',
];

const SLUG_REGEX = /^[a-z0-9-]+$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/;

const SECRET_PATTERNS = [
  /sk_live_[a-zA-Z0-9]+/i,
  /bearer\s+[a-zA-Z0-9._-]+/i,
  /-----BEGIN\s+(RSA|EC|PGP|PRIVATE)\s+KEY-----/i,
  /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9._-]+['"]/i,
];

const UNSAFE_CODE_PATTERNS = [
  /\beval\s*\(/i,
  /new\s+Function\s*\(/i,
  /<script\b/i,
  /javascript:/i,
];

function scanObjectForStrings(
  obj: any,
  visitor: (val: string, path: string) => void,
  currentPath = ''
) {
  if (obj === null || obj === undefined) return;

  if (typeof obj === 'string') {
    visitor(obj, currentPath);
    return;
  }

  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const path = currentPath ? `${currentPath}.${key}` : key;
      scanObjectForStrings(obj[key], visitor, path);
    }
  }
}

export function validatePluginManifest(manifest: any): ManifestValidationResult {
  const issues: ValidationIssue[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return {
      valid: false,
      issues: [
        {
          code: 'INVALID_MANIFEST_OBJECT',
          message: 'Manifest must be a non-null object',
          severity: 'ERROR',
        },
      ],
    };
  }

  // 1. Core Module Check - Core modules are NOT plugins!
  if (manifest.isCore === true) {
    issues.push({
      code: 'MANIFEST_CORE_NOT_ALLOWED',
      message: 'Core modules cannot be registered as plugins. Core Module != Plugin.',
      field: 'isCore',
      severity: 'ERROR',
    });
  }

  // 2. ID validation
  if (!manifest.id || typeof manifest.id !== 'string') {
    issues.push({
      code: 'INVALID_ID',
      message: 'Plugin id is required and must be a string',
      field: 'id',
      severity: 'ERROR',
    });
  } else if (!SLUG_REGEX.test(manifest.id)) {
    issues.push({
      code: 'INVALID_ID_FORMAT',
      message: 'Plugin id must be a valid lowercase slug (e.g. "seo-analyzer")',
      field: 'id',
      severity: 'ERROR',
    });
  }

  // 3. Name validation
  if (!manifest.name || typeof manifest.name !== 'string' || manifest.name.trim() === '') {
    issues.push({
      code: 'INVALID_NAME',
      message: 'Plugin name is required',
      field: 'name',
      severity: 'ERROR',
    });
  }

  // 4. Version validation
  if (!manifest.version || typeof manifest.version !== 'string' || !SEMVER_REGEX.test(manifest.version)) {
    issues.push({
      code: 'INVALID_VERSION',
      message: 'Plugin version must be a valid semver string (e.g. "1.0.0")',
      field: 'version',
      severity: 'ERROR',
    });
  }

  // 5. Description validation
  if (!manifest.description || typeof manifest.description !== 'string' || manifest.description.trim() === '') {
    issues.push({
      code: 'INVALID_DESCRIPTION',
      message: 'Plugin description is required',
      field: 'description',
      severity: 'ERROR',
    });
  }

  // 6. Category validation
  if (!manifest.category || !VALID_CATEGORIES.includes(manifest.category)) {
    issues.push({
      code: 'INVALID_CATEGORY',
      message: `Category must be one of: ${VALID_CATEGORIES.join(', ')}`,
      field: 'category',
      severity: 'ERROR',
    });
  }

  // 7. Author validation
  if (!manifest.author) {
    issues.push({
      code: 'INVALID_AUTHOR',
      message: 'Author information is required',
      field: 'author',
      severity: 'ERROR',
    });
  } else if (typeof manifest.author === 'object' && !manifest.author.name) {
    issues.push({
      code: 'INVALID_AUTHOR_NAME',
      message: 'Author object must include a name field',
      field: 'author.name',
      severity: 'ERROR',
    });
  }

  // 8. Security & Content Scans (Secrets & Unsafe Code Execution)
  scanObjectForStrings(manifest, (strVal, path) => {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(strVal)) {
        issues.push({
          code: 'MANIFEST_CONTAINS_SECRETS',
          message: `Manifest field '${path}' contains prohibited hardcoded secret string`,
          field: path,
          severity: 'ERROR',
        });
        break;
      }
    }

    for (const pattern of UNSAFE_CODE_PATTERNS) {
      if (pattern.test(strVal)) {
        issues.push({
          code: 'UNSAFE_CODE_EXECUTION',
          message: `Manifest field '${path}' contains prohibited code execution construct`,
          field: path,
          severity: 'ERROR',
        });
        break;
      }
    }
  });

  // 9. Config Schema Sensitive Field Check
  if (manifest.configSchema && Array.isArray(manifest.configSchema.fields)) {
    for (const field of manifest.configSchema.fields) {
      if (field.sensitive && field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== '') {
        issues.push({
          code: 'MANIFEST_CONTAINS_SECRETS',
          message: `Sensitive config field '${field.key}' must not provide a hardcoded secret defaultValue in manifest`,
          field: `configSchema.fields.${field.key}`,
          severity: 'ERROR',
        });
      }
    }
  }

  const valid = issues.filter((i) => i.severity === 'ERROR').length === 0;

  return {
    valid,
    issues,
  };
}

export function validatePluginDependencies(
  pluginId: string,
  registry: PluginRegistry = globalPluginRegistry
): DependencyCheckResult {
  const issues: ValidationIssue[] = [];
  const missingDependencies: string[] = [];
  const circularDependencies: string[][] = [];

  const rootManifest = registry.getPlugin(pluginId);
  if (!rootManifest) {
    return {
      valid: false,
      missingDependencies: [pluginId],
      circularDependencies: [],
      issues: [
        {
          code: 'PLUGIN_NOT_FOUND',
          message: `Plugin '${pluginId}' is not registered`,
          severity: 'ERROR',
        },
      ],
    };
  }

  function traverse(currentId: string, currentPath: string[]) {
    if (currentPath.includes(currentId)) {
      const cycle = [...currentPath.slice(currentPath.indexOf(currentId)), currentId];
      const cycleKey = cycle.join('->');
      if (!circularDependencies.some((c) => c.join('->') === cycleKey)) {
        circularDependencies.push(cycle);
        issues.push({
          code: 'CIRCULAR_DEPENDENCY',
          message: `Required dependency cycle detected: ${cycle.join(' -> ')}`,
          severity: 'ERROR',
        });
      }
      return;
    }

    const manifest = registry.getPlugin(currentId);
    if (!manifest) {
      if (!missingDependencies.includes(currentId)) {
        missingDependencies.push(currentId);
        issues.push({
          code: 'MISSING_DEPENDENCY',
          message: `Required dependency '${currentId}' is missing from registry`,
          severity: 'ERROR',
        });
      }
      return;
    }

    const nextPath = [...currentPath, currentId];
    const reqDeps = (manifest.dependencies || []).filter((d) => !d.optional);

    for (const dep of reqDeps) {
      traverse(dep.pluginId, nextPath);
    }
  }

  traverse(pluginId, []);

  const valid = missingDependencies.length === 0 && circularDependencies.length === 0;

  return {
    valid,
    missingDependencies,
    circularDependencies,
    issues,
  };
}
