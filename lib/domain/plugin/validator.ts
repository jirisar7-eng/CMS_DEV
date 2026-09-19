import {
  PluginManifest,
  ManifestValidationResult,
  DependencyCheckResult,
  ValidationIssue,
  PluginType,
  PluginCategory,
  PluginCapabilityType,
  DependencyKind,
  PluginLifecycleState,
} from './contracts';
import type { PluginRegistry } from './registry';

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  'id',
  'name',
  'version',
  'description',
  'type',
  'category',
  'author',
  'homepage',
  'legal',
  'lifecycle',
  'compatibility',
  'dependencies',
  'capabilities',
  'hooks',
  'requiredPermissions',
  'requiredEntitlements',
  'configSchema',
  'isCore',
]);

const VALID_TYPES: PluginType[] = [
  'OFFICIAL',
  'THIRD_PARTY',
  'COMMUNITY',
  'PRIVATE',
  'EXPERIMENTAL',
];

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

const VALID_CAPABILITY_TYPES: PluginCapabilityType[] = [
  'UI_PANEL',
  'REST_API',
  'HOOK',
  'CRON_TASK',
  'BACKGROUND_SERVICE',
  'COMPOSER_BLOCK',
];

const VALID_DEPENDENCY_KINDS: DependencyKind[] = [
  'REQUIRED',
  'OPTIONAL',
  'INTEGRATION',
];

const VALID_LIFECYCLE_STATES: PluginLifecycleState[] = [
  'DRAFT',
  'STABLE',
  'DEPRECATED',
  'ARCHIVED',
];

const SLUG_REGEX = /^[a-z0-9-]+$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/;
const VERSION_RANGE_REGEX = /^([\^~><=]*\d+(\.(\d+|[xX]))*(-[a-zA-Z0-9.-]+)?|\*)$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function isPlainObject(val: any): boolean {
  if (val === null || typeof val !== 'object' || Array.isArray(val)) {
    return false;
  }
  const proto = Object.getPrototypeOf(val);
  return proto === null || proto === Object.prototype;
}

function isValidHttpUrl(urlStr: any): boolean {
  if (typeof urlStr !== 'string') return false;
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function checkProhibitedTypesAndValues(
  obj: any,
  issues: ValidationIssue[],
  visited = new WeakSet<object>(),
  currentPath = ''
) {
  if (obj === null || obj === undefined) return;

  const objType = typeof obj;

  if (objType === 'function' || objType === 'symbol' || objType === 'bigint') {
    issues.push({
      code: 'UNSUPPORTED_DATA_TYPE',
      message: `Prohibited non-data type '${objType}' found at '${currentPath || 'root'}'`,
      field: currentPath || 'root',
      severity: 'ERROR',
    });
    return;
  }

  if (objType === 'string') {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(obj)) {
        issues.push({
          code: 'MANIFEST_CONTAINS_SECRETS',
          message: `Manifest path '${currentPath}' contains prohibited secret pattern`,
          field: currentPath,
          severity: 'ERROR',
        });
        break;
      }
    }

    for (const pattern of UNSAFE_CODE_PATTERNS) {
      if (pattern.test(obj)) {
        issues.push({
          code: 'UNSAFE_CODE_EXECUTION',
          message: `Manifest path '${currentPath}' contains prohibited code execution string`,
          field: currentPath,
          severity: 'ERROR',
        });
        break;
      }
    }
    return;
  }

  if (objType === 'object') {
    if (visited.has(obj)) {
      issues.push({
        code: 'CIRCULAR_MANIFEST_OBJECT',
        message: `Circular reference detected at '${currentPath}'`,
        field: currentPath,
        severity: 'ERROR',
      });
      return;
    }
    visited.add(obj);

    for (const key of Object.keys(obj)) {
      const path = currentPath ? `${currentPath}.${key}` : key;
      checkProhibitedTypesAndValues(obj[key], issues, visited, path);
    }
  }
}

