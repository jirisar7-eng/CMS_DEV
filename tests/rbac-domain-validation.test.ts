import { test } from 'node:test';
import assert from 'node:assert';
import {
  validateRoleName,
  validateRoleDescription,
  validatePermissionKeys,
} from '../lib/domain/roles/validation';
import { RoleServiceError } from '../lib/domain/roles/types';

test('SYN-RBAC-002: Role Domain Validation', async (t) => {
  await t.test('1. validateRoleName accepts valid names and trims whitespace', () => {
    assert.strictEqual(validateRoleName('Editor'), 'Editor');
    assert.strictEqual(validateRoleName('  Senior Editor  '), 'Senior Editor');
    assert.strictEqual(validateRoleName('Role-123_Test'), 'Role-123_Test');
    assert.strictEqual(validateRoleName('Správce Článků'), 'Správce Článků');
  });

  await t.test('2. validateRoleName rejects invalid, empty, or out-of-range names', () => {
    assert.throws(() => validateRoleName(''), (err: any) => err instanceof RoleServiceError && err.code === 'INVALID_INPUT');
    assert.throws(() => validateRoleName('A'), (err: any) => err instanceof RoleServiceError && err.code === 'INVALID_INPUT');
    assert.throws(() => validateRoleName('   '), (err: any) => err instanceof RoleServiceError && err.code === 'INVALID_INPUT');
    assert.throws(() => validateRoleName('A'.repeat(51)), (err: any) => err instanceof RoleServiceError && err.code === 'INVALID_INPUT');
    assert.throws(() => validateRoleName(null), (err: any) => err instanceof RoleServiceError && err.code === 'INVALID_INPUT');
    assert.throws(() => validateRoleName('Invalid\x00Control'), (err: any) => err instanceof RoleServiceError && err.code === 'INVALID_INPUT');
  });

  await t.test('3. validateRoleDescription normalizes and enforces length limits', () => {
    assert.strictEqual(validateRoleDescription(undefined), null);
    assert.strictEqual(validateRoleDescription(null), null);
    assert.strictEqual(validateRoleDescription(''), null);
    assert.strictEqual(validateRoleDescription('   '), null);
    assert.strictEqual(validateRoleDescription('Valid description'), 'Valid description');
    assert.throws(() => validateRoleDescription('A'.repeat(501)), (err: any) => err instanceof RoleServiceError && err.code === 'INVALID_INPUT');
  });

  await t.test('4. validatePermissionKeys validates keys against catalog and rejects duplicates / sensitive keys', () => {
    const valid = validatePermissionKeys(['admin.access', 'brand.view', 'media.view']);
    assert.deepStrictEqual(valid, ['admin.access', 'brand.view', 'media.view']);

    // Unknown key
    assert.throws(
      () => validatePermissionKeys(['admin.access', 'unknown.fake.perm']),
      (err: any) => err instanceof RoleServiceError && err.code === 'UNKNOWN_PERMISSION'
    );

    // Duplicate key
    assert.throws(
      () => validatePermissionKeys(['admin.access', 'brand.view', 'admin.access']),
      (err: any) => err instanceof RoleServiceError && err.code === 'INVALID_INPUT'
    );

    // Sensitive key (system_map.read_internal) cannot be granted via roles
    assert.throws(
      () => validatePermissionKeys(['system_map.read_internal']),
      (err: any) => err instanceof RoleServiceError && err.code === 'FORBIDDEN'
    );
  });
});
