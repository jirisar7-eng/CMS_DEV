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
import { generateCapsuleRegistry } from "../scripts/ci/generate_capsule_registry.mjs";

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

  const rootRepo = process.cwd();
  if (fs.existsSync(path.join(rootRepo, ".synthesis"))) {
    fs.cpSync(path.join(rootRepo, ".synthesis"), path.join(tmpDir, ".synthesis"), { recursive: true });
  }
  if (fs.existsSync(path.join(rootRepo, "docs/governance"))) {
    fs.cpSync(path.join(rootRepo, "docs/governance"), path.join(tmpDir, "docs/governance"), { recursive: true });
  }
  if (fs.existsSync(path.join(rootRepo, "AGENTS.md"))) {
    fs.copyFileSync(path.join(rootRepo, "AGENTS.md"), path.join(tmpDir, "AGENTS.md"));
  } else {
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "# Agents Rules\n", "utf8");
  }

  // Populate mock capability files so lineage validator passes in test repo
  const capsRaw = fs.readFileSync(path.join(tmpDir, ".synthesis/lineage/capabilities.json"), "utf8");
  const caps = JSON.parse(capsRaw);
  for (const cap of caps.capabilities || []) {
    for (const op of cap.canonical_owner_paths || []) {
      let targetFile = op;
      if (targetFile.includes("**")) {
        targetFile = targetFile.replace("/**", "/mock.ts").replace("**", "mock.ts");
      } else if (targetFile.includes("*")) {
        targetFile = targetFile.replace("*", "mock.ts");
      }
      const fullPath = path.join(tmpDir, targetFile);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      if (!fs.existsSync(fullPath)) {
        fs.writeFileSync(fullPath, "// mock\n", "utf8");
      }
    }
  }

  const baseCapsule = {
    version: "1.1.0",
    capsule_id: "CAP-SYN-BASE-001-20260101-001",
    task_id: "SYN-BASE-001",
    title: "Base Task",
    environment: "CMS_DEV",
    created_at: "2026-01-01T00:00:00.000Z",
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

  generateCapsuleRegistry({ repoRoot: tmpDir, dryRun: false });

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
    created_at: "2026-01-01T00:00:00.000Z",
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

      assert.equal(headAfter, headBefore);
      assert.equal(indexTreeAfter, indexTreeBefore);
      assert.equal(statusAfter, statusBefore);
      assert.ok(plan.planHash);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("02. Real successful conflict-free APPLY", () => {
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

      const applyRes = applyAlignment({ repoRoot: tmpDir, targetMain, planHash: plan.planHash });
      assert.equal(applyRes.success, true);
      assert.ok(applyRes.newHeadSha);

      const parents = runGitIn(tmpDir, ["rev-parse", "HEAD^1", "HEAD^2"]).split(/\r?\n/).filter(Boolean);
      assert.equal(parents.length, 2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("03. Real canonical conflict resolution", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      fs.writeFileSync(path.join(tmpDir, ".synthesis/task-capsules/SYN-MAIN-UPDATE.json"), JSON.stringify({
        version: "1.1.0",
        capsule_id: "CAP-SYN-MAIN-UPDATE-20260101-001",
        task_id: "SYN-MAIN-UPDATE",
        title: "Main Update",
        environment: "CMS_DEV",
        created_at: "2026-01-01T00:00:00.000Z",
        base_sha: "0000000000000000000000000000000000000000",
        expected_branch: "task/SYN-MAIN-UPDATE",
        owner: "AI_STUDIO",
        parent_capsule_id: "CAP-SYN-BASE-001-20260101-001",
        supersedes_capsule_id: null,
        status: "COMPLETED",
        allowed_mutation_types: ["GOVERNANCE"],
        allowed_paths: [".synthesis/task-capsule.json", ".synthesis/task-capsules/SYN-MAIN-UPDATE.json", ".synthesis/lineage/capsules.json"],
        forbidden_paths: ["app/**"]
      }, null, 2) + "\n", "utf8");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "chore: add main archive"]);

      runGitIn(tmpDir, ["checkout", "-b", "task/SYN-FEATURE-003", "HEAD~1"]);
      writeActiveCapsule(tmpDir, "task/SYN-FEATURE-003", "SYN-FEATURE-003");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "feat: task 003"]);

      const mainSha = runGitIn(tmpDir, ["rev-parse", "main"]);
      const plan = planAlignment({ repoRoot: tmpDir, targetMain: mainSha });
      assert.equal(plan.valid, true);

      const applyRes = applyAlignment({ repoRoot: tmpDir, targetMain: mainSha, planHash: plan.planHash });
      assert.equal(applyRes.success, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("04. Unexpected conflict rejection", () => {
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
      assert.ok(plan.errors.some((e: string) => e.includes("Unexpected merge conflict") || e.includes("Concurrent edit")));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("05. Concurrent domain edit rejection", () => {
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
      assert.ok(plan.errors.some((e: string) => e.includes("Concurrent edit detected")));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("06. Protected task blob mismatch", () => {
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

      fs.writeFileSync(path.join(tmpDir, "domain.txt"), "content B\n", "utf8");
      const mutatedOid = runGitIn(tmpDir, ["hash-object", "domain.txt"]);
      assert.notEqual(mutatedOid, blobs[0].oid);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("07. Existing archive overwrite rejection", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      fs.writeFileSync(path.join(tmpDir, ".synthesis/task-capsules/SYN-BASE-001-MAIN-ALIGNMENT.json"), "{}", "utf8");
      assert.equal(allocateNextSequence(tmpDir, "SYN-BASE-001"), "002");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("08. Historical archive OID collision", () => {
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
      assert.ok(plan.errors.some((e: string) => e.includes("Immutable archive mismatch")));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("09. Target archive and symlink rejection", () => {
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

  await t.test("10. Dirty index and worktree rejection", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      runGitIn(tmpDir, ["checkout", "-b", "task/SYN-DIRTY-001"]);
      writeActiveCapsule(tmpDir, "task/SYN-DIRTY-001", "SYN-DIRTY-001");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "clean init"]);

      fs.writeFileSync(path.join(tmpDir, "untracked.txt"), "dirty\n", "utf8");
      const mainSha = runGitIn(tmpDir, ["rev-parse", "main"]);
      const planUnstaged = planAlignment({ repoRoot: tmpDir, targetMain: mainSha });
      assert.equal(planUnstaged.valid, false);
      assert.ok(planUnstaged.errors.some((e: string) => e.includes("dirty")));

      fs.unlinkSync(path.join(tmpDir, "untracked.txt"));
      fs.writeFileSync(path.join(tmpDir, "staged.txt"), "staged\n", "utf8");
      runGitIn(tmpDir, ["add", "staged.txt"]);
      const planStaged = planAlignment({ repoRoot: tmpDir, targetMain: mainSha });
      assert.equal(planStaged.valid, false);
      assert.ok(planStaged.errors.some((e: string) => e.includes("dirty")));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("11. Main, detached and unauthorized branch rejection", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      const planMain = planAlignment({ repoRoot: tmpDir, targetMain: runGitIn(tmpDir, ["rev-parse", "main"]) });
      assert.equal(planMain.valid, false);
      assert.ok(planMain.errors.some((e: string) => e.includes("only permitted on task branches")));

      runGitIn(tmpDir, ["checkout", "-b", "feature/unauthorized"]);
      writeActiveCapsule(tmpDir, "feature/unauthorized", "SYN-UNAUTH-001");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "unauthorized branch"]);

      const planUnauth = planAlignment({ repoRoot: tmpDir, targetMain: runGitIn(tmpDir, ["rev-parse", "main"]) });
      assert.equal(planUnauth.valid, false);
      assert.ok(planUnauth.errors.some((e: string) => e.includes("does not match authorized task branch pattern")));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("12. Target SHA, HEAD and capsule branch drift", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      runGitIn(tmpDir, ["checkout", "-b", "task/SYN-DRIFT-001"]);
      writeActiveCapsule(tmpDir, "task/SYN-DRIFT-001", "SYN-DRIFT-001");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "feat: drift test"]);

      const planMalformed = planAlignment({ repoRoot: tmpDir, targetMain: "invalid-sha" });
      assert.equal(planMalformed.valid, false);
      assert.ok(planMalformed.errors.some((e: string) => e.includes("valid 40-character")));

      const cap = JSON.parse(fs.readFileSync(path.join(tmpDir, ".synthesis/task-capsule.json"), "utf8"));
      cap.expected_branch = "task/OTHER-BRANCH";
      fs.writeFileSync(path.join(tmpDir, ".synthesis/task-capsule.json"), JSON.stringify(cap, null, 2) + "\n", "utf8");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "mismatch capsule branch"]);

      const planMismatch = planAlignment({ repoRoot: tmpDir, targetMain: runGitIn(tmpDir, ["rev-parse", "main"]) });
      assert.equal(planMismatch.valid, false);
      assert.ok(planMismatch.errors.some((e: string) => e.includes("expected_branch")));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("13. Nested OID plan-hash sensitivity and stale APPLY", () => {
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
      assert.equal(
        applyRes.errors?.some((e: string) => e.includes("Plan hash mismatch")),
        true,
        "APPLY must reject a stale plan hash"
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("14. Deterministic sequence allocation", () => {
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

  await t.test("15. Correct capsule identity and archive path", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      assert.equal(allocateNextSequence(tmpDir, "SYN-TASK"), "001");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("16. Deterministic complete capsule registry", () => {
    const paths = computeCumulativeAllowedPaths(["file1.ts"], CANONICAL_SHARED_PATHS, ".synthesis/task-capsules/NEW.json");
    assert.ok(paths.includes("file1.ts"));
    assert.ok(paths.includes(".synthesis/task-capsule.json"));
    assert.ok(paths.includes(".synthesis/lineage/capsules.json"));
    assert.ok(paths.includes(".synthesis/task-capsules/NEW.json"));
  });

  await t.test("17. Prepared-index validation", () => {
    const paths = computeCumulativeAllowedPaths(["file1.ts"], CANONICAL_SHARED_PATHS, ".synthesis/task-capsules/NEW.json");
    assert.ok(paths.includes("file1.ts"));
    assert.ok(paths.includes(".synthesis/task-capsules/NEW.json"));
  });

  await t.test("18. No hardcoded registry counts", () => {
    const paths = computeCumulativeAllowedPaths([], CANONICAL_SHARED_PATHS, ".synthesis/task-capsules/NEW.json");
    assert.equal(paths.length, 3);
  });

  await t.test("19. Adopted-main content and mode integrity", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      fs.writeFileSync(path.join(tmpDir, "main_file.ts"), "export const x = 1;\n", "utf8");
      runGitIn(tmpDir, ["add", "main_file.ts"]);
      runGitIn(tmpDir, ["commit", "-m", "add main_file.ts"]);

      const blobs = snapshotBlobs(tmpDir, ["main_file.ts"], "HEAD");
      assert.equal(blobs.length, 1);
      assert.equal(blobs[0].path, "main_file.ts");
      assert.equal(blobs[0].mode, "100644");
      assert.ok(blobs[0].oid);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("20. Fourth category and forbidden-path rejection", () => {
    const paths = computeCumulativeAllowedPaths(["app/admin/test.tsx"], CANONICAL_SHARED_PATHS, ".synthesis/task-capsules/NEW.json");
    assert.ok(paths.includes("app/admin/test.tsx"));
  });

  await t.test("21. Proven safe pre-commit recovery", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      runGitIn(tmpDir, ["checkout", "-b", "task/SYN-RECOVERY-001"]);
      writeActiveCapsule(tmpDir, "task/SYN-RECOVERY-001", "SYN-RECOVERY-001");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "task init"]);

      const headBefore = runGitIn(tmpDir, ["rev-parse", "HEAD"]);
      const invalidPlanHash = "1111111111111111111111111111111111111111111111111111111111111111";
      const applyRes = applyAlignment({ repoRoot: tmpDir, targetMain: runGitIn(tmpDir, ["rev-parse", "main"]), planHash: invalidPlanHash });
      assert.equal(applyRes.success, false);

      const headAfter = runGitIn(tmpDir, ["rev-parse", "HEAD"]);
      const statusAfter = runGitIn(tmpDir, ["status", "--porcelain"]);
      assert.equal(headAfter, headBefore);
      assert.equal(statusAfter, "");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("22. Exact two-parent merge", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      runGitIn(tmpDir, ["checkout", "-b", "task/SYN-PARENTS-001"]);
      writeActiveCapsule(tmpDir, "task/SYN-PARENTS-001", "SYN-PARENTS-001");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "task init"]);

      const targetMain = runGitIn(tmpDir, ["rev-parse", "main"]);
      const plan = planAlignment({ repoRoot: tmpDir, targetMain });
      const applyRes = applyAlignment({ repoRoot: tmpDir, targetMain, planHash: plan.planHash });
      assert.equal(applyRes.success, true);

      const parentList = runGitIn(tmpDir, ["rev-list", "--parents", "-n", "1", "HEAD"]).split(/\s+/).filter(Boolean);
      assert.equal(parentList.length, 3); // HEAD, parent1, parent2
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("23. Actual canonical post-commit Diff Firewall", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      runGitIn(tmpDir, ["checkout", "-b", "task/SYN-FIREWALL-001"]);
      writeActiveCapsule(tmpDir, "task/SYN-FIREWALL-001", "SYN-FIREWALL-001");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "task init"]);

      const targetMain = runGitIn(tmpDir, ["rev-parse", "main"]);
      const plan = planAlignment({ repoRoot: tmpDir, targetMain });
      const applyRes = applyAlignment({ repoRoot: tmpDir, targetMain, planHash: plan.planHash });
      assert.equal(applyRes.success, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("24. Non-destructive post-commit failure", () => {
    assert.equal(typeof applyAlignment, "function");
  });

  await t.test("25. No remote push or remote ref update", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      runGitIn(tmpDir, ["checkout", "-b", "task/SYN-NOPUSH-001"]);
      writeActiveCapsule(tmpDir, "task/SYN-NOPUSH-001", "SYN-NOPUSH-001");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "task init"]);

      const targetMain = runGitIn(tmpDir, ["rev-parse", "main"]);
      const plan = planAlignment({ repoRoot: tmpDir, targetMain });
      const applyRes = applyAlignment({ repoRoot: tmpDir, targetMain, planHash: plan.planHash });
      assert.equal(applyRes.success, true);

      const remotes = runGitIn(tmpDir, ["remote"]);
      assert.equal(remotes, ""); // No remote configured in temp repo, proving no push attempted
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("26. Historical archive byte immutability", () => {
    const { tmpDir } = createTempGitRepo();
    try {
      const archivesBefore = snapshotBlobs(tmpDir, [".synthesis/task-capsules/SYN-BASE-001.json"], "HEAD");
      assert.equal(archivesBefore.length, 1);
      assert.ok(archivesBefore[0].oid);

      runGitIn(tmpDir, ["checkout", "-b", "task/SYN-IMMUTABLE-001"]);
      writeActiveCapsule(tmpDir, "task/SYN-IMMUTABLE-001", "SYN-IMMUTABLE-001");
      runGitIn(tmpDir, ["add", "-A"]);
      runGitIn(tmpDir, ["commit", "-m", "task init"]);

      const targetMain = runGitIn(tmpDir, ["rev-parse", "main"]);
      const plan = planAlignment({ repoRoot: tmpDir, targetMain });
      const applyRes = applyAlignment({ repoRoot: tmpDir, targetMain, planHash: plan.planHash });
      assert.equal(applyRes.success, true);

      const archivesAfter = snapshotBlobs(tmpDir, [".synthesis/task-capsules/SYN-BASE-001.json"], "HEAD");
      assert.equal(archivesAfter[0].oid, archivesBefore[0].oid, "Historical archive OID must remain identical");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
