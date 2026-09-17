import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Project Context & Security Foundation', () => {
  const schemaContent = fs.readFileSync(path.join(process.cwd(), 'prisma/schema.prisma'), 'utf-8');
  const migrationContent = fs.readFileSync(path.join(process.cwd(), 'prisma/migrations/20260917120000_project_context_foundation/migration.sql'), 'utf-8');

  describe('1. MIGRATION SAFETY', () => {
    it('migration/preflight blocks if unmapped projects exist', () => {
      assert.match(migrationContent, /orphan_count > 0/, 'Migration must check for orphans');
      assert.match(migrationContent, /RAISE EXCEPTION/, 'Migration must raise exception on orphans');
    });

    it('migration does not create fake projects', () => {
      assert.doesNotMatch(migrationContent, /Migrated Project/, 'Must not generate stub projects');
      assert.doesNotMatch(migrationContent, /INSERT INTO "Project"/, 'Must not insert stub projects automatically');
    });

    it('FK prevents orphan projectIds', () => {
      assert.match(migrationContent, /FOREIGN KEY \("projectId"\) REFERENCES "Project"\("id"\)/, 'Must add foreign keys');
    });
  });

  describe('2. DELETE SAFETY & FK SEMANTICS', () => {
    it('Project delete does not cascade UserRole', () => {
      const userRoleDef = schemaContent.match(/model UserRole \{[^}]+\}/)?.[0];
      assert.ok(userRoleDef, 'UserRole model exists');
      assert.match(userRoleDef, /project\s+Project\?\s+@relation[^\n]*onDelete: Restrict/, 'UserRole must have onDelete: Restrict for project');
      assert.doesNotMatch(userRoleDef, /project\s+Project\?\s+@relation[^\n]*onDelete: Cascade/, 'UserRole must not have Cascade delete for project');
    });

    it('Project delete does not cascade UserPermissionOverride', () => {
      const overrideDef = schemaContent.match(/model UserPermissionOverride \{[^}]+\}/)?.[0];
      assert.ok(overrideDef, 'UserPermissionOverride model exists');
      assert.match(overrideDef, /project\s+Project\?\s+@relation[^\n]*onDelete: Restrict/, 'Override must have onDelete: Restrict for project');
      assert.doesNotMatch(overrideDef, /project\s+Project\?\s+@relation[^\n]*onDelete: Cascade/, 'Override must not have Cascade delete for project');
    });
  });

  describe('3. PROJECT LIFECYCLE', () => {
    it('ProjectStatus enum exists and is used', () => {
      assert.match(schemaContent, /enum ProjectStatus {/, 'Enum ProjectStatus must exist');
      assert.match(schemaContent, /status\s+ProjectStatus/, 'Project model must use ProjectStatus enum');
    });
  });
});
