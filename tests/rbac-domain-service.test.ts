import { test } from 'node:test';
import assert from 'node:assert';
import { RoleService } from '../lib/domain/roles/service';
import { RoleServiceError } from '../lib/domain/roles/types';
import { PermissionKey } from '../lib/auth/permissions';

function createMockDb() {
  const roles: any[] = [
    {
      id: 'role-super-admin',
      name: 'SUPER_ADMIN',
      description: 'Super Admin',
      isSystem: true,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      permissions: [{ permission: { id: 'p1', key: 'admin.access' } }],
      users: [{ id: 'ur1' }],
    },
    {
      id: 'role-editor',
      name: 'Editor',
      description: 'Content Editor',
      isSystem: false,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      permissions: [{ permission: { id: 'p2', key: 'content.edit' } }],
      users: [],
    },
  ];

  const permissions: any[] = [
    { id: 'p1', key: 'admin.access' },
    { id: 'p2', key: 'content.edit' },
    { id: 'p3', key: 'content.publish' },
    { id: 'p-internal', key: 'system_map.read_internal' },
  ];

  const userRoles: any[] = [
    { id: 'ur1', userId: 'user-admin', roleId: 'role-super-admin', projectId: null },
  ];

  const userOverrides: any[] = [];
  const auditLogs: any[] = [];

  const users: any[] = [
    { id: 'user-admin', email: 'admin@synthesis.local', status: 'ACTIVE' },
    { id: 'user-target', email: 'target@synthesis.local', status: 'ACTIVE' },
  ];

  const projects: any[] = [
    { id: 'proj-1', key: 'main-web', name: 'Main Web' },
  ];

  const db: any = {
    role: {
      findMany: async () => roles,
      findUnique: async ({ where }: any) => {
        if (where.id) return roles.find((r) => r.id === where.id) || null;
        if (where.name) return roles.find((r) => r.name === where.name) || null;
        return null;
      },
      create: async ({ data }: any) => {
        const newRole = {
          id: `role-${Date.now()}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
          permissions: [],
          users: [],
        };
        roles.push(newRole);
        return newRole;
      },
      update: async ({ where, data }: any) => {
        const idx = roles.findIndex((r) => r.id === where.id);
        if (idx === -1) return null;
        roles[idx] = { ...roles[idx], ...data, updatedAt: new Date() };
        return roles[idx];
      },
      delete: async ({ where }: any) => {
        const idx = roles.findIndex((r) => r.id === where.id);
        if (idx !== -1) roles.splice(idx, 1);
      },
    },
    permission: {
      findMany: async ({ where }: any) => {
        if (where.key?.in) {
          return permissions.filter((p) => where.key.in.includes(p.key));
        }
        return permissions;
      },
      findUnique: async ({ where }: any) => {
        if (where.key) return permissions.find((p) => p.key === where.key) || null;
        return null;
      },
    },
    rolePermission: {
      deleteMany: async ({ where }: any) => {
        const role = roles.find((r) => r.id === where.roleId);
        if (role) role.permissions = [];
      },
      createMany: async ({ data }: any) => {
        for (const item of data) {
          const role = roles.find((r) => r.id === item.roleId);
          const perm = permissions.find((p) => p.id === item.permissionId);
          if (role && perm) {
            role.permissions.push({ permission: perm });
          }
        }
      },
    },
    userRole: {
      count: async ({ where }: any) => {
        return userRoles.filter((ur) => ur.roleId === where.roleId).length;
      },
      findFirst: async ({ where }: any) => {
        return (
          userRoles.find(
            (ur) =>
              ur.userId === where.userId &&
              (!where.roleId || ur.roleId === where.roleId) &&
              (where.projectId === undefined || ur.projectId === where.projectId)
          ) || null
        );
      },
      findMany: async ({ where }: any) => {
        return userRoles
          .filter((ur) => ur.userId === where.userId && (where.projectId === undefined || ur.projectId === where.projectId))
          .map((ur) => ({ ...ur, role: roles.find((r) => r.id === ur.roleId) }));
      },
      create: async ({ data }: any) => {
        const assignment = {
          id: `ur-${Date.now()}-${Math.random()}`,
          ...data,
          createdAt: new Date(),
          role: roles.find((r) => r.id === data.roleId),
        };
        userRoles.push(assignment);
        return assignment;
      },
      delete: async ({ where }: any) => {
        const idx = userRoles.findIndex((ur) => ur.id === where.id);
        if (idx !== -1) userRoles.splice(idx, 1);
      },
    },
    userPermissionOverride: {
      findFirst: async ({ where }: any) => {
        return (
          userOverrides.find(
            (uo) =>
              uo.userId === where.userId &&
              uo.permissionId === where.permissionId &&
              uo.projectId === where.projectId
          ) || null
        );
      },
      findMany: async ({ where }: any) => {
        return userOverrides
          .filter((uo) => uo.userId === where.userId && (where.projectId === undefined || uo.projectId === where.projectId))
          .map((uo) => ({ ...uo, permission: permissions.find((p) => p.id === uo.permissionId) }));
      },
      create: async ({ data }: any) => {
        const override = {
          id: `uo-${Date.now()}-${Math.random()}`,
          ...data,
          createdAt: new Date(),
          permission: permissions.find((p) => p.id === data.permissionId),
        };
        userOverrides.push(override);
        return override;
      },
      update: async ({ where, data }: any) => {
        const idx = userOverrides.findIndex((uo) => uo.id === where.id);
        if (idx === -1) return null;
        userOverrides[idx] = { ...userOverrides[idx], ...data };
        return userOverrides[idx];
      },
      delete: async ({ where }: any) => {
        const idx = userOverrides.findIndex((uo) => uo.id === where.id);
        if (idx !== -1) userOverrides.splice(idx, 1);
      },
    },
    user: {
      findUnique: async ({ where }: any) => users.find((u) => u.id === where.id) || null,
    },
    project: {
      findUnique: async ({ where }: any) => projects.find((p) => p.id === where.id) || null,
    },
    auditLog: {
      create: async ({ data }: any) => {
        auditLogs.push(data);
        return data;
      },
    },
    $transaction: async (fn: any) => fn(db),
  };

  return { db, roles, permissions, userRoles, userOverrides, auditLogs };
}

test('SYN-RBAC-002: Role Domain Service Security & CRUD Invariants', async (t) => {
  await t.test('1. Unauthorized actor fails closed across all methods', async () => {
    const { db } = createMockDb();
    const service = new RoleService({
      db,
      hasPermissionFn: async () => false, // Actor lacks all permissions
    });

    await assert.rejects(
      () => service.listRoles('actor-1'),
      (err: any) => err instanceof RoleServiceError && err.code === 'FORBIDDEN'
    );
    await assert.rejects(
      () => service.createRole({ name: 'NewRole' }, 'actor-1'),
      (err: any) => err instanceof RoleServiceError && err.code === 'FORBIDDEN'
    );
    await assert.rejects(
      () => service.updateRole('role-editor', { name: 'NewName' }, 'actor-1'),
      (err: any) => err instanceof RoleServiceError && err.code === 'FORBIDDEN'
    );
    await assert.rejects(
      () => service.deleteRole('role-editor', 'actor-1'),
      (err: any) => err instanceof RoleServiceError && err.code === 'FORBIDDEN'
    );
    await assert.rejects(
      () => service.updateRolePermissions('role-editor', ['content.edit'], 'actor-1'),
      (err: any) => err instanceof RoleServiceError && err.code === 'FORBIDDEN'
    );
  });

  await t.test('2. System roles are immutable (no rename, delete, or permission update)', async () => {
    const { db } = createMockDb();
    const service = new RoleService({
      db,
      hasPermissionFn: async () => true, // Full admin
    });

    await assert.rejects(
      () => service.updateRole('role-super-admin', { name: 'RenamedAdmin' }, 'actor-admin'),
      (err: any) => err instanceof RoleServiceError && err.code === 'SYSTEM_ROLE_IMMUTABLE'
    );

    await assert.rejects(
      () => service.deleteRole('role-super-admin', 'actor-admin'),
      (err: any) => err instanceof RoleServiceError && err.code === 'SYSTEM_ROLE_IMMUTABLE'
    );

    await assert.rejects(
      () => service.updateRolePermissions('role-super-admin', ['admin.access'], 'actor-admin'),
      (err: any) => err instanceof RoleServiceError && err.code === 'SYSTEM_ROLE_IMMUTABLE'
    );
  });

  await t.test('3. In-use role cannot be deleted', async () => {
    const { db } = createMockDb();
    const service = new RoleService({
      db,
      hasPermissionFn: async () => true,
    });

    // Assign role-editor to a user
    db.userRole.create({ data: { userId: 'user-target', roleId: 'role-editor', projectId: null } });

    await assert.rejects(
      () => service.deleteRole('role-editor', 'actor-admin'),
      (err: any) => err instanceof RoleServiceError && err.code === 'ROLE_IN_USE'
    );
  });

  await t.test('4. Indirect escalation: Actor cannot mutate permissions of a role they hold', async () => {
    const { db } = createMockDb();
    const service = new RoleService({
      db,
      hasPermissionFn: async () => true,
    });

    // actor-admin holds role-editor
    await db.userRole.create({ data: { userId: 'actor-admin', roleId: 'role-editor', projectId: null } });

    await assert.rejects(
      () => service.updateRolePermissions('role-editor', ['content.edit', 'content.publish'], 'actor-admin'),
      (err: any) => err instanceof RoleServiceError && err.code === 'CANNOT_MUTATE_HELD_ROLE'
    );
  });

  await t.test('5. Permission envelope: Actor cannot grant permissions they do not possess', async () => {
    const { db } = createMockDb();
    const service = new RoleService({
      db,
      hasPermissionFn: async (_userId, permKey) => {
        if (permKey === 'roles.manage') return true;
        if (permKey === 'content.edit') return true;
        return false; // Does NOT have content.publish
      },
    });

    await assert.rejects(
      () => service.updateRolePermissions('role-editor', ['content.edit', 'content.publish'], 'actor-1'),
      (err: any) => err instanceof RoleServiceError && err.code === 'PERMISSION_ENVELOPE_EXCEEDED'
    );
  });

  await t.test('6. User role assignment: Self-assignment and project system-role assignment are forbidden', async () => {
    const { db } = createMockDb();
    const service = new RoleService({
      db,
      hasPermissionFn: async () => true,
    });

    // Self assignment forbidden
    await assert.rejects(
      () => service.assignUserRole('actor-admin', 'role-editor', null, 'actor-admin'),
      (err: any) => err instanceof RoleServiceError && err.code === 'SELF_MUTATION_FORBIDDEN'
    );

    // System role project scope forbidden
    await assert.rejects(
      () => service.assignUserRole('user-target', 'role-super-admin', 'proj-1', 'actor-admin'),
      (err: any) => err instanceof RoleServiceError && err.code === 'FORBIDDEN'
    );
  });

  await t.test('7. Direct overrides: Sensitive system_map.read_internal requires system.manage + possession', async () => {
    const { db } = createMockDb();

    // Actor with roles.manage but NOT system.manage
    const serviceNoSystemManage = new RoleService({
      db,
      hasPermissionFn: async (_u, p) => p === 'roles.manage' || p === 'system_map.read_internal',
    });

    await assert.rejects(
      () => serviceNoSystemManage.setUserOverride('user-target', 'system_map.read_internal', true, null, 'actor-admin'),
      (err: any) => err instanceof RoleServiceError && err.code === 'FORBIDDEN'
    );

    // Actor with system.manage and roles.manage and possessing permission
    const serviceFullyAuthorized = new RoleService({
      db,
      hasPermissionFn: async () => true,
    });

    const override = await serviceFullyAuthorized.setUserOverride(
      'user-target',
      'system_map.read_internal',
      true,
      null,
      'actor-admin'
    );
    assert.strictEqual(override.permissionKey, 'system_map.read_internal');
    assert.strictEqual(override.isGranted, true);
  });
});
