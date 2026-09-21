import { test, describe, it, mock, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { prisma } from '../lib/db';
import { hasPermission } from '../lib/auth/rbac';

const rbacPath = path.join(process.cwd(), 'lib/auth/rbac.ts');
const rbacContent = fs.readFileSync(rbacPath, 'utf-8');

const bootstrapPath = path.join(process.cwd(), 'scripts/bootstrap-admin.ts');
const bootstrapContent = fs.readFileSync(bootstrapPath, 'utf-8');

const EXPECTED_CONTENT_PERMISSIONS = [
  'content.view',
  'content.create',
  'content.edit',
  'content.review',
  'content.approve',
  'content.publish',
  'content.rollback',
  'content.archive',
];

test('Content RBAC Foundation - 1. PermissionKey source contains all 8 content permissions', () => {
  const permissionKeyTypeMatch = rbacContent.match(/export\s+type\s+PermissionKey\s*=([\s\S]*?);/);
  assert.ok(permissionKeyTypeMatch, 'PermissionKey type definition must exist in rbac.ts');
  const typeBody = permissionKeyTypeMatch[1];
  for (const perm of EXPECTED_CONTENT_PERMISSIONS) {
    assert.ok(
      typeBody.includes(`'${perm}'`),
      `PermissionKey must contain '${perm}'`
    );
  }
});

test('Content RBAC Foundation - 2. Bootstrap initialPermissions contains the same exact 8 content permissions', () => {
  const initialPermissionsMatch = bootstrapContent.match(/const\s+initialPermissions\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(initialPermissionsMatch, 'initialPermissions array must exist in bootstrap-admin.ts');
  const arrayBody = initialPermissionsMatch[1];
  for (const perm of EXPECTED_CONTENT_PERMISSIONS) {
    assert.ok(
      arrayBody.includes(`'${perm}'`),
      `initialPermissions in bootstrap-admin.ts must contain '${perm}'`
    );
  }
});

test('Content RBAC Foundation - 3. No content.delete in PermissionKey or bootstrap', () => {
  assert.strictEqual(
    rbacContent.includes('content.delete'),
    false,
    'lib/auth/rbac.ts must not contain content.delete'
  );
  assert.strictEqual(
    bootstrapContent.includes('content.delete'),
    false,
    'scripts/bootstrap-admin.ts must not contain content.delete'
  );
});

test('Content RBAC Foundation - 4. No newly introduced runtime SUPER_ADMIN bypass in rbac.ts', () => {
  // rbac.ts should not reference SUPER_ADMIN role name bypass
  assert.strictEqual(
    rbacContent.includes('SUPER_ADMIN'),
    false,
    'lib/auth/rbac.ts must not contain SUPER_ADMIN hardcoded bypass'
  );
  // hasPermission must evaluate real permissions and not bypass based on role name
  assert.doesNotMatch(
    rbacContent,
    /if\s*\([^)]*role\s*===\s*['"]SUPER_ADMIN['"][^)]*\)/,
    'No role-name based bypass allowed in rbac.ts'
  );
});

test('Content RBAC Foundation - 5. Existing fail-closed behavior remains visible', () => {
  // Unknown permission => fail-closed (return false when permission not found in DB)
  assert.match(
    rbacContent,
    /if\s*\(!permission\)\s*{\s*(\/\/[^\n]*\n\s*)*return\s+false;\s*}/,
    'hasPermission must return false if permission is missing in DB (fail-closed)'
  );
  // Default DENY path at end of hasPermission
  assert.match(
    rbacContent,
    /\/\/\s*4\.\s*Default DENY\s*\n\s*return\s+false;/,
    'hasPermission must conclude with default DENY (return false)'
  );
  // requirePermission throws on unauthenticated or unauthorized
  assert.match(
    rbacContent,
    /throw\s+new\s+Error\('UNAUTHENTICATED'\);/,
    'requirePermission must throw UNAUTHENTICATED when user is absent or inactive'
  );
  assert.match(
    rbacContent,
    /throw\s+new\s+Error\('UNAUTHORIZED'\);/,
    'requirePermission must throw UNAUTHORIZED when hasPermission returns false'
  );
});

test('Content RBAC Foundation - 6. Existing projectId-aware RBAC logic and deny precedence remain present', () => {
  // Check that projectId scope is passed and checked
  assert.match(
    rbacContent,
    /projectId\?:\s*string\s*\|\s*null/,
    'hasPermission and requirePermission must accept optional projectId'
  );
  // Check user permission overrides query filters by project and global
  assert.match(
    rbacContent,
    /projectId:\s*projectId\s*\?\?\s*null/,
    'Overrides query must filter by projectId ?? null'
  );
  assert.match(
    rbacContent,
    /projectId:\s*null/,
    'Overrides query must filter by global null projectId'
  );
  // Check ANY applicable DENY is evaluated before ALLOW
  assert.match(
    rbacContent,
    /!o\.isGranted/,
    'Must check for explicit DENY override'
  );
});

test('Content RBAC Foundation - 7. Bootstrap still creates RolePermission associations rather than granting by role name', () => {
  // Bootstrap must attach permissions through rolePermission records
  assert.match(
    bootstrapContent,
    /prisma\.rolePermission\.findUnique/,
    'Bootstrap must check existing rolePermission record'
  );
  assert.match(
    bootstrapContent,
    /prisma\.rolePermission\.create/,
    'Bootstrap must create rolePermission record'
  );
  // Bootstrap must ensure idempotency
  assert.match(
    bootstrapContent,
    /roleId_permissionId:\s*\{[\s\S]*?roleId:\s*superAdminRole\.id[\s\S]*?permissionId:\s*perm\.id[\s\S]*?\}/,
    'Bootstrap must use unique composite key roleId_permissionId'
  );
  // No special case "if SUPER_ADMIN then allow"
  assert.doesNotMatch(
    bootstrapContent,
    /if\s*\([^)]*SUPER_ADMIN[^)]*\)\s*{\s*return true;\s*}/,
    'Bootstrap must not use bypass shortcuts'
  );
});

// Mutate prisma singleton for unit tests
(prisma as any).permission = {
  findUnique: mock.fn(),
};
(prisma as any).userPermissionOverride = {
  findMany: mock.fn(),
};
(prisma as any).userRole = {
  findMany: mock.fn(),
};

describe('SYN-SEC-005A: RBAC Precedence Contract Regression Suite', () => {
  const userId = 'test-user-123';
  const projectId = 'proj-alpha';
  const permissionKey = 'content.publish';
  const permissionId = 'perm-content-publish';

  beforeEach(() => {
    (prisma.permission.findUnique as any).mock.mockImplementation(async () => ({
      id: permissionId,
      key: permissionKey,
    }));
    (prisma.userPermissionOverride.findMany as any).mock.mockImplementation(async () => []);
    (prisma.userRole.findMany as any).mock.mockImplementation(async () => []);
  });

  afterEach(() => {
    (prisma.permission.findUnique as any).mock.resetCalls();
    (prisma.userPermissionOverride.findMany as any).mock.resetCalls();
    (prisma.userRole.findMany as any).mock.resetCalls();
  });

  it('1. global DENY + project ALLOW -> DENY', async () => {
    (prisma.userPermissionOverride.findMany as any).mock.mockImplementation(async () => [
      { projectId: null, isGranted: false },
      { projectId, isGranted: true },
    ]);
    const result = await hasPermission(userId, permissionKey, projectId);
    assert.strictEqual(result, false, 'Global DENY must NOT be bypassed by project ALLOW');
  });

  it('2. global ALLOW + project DENY -> DENY', async () => {
    (prisma.userPermissionOverride.findMany as any).mock.mockImplementation(async () => [
      { projectId: null, isGranted: true },
      { projectId, isGranted: false },
    ]);
    const result = await hasPermission(userId, permissionKey, projectId);
    assert.strictEqual(result, false, 'Project DENY must NOT be bypassed by global ALLOW');
  });

  it('3. project ALLOW only -> ALLOW', async () => {
    (prisma.userPermissionOverride.findMany as any).mock.mockImplementation(async () => [
      { projectId, isGranted: true },
    ]);
    const result = await hasPermission(userId, permissionKey, projectId);
    assert.strictEqual(result, true, 'Applicable project ALLOW override must grant access');
  });

  it('4. global ALLOW only -> ALLOW', async () => {
    (prisma.userPermissionOverride.findMany as any).mock.mockImplementation(async () => [
      { projectId: null, isGranted: true },
    ]);
    const result = await hasPermission(userId, permissionKey, projectId);
    assert.strictEqual(result, true, 'Applicable global ALLOW override must grant access');
  });

  it('5. no override + role grant -> ALLOW', async () => {
    (prisma.userPermissionOverride.findMany as any).mock.mockImplementation(async () => []);
    (prisma.userRole.findMany as any).mock.mockImplementation(async () => [
      {
        projectId,
        role: {
          permissions: [{ permissionId }],
        },
      },
    ]);
    const result = await hasPermission(userId, permissionKey, projectId);
    assert.strictEqual(result, true, 'Role grant must allow when no overrides exist');
  });

  it('6. no override + no role grant -> DENY', async () => {
    (prisma.userPermissionOverride.findMany as any).mock.mockImplementation(async () => []);
    (prisma.userRole.findMany as any).mock.mockImplementation(async () => [
      {
        projectId,
        role: {
          permissions: [],
        },
      },
    ]);
    const result = await hasPermission(userId, permissionKey, projectId);
    assert.strictEqual(result, false, 'User with no grants or overrides must be denied');
  });

  it('7. multiple overrides with DENY -> DENY', async () => {
    (prisma.userPermissionOverride.findMany as any).mock.mockImplementation(async () => [
      { projectId, isGranted: false },
      { projectId: null, isGranted: false },
    ]);
    const result = await hasPermission(userId, permissionKey, projectId);
    assert.strictEqual(result, false, 'Multiple DENY overrides must result in DENY');
  });

  it('8. evaluation failure -> DENY', async () => {
    (prisma.permission.findUnique as any).mock.mockImplementation(async () => {
      throw new Error('Database connection failure');
    });
    const result = await hasPermission(userId, permissionKey, projectId);
    assert.strictEqual(result, false, 'Database or evaluation failure must fail closed (DENY)');
  });
});
