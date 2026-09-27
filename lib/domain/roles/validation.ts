import {
  PermissionKey,
  isPermissionKey,
  isRoleGrantExcludedPermission,
} from '@/lib/auth/permissions';
import { RoleServiceError } from './types';

// Reject control characters, require 2..50 characters
const ROLE_NAME_REGEX = /^[^\x00-\x1F\x7F]{2,50}$/;

export function validateRoleName(name: unknown): string {
  if (typeof name !== 'string') {
    throw new RoleServiceError('INVALID_INPUT', 'Role name must be a string', 400);
  }

  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 50) {
    throw new RoleServiceError(
      'INVALID_INPUT',
      'Role name must be between 2 and 50 characters',
      400
    );
  }

  if (!ROLE_NAME_REGEX.test(trimmed)) {
    throw new RoleServiceError(
      'INVALID_INPUT',
      'Role name contains invalid characters',
      400
    );
  }

  return trimmed;
}

export function validateRoleDescription(description: unknown): string | null {
  if (description === undefined || description === null || description === '') {
    return null;
  }

  if (typeof description !== 'string') {
    throw new RoleServiceError(
      'INVALID_INPUT',
      'Role description must be a string or null',
      400
    );
  }

  const trimmed = description.trim();
  if (trimmed.length > 500) {
    throw new RoleServiceError(
      'INVALID_INPUT',
      'Role description cannot exceed 500 characters',
      400
    );
  }

  return trimmed || null;
}

export function validatePermissionKeys(keys: unknown): PermissionKey[] {
  if (!Array.isArray(keys)) {
    throw new RoleServiceError(
      'INVALID_INPUT',
      'Permissions must be provided as an array',
      400
    );
  }

  const seen = new Set<string>();
  const validated: PermissionKey[] = [];

  for (const k of keys) {
    if (typeof k !== 'string') {
      throw new RoleServiceError(
        'INVALID_INPUT',
        'Each permission key must be a string',
        400
      );
    }

    const trimmed = k.trim();
    if (!isPermissionKey(trimmed)) {
      throw new RoleServiceError(
        'UNKNOWN_PERMISSION',
        `Unknown permission key: ${trimmed}`,
        400
      );
    }

    if (isRoleGrantExcludedPermission(trimmed)) {
      throw new RoleServiceError(
        'FORBIDDEN',
        `Permission ${trimmed} is sensitive and cannot be granted via roles`,
        403
      );
    }

    if (seen.has(trimmed)) {
      throw new RoleServiceError(
        'INVALID_INPUT',
        `Duplicate permission key specified: ${trimmed}`,
        400
      );
    }

    seen.add(trimmed);
    validated.push(trimmed);
  }

  return validated;
}
