// @ts-nocheck
import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateLineage, resolveRepoRoot } from '../scripts/lineage/validate.mjs';

const repoRoot = resolveRepoRoot();
const tasksPath = path.join(repoRoot, '.synthesis/lineage/tasks.json');
const capabilitiesPath = path.join(repoRoot, '.synthesis/lineage/capabilities.json');
const capsulesDir = path.join(repoRoot, '.synthesis/task-capsules');

describe('SYN-GOV-LINEAGE-001: Authoritative Implementation Lineage & Capability Registry', () => {
  const rawTasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
  const rawCapabilities = JSON.parse(fs.readFileSync(capabilitiesPath, 'utf8'));

  it('1. Validates current production graph deterministically with zero errors', () => {
    const res = validateLineage({ repoRoot });
    assert.strictEqual(res.valid, true, `Expected valid lineage, got errors: ${res.errors.join(', ')}`);
    assert.strictEqual(res.errors.length, 0);
    assert.strictEqual(res.summary.tasksCount, 34);
    assert.strictEqual(res.summary.capabilitiesCount, 13);
  });

  it('2. PR #1 bootstrap record without capsule is valid and explicitly recorded', () => {
    const pr1 = rawTasks.tasks.find((t: any) => t.pr_number === 1);
    assert.ok(pr1, 'PR #1 record must exist');
    assert.strictEqual(pr1.capsule_present, false, 'PR #1 capsule_present must be false');
    assert.strictEqual(pr1.task_id, null, 'PR #1 task_id must be null');
    assert.strictEqual(pr1.capsule_sha256, null, 'PR #1 capsule_sha256 must be null');
    assert.strictEqual(pr1.derived_status, 'MERGED', 'PR #1 derived_status must be MERGED');
    assert.ok(Array.isArray(pr1.actual_changed_files) && pr1.actual_changed_files.length > 0);
  });

  it('3. PR #1 through #34 are all represented exactly once without gaps or duplicates', () => {
    assert.strictEqual(rawTasks.tasks.length, 34);
    const prNumbers = rawTasks.tasks.map((t: any) => t.pr_number).sort((a: number, b: number) => a - b);
    const expected = Array.from({ length: 34 }, (_, i) => i + 1);
    assert.deepStrictEqual(prNumbers, expected);
  });

  it('4. Non-null task IDs are strictly unique across all historical tasks', () => {
    const nonNullTaskIds = rawTasks.tasks.filter((t: any) => t.task_id !== null).map((t: any) => t.task_id);
    assert.strictEqual(nonNullTaskIds.length, 33);
    const uniqueTaskIds = new Set(nonNullTaskIds);
    assert.strictEqual(uniqueTaskIds.size, 33, 'Expected 33 unique task IDs');
  });

  it('5. Historical IN_PROGRESS capsule + derived MERGED is valid evidence', () => {
    const inProgressTasks = rawTasks.tasks.filter((t: any) => t.capsule_declared_status === 'IN_PROGRESS');
    assert.ok(inProgressTasks.length > 0, 'Expected historical tasks with declared status IN_PROGRESS');
    for (const t of inProgressTasks) {
      assert.strictEqual(t.derived_status, 'MERGED', `Task ${t.task_id} derived status must be MERGED`);
      const capsuleFile = path.join(capsulesDir, `${t.task_id}.json`);
      assert.ok(fs.existsSync(capsuleFile), `Archived capsule must exist for ${t.task_id}`);
      const raw = JSON.parse(fs.readFileSync(capsuleFile, 'utf8'));
      assert.strictEqual(raw.status, 'IN_PROGRESS', 'Raw archive must preserve historical IN_PROGRESS status');
    }
  });

  it('6. Archived capsule SHA-256 integrity holds for all 33 historical capsules', () => {
    const capsuleTasks = rawTasks.tasks.filter((t: any) => t.capsule_present === true);
    assert.strictEqual(capsuleTasks.length, 33);
    for (const t of capsuleTasks) {
      const capsuleFile = path.join(capsulesDir, `${t.task_id}.json`);
      assert.ok(fs.existsSync(capsuleFile), `Archived file missing: ${capsuleFile}`);
      const rawContent = fs.readFileSync(capsuleFile, 'utf8');
      const hash = crypto.createHash('sha256').update(rawContent, 'utf8').digest('hex');
      assert.strictEqual(hash, t.capsule_sha256, `SHA-256 mismatch for task ${t.task_id}`);
    }
  });

  it('7. Fails closed when duplicate task ID is introduced', () => {
    const mutated = JSON.parse(JSON.stringify(rawTasks));
    mutated.tasks[2].task_id = mutated.tasks[1].task_id; // introduce duplicate
    const res = validateLineage({ repoRoot, tasksData: mutated });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes('Duplicate task_id detected')));
  });

  it('8. Fails closed when malformed SHA is introduced', () => {
    const mutated = JSON.parse(JSON.stringify(rawTasks));
    mutated.tasks[5].base_sha = 'not-a-valid-sha';
    const res = validateLineage({ repoRoot, tasksData: mutated });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes('malformed SHA')));
  });

  it('9. Fails closed when archive capsule file is missing', () => {
    const mutated = JSON.parse(JSON.stringify(rawTasks));
    mutated.tasks[10].task_id = 'SYN-NON-EXISTENT-TASK-999';
    const res = validateLineage({ repoRoot, tasksData: mutated });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes('archive file is missing')));
  });

  it('10. Fails closed when unknown capability dependency is declared', () => {
    const mutated = JSON.parse(JSON.stringify(rawCapabilities));
    mutated.capabilities[0].depends_on_capabilities.push('phantom_capability');
    const res = validateLineage({ repoRoot, capabilitiesData: mutated });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes('unknown capability dependency')));
  });

  it('11. Fails closed when capability dependency cycle is introduced', () => {
    const mutated = JSON.parse(JSON.stringify(rawCapabilities));
    const capA = mutated.capabilities.find((c: any) => c.capability_id === 'identity_rbac');
    const capB = mutated.capabilities.find((c: any) => c.capability_id === 'project_context');
    assert.ok(capA && capB);
    // capB already depends on capA ('identity_rbac')
    // Introduce reverse dependency: capA -> capB
    capA.depends_on_capabilities.push('project_context');
    const res = validateLineage({ repoRoot, capabilitiesData: mutated });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes('Capability dependency cycle detected')));
  });

  it('12. Fails closed when missing canonical owner paths or invalid visibility', () => {
    const mutatedPaths = JSON.parse(JSON.stringify(rawCapabilities));
    mutatedPaths.capabilities[1].canonical_owner_paths = [];
    const res1 = validateLineage({ repoRoot, capabilitiesData: mutatedPaths });
    assert.strictEqual(res1.valid, false);
    assert.ok(res1.errors.some((e: string) => e.includes('missing canonical owner paths')));

    const mutatedVis = JSON.parse(JSON.stringify(rawCapabilities));
    mutatedVis.capabilities[1].visibility = 'INVALID_VISIBILITY';
    const res2 = validateLineage({ repoRoot, capabilitiesData: mutatedVis });
    assert.strictEqual(res2.valid, false);
    assert.ok(res2.errors.some((e: string) => e.includes('invalid visibility enum')));
  });

  it('13. Explicitly records canonical architectural SSOT rules', () => {
    const ssot = rawCapabilities.ssot_rules;
    assert.ok(ssot, 'ssot_rules must exist in capabilities.json');
    assert.ok(ssot.content_ssot.includes('canonical content SSOT'));
    assert.ok(ssot.visual_editor_role.includes('adapter, NOT SSOT'));
    assert.ok(ssot.search_role.includes('derived/rebuildable index, NOT SSOT'));
    assert.ok(ssot.project_context_role.includes('canonical project/tenant boundary'));
    assert.ok(ssot.capability_map_role.includes('status/product navigation authority, NOT business-data SSOT'));
    assert.ok(ssot.redirect_runtime_role.includes('consumes published content + RedirectRule'));
    assert.ok(ssot.media_replace_role.includes('SAFELY_DISABLED / deferred'));
    assert.ok(ssot.sitemap_runtime_role.includes('planned / not falsely complete'));
  });
});
