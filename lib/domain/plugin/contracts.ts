export type PluginCategory =
  | 'SEO'
  | 'MARKETING'
  | 'ANALYTICS'
  | 'INTEGRATION'
  | 'UTILITY'
  | 'CONTENT'
  | 'WORKFLOW'
  | 'SECURITY';

export type PluginCapabilityType =
  | 'UI_PANEL'
  | 'REST_API'
  | 'HOOK'
  | 'CRON_TASK'
  | 'BACKGROUND_SERVICE'
  | 'COMPOSER_BLOCK';

export interface PluginCapability {
  id: string;
  type: PluginCapabilityType;
  name: string;
  description?: string;
  target?: string;
}

export interface PluginHook {
  name: string;
  target: string;
  priority?: number;
}

export interface PluginDependency {
  pluginId: string;
  versionRange?: string;
  optional?: boolean; // Default false (REQUIRED dependency)
}

export interface PluginConfigField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect';
  defaultValue?: any;
  required?: boolean;
  options?: { label: string; value: string }[];
  description?: string;
  sensitive?: boolean; // Sensitive fields must NOT include hardcoded secrets in manifest
}

export interface PluginConfigSchema {
  fields: PluginConfigField[];
}

export interface PluginAuthor {
  name: string;
  email?: string;
  url?: string;
}

export interface PluginManifest {
  /** Unique plugin identifier in slug format (e.g. "seo-analyzer") */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Semver version string (e.g. "1.0.0") */
  version: string;
  /** Functional description of the plugin */
  description: string;
  /** Plugin category */
  category: PluginCategory;
  /** Author or maintainer information */
  author: string | PluginAuthor;
  /** Documentation or home page URL */
  homepage?: string;
  /** Open source or commercial license identifier */
  license?: string;
  /** Minimum compatible CMS core version */
  minCmsVersion?: string;
  /** Maximum compatible CMS core version */
  maxCmsVersion?: string;
  /** Dependencies on other plugins */
  dependencies?: PluginDependency[];
  /** Extension capabilities exported by this plugin */
  capabilities?: PluginCapability[];
  /** System event hooks subscribed by this plugin */
  hooks?: PluginHook[];
  /** RBAC permissions required to configure or manage this plugin */
  requiredPermissions?: string[];
  /** Project entitlements required to enable this plugin */
  requiredEntitlements?: string[];
  /** Declarative configuration schema */
  configSchema?: PluginConfigSchema;
  /** Core module flag - plugins are extension modules, NOT core system modules */
  isCore?: false;
  /** Experimental / Beta release indicator */
  experimental?: boolean;
}

export interface ValidationIssue {
  code: string;
  message: string;
  field?: string;
  severity: 'ERROR' | 'WARNING';
}

export interface ManifestValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface DependencyCheckResult {
  valid: boolean;
  missingDependencies: string[];
  circularDependencies: string[][];
  issues: ValidationIssue[];
}
