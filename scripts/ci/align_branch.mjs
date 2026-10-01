import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { generateCapsuleRegistry, resolveRepoRoot } from "./generate_capsule_registry.mjs";
import { validateCapsuleRegistry } from "./validate_capsule_registry.mjs";
import { validateRulesetLock } from "./validate_ruleset_lock.mjs";
import { validateLineage } from "../lineage/validate.mjs";

export const TOOL_CONTRACT_VERSION = "1.1.0";
export const CANONICAL_SHARED_PATHS = Object.freeze([
  ".synthesis/lineage/capsules.json",
  ".synthesis/task-capsule.json"
]);

const TASK_ID_REGEX = /^[A-Z0-9]+(-[A-Z0-9]+)+$/;
const BRANCH_NAME_REGEX = /^task\/[A-Za-z0-9._-]+$/;
const SHA1_REGEX = /^[0-9a-f]{40}$/;

export function canonicalJsonStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJsonStringify).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ":" + canonicalJsonStringify(value[k]));
  return "{" + pairs.join(",") + "}";
}

export function computePlanHash(payload) {
  const canonicalString = canonicalJsonStringify(payload);
  return crypto.createHash("sha256").update(canonicalString).digest("hex");
}

function runGit(repoRoot, args, options = {}) {
  const res = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options
  });
  if (res.error) {
    throw new Error(`Git spawn error [git ${args.join(" ")}]: ${res.error.message}`);
  }
  return res;
}

function runGitOrThrow(repoRoot, args, options = {}) {
  const res = runGit(repoRoot, args, options);
  if (res.status !== 0) {
    throw new Error(`Git command failed [git ${args.join(" ")}]: ${(res.stderr || res.stdout || "").trim()}`);
  }
  return (res.stdout || "").trim();
}

export function detectConflictsReadOnly(repoRoot, mergeBase, headSha, targetMainSha) {
  const res = runGit(repoRoot, ["merge-tree", mergeBase, headSha, targetMainSha]);
  if (res.status !== 0 && !res.stdout) {
    throw new Error(`git merge-tree failed unexpectedly with code ${res.status}: ${(res.stderr || "").trim()}`);
  }
  const output = (res.stdout || "") + "\n" + (res.stderr || "");
  const conflicts = new Set();
  const lines = output.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("changed in both")) {
      const next = lines[i + 1] || "";
      const match = next.match(/\s(?:base|our|their)\s+\d+\s+[0-9a-f]+\s+(.+)$/);
      if (match) {
        conflicts.add(match[1].trim());
      }
    }
  }
  return Array.from(conflicts).sort();
}

