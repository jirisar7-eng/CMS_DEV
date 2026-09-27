import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { RoleService } from '../lib/domain/roles/service';
import { RoleServiceError } from '../lib/domain/roles/types';
import { PERMISSION_KEYS, PermissionKey } from '../lib/auth/permissions';

function createMockDb() {
  const roles = [
    { id: 'role-super-admin', name: 'Super Administrator', isSystem: true, description: 'Full access', permissions: [] },
    { id: 'role-admin', name: 'Administrator', isSystem: true, description: 'Admin access', permissions: [] },
    { id: 'role-editor', name: 'Editor', isSystem: false, description: 'Content editor', permissions: [] },
    { id: 'role-custom', name: 'Custom Role', isSystem: false, description: 'Custom role description', permissions: [] },
  ];

  const permissions = PERMISSION_KEYS.map((key, idx) => ({
    id: `perm-${idx + 1}`,
    key,
    description: `Permission ${key}`,
    category: key.split('.')[0] || 'general',
  }));

  const userRoles: any[] = [];
  const userOverrides: any[] = [];
  const auditLogs: any[] = [];

  const users = [
    { id: 'actor-admin', email: 'admin@synthesis.local', name: 'Admin User' },
    { id: 'actor-editor', email: 'editor@synthesis.local', name: 'Editor User' },
    { id: 'user-target', email: 'target@synthesis.local', name: 'Target User' },
  ];

  const projects = [
    { id: 'proj-alpha', name: 'Project Alpha' },
    { id: 'proj-beta', name: 'Project Beta' },
  ];

  const db: any = {
    role: {
      findMany: async () => roles.map((r) => ({ ...r, _count: { userRoles: userRoles.filter((ur) => ur.roleId === r.id).length } })),
      findUnique: async ({ where }: any) => {
        const found = roles.find((r) => r.id === where.id || (where.name && r.name.toLowerCase() === where.name.toLowerCase()));
        if (!found) return null;
        return {
          ...found,
          permissions: (found.permissions || []).map((pId: string) => ({
            permission: permissions.find((p) => p.id === pId),
          })),
          users: userRoles.filter((ur) => ur.roleId === found.id).map((ur) => ({ id: ur.userId })),
          _count: { userRoles: userRoles.filter((ur) => ur.roleId === found.id).length },
        };
      },
      findFirst: async ({ where }: any) => {
        const found = roles.find((r) => (where.name && r.name.toLowerCase() === where.name.toLowerCase()));
        return found || null;
      },
      create: async ({ data }: any) => {
        const newRole = { id: `role-${Date.now()}`, isSystem: false, description: null, ...data, permissions: [] };
        roles.push(newRole);
        return newRole;
      },
      update: async ({ where, data }: any) => {
        const idx = roles.findIndex((r) => r.id === where.id);
        if (idx === -1) return null;
        roles[idx] = { ...roles[idx], ...data };
        return {
          ...roles[idx],
          permissions: (roles[idx].permissions || []).map((pId: string) => ({
            permission: permissions.find((p) => p.id === pId),
          })),
          users: userRoles.filter((ur) => ur.roleId === roles[idx].id).map((ur) => ({ id: ur.userId })),
        };
      },
      delete: async ({ where }: any) => {
        const idx = roles.findIndex((r) => r.id === where.id);
        if (idx !== -1) roles.splice(idx, 1);
      },
    },
    permission: {
      findMany: async ({ where }: any = {}) => {
        if (where?.key?.in) {
          return permissions.filter((p) => where.key.in.includes(p.key));
        }
        return permissions;
      },
      findUnique: async ({ where }: any) => permissions.find((p) => p.id === where.id || p.key === where.key) || null,
    },
    rolePermission: {
      findMany: async ({ where }: any) => {
        const role = roles.find((r) => r.id === where.roleId);
        if (!role) return [];
        return (role.permissions || []).map((pId: string) => ({
          roleId: role.id,
          permissionId: pId,
          permission: permissions.find((p) => p.id === pId),
        }));
      },
      deleteMany: async ({ where }: any) => {
        const role = roles.find((r) => r.id === where.roleId);
        if (role) role.permissions = [];
      },
      createMany: async ({ data }: any) => {
        for (const item of data) {
          const role = roles.find((r) => r.id === item.roleId);
          if (role) {
            role.permissions = role.permissions || [];
            if (!role.permissions.includes(item.permissionId)) {
              role.permissions.push(item.permissionId);
            }
          }
        }
      },
    },
    userRole: {
      count: async ({ where }: any = {}) => {
        return userRoles.filter((ur) => !where?.roleId || ur.roleId === where.roleId).length;
      },
      findFirst: async ({ where }: any) => {
        return (
          userRoles.find(
            (ur) =>
              ur.userId === where.userId &&
              ur.roleId === where.roleId &&
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
        return {
          ...userOverrides[idx],
          permission: permissions.find((p) => p.id === userOverrides[idx].permissionId),
        };
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

  return { db, roles, permissions, userRoles, userOverrides, auditLogs, users, projects };
}

test('SYN-RBAC-002: Advanced Security, Scope Isolation & Audit Invariants', async (t) => {
  await t.test('1. Unauthenticated actors are rejected fail-closed with 401 UNAUTHENTICATED', async () => {
    const { db } = createMockDb();
    const service = new RoleService({ db, hasPermissionFn: async () => true });

    await assert.rejects(
      () => service.listRoles(''),
      (err: any) => err instanceof RoleServiceError && err.code === 'UNAUTHENTICATED' && err.statusCode === 401
    );
    await assert.rejects(
      () => service.createRole({ name: 'Role' }, ''),
      (err: any) => err instanceof RoleServiceError && err.code === 'UNAUTHENTICATED' && err.statusCode === 401
    );
    await assert.rejects(
      () => service.assignUserRole('user-target', 'role-editor', null, ''),
      (err: any) => err instanceof RoleServiceError && err.code === 'UNAUTHENTICATED' && err.statusCode === 401
    );
    await assert.rejects(
      () => service.removeUserRole('user-target', 'role-editor', null, ''),
      (err: any) => err instanceof RoleServiceError && err.code === 'UNAUTHENTICATED' && err.statusCode === 401
    );
    await assert.rejects(
      () => service.setUserOverride('user-target', 'content.edit', true, null, ''),
      (err: any) => err instanceof RoleServiceError && err.code === 'UNAUTHENTICATED' && err.statusCode === 401
    );
    await assert.rejects(
      () => service.removeUserOverride('user-target', 'content.edit', null, ''),
      (err: any) => err instanceof RoleServiceError && err.code === 'UNAUTHENTICATED' && err.statusCode === 401
    );
  });

  await t.test('2. Self-removal and self-mutation of roles and overrides are strictly denied', async () => {
    const { db, userRoles, userOverrides } = createMockDb();
    const service = new RoleService({ db, hasPermissionFn: async () => true });

    userRoles.push({ id: 'ur-self', userId: 'actor-admin', roleId: 'role-editor', projectId: null });
    userOverrides.push({ id: 'uo-self', userId: 'actor-admin', permissionId: 'perm-1', projectId: null, isGranted: true });

    await assert.rejects(
      () => service.assignUserRole('actor-admin', 'role-custom', null, 'actor-admin'),
      (err: any) => err instanceof RoleServiceError && err.code === 'SELF_MUTATION_FORBIDDEN' && err.statusCode === 403
    );

    await assert.rejects(
      () => service.removeUserRole('actor-admin', 'role-editor', null, 'actor-admin'),
      (err: any) => err instanceof RoleServiceError && err.code === 'SELF_MUTATION_FORBIDDEN' && err.statusCode === 403
    );

    await assert.rejects(
      () => service.setUserOverride('actor-admin', 'brand.view', true, null, 'actor-admin'),
      (err: any) => err instanceof RoleServiceError && err.code === 'SELF_MUTATION_FORBIDDEN' && err.statusCode === 403
    );

    await assert.rejects(
      () => service.removeUserOverride('actor-admin', 'admin.access', null, 'actor-admin'),
      (err: any) => err instanceof RoleServiceError && err.code === 'SELF_MUTATION_FORBIDDEN' && err.statusCode === 403
    );
  });

  await t.test('3. Cross-project mutation isolation and unknown project validation', async () => {
    const { db } = createMockDb();
    const service = new RoleService({
      db,
      hasPermissionFn: async (_userId, permKey, projId) => {
        if (permKey === 'roles.manage' && projId === 'proj-alpha') return true;
        if (permKey === 'content.edit' && projId === 'proj-alpha') return true;
        return false;
      },
    });

    const assignment = await service.assignUserRole('user-target', 'role-editor', 'proj-alpha', 'actor-admin');
    assert.strictEqual(assignment.projectId, 'proj-alpha');

    await assert.rejects(
      () => service.assignUserRole('user-target', 'role-editor', 'proj-beta', 'actor-admin'),
      (err: any) => err instanceof RoleServiceError && err.code === 'FORBIDDEN'
    );

    await assert.rejects(
      () => service.assignUserRole('user-target', 'role-editor', null, 'actor-admin'),
      (err: any) => err instanceof RoleServiceError && err.code === 'FORBIDDEN'
    );

    const fullAdminService = new RoleService({ db, hasPermissionFn: async () => true });
    await assert.rejects(
      () => fullAdminService.assignUserRole('user-target', 'role-editor', 'non-existent-proj', 'actor-admin'),
      (err: any) => err instanceof RoleServiceError && err.code === 'NOT_FOUND'
    );
  });

  await t.test('4. Comprehensive Audit Trail verification on all mutating paths', async () => {
    const { db, auditLogs } = createMockDb();
    const service = new RoleService({ db, hasPermissionFn: async () => true });

    // 1. Role Create
    const createdRole = await service.createRole({ name: 'AuditedRole', description: 'Test role' }, 'actor-admin');
    const createAudit = auditLogs.find((a) => a.action === 'ROLE_CREATED' && a.resourceId === createdRole.id);
    assert.ok(createAudit, 'Must record ROLE_CREATED audit');
    assert.strictEqual(createAudit.actorId, 'actor-admin');
    assert.strictEqual(createAudit.metadata.name, 'AuditedRole');

    // 2. Role Update
    await service.updateRole(createdRole.id, { name: 'RenamedAuditedRole' }, 'actor-admin');
    const updateAudit = auditLogs.find((a) => a.action === 'ROLE_UPDATED' && a.resourceId === createdRole.id);
    assert.ok(updateAudit, 'Must record ROLE_UPDATED audit');
    assert.strictEqual(updateAudit.metadata.name, 'RenamedAuditedRole');
    assert.strictEqual(updateAudit.metadata.previousName, 'AuditedRole');

    // 3. Role Permissions Update
    await service.updateRolePermissions(createdRole.id, ['content.view', 'media.view'], 'actor-admin');
    const permAudit = auditLogs.find((a) => a.action === 'ROLE_PERMISSIONS_CHANGED' && a.resourceId === createdRole.id);
    assert.ok(permAudit, 'Must record ROLE_PERMISSIONS_CHANGED audit');
    assert.deepStrictEqual(permAudit.metadata.permissionKeys, ['content.view', 'media.view']);
    assert.strictEqual(permAudit.metadata.addedCount, 2);

    // 4. Role Assign
    const userRole = await service.assignUserRole('user-target', createdRole.id, 'proj-alpha', 'actor-admin');
    const assignAudit = auditLogs.find((a) => a.action === 'ROLE_ASSIGNED' && a.resourceId === userRole.id);
    assert.ok(assignAudit, 'Must record ROLE_ASSIGNED audit');
    assert.strictEqual(assignAudit.metadata.targetUserId, 'user-target');
    assert.strictEqual(assignAudit.metadata.projectId, 'proj-alpha');

    // 5. Role Remove
    await service.removeUserRole('user-target', createdRole.id, 'proj-alpha', 'actor-admin');
    const removeRoleAudit = auditLogs.find((a) => a.action === 'ROLE_REMOVED' && a.resourceId === userRole.id);
    assert.ok(removeRoleAudit, 'Must record ROLE_REMOVED audit');
    assert.strictEqual(removeRoleAudit.metadata.targetUserId, 'user-target');

    // 6. Role Delete
    await service.deleteRole(createdRole.id, 'actor-admin');
    const deleteAudit = auditLogs.find((a) => a.action === 'ROLE_DELETED' && a.resourceId === createdRole.id);
    assert.ok(deleteAudit, 'Must record ROLE_DELETED audit');

    // 7. Override Set
    const override = await service.setUserOverride('user-target', 'content.edit', true, 'proj-alpha', 'actor-admin');
    const overrideAudit = auditLogs.find((a) => a.action === 'PERMISSION_OVERRIDE_CHANGED' && a.resourceId === override.id && a.metadata.operation === 'ALLOW');
    assert.ok(overrideAudit, 'Must record PERMISSION_OVERRIDE_CHANGED (ALLOW) audit');

    // 8. Override Remove
    await service.removeUserOverride('user-target', 'content.edit', 'proj-alpha', 'actor-admin');
    const removeOverrideAudit = auditLogs.find((a) => a.action === 'PERMISSION_OVERRIDE_CHANGED' && a.resourceId === override.id && a.metadata.operation === 'REMOVED');
    assert.ok(removeOverrideAudit, 'Must record PERMISSION_OVERRIDE_CHANGED (REMOVED) audit');
  });

  await t.test('5. Admin Roles UI truthfulness and contract parity', () => {
    const pagePath = path.resolve('app/admin/roles/page.tsx');
    assert.strictEqual(fs.existsSync(pagePath), true, 'app/admin/roles/page.tsx must exist');
    const pageCode = fs.readFileSync(pagePath, 'utf8');

    assert.match(pageCode, /group="SPRÁVA"/);
    assert.match(pageCode, /status="FUNKČNÍ"/);
    assert.match(pageCode, /helpKey="management\.roles\.view"/);

    assert.match(pageCode, /\/api\/admin\/roles/);
    assert.match(pageCode, /\/api\/admin\/users/);
    assert.match(pageCode, /\/api\/admin\/projects/);

    assert.doesNotMatch(pageCode, /handleUnfinishedAction/);
  });
});
