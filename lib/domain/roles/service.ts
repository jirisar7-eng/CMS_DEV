import { logAudit } from '@/lib/auth/audit';
import {
  PermissionKey,
  isPermissionKey,
  isRoleGrantExcludedPermission,
} from '@/lib/auth/permissions';
import {
  CreateRoleInput,
  RoleServiceError,
  SafeRoleRecord,
  SafeUserPermissionOverride,
  SafeUserRoleAssignment,
  UpdateRoleInput,
} from './types';
import {
  validatePermissionKeys,
  validateRoleDescription,
  validateRoleName,
} from './validation';

export interface RoleServiceDependencies {
  db?: any;
  hasPermissionFn?: (
    userId: string,
    permissionKey: PermissionKey,
    projectId?: string | null
  ) => Promise<boolean>;
}

export class RoleService {
  private dbStore: any;
  private hasPermissionFn?: (
    userId: string,
    permissionKey: PermissionKey,
    projectId?: string | null
  ) => Promise<boolean>;

  constructor(deps?: RoleServiceDependencies) {
    this.dbStore = deps?.db ?? null;
    this.hasPermissionFn = deps?.hasPermissionFn;
  }

  private async getDb(): Promise<any> {
    if (this.dbStore) return this.dbStore;
    const { prisma } = await import('@/lib/db');
    return prisma;
  }

  private async checkPermission(
    userId: string,
    permissionKey: PermissionKey,
    projectId?: string | null
  ): Promise<boolean> {
    if (this.hasPermissionFn) {
      return this.hasPermissionFn(userId, permissionKey, projectId);
    }
    const { hasPermission } = await import('@/lib/auth/rbac');
    return hasPermission(userId, permissionKey, projectId);
  }

  // ==========================================
  // 1. Role Definitions & Permissions
  // ==========================================

