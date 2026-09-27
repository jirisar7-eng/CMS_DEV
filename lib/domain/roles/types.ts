import { PermissionKey } from '@/lib/auth/permissions';

export interface SafeRoleRecord {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  permissions: PermissionKey[];
  usersCount: number;
}

export interface CreateRoleInput {
  name: string;
  description?: string | null;
}

export interface UpdateRoleInput {
  name?: string;
  description?: string | null;
}

export interface SafeUserRoleAssignment {
  id: string;
  userId: string;
  roleId: string;
  roleName: string;
  isSystem: boolean;
  projectId: string | null;
  createdAt: string;
}

export interface SafeUserPermissionOverride {
  id: string;
  userId: string;
  permissionId: string;
  permissionKey: PermissionKey;
  isGranted: boolean;
  projectId: string | null;
  createdAt: string;
}

export type RoleErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'NAME_EXISTS'
  | 'SYSTEM_ROLE_IMMUTABLE'
  | 'ROLE_IN_USE'
  | 'UNKNOWN_PERMISSION'
  | 'CANNOT_MUTATE_HELD_ROLE'
  | 'PERMISSION_ENVELOPE_EXCEEDED'
  | 'SELF_MUTATION_FORBIDDEN'
  | 'CROSS_PROJECT_FORBIDDEN'
  | 'DATABASE_ERROR';

export class RoleServiceError extends Error {
  readonly code: RoleErrorCode;
  readonly statusCode: number;

  constructor(code: RoleErrorCode, message: string, statusCode: number = 400) {
    super(message);
    this.name = 'RoleServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
