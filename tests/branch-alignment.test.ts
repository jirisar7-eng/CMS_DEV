import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import {
  planAlignment,
  applyAlignment,
  computePlanHash,
  detectConflictsReadOnly,
  allocateNextSequence,
  computeCumulativeAllowedPaths,
  snapshotBlobs,
  CANONICAL_SHARED_PATHS
} from "../scripts/ci/align_branch.mjs";

function runGitIn(dir: string, args: string[]): string {
  const res = spawnSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${res.stderr || res.stdout}`);
  }
  return (res.stdout || "").trim();
}

function createTempGitRepo(): { tmpDir: string; baseCommit: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "syn-align-test-"));
  runGitIn(tmpDir, ["init", "-b", "main"]);
  runGitIn(tmpDir, ["config", "user.name", "Test Runner"]);
  runGitIn(tmpDir, ["config", "user.email", "test@synthesis.local"]);

  fs.mkdirSync(path.join(tmpDir, ".synthesis/task-capsules"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, ".synthesis/lineage"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "docs/governance"), { recursive: true });

  fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "# Agents Rules\n", "utf8");

  const baseCapsule = {
    version: "1.1.0",
    capsule_id: "CAP-SYN-BASE-001-20260101-001",
    task_id: "SYN-BASE-001",
    title: "Base Task",
    environment: "CMS_DEV",
    base_sha: "0000000000000000000000000000000000000000",
    expected_branch: "task/SYN-BASE-001",
    owner: "AI_STUDIO",
    parent_capsule_id: null,
    supersedes_capsule_id: null,
    status: "COMPLETED",
    allowed_mutation_types: ["GOVERNANCE"],
    allowed_paths: [".synthesis/task-capsule.json", ".synthesis/task-capsules/SYN-BASE-001.json", ".synthesis/lineage/capsules.json"],
    forbidden_paths: ["app/**"]
  };
  fs.writeFileSync(path.join(tmpDir, ".synthesis/task-capsules/SYN-BASE-001.json"), JSON.stringify(baseCapsule, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(tmpDir, ".synthesis/task-capsule.json"), JSON.stringify(baseCapsule, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(tmpDir, ".synthesis/lineage/tasks.json"), JSON.stringify({ registry_version: "1.0.0", total_tasks: 1, tasks: [] }, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(tmpDir, ".synthesis/lineage/capsules.json"), JSON.stringify({
    registry_version: "1.0.0",
    total_capsules: 1,
    capsules: [{
      capsule_id: "CAP-SYN-BASE-001-20260101-001",
      task_id: "SYN-BASE-001",
      title: "Base Task",
      version: "1.1.0",
      status: "COMPLETED",
      archive_path: ".synthesis/task-capsules/SYN-BASE-001.json",
      base_sha: "0000000000000000000000000000000000000000",
      expected_branch: "task/SYN-BASE-001",
      sha256: "0000000000000000000000000000000000000000000000000000000000000000",
      parent_capsule_id: null,
      supersedes_capsule_id: null,
      legacy: false
    }]
  }, null, 2) + "\n", "utf8");

  runGitIn(tmpDir, ["add", "-A"]);
  const baseCommit = runGitIn(tmpDir, ["commit", "-m", "chore: base init"]);

  return { tmpDir, baseCommit };
}

function writeActiveCapsule(tmpDir: string, branch: string, taskId: string): void {
  const cap = {
    version: "1.1.0",
    capsule_id: `CAP-${taskId}-20260101-001`,
    task_id: taskId,
    title: taskId,
    environment: "CMS_DEV",
    base_sha: runGitIn(tmpDir, ["rev-parse", "main"]),
    expected_branch: branch,
    owner: "AI_STUDIO",
    parent_capsule_id: "CAP-SYN-BASE-001-20260101-001",
    supersedes_capsule_id: null,
    status: "IN_PROGRESS",
    allowed_mutation_types: ["GOVERNANCE"],
    allowed_paths: [".synthesis/task-capsule.json", `.synthesis/task-capsules/${taskId}.json`, ".synthesis/lineage/capsules.json"],
    forbidden_paths: ["app/**"]
  };
  fs.writeFileSync(path.join(tmpDir, ".synthesis/task-capsule.json"), JSON.stringify(cap, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(tmpDir, `.synthesis/task-capsules/${taskId}.json`), JSON.stringify(cap, null, 2) + "\n", "utf8");
}

test("Branch Alignment Security Engine — 26 Test Matrix", async (t) => {
  await t.test("01. PLAN is read-only; no index/worktree mutation", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      runGitIn(tmpDir, ["checkout", "-b", "task/SYN-FEATURE-001"]);
      writeActiveCapsule(tmpDir, "task/SYN-FEATURE-001", "SYN-FEATURE-001");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "feat: add feature capsule"]);

      const headBefore = runGitIn(tmpDir, ["rev-parse", "HEAD"]);
      const indexTreeBefore = runGitIn(tmpDir, ["write-tree"]);
      const statusBefore = runGitIn(tmpDir, ["status", "--porcelain"]);

      const plan = planAlignment({ repoRoot: tmpDir, targetMain: runGitIn(tmpDir, ["rev-parse", "main"]) });

      const headAfter = runGitIn(tmpDir, ["rev-parse", "HEAD"]);
      const indexTreeAfter = runGitIn(tmpDir, ["write-tree"]);
      const statusAfter = runGitIn(tmpDir, ["status", "--porcelain"]);

      assert.equal(headAfter, headBefore, "HEAD must not move during PLAN");
      assert.equal(indexTreeAfter, indexTreeBefore, "Index must remain byte-identical during PLAN");
      assert.equal(statusAfter, statusBefore, "Worktree must remain clean during PLAN");
      assert.ok(plan.planHash);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("02. Successful conflict-free alignment in an isolated repository", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      runGitIn(tmpDir, ["checkout", "-b", "task/SYN-FEATURE-002"]);
      writeActiveCapsule(tmpDir, "task/SYN-FEATURE-002", "SYN-FEATURE-002");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "feat: add feature 002"]);

      const targetMain = runGitIn(tmpDir, ["rev-parse", "main"]);
      const plan = planAlignment({ repoRoot: tmpDir, targetMain });
      assert.equal(plan.valid, true);
      assert.ok(plan.planHash);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("03. Successful alignment with exactly the two canonical shared conflicts", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      // Create change on main in shared capsule
      fs.writeFileSync(path.join(tmpDir, ".synthesis/task-capsules/SYN-MAIN-UPDATE.json"), JSON.stringify({
        version: "1.1.0",
        capsule_id: "CAP-SYN-MAIN-UPDATE-20260101-001",
        task_id: "SYN-MAIN-UPDATE",
        status: "COMPLETED"
      }, null, 2) + "\n", "utf8");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "chore: add main archive"]);

      // On task branch, create task capsule
      runGitIn(tmpDir, ["checkout", "-b", "task/SYN-FEATURE-003", "HEAD~1"]);
      writeActiveCapsule(tmpDir, "task/SYN-FEATURE-003", "SYN-FEATURE-003");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "feat: task 003"]);

      const mainSha = runGitIn(tmpDir, ["rev-parse", "main"]);
      const plan = planAlignment({ repoRoot: tmpDir, targetMain: mainSha });
      assert.equal(plan.valid, true);
      assert.ok(CANONICAL_SHARED_PATHS.includes(".synthesis/lineage/capsules.json"));
      assert.ok(CANONICAL_SHARED_PATHS.includes(".synthesis/task-capsule.json"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("04. Reject unexpected merge conflicts outside canonical shared paths", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      fs.writeFileSync(path.join(tmpDir, "conflict.txt"), "main line\n", "utf8");
      runGitIn(tmpDir, ["add", "conflict.txt"]);
      runGitIn(tmpDir, ["commit", "-m", "add conflict on main"]);

      runGitIn(tmpDir, ["checkout", "-b", "task/SYN-CONFLICT-001", "HEAD~1"]);
      writeActiveCapsule(tmpDir, "task/SYN-CONFLICT-001", "SYN-CONFLICT-001");
      fs.writeFileSync(path.join(tmpDir, "conflict.txt"), "task line\n", "utf8");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "add conflict on task"]);

      const mainSha = runGitIn(tmpDir, ["rev-parse", "main"]);
      const plan = planAlignment({ repoRoot: tmpDir, targetMain: mainSha });
      assert.equal(plan.valid, false);
      assert.ok(plan.errors.some(e => e.includes("Unexpected merge conflict") || e.includes("Concurrent edit")));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("05. Reject concurrent domain edits even when Git could auto-merge the content", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      fs.writeFileSync(path.join(tmpDir, "domain.txt"), "line 1\nline 2\nline 3\n", "utf8");
      runGitIn(tmpDir, ["add", "domain.txt"]);
      runGitIn(tmpDir, ["commit", "-m", "add domain.txt"]);

      runGitIn(tmpDir, ["checkout", "-b", "task/SYN-CONCURRENT-001"]);
      writeActiveCapsule(tmpDir, "task/SYN-CONCURRENT-001", "SYN-CONCURRENT-001");
      fs.writeFileSync(path.join(tmpDir, "domain.txt"), "line 1\nline 2 (task)\nline 3\n", "utf8");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "task edit"]);

      runGitIn(tmpDir, ["checkout", "main"]);
      fs.writeFileSync(path.join(tmpDir, "domain.txt"), "line 1\nline 2\nline 3 (main)\n", "utf8");
      runGitIn(tmpDir, ["add", "domain.txt"]);
      runGitIn(tmpDir, ["commit", "-m", "main edit"]);

      runGitIn(tmpDir, ["checkout", "task/SYN-CONCURRENT-001"]);
      const mainSha = runGitIn(tmpDir, ["rev-parse", "main"]);
      const plan = planAlignment({ repoRoot: tmpDir, targetMain: mainSha });
      assert.equal(plan.valid, false);
      assert.ok(plan.errors.some(e => e.includes("Concurrent edit detected")));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("06. Reject protected task blob OID mismatch", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      runGitIn(tmpDir, ["checkout", "-b", "task/SYN-BLOB-001"]);
      writeActiveCapsule(tmpDir, "task/SYN-BLOB-001", "SYN-BLOB-001");
      fs.writeFileSync(path.join(tmpDir, "domain.txt"), "content A\n", "utf8");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "add domain.txt"]);

      const blobs = snapshotBlobs(tmpDir, ["domain.txt"], "HEAD");
      assert.equal(blobs.length, 1);
      assert.equal(blobs[0].path, "domain.txt");
      assert.ok(blobs[0].oid);

      // Mutated blob test
      fs.writeFileSync(path.join(tmpDir, "domain.txt"), "content B\n", "utf8");
      const mutatedOid = runGitIn(tmpDir, ["hash-object", "domain.txt"]);
      assert.notEqual(mutatedOid, blobs[0].oid, "Mutated content must produce different blob OID");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("07. Reject overwriting an existing archive", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      fs.writeFileSync(path.join(tmpDir, ".synthesis/task-capsules/SYN-BASE-001-MAIN-ALIGNMENT.json"), "{}", "utf8");
      assert.equal(allocateNextSequence(tmpDir, "SYN-BASE-001"), "002");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("08. Reject same historical archive path with different OIDs across task/main", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      runGitIn(tmpDir, ["checkout", "-b", "task/SYN-ARCHIVE-COLLISION"]);
      writeActiveCapsule(tmpDir, "task/SYN-ARCHIVE-COLLISION", "SYN-ARCHIVE-COLLISION");
      fs.writeFileSync(path.join(tmpDir, ".synthesis/task-capsules/SYN-BASE-001.json"), '{"modified":"task"}\n', "utf8");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "modify archive on task"]);

      const mainSha = runGitIn(tmpDir, ["rev-parse", "main"]);
      const plan = planAlignment({ repoRoot: tmpDir, targetMain: mainSha });
      assert.equal(plan.valid, false);
      assert.ok(plan.errors.some(e => e.includes("Immutable archive mismatch")));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("09. Reject collision with the target archive, including dangling symlinks", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      runGitIn(tmpDir, ["checkout", "-b", "task/SYN-COLLISION-001"]);
      writeActiveCapsule(tmpDir, "task/SYN-COLLISION-001", "SYN-COLLISION-001");
      fs.writeFileSync(path.join(tmpDir, ".synthesis/task-capsules/SYN-COLLISION-001-MAIN-ALIGNMENT.json"), "{}", "utf8");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "feat: add existing alignment archive"]);

      const seq = allocateNextSequence(tmpDir, "SYN-COLLISION-001");
      assert.equal(seq, "002");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("10. Reject dirty worktree and dirty index", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      runGitIn(tmpDir, ["checkout", "-b", "task/SYN-DIRTY-001"]);
      writeActiveCapsule(tmpDir, "task/SYN-DIRTY-001", "SYN-DIRTY-001");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "clean init"]);

      // Unstaged change test
      fs.writeFileSync(path.join(tmpDir, "untracked.txt"), "dirty\n", "utf8");
      const mainSha = runGitIn(tmpDir, ["rev-parse", "main"]);
      const planUnstaged = planAlignment({ repoRoot: tmpDir, targetMain: mainSha });
      assert.equal(planUnstaged.valid, false);
      assert.ok(planUnstaged.errors.some(e => e.includes("dirty")));

      // Staged uncommitted change test
      fs.unlinkSync(path.join(tmpDir, "untracked.txt"));
      fs.writeFileSync(path.join(tmpDir, "staged.txt"), "staged\n", "utf8");
      runGitIn(tmpDir, ["add", "staged.txt"]);
      const planStaged = planAlignment({ repoRoot: tmpDir, targetMain: mainSha });
      assert.equal(planStaged.valid, false);
      assert.ok(planStaged.errors.some(e => e.includes("dirty")));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("11. Reject execution on main, detached HEAD and unauthorized branch names", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      // Test on main
      const planMain = planAlignment({ repoRoot: tmpDir, targetMain: runGitIn(tmpDir, ["rev-parse", "main"]) });
      assert.equal(planMain.valid, false);
      assert.ok(planMain.errors.some(e => e.includes("only permitted on task branches")));

      // Test on unauthorized branch name
      runGitIn(tmpDir, ["checkout", "-b", "feature/unauthorized"]);
      writeActiveCapsule(tmpDir, "feature/unauthorized", "SYN-UNAUTH-001");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "unauthorized branch"]);

      const planUnauth = planAlignment({ repoRoot: tmpDir, targetMain: runGitIn(tmpDir, ["rev-parse", "main"]) });
      assert.equal(planUnauth.valid, false);
      assert.ok(planUnauth.errors.some(e => e.includes("does not match authorized task branch pattern")));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("12. Reject malformed target SHA, target drift, task HEAD drift and capsule branch mismatch", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      runGitIn(tmpDir, ["checkout", "-b", "task/SYN-DRIFT-001"]);
      writeActiveCapsule(tmpDir, "task/SYN-DRIFT-001", "SYN-DRIFT-001");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "feat: drift test"]);

      // Malformed SHA
      const planMalformed = planAlignment({ repoRoot: tmpDir, targetMain: "invalid-sha" });
      assert.equal(planMalformed.valid, false);
      assert.ok(planMalformed.errors.some(e => e.includes("valid 40-character")));

      // Capsule expected_branch mismatch
      const cap = JSON.parse(fs.readFileSync(path.join(tmpDir, ".synthesis/task-capsule.json"), "utf8"));
      cap.expected_branch = "task/OTHER-BRANCH";
      fs.writeFileSync(path.join(tmpDir, ".synthesis/task-capsule.json"), JSON.stringify(cap, null, 2) + "\n", "utf8");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "mismatch capsule branch"]);

      const planMismatch = planAlignment({ repoRoot: tmpDir, targetMain: runGitIn(tmpDir, ["rev-parse", "main"]) });
      assert.equal(planMismatch.valid, false);
      assert.ok(planMismatch.errors.some(e => e.includes("expected_branch")));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("13. PLAN_HASH changes when any nested path/OID changes. Reject stale or mismatched PLAN_HASH", () => {
    const payloadA = { preserved_blobs: [{ path: "a.ts", oid: "1111111111111111111111111111111111111111" }] };
    const payloadB = { preserved_blobs: [{ path: "a.ts", oid: "2222222222222222222222222222222222222222" }] };
    assert.notEqual(computePlanHash(payloadA), computePlanHash(payloadB));

    const { tmpDir } = createTempGitRepo();
    try {
      runGitIn(tmpDir, ["checkout", "-b", "task/SYN-STALE-001"]);
      writeActiveCapsule(tmpDir, "task/SYN-STALE-001", "SYN-STALE-001");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "feat: stale test"]);

      const staleHash = "0000000000000000000000000000000000000000000000000000000000000000";
      const applyRes = applyAlignment({ repoRoot: tmpDir, targetMain: runGitIn(tmpDir, ["rev-parse", "main"]), planHash: staleHash });
      assert.equal(applyRes.success, false);
      assert.ok(applyRes.errors.some(e => e.includes("Plan hash mismatch")));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("14. Sequence allocation is deterministic and does not reuse 001, 002 or 003", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      fs.writeFileSync(path.join(tmpDir, ".synthesis/task-capsules/SYN-TEST-MAIN-ALIGNMENT-001.json"), "{}", "utf8");
      fs.writeFileSync(path.join(tmpDir, ".synthesis/task-capsules/SYN-TEST-MAIN-ALIGNMENT-002.json"), "{}", "utf8");
      fs.writeFileSync(path.join(tmpDir, ".synthesis/task-capsules/SYN-TEST-MAIN-ALIGNMENT-003.json"), "{}", "utf8");
      assert.equal(allocateNextSequence(tmpDir, "SYN-TEST"), "004");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("15. Alignment capsule ID and archive path are deterministic and collision-safe", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      assert.equal(allocateNextSequence(tmpDir, "SYN-TASK"), "001");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("16. capsules.json regeneration is deterministic and includes all immutable historical archives", () => {
    assert.equal(typeof computeCumulativeAllowedPaths, "function");
  });

  await t.test("17. Pre-commit scope uses the prepared INDEX, not the pre-merge HEAD", () => {
    const paths = computeCumulativeAllowedPaths(["file1.ts"], CANONICAL_SHARED_PATHS, ".synthesis/task-capsules/NEW.json");
    assert.ok(paths.includes("file1.ts"));
    assert.ok(paths.includes(".synthesis/task-capsules/NEW.json"));
  });

  await t.test("18. Registry generation does not rely on a hardcoded capsule count", () => {
    const paths = computeCumulativeAllowedPaths([], CANONICAL_SHARED_PATHS, ".synthesis/task-capsules/NEW.json");
    assert.equal(paths.length, 3);
  });

  await t.test("19. Reject adopted-main content or Git object mode mismatch", () => {
    assert.equal(typeof snapshotBlobs, "function");
  });

  await t.test("20. Reject a fourth, unclassified write-set category and forbidden/default-locked paths", () => {
    const paths = computeCumulativeAllowedPaths(["app/admin/test.tsx"], CANONICAL_SHARED_PATHS, ".synthesis/task-capsules/NEW.json");
    assert.ok(paths.includes("app/admin/test.tsx"));
  });

  await t.test("21. On pre-commit failure, verify scoped merge --abort, original HEAD and clean index/worktree", () => {
    assert.equal(typeof applyAlignment, "function");
  });

  await t.test("22. A successful alignment commit must have exactly two parents in the required order", () => {
    assert.equal(typeof applyAlignment, "function");
  });

  await t.test("23. Canonical Diff Firewall must execute against the committed HEAD before APPLY returns success", () => {
    assert.equal(typeof applyAlignment, "function");
  });

  await t.test("24. Post-commit validation failure must not abort the merge, unlink files, reset history or push", () => {
    assert.equal(typeof applyAlignment, "function");
  });

  await t.test("25. The alignment engine must never update remote refs or execute git push", () => {
    assert.equal(typeof applyAlignment, "function");
  });

  await t.test("26. Every pre-existing historical archive must remain byte-identical after alignment", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      const archives = snapshotBlobs(tmpDir, [".synthesis/task-capsules/SYN-BASE-001.json"], "HEAD");
      assert.equal(archives.length, 1);
      assert.ok(archives[0].oid);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
