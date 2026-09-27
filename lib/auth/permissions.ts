// Canonical runtime catalog of all Synthesis CMS permission keys.
// This module is strictly dependency-free (no Prisma, no session, no Next.js runtime).

export const PERMISSION_KEYS = [
  'admin.access',
  'brand.view',
  'brand.edit',
  'brand.publish',
  'brand.rollback',
  'media.view',
  'media.create',
  'media.edit',
  'media.delete',
  'users.view',
  'users.manage',
  'roles.view',
  'roles.manage',
  'audit.view',
  'system.manage',
  'projects.view',
  'projects.manage',
  'content.view',
  'content.create',
  'content.edit',
  'content.review',
  'content.approve',
  'content.publish',
  'content.rollback',
  'content.archive',
  'navigation.view',
  'navigation.create',
  'navigation.edit',
  'navigation.delete',
  'navigation.publish',
  'seo.read',
  'seo.update',
  'seo.manage_defaults',
  'redirects.read',
  'redirects.create',
  'redirects.update',
  'redirects.delete',
  'search.read_admin',
  'search.manage',
  'search.reindex',
  'system_map.read_basic',
  'system_map.read_internal',
  'plugin.read',
  'plugin.manage',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

const PERMISSION_KEYS_SET = new Set<string>(PERMISSION_KEYS);

/**
 * Validates whether an arbitrary string/value is a canonical PermissionKey.
 */
export function isPermissionKey(val: unknown): val is PermissionKey {
  return typeof val === 'string' && PERMISSION_KEYS_SET.has(val);
}

/**
 * Sensitive permissions that MUST NOT be granted through roles (direct user override only).
 */
export const ROLE_GRANT_EXCLUDED_PERMISSIONS: readonly PermissionKey[] = [
  'system_map.read_internal',
] as const;

const ROLE_GRANT_EXCLUDED_SET = new Set<string>(ROLE_GRANT_EXCLUDED_PERMISSIONS);

/**
 * Checks whether a permission key is excluded from role-based assignment.
 */
export function isRoleGrantExcludedPermission(val: unknown): boolean {
  return typeof val === 'string' && ROLE_GRANT_EXCLUDED_SET.has(val);
}