  async listRoles(actorId: string): Promise<SafeRoleRecord[]> {
    if (!actorId) {
      throw new RoleServiceError('UNAUTHENTICATED', 'Authentication required', 401);
    }

    const canView =
      (await this.checkPermission(actorId, 'roles.view', null)) ||
      (await this.checkPermission(actorId, 'roles.manage', null));

    if (!canView) {
      throw new RoleServiceError('FORBIDDEN', 'Insufficient permissions to view roles', 403);
    }

    const db = await this.getDb();
    const roles = await db.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        users: {
          select: { id: true },
        },
      },
    });

    return roles.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
      permissions: r.permissions.map((rp: any) => rp.permission.key as PermissionKey),
      usersCount: r.users?.length ?? 0,
    }));
  }

  async getRole(roleId: string, actorId: string): Promise<SafeRoleRecord> {
    if (!actorId) {
      throw new RoleServiceError('UNAUTHENTICATED', 'Authentication required', 401);
    }

    const canView =
      (await this.checkPermission(actorId, 'roles.view', null)) ||
      (await this.checkPermission(actorId, 'roles.manage', null));

    if (!canView) {
      throw new RoleServiceError('FORBIDDEN', 'Insufficient permissions to view role', 403);
    }

    const db = await this.getDb();
    const role = await db.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        users: {
          select: { id: true },
        },
      },
    });

    if (!role) {
      throw new RoleServiceError('NOT_FOUND', 'Role not found', 404);
    }

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      createdAt: role.createdAt instanceof Date ? role.createdAt.toISOString() : String(role.createdAt),
      updatedAt: role.updatedAt instanceof Date ? role.updatedAt.toISOString() : String(role.updatedAt),
      permissions: role.permissions.map((rp: any) => rp.permission.key as PermissionKey),
      usersCount: role.users?.length ?? 0,
    };
  }

  async createRole(input: CreateRoleInput, actorId: string): Promise<SafeRoleRecord> {
    if (!actorId) {
      throw new RoleServiceError('UNAUTHENTICATED', 'Authentication required', 401);
    }

    const canManage = await this.checkPermission(actorId, 'roles.manage', null);
    if (!canManage) {
      throw new RoleServiceError('FORBIDDEN', 'Insufficient permissions to create role', 403);
    }

    const name = validateRoleName(input.name);
    const description = validateRoleDescription(input.description);

    const db = await this.getDb();
    const existing = await db.role.findUnique({
      where: { name },
    });

    if (existing) {
      throw new RoleServiceError('NAME_EXISTS', `Role with name "${name}" already exists`, 409);
    }

    const executeTransaction = async (tx: any) => {
      const created = await tx.role.create({
        data: {
          name,
          description,
          isSystem: false,
        },
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      });

      await logAudit({
        action: 'ROLE_CREATED',
        scopeType: 'SYSTEM',
        resourceType: 'ROLE',
        resourceId: created.id,
        actorId,
        metadata: {
          roleId: created.id,
          name: created.name,
          description: created.description,
          isSystem: false,
        },
        tx,
      });

      return created;
    };

    const role = db.$transaction
      ? await db.$transaction(executeTransaction)
      : await executeTransaction(db);

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      createdAt: role.createdAt instanceof Date ? role.createdAt.toISOString() : String(role.createdAt),
      updatedAt: role.updatedAt instanceof Date ? role.updatedAt.toISOString() : String(role.updatedAt),
      permissions: [],
      usersCount: 0,
    };
  }

  async updateRole(roleId: string, input: UpdateRoleInput, actorId: string): Promise<SafeRoleRecord> {
    if (!actorId) {
      throw new RoleServiceError('UNAUTHENTICATED', 'Authentication required', 401);
    }

    const canManage = await this.checkPermission(actorId, 'roles.manage', null);
    if (!canManage) {
      throw new RoleServiceError('FORBIDDEN', 'Insufficient permissions to update role', 403);
    }

    const db = await this.getDb();
    const role = await db.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: { include: { permission: true } },
        users: { select: { id: true } },
      },
    });

    if (!role) {
      throw new RoleServiceError('NOT_FOUND', 'Role not found', 404);
    }

    if (role.isSystem) {
      throw new RoleServiceError('SYSTEM_ROLE_IMMUTABLE', 'System roles cannot be modified or renamed', 403);
    }

    const updates: { name?: string; description?: string | null } = {};
    if (input.name !== undefined) {
      const newName = validateRoleName(input.name);
      if (newName !== role.name) {
        const conflict = await db.role.findUnique({ where: { name: newName } });
        if (conflict && conflict.id !== roleId) {
          throw new RoleServiceError('NAME_EXISTS', `Role with name "${newName}" already exists`, 409);
        }
        updates.name = newName;
      }
    }

    if (input.description !== undefined) {
      updates.description = validateRoleDescription(input.description);
    }

    const executeTransaction = async (tx: any) => {
      const updated = await tx.role.update({
        where: { id: roleId },
        data: updates,
        include: {
          permissions: { include: { permission: true } },
          users: { select: { id: true } },
        },
      });

      await logAudit({
        action: 'ROLE_UPDATED',
        scopeType: 'SYSTEM',
        resourceType: 'ROLE',
        resourceId: roleId,
        actorId,
        metadata: {
          roleId,
          name: updated.name,
          description: updated.description,
          previousName: role.name,
        },
        tx,
      });

      return updated;
    };

    const updated = db.$transaction
      ? await db.$transaction(executeTransaction)
      : await executeTransaction(db);

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      isSystem: updated.isSystem,
      createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : String(updated.createdAt),
      updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : String(updated.updatedAt),
      permissions: updated.permissions.map((rp: any) => rp.permission.key as PermissionKey),
      usersCount: updated.users?.length ?? 0,
    };
  }

  async deleteRole(roleId: string, actorId: string): Promise<void> {
    if (!actorId) {
      throw new RoleServiceError('UNAUTHENTICATED', 'Authentication required', 401);
    }

    const canManage = await this.checkPermission(actorId, 'roles.manage', null);
    if (!canManage) {
      throw new RoleServiceError('FORBIDDEN', 'Insufficient permissions to delete role', 403);
    }

    const db = await this.getDb();
    const role = await db.role.findUnique({
      where: { id: roleId },
    });

    if (!role) {
      throw new RoleServiceError('NOT_FOUND', 'Role not found', 404);
    }

    if (role.isSystem) {
      throw new RoleServiceError('SYSTEM_ROLE_IMMUTABLE', 'System roles cannot be deleted', 403);
    }

    const assignmentCount = await db.userRole.count({
      where: { roleId },
    });

    if (assignmentCount > 0) {
      throw new RoleServiceError('ROLE_IN_USE', `Cannot delete role with ${assignmentCount} active user assignments`, 409);
    }

    const executeTransaction = async (tx: any) => {
      await tx.role.delete({
        where: { id: roleId },
      });

      await logAudit({
        action: 'ROLE_DELETED',
        scopeType: 'SYSTEM',
        resourceType: 'ROLE',
        resourceId: roleId,
        actorId,
        metadata: {
          roleId,
          name: role.name,
        },
        tx,
      });
    };

    if (db.$transaction) {
      await db.$transaction(executeTransaction);
    } else {
      await executeTransaction(db);
    }
  }

  async updateRolePermissions(
    roleId: string,
    rawPermissionKeys: unknown,
    actorId: string
  ): Promise<SafeRoleRecord> {
    if (!actorId) {
      throw new RoleServiceError('UNAUTHENTICATED', 'Authentication required', 401);
    }

    const canManage = await this.checkPermission(actorId, 'roles.manage', null);
    if (!canManage) {
      throw new RoleServiceError('FORBIDDEN', 'Insufficient permissions to update role permissions', 403);
    }

    const db = await this.getDb();
    const role = await db.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: { include: { permission: true } },
        users: { select: { id: true } },
      },
    });

    if (!role) {
      throw new RoleServiceError('NOT_FOUND', 'Role not found', 404);
    }

    if (role.isSystem) {
      throw new RoleServiceError('SYSTEM_ROLE_IMMUTABLE', 'System role permissions are immutable', 403);
    }

    const validatedKeys = validatePermissionKeys(rawPermissionKeys);

    // Rule: Actor cannot mutate the permission matrix of any role they currently hold
    const actorMembership = await db.userRole.findFirst({
      where: {
        userId: actorId,
        roleId,
      },
    });

    if (actorMembership) {
      throw new RoleServiceError(
        'CANNOT_MUTATE_HELD_ROLE',
        'Cannot modify permissions of a role currently assigned to your account',
        403
      );
    }

    // Permission envelope: For every newly added permission, actor must possess it at GLOBAL scope
    const existingKeys = new Set(role.permissions.map((rp: any) => rp.permission.key));
    for (const key of validatedKeys) {
      if (!existingKeys.has(key)) {
        const actorHas = await this.checkPermission(actorId, key, null);
        if (!actorHas) {
          throw new RoleServiceError(
            'PERMISSION_ENVELOPE_EXCEEDED',
            `Cannot grant permission "${key}" which you do not possess`,
            403
          );
        }
      }
    }

    // Fetch Permission entities from DB
    const dbPermissions = await db.permission.findMany({
      where: {
        key: { in: validatedKeys },
      },
    });

    if (dbPermissions.length !== validatedKeys.length) {
      throw new RoleServiceError('UNKNOWN_PERMISSION', 'One or more permissions do not exist in database', 400);
    }

    const executeTransaction = async (tx: any) => {
      // 1. Delete current role permissions
      await tx.rolePermission.deleteMany({
        where: { roleId },
      });

      // 2. Insert new role permissions
      if (dbPermissions.length > 0) {
        await tx.rolePermission.createMany({
          data: dbPermissions.map((p: any) => ({
            roleId,
            permissionId: p.id,
          })),
        });
      }

      // 3. Log audit
      const added = validatedKeys.filter((k) => !existingKeys.has(k));
      const removed = Array.from(existingKeys).filter((k) => !validatedKeys.includes(k as any));

      await logAudit({
        action: 'ROLE_PERMISSIONS_CHANGED',
        scopeType: 'SYSTEM',
        resourceType: 'ROLE',
        resourceId: roleId,
        actorId,
        metadata: {
          roleId,
          roleName: role.name,
          permissionKeys: validatedKeys,
          addedCount: added.length,
          removedCount: removed.length,
        },
        tx,
      });

      return tx.role.findUnique({
        where: { id: roleId },
        include: {
          permissions: { include: { permission: true } },
          users: { select: { id: true } },
        },
      });
    };

    const updated = db.$transaction
      ? await db.$transaction(executeTransaction)
      : await executeTransaction(db);

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      isSystem: updated.isSystem,
      createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : String(updated.createdAt),
      updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : String(updated.updatedAt),
      permissions: updated.permissions.map((rp: any) => rp.permission.key as PermissionKey),
      usersCount: updated.users?.length ?? 0,
    };
  }

  // ==========================================
  // 2. User Role Assignments
  // ==========================================

  async listUserRoles(
    targetUserId: string,
    projectId: string | null | undefined,
    actorId: string
  ): Promise<SafeUserRoleAssignment[]> {
    if (!actorId) {
      throw new RoleServiceError('UNAUTHENTICATED', 'Authentication required', 401);
    }

    const normalizedProjectId = projectId?.trim() || null;
    const canView =
      (await this.checkPermission(actorId, 'roles.view', normalizedProjectId)) ||
      (await this.checkPermission(actorId, 'roles.manage', normalizedProjectId));

    if (!canView) {
      throw new RoleServiceError('FORBIDDEN', 'Insufficient permissions to view user roles', 403);
    }

    const db = await this.getDb();
    const where: any = { userId: targetUserId };
    if (normalizedProjectId !== undefined) {
      where.projectId = normalizedProjectId;
    }

    const assignments = await db.userRole.findMany({
      where,
      include: {
        role: true,
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    return assignments.map((a: any) => ({
      id: a.id,
      userId: a.userId,
      roleId: a.roleId,
      roleName: a.role.name,
      isSystem: a.role.isSystem,
      projectId: a.projectId,
      createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
    }));
  }

  async assignUserRole(
    targetUserId: string,
    roleId: string,
    projectId: string | null | undefined,
    actorId: string
  ): Promise<SafeUserRoleAssignment> {
    if (!actorId) {
      throw new RoleServiceError('UNAUTHENTICATED', 'Authentication required', 401);
    }

    if (targetUserId === actorId) {
      throw new RoleServiceError('SELF_MUTATION_FORBIDDEN', 'Cannot modify role assignments for your own account', 403);
    }

    const normalizedProjectId = projectId?.trim() || null;

    // Check authorization for scope
    const canManage = await this.checkPermission(actorId, 'roles.manage', normalizedProjectId);
    if (!canManage) {
      throw new RoleServiceError(
        'FORBIDDEN',
        normalizedProjectId
          ? `Insufficient permissions to assign roles in project ${normalizedProjectId}`
          : 'Insufficient permissions for global role assignment',
        403
      );
    }

    const db = await this.getDb();
    const role = await db.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: { include: { permission: true } },
      },
    });

    if (!role) {
      throw new RoleServiceError('NOT_FOUND', 'Role not found', 404);
    }

    // System role protection: Global only, requires system.manage
    if (role.isSystem) {
      if (normalizedProjectId !== null) {
        throw new RoleServiceError('FORBIDDEN', 'System roles cannot be assigned to project scopes', 403);
      }
      const canManageSystem = await this.checkPermission(actorId, 'system.manage', null);
      if (!canManageSystem) {
        throw new RoleServiceError('FORBIDDEN', 'Assigning system roles requires system.manage permission', 403);
      }
    }

    // Verify target user exists and is active
    const user = await db.user.findUnique({
      where: { id: targetUserId },
    });
    if (!user) {
      throw new RoleServiceError('NOT_FOUND', 'User not found', 404);
    }

    // Verify project exists if non-null
    if (normalizedProjectId) {
      const project = await db.project.findUnique({
        where: { id: normalizedProjectId },
      });
      if (!project) {
        throw new RoleServiceError('NOT_FOUND', 'Target project not found', 404);
      }
    }

    // Permission envelope: Actor must possess all permissions of this role at the assignment scope
    for (const rp of role.permissions) {
      const permKey = rp.permission.key as PermissionKey;
      const actorHas = await this.checkPermission(actorId, permKey, normalizedProjectId);
      if (!actorHas) {
        throw new RoleServiceError(
          'PERMISSION_ENVELOPE_EXCEEDED',
          `Cannot assign role containing "${permKey}" which you do not possess at target scope`,
          403
        );
      }
    }

    const executeTransaction = async (tx: any) => {
      // Check existing assignment
      const existing = await tx.userRole.findFirst({
        where: {
          userId: targetUserId,
          roleId,
          projectId: normalizedProjectId,
        },
      });

      if (existing) {
        return existing;
      }

      const assignment = await tx.userRole.create({
        data: {
          userId: targetUserId,
          roleId,
          projectId: normalizedProjectId,
        },
        include: { role: true },
      });

      await logAudit({
        action: 'ROLE_ASSIGNED',
        scopeType: normalizedProjectId ? 'PROJECT' : 'SYSTEM',
        scopeId: normalizedProjectId,
        resourceType: 'USER_ROLE',
        resourceId: assignment.id,
        actorId,
        metadata: {
          targetUserId,
          role: role.name,
          roleId,
          roleName: role.name,
          projectId: normalizedProjectId,
        },
        tx,
      });

      return assignment;
    };

    const assignment = db.$transaction
      ? await db.$transaction(executeTransaction)
      : await executeTransaction(db);

    return {
      id: assignment.id,
      userId: assignment.userId,
      roleId: assignment.roleId,
      roleName: role.name,
      isSystem: role.isSystem,
      projectId: assignment.projectId,
      createdAt: assignment.createdAt instanceof Date ? assignment.createdAt.toISOString() : String(assignment.createdAt),
    };
  }

  async removeUserRole(
    targetUserId: string,
    roleId: string,
    projectId: string | null | undefined,
    actorId: string
  ): Promise<void> {
    if (!actorId) {
      throw new RoleServiceError('UNAUTHENTICATED', 'Authentication required', 401);
    }

    if (targetUserId === actorId) {
      throw new RoleServiceError('SELF_MUTATION_FORBIDDEN', 'Cannot remove roles from your own account', 403);
    }

    const normalizedProjectId = projectId?.trim() || null;

    const canManage = await this.checkPermission(actorId, 'roles.manage', normalizedProjectId);
    if (!canManage) {
      throw new RoleServiceError('FORBIDDEN', 'Insufficient permissions to remove user role', 403);
    }

    const db = await this.getDb();
    const assignment = await db.userRole.findFirst({
      where: {
        userId: targetUserId,
        roleId,
        projectId: normalizedProjectId,
      },
      include: { role: true },
    });

    if (!assignment) {
      throw new RoleServiceError('NOT_FOUND', 'Role assignment not found', 404);
    }

    if (assignment.role.isSystem) {
      const canManageSystem = await this.checkPermission(actorId, 'system.manage', null);
      if (!canManageSystem) {
        throw new RoleServiceError('FORBIDDEN', 'Removing system roles requires system.manage permission', 403);
      }
    }

    const executeTransaction = async (tx: any) => {
      await tx.userRole.delete({
        where: { id: assignment.id },
      });

      await logAudit({
        action: 'ROLE_REMOVED',
        scopeType: normalizedProjectId ? 'PROJECT' : 'SYSTEM',
        scopeId: normalizedProjectId,
        resourceType: 'USER_ROLE',
        resourceId: assignment.id,
        actorId,
        metadata: {
          targetUserId,
          role: assignment.role.name,
          roleId,
          roleName: assignment.role.name,
          projectId: normalizedProjectId,
        },
        tx,
      });
    };

    if (db.$transaction) {
      await db.$transaction(executeTransaction);
    } else {
      await executeTransaction(db);
    }
  }

  // ==========================================
  // 3. Direct User Permission Overrides
  // ==========================================

  async listUserOverrides(
    targetUserId: string,
    projectId: string | null | undefined,
    actorId: string
  ): Promise<SafeUserPermissionOverride[]> {
    if (!actorId) {
      throw new RoleServiceError('UNAUTHENTICATED', 'Authentication required', 401);
    }

    const normalizedProjectId = projectId?.trim() || null;
    const canView =
      (await this.checkPermission(actorId, 'roles.view', normalizedProjectId)) ||
      (await this.checkPermission(actorId, 'roles.manage', normalizedProjectId));

    if (!canView) {
      throw new RoleServiceError('FORBIDDEN', 'Insufficient permissions to view overrides', 403);
    }

    const db = await this.getDb();
    const where: any = { userId: targetUserId };
    if (normalizedProjectId !== undefined) {
      where.projectId = normalizedProjectId;
    }

    const overrides = await db.userPermissionOverride.findMany({
      where,
      include: { permission: true },
      orderBy: [{ createdAt: 'asc' }],
    });

    return overrides.map((o: any) => ({
      id: o.id,
      userId: o.userId,
      permissionId: o.permissionId,
      permissionKey: o.permission.key as PermissionKey,
      isGranted: o.isGranted,
      projectId: o.projectId,
      createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt),
    }));
  }

  async setUserOverride(
    targetUserId: string,
    rawPermissionKey: unknown,
    isGranted: boolean,
    projectId: string | null | undefined,
    actorId: string
  ): Promise<SafeUserPermissionOverride> {
    if (!actorId) {
      throw new RoleServiceError('UNAUTHENTICATED', 'Authentication required', 401);
    }

    if (targetUserId === actorId) {
      throw new RoleServiceError('SELF_MUTATION_FORBIDDEN', 'Cannot modify permission overrides for your own account', 403);
    }

    if (typeof rawPermissionKey !== 'string' || !isPermissionKey(rawPermissionKey)) {
      throw new RoleServiceError('UNKNOWN_PERMISSION', `Unknown permission key: ${rawPermissionKey}`, 400);
    }

    const permissionKey = rawPermissionKey as PermissionKey;
    const normalizedProjectId = projectId?.trim() || null;

    // Sensitive permission check: system_map.read_internal is global-only, requires system.manage + possessing it
    if (isRoleGrantExcludedPermission(permissionKey)) {
      if (normalizedProjectId !== null) {
        throw new RoleServiceError('FORBIDDEN', `${permissionKey} can only be configured at global scope`, 403);
      }
      const canManageSystem = await this.checkPermission(actorId, 'system.manage', null);
      const canManageRoles = await this.checkPermission(actorId, 'roles.manage', null);
      const actorHas = await this.checkPermission(actorId, permissionKey, null);

      if (!canManageSystem || !canManageRoles || !actorHas) {
        throw new RoleServiceError(
          'FORBIDDEN',
          `Configuring ${permissionKey} override requires global roles.manage, system.manage, and possessing the permission`,
          403
        );
      }
    } else {
      // Standard permission check
      const canManage = await this.checkPermission(actorId, 'roles.manage', normalizedProjectId);
      if (!canManage) {
        throw new RoleServiceError('FORBIDDEN', 'Insufficient permissions to set override', 403);
      }

      // If granting ALLOW, actor must possess this permission at target scope
      if (isGranted) {
        const actorHas = await this.checkPermission(actorId, permissionKey, normalizedProjectId);
        if (!actorHas) {
          throw new RoleServiceError(
            'PERMISSION_ENVELOPE_EXCEEDED',
            `Cannot grant ALLOW override for "${permissionKey}" which you do not possess at target scope`,
            403
          );
        }
      }
    }

    const db = await this.getDb();
    const user = await db.user.findUnique({ where: { id: targetUserId } });
    if (!user) {
      throw new RoleServiceError('NOT_FOUND', 'User not found', 404);
    }

    const perm = await db.permission.findUnique({ where: { key: permissionKey } });
    if (!perm) {
      throw new RoleServiceError('NOT_FOUND', 'Permission record not found in database', 404);
    }

    if (normalizedProjectId) {
      const project = await db.project.findUnique({ where: { id: normalizedProjectId } });
      if (!project) {
        throw new RoleServiceError('NOT_FOUND', 'Target project not found', 404);
      }
    }

    const executeTransaction = async (tx: any) => {
      const existing = await tx.userPermissionOverride.findFirst({
        where: {
          userId: targetUserId,
          permissionId: perm.id,
          projectId: normalizedProjectId,
        },
      });

      let override;
      if (existing) {
        override = await tx.userPermissionOverride.update({
          where: { id: existing.id },
          data: { isGranted },
          include: { permission: true },
        });
      } else {
        override = await tx.userPermissionOverride.create({
          data: {
            userId: targetUserId,
            permissionId: perm.id,
            projectId: normalizedProjectId,
            isGranted,
          },
          include: { permission: true },
        });
      }

      await logAudit({
        action: 'PERMISSION_OVERRIDE_CHANGED',
        scopeType: normalizedProjectId ? 'PROJECT' : 'SYSTEM',
        scopeId: normalizedProjectId,
        resourceType: 'USER_PERMISSION_OVERRIDE',
        resourceId: override.id,
        actorId,
        metadata: {
          targetUserId,
          permission: permissionKey,
          permissionKey,
          granted: isGranted,
          isGranted,
          projectId: normalizedProjectId,
          operation: isGranted ? 'ALLOW' : 'DENY',
        },
        tx,
      });

      return override;
    };

    const override = db.$transaction
      ? await db.$transaction(executeTransaction)
      : await executeTransaction(db);

    return {
      id: override.id,
      userId: override.userId,
      permissionId: override.permissionId,
      permissionKey: override.permission.key as PermissionKey,
      isGranted: override.isGranted,
      projectId: override.projectId,
      createdAt: override.createdAt instanceof Date ? override.createdAt.toISOString() : String(override.createdAt),
    };
  }

  async removeUserOverride(
    targetUserId: string,
    rawPermissionKey: unknown,
    projectId: string | null | undefined,
    actorId: string
  ): Promise<void> {
    if (!actorId) {
      throw new RoleServiceError('UNAUTHENTICATED', 'Authentication required', 401);
    }

    if (targetUserId === actorId) {
      throw new RoleServiceError('SELF_MUTATION_FORBIDDEN', 'Cannot remove permission overrides from your own account', 403);
    }

    if (typeof rawPermissionKey !== 'string' || !isPermissionKey(rawPermissionKey)) {
      throw new RoleServiceError('UNKNOWN_PERMISSION', `Unknown permission key: ${rawPermissionKey}`, 400);
    }

    const permissionKey = rawPermissionKey as PermissionKey;
    const normalizedProjectId = projectId?.trim() || null;

    if (isRoleGrantExcludedPermission(permissionKey)) {
      const canManageSystem = await this.checkPermission(actorId, 'system.manage', null);
      const canManageRoles = await this.checkPermission(actorId, 'roles.manage', null);
      if (!canManageSystem || !canManageRoles) {
        throw new RoleServiceError('FORBIDDEN', `Removing ${permissionKey} override requires system.manage and roles.manage`, 403);
      }
    } else {
      const canManage = await this.checkPermission(actorId, 'roles.manage', normalizedProjectId);
      if (!canManage) {
        throw new RoleServiceError('FORBIDDEN', 'Insufficient permissions to remove override', 403);
      }
    }

    const db = await this.getDb();
    const perm = await db.permission.findUnique({ where: { key: permissionKey } });
    if (!perm) {
      throw new RoleServiceError('NOT_FOUND', 'Permission record not found in database', 404);
    }

    const override = await db.userPermissionOverride.findFirst({
      where: {
        userId: targetUserId,
        permissionId: perm.id,
        projectId: normalizedProjectId,
      },
    });

    if (!override) {
      throw new RoleServiceError('NOT_FOUND', 'Permission override not found', 404);
    }

    const executeTransaction = async (tx: any) => {
      await tx.userPermissionOverride.delete({
        where: { id: override.id },
      });

      await logAudit({
        action: 'PERMISSION_OVERRIDE_CHANGED',
        scopeType: normalizedProjectId ? 'PROJECT' : 'SYSTEM',
        scopeId: normalizedProjectId,
        resourceType: 'USER_PERMISSION_OVERRIDE',
        resourceId: override.id,
        actorId,
        metadata: {
          targetUserId,
          permission: permissionKey,
          permissionKey,
          granted: false,
          isGranted: false,
          projectId: normalizedProjectId,
          operation: 'REMOVED',
        },
        tx,
      });
    };

    if (db.$transaction) {
      await db.$transaction(executeTransaction);
    } else {
      await executeTransaction(db);
    }
  }
}

let roleServiceInstance: RoleService | null = null;

export function getRoleService(): RoleService {
  if (!roleServiceInstance) {
    roleServiceInstance = new RoleService();
  }
  return roleServiceInstance;
}

export function setRoleServiceForTesting(service: RoleService | null): void {
  roleServiceInstance = service;
}
