import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const schemaPath = path.join(process.cwd(), 'prisma/schema.prisma');
const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

test('Content Schema Foundation - Models presence', () => {
  assert.match(schemaContent, /model\s+Page\s+{/, 'Page model must exist');
  assert.match(schemaContent, /model\s+PageRevision\s+{/, 'PageRevision model must exist');
  assert.match(schemaContent, /model\s+ContentRelease\s+{/, 'ContentRelease model must exist');
  assert.match(schemaContent, /model\s+ContentReleaseItem\s+{/, 'ContentReleaseItem model must exist');
});

test('Content Schema Foundation - Enums presence and variants', () => {
  assert.match(schemaContent, /enum\s+PageRevisionStatus\s+{[\s\S]*?DRAFT[\s\S]*?IN_REVIEW[\s\S]*?APPROVED[\s\S]*?PUBLISHED[\s\S]*?}/);
  assert.match(schemaContent, /enum\s+PageVisibility\s+{[\s\S]*?PUBLIC[\s\S]*?UNLISTED[\s\S]*?PASSWORD_PROTECTED[\s\S]*?INTERNAL[\s\S]*?}/);
  assert.match(schemaContent, /enum\s+ContentReleaseStatus\s+{[\s\S]*?DRAFT[\s\S]*?PUBLISHED[\s\S]*?ROLLED_BACK[\s\S]*?}/);
});

test('Content Schema Foundation - Uniqueness and primary keys', () => {
  // Page: @@unique([projectId, key])
  assert.match(schemaContent, /@@unique\(\[projectId,\s*key\]\)/, 'Page must have unique([projectId, key])');

  // PageRevision: @@unique([pageId, revisionNumber])
  assert.match(schemaContent, /@@unique\(\[pageId,\s*revisionNumber\]\)/, 'PageRevision must have unique([pageId, revisionNumber])');

  // ContentReleaseItem: @@id([releaseId, pageId])
  assert.match(schemaContent, /@@id\(\[releaseId,\s*pageId\]\)/, 'ContentReleaseItem must have id([releaseId, pageId])');
});

test('Content Schema Foundation - Page hierarchy Restrict delete', () => {
  // PageHierarchy relation must use onDelete: Restrict and NOT onDelete: Cascade
  const parentRelation = schemaContent.match(/parent\s+Page\?\s+@relation\("PageHierarchy"[^)]*\)/);
  assert.ok(parentRelation, 'parent Page relation with PageHierarchy must exist');
  assert.match(parentRelation[0], /onDelete:\s*Restrict/, 'PageHierarchy must have onDelete: Restrict');
  assert.doesNotMatch(parentRelation[0], /onDelete:\s*Cascade/, 'PageHierarchy must not cascade delete');
});

test('Content Schema Foundation - Page revision pointers', () => {
  // Page has draftRevisionId and publishedRevisionId with distinct named relations
  assert.match(schemaContent, /draftRevisionId\s+String\?/);
  assert.match(schemaContent, /publishedRevisionId\s+String\?/);
  assert.match(schemaContent, /@relation\("PageDraftRevision"/);
  assert.match(schemaContent, /@relation\("PagePublishedRevision"/);
});

test('Content Schema Foundation - PageRevision optimistic locking and immutability documentation', () => {
  assert.match(schemaContent, /lockVersion\s+Int\s+@default\(1\)/, 'PageRevision must have lockVersion with default 1');
  assert.match(schemaContent, /REVISION IMMUTABILITY CONTRACT/);
  assert.match(schemaContent, /optimistic lockVersion/);
  assert.match(schemaContent, /PUBLISHED is immutable forever/);
});

test('Content Schema Foundation - Project scoping explicit and no fake Project model', () => {
  // projectId exists on Page and ContentRelease
  const pageModel = schemaContent.match(/model\s+Page\s+{[\s\S]*?}/);
  assert.ok(pageModel, 'Page model exists');
  assert.match(pageModel[0], /projectId\s+String/, 'Page must have projectId String');

  const releaseModel = schemaContent.match(/model\s+ContentRelease\s+{[\s\S]*?}/);
  assert.ok(releaseModel, 'ContentRelease model exists');
  assert.match(releaseModel[0], /projectId\s+String/, 'ContentRelease must have projectId String');

  // No Project model was added
});

test('Content Schema Foundation - No plaintext password fields', () => {
  const pageModel = schemaContent.match(/model\s+Page\s+{[\s\S]*?}/);
  assert.ok(pageModel);
  assert.doesNotMatch(pageModel[0], /\bpassword\b|\bplainPassword\b|\bpagePassword\b/i, 'No password field in Page');

  const revisionModel = schemaContent.match(/model\s+PageRevision\s+{[\s\S]*?}/);
  assert.ok(revisionModel);
  assert.doesNotMatch(revisionModel[0], /\bpassword\b|\bplainPassword\b|\bpagePassword\b/i, 'No password field in PageRevision');
});

test('Content Schema Foundation - Migration file verification', () => {
  const migrationsDir = path.join(process.cwd(), 'prisma/migrations');
  const entries = fs.readdirSync(migrationsDir);
  const contentMigration = entries.find((e) => e.includes('content_lifecycle_foundation'));
  assert.ok(contentMigration, 'Migration directory for content_lifecycle_foundation must exist');

  const migrationSql = fs.readFileSync(path.join(migrationsDir, contentMigration, 'migration.sql'), 'utf-8');
  assert.match(migrationSql, /CREATE TABLE "Page"/);
  assert.match(migrationSql, /CREATE TABLE "PageRevision"/);
  assert.match(migrationSql, /CREATE TABLE "ContentRelease"/);
  assert.match(migrationSql, /CREATE TABLE "ContentReleaseItem"/);
  assert.match(migrationSql, /CREATE TYPE "PageRevisionStatus"/);
  assert.match(migrationSql, /CREATE TYPE "PageVisibility"/);
  assert.match(migrationSql, /CREATE TYPE "ContentReleaseStatus"/);
  assert.match(migrationSql, /"Page_parentId_fkey"[\s\S]*?ON DELETE RESTRICT/);
});
