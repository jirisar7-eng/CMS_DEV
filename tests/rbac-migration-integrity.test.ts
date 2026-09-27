import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

test('SYN-RBAC-002: PostgreSQL Partial Unique Index Migration Integrity', async (t) => {
  const migrationPath = path.resolve('prisma/migrations/20260927160000_rbac_global_unique_indexes/migration.sql');
  const schemaPath = path.resolve('prisma/schema.prisma');

  await t.test('1. Migration file exists in the correct migration directory', () => {
    assert.strictEqual(fs.existsSync(migrationPath), true, 'migration.sql must exist');
  });

  const sql = fs.readFileSync(migrationPath, 'utf8');

  await t.test('2. UserRole global duplicate preflight exists and fails closed', () => {
    assert.match(sql, /FROM\s+"UserRole"/i, 'Must check UserRole table in preflight');
    assert.match(sql, /WHERE\s+"projectId"\s+IS\s+NULL/i, 'Must check WHERE "projectId" IS NULL');
    assert.match(sql, /GROUP\s+BY\s+"userId",\s+"roleId"/i, 'Must group by userId and roleId');
    assert.match(sql, /HAVING\s+COUNT\(\*\)\s+>\s+1/i, 'Must check for duplicate count > 1');
    assert.match(sql, /RAISE\s+EXCEPTION/i, 'Must raise exception on duplicate');
  });

  await t.test('3. UserPermissionOverride global duplicate preflight exists and fails closed', () => {
    assert.match(sql, /FROM\s+"UserPermissionOverride"/i, 'Must check UserPermissionOverride table in preflight');
    assert.match(sql, /GROUP\s+BY\s+"userId",\s+"permissionId"/i, 'Must group by userId and permissionId');
    assert.match(sql, /RAISE\s+EXCEPTION/i, 'Must raise exception on duplicate override');
  });

  await t.test('4. Conflicting global override preflight exists', () => {
    assert.match(sql, /COUNT\(DISTINCT\s+"isGranted"\)\s+>\s+1/i, 'Must check for conflicting isGranted values');
  });

  await t.test('5. UserRole partial unique index definition is exact and bounded', () => {
    assert.match(
      sql,
      /CREATE\s+UNIQUE\s+INDEX\s+"UserRole_userId_roleId_global_key"\s+ON\s+"UserRole"\s*\("userId",\s*"roleId"\)\s+WHERE\s+"projectId"\s+IS\s+NULL;/i,
      'Exact UserRole partial unique index statement required'
    );
  });

  await t.test('6. UserPermissionOverride partial unique index definition is exact and bounded', () => {
    assert.match(
      sql,
      /CREATE\s+UNIQUE\s+INDEX\s+"UserPermissionOverride_userId_permissionId_global_key"\s+ON\s+"UserPermissionOverride"\s*\("userId",\s*"permissionId"\)\s+WHERE\s+"projectId"\s+IS\s+NULL;/i,
      'Exact UserPermissionOverride partial unique index statement required'
    );
  });

  await t.test('7. No automatic DELETE, UPDATE, TRUNCATE, or DROP data repairs in migration', () => {
    assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i, 'No automatic DELETE allowed');
    assert.doesNotMatch(sql, /\bUPDATE\s+"UserRole"\b/i, 'No automatic UPDATE allowed');
    assert.doesNotMatch(sql, /\bUPDATE\s+"UserPermissionOverride"\b/i, 'No automatic UPDATE allowed');
    assert.doesNotMatch(sql, /\bTRUNCATE\b/i, 'No TRUNCATE allowed');
    assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i, 'No DROP TABLE allowed');
    assert.doesNotMatch(sql, /\bDROP\s+INDEX\b/i, 'No DROP INDEX allowed');
  });

  await t.test('8. Existing 3-column project-scoped unique index contract in schema.prisma remains unchanged', () => {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    assert.match(schema, /@@unique\(\[userId, roleId, projectId\]\)/, 'UserRole 3-column unique constraint must remain');
    assert.match(schema, /@@unique\(\[userId, permissionId, projectId\]\)/, 'UserPermissionOverride 3-column unique constraint must remain');
  });
});
