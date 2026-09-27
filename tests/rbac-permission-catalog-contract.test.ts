import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  PERMISSION_KEYS,
  isPermissionKey,
  ROLE_GRANT_EXCLUDED_PERMISSIONS,
  isRoleGrantExcludedPermission,
  PermissionKey,
} from '../lib/auth/permissions';

test('SYN-RBAC-002: Canonical Permission Catalog Contract', async (t) => {
  await t.test('1. Catalog contains exactly 44 canonical permission keys', () => {
    assert.strictEqual(PERMISSION_KEYS.length, 44, 'Must have exactly 44 keys');
  });

  await t.test('2. No duplicate keys exist in PERMISSION_KEYS', () => {
    const uniqueKeys = new Set(PERMISSION_KEYS);
    assert.strictEqual(uniqueKeys.size, PERMISSION_KEYS.length, 'All keys must be unique');
  });

  await t.test('3. isPermissionKey validates canonical keys accurately and rejects invalid keys', () => {
    assert.strictEqual(isPermissionKey('admin.access'), true);
    assert.strictEqual(isPermissionKey('roles.manage'), true);
    assert.strictEqual(isPermissionKey('system_map.read_internal'), true);
    assert.strictEqual(isPermissionKey('invalid.unknown.permission'), false);
    assert.strictEqual(isPermissionKey(''), false);
    assert.strictEqual(isPermissionKey(null), false);
    assert.strictEqual(isPermissionKey(123), false);
  });

  await t.test('4. system_map.read_internal is present and in ROLE_GRANT_EXCLUDED_PERMISSIONS', () => {
    assert.strictEqual(PERMISSION_KEYS.includes('system_map.read_internal'), true);
    assert.strictEqual(ROLE_GRANT_EXCLUDED_PERMISSIONS.includes('system_map.read_internal'), true);
    assert.strictEqual(isRoleGrantExcludedPermission('system_map.read_internal'), true);
    assert.strictEqual(isRoleGrantExcludedPermission('roles.manage'), false);
  });

  await t.test('5. lib/auth/rbac.ts re-exports permission catalog without drift', () => {
    const rbacPath = path.resolve('lib/auth/rbac.ts');
    const rbacContent = fs.readFileSync(rbacPath, 'utf8');
    assert.match(rbacContent, /from\s+['"]\.\/permissions['"]/);
  });

  await t.test('6. scripts/bootstrap-admin.ts consumes single-source permission catalog', () => {
    const bootstrapPath = path.resolve('scripts/bootstrap-admin.ts');
    const bootstrapContent = fs.readFileSync(bootstrapPath, 'utf8');
    assert.match(bootstrapContent, /from\s+['"]\.\.\/lib\/auth\/permissions['"]/);
    assert.doesNotMatch(bootstrapContent, /const\s+initialPermissions\s*=\s*\[/);
  });
});