export function validatePluginManifest(manifest: any): ManifestValidationResult {
  const issues: ValidationIssue[] = [];

  if (!manifest || !isPlainObject(manifest)) {
    return {
      valid: false,
      issues: [
        {
          code: 'INVALID_MANIFEST_OBJECT',
          message: 'Manifest must be a non-null plain object',
          severity: 'ERROR',
        },
      ],
    };
  }

  // 1. Unknown top-level fields check
  for (const key of Object.keys(manifest)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      issues.push({
        code: 'UNKNOWN_TOP_LEVEL_FIELD',
        message: `Unknown top-level field '${key}' is not allowed in plugin manifest`,
        field: key,
        severity: 'ERROR',
      });
    }
  }

  // 2. Scan for executable/unsupported types, circular refs, secrets, and unsafe execution constructs
  checkProhibitedTypesAndValues(manifest, issues);

  // 3. Core module rejection
  if (manifest.isCore === true) {
    issues.push({
      code: 'MANIFEST_CORE_NOT_ALLOWED',
      message: 'Core modules cannot be registered as plugins. Core Module != Plugin.',
      field: 'isCore',
      severity: 'ERROR',
    });
  }

  // 4. ID validation
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

  // 5. Name, Version, Description
  if (!manifest.name || typeof manifest.name !== 'string' || manifest.name.trim() === '') {
    issues.push({
      code: 'INVALID_NAME',
      message: 'Plugin name is required and must be a non-empty string',
      field: 'name',
      severity: 'ERROR',
    });
  }

  if (!manifest.version || typeof manifest.version !== 'string' || !SEMVER_REGEX.test(manifest.version)) {
    issues.push({
      code: 'INVALID_VERSION',
      message: 'Plugin version must be a valid semver string (e.g. "1.0.0")',
      field: 'version',
      severity: 'ERROR',
    });
  }

  if (!manifest.description || typeof manifest.description !== 'string' || manifest.description.trim() === '') {
    issues.push({
      code: 'INVALID_DESCRIPTION',
      message: 'Plugin description is required and must be a non-empty string',
      field: 'description',
      severity: 'ERROR',
    });
  }

  // 6. Plugin Type validation
  if (!manifest.type || !VALID_TYPES.includes(manifest.type)) {
    issues.push({
      code: 'INVALID_TYPE',
      message: `Plugin type must be one of: ${VALID_TYPES.join(', ')}`,
      field: 'type',
      severity: 'ERROR',
    });
  }

  // 7. Category validation
  if (!manifest.category || !VALID_CATEGORIES.includes(manifest.category)) {
    issues.push({
      code: 'INVALID_CATEGORY',
      message: `Category must be one of: ${VALID_CATEGORIES.join(', ')}`,
      field: 'category',
      severity: 'ERROR',
    });
  }

  // 8. Homepage URL validation
  if (manifest.homepage !== undefined && !isValidHttpUrl(manifest.homepage)) {
    issues.push({
      code: 'INVALID_HOMEPAGE_URL',
      message: 'Homepage must be a valid http or https URL',
      field: 'homepage',
      severity: 'ERROR',
    });
  }

  // 9. Author & Legal metadata validation by PluginType
  if (!manifest.author) {
    issues.push({
      code: 'INVALID_AUTHOR',
      message: 'Author information is required',
      field: 'author',
      severity: 'ERROR',
    });
  } else if (typeof manifest.author === 'string') {
    if (manifest.author.trim() === '') {
      issues.push({
        code: 'INVALID_AUTHOR',
        message: 'Author string must not be empty',
        field: 'author',
        severity: 'ERROR',
      });
    }
  } else if (typeof manifest.author === 'object') {
    if (!isPlainObject(manifest.author)) {
      issues.push({
        code: 'NOT_PLAIN_OBJECT',
        message: 'Author object must be a plain object',
        field: 'author',
        severity: 'ERROR',
      });
    } else {
      if (!manifest.author.name || typeof manifest.author.name !== 'string' || manifest.author.name.trim() === '') {
        issues.push({
          code: 'INVALID_AUTHOR_NAME',
          message: 'Author object must include a valid non-empty name string',
          field: 'author.name',
          severity: 'ERROR',
        });
      }
      if (
        manifest.author.email !== undefined &&
        (typeof manifest.author.email !== 'string' || !EMAIL_REGEX.test(manifest.author.email))
      ) {
        issues.push({
          code: 'INVALID_AUTHOR_EMAIL',
          message: 'Author email must be a valid email address',
          field: 'author.email',
          severity: 'ERROR',
        });
      }
      if (manifest.author.url !== undefined && !isValidHttpUrl(manifest.author.url)) {
        issues.push({
          code: 'INVALID_AUTHOR_URL',
          message: 'Author url must be a valid http or https URL',
          field: 'author.url',
          severity: 'ERROR',
        });
      }
    }
  }

  const requiresLegal = ['OFFICIAL', 'THIRD_PARTY', 'COMMUNITY'].includes(manifest.type);
  if (requiresLegal && !manifest.legal) {
    issues.push({
      code: 'LEGAL_REQUIRED',
      message: `Plugin type '${manifest.type}' requires legal metadata with license`,
      field: 'legal',
      severity: 'ERROR',
    });
  } else if (manifest.legal) {
    if (!isPlainObject(manifest.legal)) {
      issues.push({
        code: 'NOT_PLAIN_OBJECT',
        message: 'Legal metadata must be a plain object',
        field: 'legal',
        severity: 'ERROR',
      });
    } else {
      if (!manifest.legal.license || typeof manifest.legal.license !== 'string' || manifest.legal.license.trim() === '') {
        issues.push({
          code: 'INVALID_LICENSE',
          message: 'Legal license must be a valid non-empty string',
          field: 'legal.license',
          severity: 'ERROR',
        });
      }
      if (manifest.legal.termsUrl !== undefined && !isValidHttpUrl(manifest.legal.termsUrl)) {
        issues.push({
          code: 'INVALID_LEGAL_URL',
          message: 'Legal termsUrl must be a valid http or https URL',
          field: 'legal.termsUrl',
          severity: 'ERROR',
        });
      }
      if (manifest.legal.privacyUrl !== undefined && !isValidHttpUrl(manifest.legal.privacyUrl)) {
        issues.push({
          code: 'INVALID_LEGAL_URL',
          message: 'Legal privacyUrl must be a valid http or https URL',
          field: 'legal.privacyUrl',
          severity: 'ERROR',
        });
      }
      if (manifest.legal.securityPolicyUrl !== undefined && !isValidHttpUrl(manifest.legal.securityPolicyUrl)) {
        issues.push({
          code: 'INVALID_LEGAL_URL',
          message: 'Legal securityPolicyUrl must be a valid http or https URL',
          field: 'legal.securityPolicyUrl',
          severity: 'ERROR',
        });
      }
    }
  }

  // 10. Lifecycle metadata
  if (manifest.lifecycle !== undefined) {
    if (!isPlainObject(manifest.lifecycle)) {
      issues.push({
        code: 'NOT_PLAIN_OBJECT',
        message: 'Lifecycle metadata must be a plain object',
        field: 'lifecycle',
        severity: 'ERROR',
      });
    } else if (!manifest.lifecycle.state || !VALID_LIFECYCLE_STATES.includes(manifest.lifecycle.state)) {
      issues.push({
        code: 'INVALID_LIFECYCLE_STATE',
        message: `Lifecycle state must be one of: ${VALID_LIFECYCLE_STATES.join(', ')}`,
        field: 'lifecycle.state',
        severity: 'ERROR',
      });
    }
  }

  // 11. Compatibility metadata
  if (manifest.compatibility !== undefined) {
    if (!isPlainObject(manifest.compatibility)) {
      issues.push({
        code: 'NOT_PLAIN_OBJECT',
        message: 'Compatibility metadata must be a plain object',
        field: 'compatibility',
        severity: 'ERROR',
      });
    } else {
      const { minCmsVersion, maxCmsVersion, supportedCmsVersions } = manifest.compatibility;
      if (minCmsVersion && (typeof minCmsVersion !== 'string' || !VERSION_RANGE_REGEX.test(minCmsVersion))) {
        issues.push({
          code: 'INVALID_COMPATIBILITY_VERSION',
          message: `minCmsVersion '${minCmsVersion}' is not a valid version or range syntax`,
          field: 'compatibility.minCmsVersion',
          severity: 'ERROR',
        });
      }
      if (maxCmsVersion && (typeof maxCmsVersion !== 'string' || !VERSION_RANGE_REGEX.test(maxCmsVersion))) {
        issues.push({
          code: 'INVALID_COMPATIBILITY_VERSION',
          message: `maxCmsVersion '${maxCmsVersion}' is not a valid version or range syntax`,
          field: 'compatibility.maxCmsVersion',
          severity: 'ERROR',
        });
      }
      if (supportedCmsVersions !== undefined) {
        if (!Array.isArray(supportedCmsVersions)) {
          issues.push({
            code: 'INVALID_SUPPORTED_CMS_VERSIONS',
            message: 'supportedCmsVersions must be an array',
            field: 'compatibility.supportedCmsVersions',
            severity: 'ERROR',
          });
        } else {
          const seenVersions = new Set<string>();
          for (let i = 0; i < supportedCmsVersions.length; i++) {
            const ver = supportedCmsVersions[i];
            if (!ver || typeof ver !== 'string' || !VERSION_RANGE_REGEX.test(ver)) {
              issues.push({
                code: 'INVALID_SUPPORTED_CMS_VERSION',
                message: `supportedCmsVersions at index ${i} is not a valid version or range string`,
                field: `compatibility.supportedCmsVersions[${i}]`,
                severity: 'ERROR',
              });
            } else {
              if (seenVersions.has(ver)) {
                issues.push({
                  code: 'DUPLICATE_SUPPORTED_CMS_VERSION',
                  message: `Duplicate version '${ver}' in supportedCmsVersions at index ${i}`,
                  field: `compatibility.supportedCmsVersions[${i}]`,
                  severity: 'ERROR',
                });
              }
              seenVersions.add(ver);
            }
          }
        }
      }
    }
  }

  // 12. Capabilities validation & Duplicate ID check
  if (manifest.capabilities !== undefined) {
    if (!Array.isArray(manifest.capabilities)) {
      issues.push({
        code: 'INVALID_CAPABILITIES',
        message: 'Capabilities must be an array',
        field: 'capabilities',
        severity: 'ERROR',
      });
    } else {
      const seenCapIds = new Set<string>();
      for (let i = 0; i < manifest.capabilities.length; i++) {
        const cap = manifest.capabilities[i];
        if (!cap || !isPlainObject(cap)) {
          issues.push({
            code: 'INVALID_CAPABILITY',
            message: `Capability at index ${i} must be a plain object`,
            field: `capabilities[${i}]`,
            severity: 'ERROR',
          });
          continue;
        }

        if (!cap.id || typeof cap.id !== 'string' || cap.id.trim() === '') {
          issues.push({
            code: 'INVALID_CAPABILITY_ID',
            message: `Capability at index ${i} must specify a valid id`,
            field: `capabilities[${i}].id`,
            severity: 'ERROR',
          });
        } else {
          if (seenCapIds.has(cap.id)) {
            issues.push({
              code: 'DUPLICATE_CAPABILITY_ID',
              message: `Duplicate capability ID '${cap.id}' at index ${i}`,
              field: `capabilities[${i}].id`,
              severity: 'ERROR',
            });
          }
          seenCapIds.add(cap.id);
        }

        if (!cap.name || typeof cap.name !== 'string' || cap.name.trim() === '') {
          issues.push({
            code: 'INVALID_CAPABILITY_NAME',
            message: `Capability at index ${i} must specify a valid name`,
            field: `capabilities[${i}].name`,
            severity: 'ERROR',
          });
        }

        if (!cap.type || !VALID_CAPABILITY_TYPES.includes(cap.type)) {
          issues.push({
            code: 'INVALID_CAPABILITY_TYPE',
            message: `Capability type at index ${i} must be one of: ${VALID_CAPABILITY_TYPES.join(', ')}`,
            field: `capabilities[${i}].type`,
            severity: 'ERROR',
          });
        }
      }
    }
  }

  // 13. Hooks validation & Duplicate Hook check
  if (manifest.hooks !== undefined) {
    if (!Array.isArray(manifest.hooks)) {
      issues.push({
        code: 'INVALID_HOOKS',
        message: 'Hooks must be an array',
        field: 'hooks',
        severity: 'ERROR',
      });
    } else {
      const seenHooks = new Set<string>();
      for (let i = 0; i < manifest.hooks.length; i++) {
        const hook = manifest.hooks[i];
        if (!hook || !isPlainObject(hook)) {
          issues.push({
            code: 'INVALID_HOOK',
            message: `Hook at index ${i} must be a plain object`,
            field: `hooks[${i}]`,
            severity: 'ERROR',
          });
          continue;
        }

        if (!hook.name || typeof hook.name !== 'string' || hook.name.trim() === '') {
          issues.push({
            code: 'INVALID_HOOK_NAME',
            message: `Hook at index ${i} must specify a valid name`,
            field: `hooks[${i}].name`,
            severity: 'ERROR',
          });
        }

        if (!hook.target || typeof hook.target !== 'string' || hook.target.trim() === '') {
          issues.push({
            code: 'INVALID_HOOK_TARGET',
            message: `Hook at index ${i} must specify a valid target`,
            field: `hooks[${i}].target`,
            severity: 'ERROR',
          });
        }

        if (hook.name && hook.target) {
          const sig = `${hook.name}:${hook.target}`;
          if (seenHooks.has(sig)) {
            issues.push({
              code: 'DUPLICATE_HOOK',
              message: `Duplicate hook registration for '${sig}' at index ${i}`,
              field: `hooks[${i}]`,
              severity: 'ERROR',
            });
          }
          seenHooks.add(sig);
        }
      }
    }
  }

  // 14. Permissions & Entitlements array & duplicate validation
  if (manifest.requiredPermissions !== undefined) {
    if (!Array.isArray(manifest.requiredPermissions)) {
      issues.push({
        code: 'INVALID_REQUIRED_PERMISSIONS',
        message: 'requiredPermissions must be an array',
        field: 'requiredPermissions',
        severity: 'ERROR',
      });
    } else {
      const seenPerms = new Set<string>();
      for (let i = 0; i < manifest.requiredPermissions.length; i++) {
        const perm = manifest.requiredPermissions[i];
        if (!perm || typeof perm !== 'string' || perm.trim() === '') {
          issues.push({
            code: 'INVALID_PERMISSION',
            message: `requiredPermissions at index ${i} must be a non-empty string`,
            field: `requiredPermissions[${i}]`,
            severity: 'ERROR',
          });
        } else {
          if (seenPerms.has(perm)) {
            issues.push({
              code: 'DUPLICATE_PERMISSION',
              message: `Duplicate requiredPermission '${perm}' at index ${i}`,
              field: `requiredPermissions[${i}]`,
              severity: 'ERROR',
            });
          }
          seenPerms.add(perm);
        }
      }
    }
  }

  if (manifest.requiredEntitlements !== undefined) {
    if (!Array.isArray(manifest.requiredEntitlements)) {
      issues.push({
        code: 'INVALID_REQUIRED_ENTITLEMENTS',
        message: 'requiredEntitlements must be an array',
        field: 'requiredEntitlements',
        severity: 'ERROR',
      });
    } else {
      const seenEnts = new Set<string>();
      for (let i = 0; i < manifest.requiredEntitlements.length; i++) {
        const ent = manifest.requiredEntitlements[i];
        if (!ent || typeof ent !== 'string' || ent.trim() === '') {
          issues.push({
            code: 'INVALID_ENTITLEMENT',
            message: `requiredEntitlements at index ${i} must be a non-empty string`,
            field: `requiredEntitlements[${i}]`,
            severity: 'ERROR',
          });
        } else {
          if (seenEnts.has(ent)) {
            issues.push({
              code: 'DUPLICATE_ENTITLEMENT',
              message: `Duplicate requiredEntitlement '${ent}' at index ${i}`,
              field: `requiredEntitlements[${i}]`,
              severity: 'ERROR',
            });
          }
          seenEnts.add(ent);
        }
      }
    }
  }

  // 15. Dependencies validation & duplicate check
  if (manifest.dependencies !== undefined) {
    if (!Array.isArray(manifest.dependencies)) {
      issues.push({
        code: 'INVALID_DEPENDENCIES',
        message: 'Dependencies must be an array',
        field: 'dependencies',
        severity: 'ERROR',
      });
    } else {
      const seenDepIds = new Set<string>();

      for (let i = 0; i < manifest.dependencies.length; i++) {
        const dep = manifest.dependencies[i];
        if (!dep || !isPlainObject(dep)) {
          issues.push({
            code: 'INVALID_DEPENDENCY',
            message: `Dependency at index ${i} must be a plain object`,
            field: `dependencies[${i}]`,
            severity: 'ERROR',
          });
          continue;
        }

        if (!dep.pluginId || typeof dep.pluginId !== 'string' || dep.pluginId.trim() === '') {
          issues.push({
            code: 'INVALID_DEPENDENCY_ID',
            message: `Dependency at index ${i} must specify a valid pluginId`,
            field: `dependencies[${i}].pluginId`,
            severity: 'ERROR',
          });
        } else {
          if (seenDepIds.has(dep.pluginId)) {
            issues.push({
              code: 'DUPLICATE_DEPENDENCY',
              message: `Duplicate dependency on '${dep.pluginId}' at index ${i}`,
              field: `dependencies[${i}].pluginId`,
              severity: 'ERROR',
            });
          }
          seenDepIds.add(dep.pluginId);
        }

        if (!dep.kind || !VALID_DEPENDENCY_KINDS.includes(dep.kind)) {
          issues.push({
            code: 'INVALID_DEPENDENCY_KIND',
            message: `Dependency kind at index ${i} must be one of: ${VALID_DEPENDENCY_KINDS.join(', ')}`,
            field: `dependencies[${i}].kind`,
            severity: 'ERROR',
          });
        }

        if (dep.versionRange && (typeof dep.versionRange !== 'string' || !VERSION_RANGE_REGEX.test(dep.versionRange))) {
          issues.push({
            code: 'INVALID_VERSION_RANGE',
            message: `Dependency versionRange '${dep.versionRange}' at index ${i} is invalid`,
            field: `dependencies[${i}].versionRange`,
            severity: 'ERROR',
          });
        }
      }
    }
  }

  // 16. Config schema sensitive field default value check & plain object fields
  if (manifest.configSchema !== undefined) {
    if (!isPlainObject(manifest.configSchema)) {
      issues.push({
        code: 'NOT_PLAIN_OBJECT',
        message: 'configSchema must be a plain object',
        field: 'configSchema',
        severity: 'ERROR',
      });
    } else if (Array.isArray(manifest.configSchema.fields)) {
      for (const field of manifest.configSchema.fields) {
        if (
          field &&
          field.sensitive &&
          field.defaultValue !== undefined &&
          field.defaultValue !== null &&
          field.defaultValue !== ''
        ) {
          issues.push({
            code: 'MANIFEST_CONTAINS_SECRETS',
            message: `Sensitive config field '${field.key}' must not provide a hardcoded secret defaultValue in manifest`,
            field: `configSchema.fields.${field.key}`,
            severity: 'ERROR',
          });
        }
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
  registry: PluginRegistry
): DependencyCheckResult {
  if (!registry) {
    throw new Error('PluginRegistry instance must be explicitly provided to validatePluginDependencies');
  }

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
    const requiredDeps = (manifest.dependencies || []).filter((d) => d.kind === 'REQUIRED');

    for (const dep of requiredDeps) {
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