export function snapshotBlobs(repoRoot, paths, ref) {
  const results = [];
  for (const p of paths) {
    const res = runGit(repoRoot, ["rev-parse", `${ref}:${p}`]);
    if (res.status === 0) {
      const oid = res.stdout.trim();
      results.push({ path: p, oid });
    }
  }
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

export function allocateNextSequence(repoRoot, originalTaskId) {
  const archivesDir = path.join(repoRoot, ".synthesis/task-capsules");
  if (!fs.existsSync(archivesDir)) {
    return "001";
  }
  const files = fs.readdirSync(archivesDir);
  const regex = new RegExp(`^${originalTaskId}-MAIN-ALIGNMENT-(\\d{3})\\.json$`);
  let maxSeq = 0;
  for (const f of files) {
    const m = f.match(regex);
    if (m) {
      const num = parseInt(m[1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }
  if (maxSeq === 0) {
    if (files.includes(`${originalTaskId}-MAIN-ALIGNMENT.json`)) {
      return "002";
    }
    return "001";
  }
  const next = maxSeq + 1;
  return String(next).padStart(3, "0");
}

export function computeCumulativeAllowedPaths(taskChangedPaths, canonicalSharedPaths, newArchivePath) {
  const set = new Set();
  for (const p of taskChangedPaths) {
    if (!canonicalSharedPaths.includes(p)) {
      set.add(p);
    }
  }
  for (const s of canonicalSharedPaths) {
    set.add(s);
  }
  set.add(newArchivePath);
  return Array.from(set).sort();
}

export function planAlignment(options = {}) {
  const repoRoot = options.repoRoot || resolveRepoRoot();
  const errors = [];

  // 1. Worktree and Index Clean
  const statusOut = runGitOrThrow(repoRoot, ["status", "--porcelain"]);
  if (statusOut.length > 0) {
    errors.push("Worktree or index is dirty. Alignment requires a clean working tree.");
    return { valid: false, errors };
  }

  // 2. Branch & Identity Check
  const actualBranch = runGitOrThrow(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (actualBranch === "HEAD") {
    errors.push("Detached HEAD state detected. Alignment must run on an authorized task branch.");
    return { valid: false, errors };
  }
  if (actualBranch === "main" || actualBranch === "master") {
    errors.push(`Current branch is '${actualBranch}'. Alignment is only permitted on task branches.`);
    return { valid: false, errors };
  }
  if (!BRANCH_NAME_REGEX.test(actualBranch)) {
    errors.push(`Branch '${actualBranch}' does not match authorized task branch pattern 'task/*'.`);
    return { valid: false, errors };
  }
  if (options.branch && options.branch !== actualBranch) {
    errors.push(`Supplied branch '${options.branch}' does not match actual Git branch '${actualBranch}'.`);
    return { valid: false, errors };
  }

  // 3. Resolve SHAs
  const actualHead = runGitOrThrow(repoRoot, ["rev-parse", "HEAD"]);
  if (options.taskHead && options.taskHead !== actualHead) {
    errors.push(`Supplied taskHead '${options.taskHead}' does not match actual Git HEAD '${actualHead}'.`);
    return { valid: false, errors };
  }

  let targetMain = options.targetMain;
  if (!targetMain) {
    try {
      targetMain = runGitOrThrow(repoRoot, ["rev-parse", "origin/main"]);
    } catch {
      targetMain = runGitOrThrow(repoRoot, ["rev-parse", "main"]);
    }
  }
  if (!SHA1_REGEX.test(targetMain)) {
    errors.push(`Target main '${targetMain}' is not a valid 40-character commit SHA.`);
    return { valid: false, errors };
  }

  let mergeBase;
  try {
    mergeBase = runGitOrThrow(repoRoot, ["merge-base", actualHead, targetMain]);
  } catch (e) {
    errors.push(`Failed to calculate merge-base between ${actualHead} and ${targetMain}: ${e.message}`);
    return { valid: false, errors };
  }

  // 4. Active Capsule Check
  const activeCapsulePath = path.join(repoRoot, ".synthesis/task-capsule.json");
  if (!fs.existsSync(activeCapsulePath)) {
    errors.push("Missing active capsule at .synthesis/task-capsule.json");
    return { valid: false, errors };
  }
  let activeCapsule;
  try {
    activeCapsule = JSON.parse(fs.readFileSync(activeCapsulePath, "utf8"));
  } catch (e) {
    errors.push(`Malformed active capsule JSON: ${e.message}`);
    return { valid: false, errors };
  }

  if (activeCapsule.expected_branch && activeCapsule.expected_branch !== actualBranch) {
    errors.push(`Active capsule expected_branch '${activeCapsule.expected_branch}' does not match current branch '${actualBranch}'.`);
    return { valid: false, errors };
  }

  const rawTaskId = activeCapsule.task_id || "";
  const rootTaskId = rawTaskId.replace(/-MAIN-ALIGNMENT(-\d{3})?$/, "");
  if (!TASK_ID_REGEX.test(rootTaskId)) {
    errors.push(`Invalid task ID format '${rootTaskId}'. Must match standard uppercase alphanumeric hyphen pattern.`);
    return { valid: false, errors };
  }

  const nextSeq = allocateNextSequence(repoRoot, rootTaskId);
  const newArchiveFilename = nextSeq === "001"
    ? `${rootTaskId}-MAIN-ALIGNMENT.json`
    : `${rootTaskId}-MAIN-ALIGNMENT-${nextSeq}.json`;

  const targetArchivePath = `.synthesis/task-capsules/${newArchiveFilename}`;
  const resolvedTarget = path.resolve(repoRoot, targetArchivePath);
  const resolvedArchivesDir = path.resolve(repoRoot, ".synthesis/task-capsules");
  if (!resolvedTarget.startsWith(resolvedArchivesDir + path.sep)) {
    errors.push(`Target archive path '${targetArchivePath}' escapes allowed directory boundary.`);
    return { valid: false, errors };
  }

  if (fs.existsSync(resolvedTarget)) {
    errors.push(`Target alignment archive collision: ${targetArchivePath} already exists.`);
    return { valid: false, errors };
  }

  // 5. Diff sets
  const taskChangedOut = runGitOrThrow(repoRoot, ["diff", "--name-only", `${mergeBase}..${actualHead}`]);
  const taskChangedPaths = taskChangedOut ? taskChangedOut.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).sort() : [];

  const mainChangedOut = runGitOrThrow(repoRoot, ["diff", "--name-only", `${mergeBase}..${targetMain}`]);
  const mainChangedPaths = mainChangedOut ? mainChangedOut.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).sort() : [];

  // Concurrent paths = intersection
  const concurrentPaths = taskChangedPaths.filter((p) => mainChangedPaths.includes(p)).sort();
  for (const cp of concurrentPaths) {
    if (!CANONICAL_SHARED_PATHS.includes(cp)) {
      errors.push(`Concurrent edit detected outside canonical shared paths: ${cp}`);
    }
  }

  // Read-only conflict discovery
  let conflictPaths = [];
  try {
    conflictPaths = detectConflictsReadOnly(repoRoot, mergeBase, actualHead, targetMain);
  } catch (e) {
    errors.push(`Merge-tree conflict detection failed: ${e.message}`);
  }

  for (const c of conflictPaths) {
    if (!CANONICAL_SHARED_PATHS.includes(c)) {
      errors.push(`Unexpected merge conflict detected outside canonical shared paths: ${c}`);
    }
  }

  // Snapshot archives from both task head and target main
  const taskArchivesOut = runGit(repoRoot, ["ls-tree", "-r", "--name-only", actualHead, ".synthesis/task-capsules"]);
  const taskArchivePaths = taskArchivesOut.status === 0 && taskArchivesOut.stdout
    ? taskArchivesOut.stdout.split(/\r?\n/).map((s) => s.trim()).filter((p) => p.endsWith(".json")).sort()
    : [];
  const taskArchives = snapshotBlobs(repoRoot, taskArchivePaths, actualHead);

  const mainArchivesOut = runGit(repoRoot, ["ls-tree", "-r", "--name-only", targetMain, ".synthesis/task-capsules"]);
  const mainArchivePaths = mainArchivesOut.status === 0 && mainArchivesOut.stdout
    ? mainArchivesOut.stdout.split(/\r?\n/).map((s) => s.trim()).filter((p) => p.endsWith(".json")).sort()
    : [];
  const mainArchives = snapshotBlobs(repoRoot, mainArchivePaths, targetMain);

  // Check archive collisions with different OIDs
  const mainArchiveMap = new Map(mainArchives.map((a) => [a.path, a.oid]));
  for (const ta of taskArchives) {
    const mainOid = mainArchiveMap.get(ta.path);
    if (mainOid && mainOid !== ta.oid) {
      errors.push(`Immutable archive mismatch for ${ta.path}: task OID ${ta.oid} != main OID ${mainOid}`);
    }
  }

  // Preserved task blobs
  const preservedPaths = taskChangedPaths.filter((p) =>
    !CANONICAL_SHARED_PATHS.includes(p) && !p.startsWith(".synthesis/task-capsules/")
  ).sort();
  const preservedBlobs = snapshotBlobs(repoRoot, preservedPaths, actualHead);

  // Cumulative allowed_paths
  const projectedAllowedPaths = computeCumulativeAllowedPaths(taskChangedPaths, CANONICAL_SHARED_PATHS, targetArchivePath);

  const repoIdentity = runGitOrThrow(repoRoot, ["rev-parse", "--show-toplevel"]);

  const hashPayload = {
    active_capsule_id: activeCapsule.capsule_id || activeCapsule.task_id,
    branch: actualBranch,
    canonical_shared_paths: [...CANONICAL_SHARED_PATHS].sort(),
    concurrent_paths: concurrentPaths,
    conflict_paths: conflictPaths,
    main_archives: mainArchives,
    main_changed_paths: mainChangedPaths,
    merge_base_sha: mergeBase,
    next_sequence: nextSeq,
    parent_capsule_id: activeCapsule.capsule_id || activeCapsule.task_id,
    preserved_blobs: preservedBlobs,
    repo_identity: repoIdentity,
    target_archive_path: targetArchivePath,
    target_main_sha: targetMain,
    task_archives: taskArchives,
    task_changed_paths: taskChangedPaths,
    task_head_sha: actualHead,
    tool_contract_version: TOOL_CONTRACT_VERSION
  };

  const planHash = computePlanHash(hashPayload);

  if (errors.length > 0) {
    return { valid: false, errors, planHash, details: hashPayload };
  }

  return {
    valid: true,
    errors: [],
    planHash,
    branch: actualBranch,
    taskHead: actualHead,
    targetMain,
    mergeBase,
    activeCapsule,
    rootTaskId,
    nextSeq,
    targetArchivePath,
    taskChangedPaths,
    mainChangedPaths,
    concurrentPaths,
    conflictPaths,
    taskArchives,
    mainArchives,
    preservedBlobs,
    projectedAllowedPaths,
    hashPayload
  };
}

export function applyAlignment(options = {}) {
  const repoRoot = options.repoRoot || resolveRepoRoot();
  const requiredPlanHash = options.planHash;
  if (!requiredPlanHash || typeof requiredPlanHash !== "string" || requiredPlanHash.length !== 64) {
    return { success: false, errors: ["Missing or invalid required 64-char --plan-hash argument."] };
  }

  // 1. Preflight Plan
  const plan = planAlignment(options);
  if (!plan.valid) {
    return { success: false, errors: ["Plan preflight failed:", ...plan.errors] };
  }

  if (plan.planHash !== requiredPlanHash) {
    return {
      success: false,
      errors: [`Plan hash mismatch: supplied '${requiredPlanHash}' != computed '${plan.planHash}'. TOCTOU guard triggered.`]
    };
  }

  const { targetMain, activeCapsule, rootTaskId, nextSeq, targetArchivePath, preservedBlobs, projectedAllowedPaths, taskArchives, mainArchives } = plan;
  let mergeInitiated = false;
  let commitCreated = false;

  // 2. Start Merge
  const mergeRes = runGit(repoRoot, ["merge", "--no-commit", "--no-ff", targetMain]);
  mergeInitiated = true;

  if (mergeRes.status !== 0) {
    // Check conflicts
    const unmergedOut = runGitOrThrow(repoRoot, ["diff", "--name-only", "--diff-filter=U"]);
    const actualConflicts = unmergedOut ? unmergedOut.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
    for (const ac of actualConflicts) {
      if (!CANONICAL_SHARED_PATHS.includes(ac)) {
        runGit(repoRoot, ["merge", "--abort"]);
        return {
          success: false,
          errors: [`Merge aborted: conflict in non-canonical path '${ac}'. Worktree restored.`]
        };
      }
    }
  }

  try {
    // 3. Resolve canonical shared files
    const nowIso = new Date().toISOString();
    const dateFormatted = nowIso.slice(0, 10).replace(/-/g, "");
    const alignmentTaskId = nextSeq === "001"
      ? `${rootTaskId}-MAIN-ALIGNMENT`
      : `${rootTaskId}-MAIN-ALIGNMENT-${nextSeq}`;
    const alignmentCapsuleId = `CAP-${alignmentTaskId}-${dateFormatted}-001`;

    const alignmentCapsule = {
      version: "1.1.0",
      capsule_id: alignmentCapsuleId,
      task_id: alignmentTaskId,
      title: `${activeCapsule.title || rootTaskId} Main Alignment ${nextSeq}`,
      environment: activeCapsule.environment || "CMS_DEV",
      base_sha: targetMain,
      expected_branch: plan.branch,
      owner: activeCapsule.owner || "AI_STUDIO",
      parent_capsule_id: activeCapsule.capsule_id || activeCapsule.task_id,
      supersedes_capsule_id: null,
      created_at: nowIso,
      status: "COMPLETED",
      allowed_mutation_types: Array.from(new Set([
        ...(activeCapsule.allowed_mutation_types || []),
        "GOVERNANCE",
        "EVIDENCE"
      ])).sort(),
      allowed_paths: projectedAllowedPaths,
      forbidden_paths: activeCapsule.forbidden_paths || [
        ".synthesis/lineage/tasks.json",
        ".synthesis/lineage/capabilities.json",
        ".github/**",
        "app/**",
        "components/**",
        "lib/**",
        "prisma/**",
        "package.json",
        "package-lock.json",
        ".env*",
        "deployment/**",
        "infra/**"
      ]
    };

    // Write active capsule and new archive
    fs.writeFileSync(path.join(repoRoot, ".synthesis/task-capsule.json"), JSON.stringify(alignmentCapsule, null, 2) + "\n", "utf8");
    fs.writeFileSync(path.join(repoRoot, targetArchivePath), JSON.stringify(alignmentCapsule, null, 2) + "\n", "utf8");

    // Regenerate capsules.json
    generateCapsuleRegistry({ repoRoot });

    // Stage resolved and generated files
    runGitOrThrow(repoRoot, ["add", ".synthesis/task-capsule.json", targetArchivePath, ".synthesis/lineage/capsules.json"]);

    // 4. Pre-Commit Verifications
    // A. Staged index diff vs targetMain
    const stagedDiffOut = runGitOrThrow(repoRoot, ["diff", "--cached", "--name-only", targetMain]);
    const stagedPaths = stagedDiffOut ? stagedDiffOut.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).sort() : [];

    const expectedAllowed = [...projectedAllowedPaths].sort();
    if (JSON.stringify(stagedPaths) !== JSON.stringify(expectedAllowed)) {
      throw new Error(`Staged merge index diff does not equal projected allowed_paths.\nStaged: ${JSON.stringify(stagedPaths)}\nExpected: ${JSON.stringify(expectedAllowed)}`);
    }

    // B. Preserved Blobs Integrity
    for (const pb of preservedBlobs) {
      const fullP = path.join(repoRoot, pb.path);
      if (!fs.existsSync(fullP)) {
        throw new Error(`Preserved task file missing after merge: ${pb.path}`);
      }
      const hashRes = runGitOrThrow(repoRoot, ["hash-object", pb.path]);
      if (hashRes !== pb.oid) {
        throw new Error(`Preserved task file blob OID mismatch for ${pb.path}: pre-merge ${pb.oid} != current ${hashRes}`);
      }
    }

    // C. Historical Archives Integrity
    const allHistoricalArchives = new Map();
    for (const a of [...taskArchives, ...mainArchives]) {
      allHistoricalArchives.set(a.path, a.oid);
    }
    for (const [aPath, expectedOid] of allHistoricalArchives.entries()) {
      const fullP = path.join(repoRoot, aPath);
      if (!fs.existsSync(fullP)) {
        throw new Error(`Historical archive missing after merge: ${aPath}`);
      }
      const currentOid = runGitOrThrow(repoRoot, ["hash-object", aPath]);
      if (currentOid !== expectedOid) {
        throw new Error(`Historical archive modified for ${aPath}: expected ${expectedOid} != current ${currentOid}`);
      }
    }

    // D. Ruleset & Registry & Lineage Validators
    const rulesetRes = validateRulesetLock({ repoRoot });
    if (!rulesetRes.valid) {
      throw new Error(`Ruleset lock validation failed: ${rulesetRes.errors.join("; ")}`);
    }

    const regRes = validateCapsuleRegistry({ repoRoot });
    if (!regRes.valid) {
      throw new Error(`Capsule registry validation failed: ${regRes.errors.join("; ")}`);
    }

    const lineageRes = validateLineage({ repoRoot });
    if (!lineageRes.valid) {
      throw new Error(`Lineage validation failed: ${lineageRes.errors.join("; ")}`);
    }

    // E. git diff --cached --check
    const diffCheckRes = runGit(repoRoot, ["diff", "--cached", "--check"]);
    if (diffCheckRes.status !== 0) {
      throw new Error(`git diff --cached --check failed: ${diffCheckRes.stderr || diffCheckRes.stdout}`);
    }

    // 5. Create 2-Parent Merge Commit
    const commitMsg = options.commitMessage ||
      `chore(alignment): align ${plan.branch} with main (${targetMain.slice(0, 7)})\n\n` +
      `TASK_ID: ${alignmentTaskId}\n` +
      `CAPSULE_ID: ${alignmentCapsuleId}\n` +
      `BASE_SHA: ${targetMain}\n` +
      `PARENT_CAPSULE_ID: ${alignmentCapsule.parent_capsule_id}\n` +
      `PLAN_HASH: ${plan.planHash}`;

    runGitOrThrow(repoRoot, ["commit", "-m", commitMsg]);
    commitCreated = true;

    // 6. Post-Commit Verifications
    const newHead = runGitOrThrow(repoRoot, ["rev-parse", "HEAD"]);
    const parents = runGitOrThrow(repoRoot, ["rev-parse", "HEAD^1", "HEAD^2"]).split(/\r?\n/).filter(Boolean);
    if (parents.length !== 2) {
      throw new Error(`Created commit ${newHead} does not have exactly 2 parents (parents: ${parents.join(", ")})`);
    }
    if (parents[0] !== plan.taskHead) {
      throw new Error(`First parent ${parents[0]} does not equal pre-merge task HEAD ${plan.taskHead}`);
    }
    if (parents[1] !== targetMain) {
      throw new Error(`Second parent ${parents[1]} does not equal target main ${targetMain}`);
    }

    // Final diff against targetMain
    const finalDiffOut = runGitOrThrow(repoRoot, ["diff", "--name-only", targetMain, "HEAD"]);
    const finalDiffPaths = finalDiffOut ? finalDiffOut.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).sort() : [];
    if (JSON.stringify(finalDiffPaths) !== JSON.stringify(expectedAllowed)) {
      throw new Error(`Post-commit final branch diff does not match projected allowed_paths.`);
    }

    return {
      success: true,
      newHeadSha: newHead,
      alignmentTaskId,
      alignmentCapsuleId,
      planHash: plan.planHash,
      targetMainSha: targetMain
    };
  } catch (err) {
    if (!commitCreated && mergeInitiated) {
      // Safe pre-commit rollback
      runGit(repoRoot, ["merge", "--abort"]);
      const fullArchivePath = path.join(repoRoot, targetArchivePath);
      if (fs.existsSync(fullArchivePath)) {
        try { fs.unlinkSync(fullArchivePath); } catch {}
      }
      return {
        success: false,
        errors: [`Apply failed pre-commit: ${err.message}. Merge aborted and worktree restored.`]
      };
    } else {
      // Post-commit failure: NEVER destructive rollback!
      return {
        success: false,
        postCommitFailure: true,
        status: "POST_COMMIT_VALIDATION_FAILED",
        recovery: "RECOVERY_REQUIRED",
        errors: [`Apply failed post-commit: ${err.message}. Commit preserved for audit. DO NOT PUSH.`]
      };
    }
  }
}

// CLI Execution
if (process.argv[1] && process.argv[1].endsWith("align_branch.mjs")) {
  const args = process.argv.slice(2);
  let mode = null;
  let planHash = null;
  let targetMain = null;

  for (const a of args) {
    if (a.startsWith("--mode=")) mode = a.slice(7);
    if (a.startsWith("--plan-hash=")) planHash = a.slice(12);
    if (a.startsWith("--target-main=")) targetMain = a.slice(14);
  }

  if (mode === "plan") {
    const res = planAlignment({ targetMain });
    if (!res.valid) {
      console.error(JSON.stringify({ success: false, errors: res.errors }, null, 2));
      process.exit(1);
    }
    console.log(JSON.stringify({
      success: true,
      plan_hash: res.planHash,
      branch: res.branch,
      task_head_sha: res.taskHead,
      target_main_sha: res.targetMain,
      merge_base_sha: res.mergeBase,
      active_capsule_id: res.activeCapsule.capsule_id,
      target_archive_path: res.targetArchivePath,
      next_sequence: res.nextSeq,
      conflict_paths: res.conflictPaths,
      concurrent_paths: res.concurrentPaths,
      preserved_blob_count: res.preservedBlobs.length,
      projected_allowed_paths: res.projectedAllowedPaths
    }, null, 2));
    process.exit(0);
  } else if (mode === "apply") {
    const res = applyAlignment({ planHash, targetMain });
    if (!res.success) {
      console.error(JSON.stringify({ success: false, errors: res.errors, recovery: res.recovery || null }, null, 2));
      process.exit(1);
    }
    console.log(JSON.stringify({
      success: true,
      new_head_sha: res.newHeadSha,
      alignment_task_id: res.alignmentTaskId,
      alignment_capsule_id: res.alignmentCapsuleId,
      plan_hash: res.planHash,
      target_main_sha: res.targetMainSha
    }, null, 2));
    process.exit(0);
  } else {
    console.error("Usage: node scripts/ci/align_branch.mjs --mode=[plan|apply] [--plan-hash=<hash>] [--target-main=<sha>]");
    process.exit(1);
  }
}
