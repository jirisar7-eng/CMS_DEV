export type CapabilityVisibility = 'OWNER_INTERNAL' | 'SAFE_PUBLIC_METADATA';

export interface RawCapabilityRecord {
  capability_id: string;
  canonical_owner_paths: string[];
  data_models: string[];
  api_boundaries: string[];
  depends_on_capabilities: string[];
  project_scoped: boolean;
  security_boundary: string;
  visibility: CapabilityVisibility;
  source_tasks: string[];
  last_merge_sha: string;
  ssot_role: string;
}

export interface RawCapabilitiesRegistry {
  registry_version: string;
  capabilities: RawCapabilityRecord[];
}

export interface RawTaskRecord {
  record_version: string;
  pr_number: number;
  pr_title: string;
  task_id: string | null;
  branch: string;
  base_sha: string;
  source_head_sha: string;
  merge_sha: string;
  merged_at: string;
  capsule_present: boolean;
  capsule_declared_status: string | null;
  derived_status: string;
  allowed_paths: string[];
  actual_changed_files: string[];
  capsule_sha256: string | null;
  touches_capabilities: string[];
  depends_on_tasks: string[];
  evidence_source: string;
}

export interface RawTasksRegistry {
  registry_version: string;
  total_tasks: number;
  tasks: RawTaskRecord[];
}

/**
 * Basic capability record stripped of sensitive architectural and Git internals:
 * - NO canonical owner filesystem paths
 * - NO database models
 * - NO internal API boundaries
 * - NO security boundary details
 * - NO source task / capsule references
 * - NO Git SHAs
 */
export interface BasicCapabilityRecord {
  capability_id: string;
  visibility: CapabilityVisibility;
  project_scoped: boolean;
  depends_on_capabilities: string[];
}

export interface BasicSystemMap {
  view: 'basic';
  registry_version: string;
  total_capabilities: number;
  capabilities: BasicCapabilityRecord[];
}

/**
 * Full internal capability record with all architectural governance metadata.
 */
export type InternalCapabilityRecord = RawCapabilityRecord;
export type InternalTaskRecord = RawTaskRecord;

export interface InternalSystemMap {
  view: 'internal';
  registry_version: string;
  total_capabilities: number;
  capabilities: InternalCapabilityRecord[];
  total_tasks: number;
  tasks: InternalTaskRecord[];
}

export type SystemMapAccessLevel = 'basic' | 'internal';

export class SystemMapRegistryError extends Error {
  constructor(message: string, public readonly causeError?: unknown) {
    super(message);
    this.name = 'SystemMapRegistryError';
  }
}
