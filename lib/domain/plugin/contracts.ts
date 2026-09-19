export type PluginType =
  | 'OFFICIAL'
  | 'THIRD_PARTY'
  | 'COMMUNITY'
  | 'PRIVATE'
  | 'EXPERIMENTAL';

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

export type DependencyKind = 'REQUIRED' | 'OPTIONAL' | 'INTEGRATION';

export type PluginLifecycleState =
  | 'DRAFT'
  | 'STABLE'
  | 'DEPRECATED'
  | 'ARCHIVED';

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
  kind: DependencyKind;
  versionRange?: string;
}

export interface PluginConfigField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect';
  defaultValue?: any;
  required?: boolean;
  options?: { label: string; value: string }[];
  description?: string;
  sensitive?: boolean;
}

export interface PluginConfigSchema {
  fields: PluginConfigField[];
}

export interface PluginAuthor {
  name: string;
  email?: string;
  url?: string;
}

export interface PluginLegalMetadata {
  license: string;
  termsUrl?: string;
  privacyUrl?: string;
  securityPolicyUrl?: string;
}

export interface PluginLifecycleMetadata {
  state: PluginLifecycleState;
  deprecatedAt?: string;
  sunsetAt?: string;
  deprecationNotice?: string;
}

export interface PluginCompatibilityMetadata {
  minCmsVersion?: string;
  maxCmsVersion?: string;
  supportedCmsVersions?: string[];
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  type: PluginType;
  category: PluginCategory;
  author: string | PluginAuthor;
  homepage?: string;
  legal?: PluginLegalMetadata;
  lifecycle?: PluginLifecycleMetadata;
  compatibility?: PluginCompatibilityMetadata;
  dependencies?: PluginDependency[];
  capabilities?: PluginCapability[];
  hooks?: PluginHook[];
  requiredPermissions?: string[];
  requiredEntitlements?: string[];
  configSchema?: PluginConfigSchema;
  isCore?: false;
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
