import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolveRepoRoot } from "./generate_capsule_registry.mjs";
import { matchesPattern } from "./diff_firewall.mjs";

export const TOOL_CONTRACT_VERSION = "1.3.0";
export const CANONICAL_SHARED_PATHS = Object.freeze([
  ".synthesis/lineage/capsules.json",
  ".synthesis/task-capsule.json"
]);
const TASK_ID_REGEX = /^[A-Z0-9]+(-[A-Z0-9]+)+$/;
const BRANCH_NAME_REGEX = /^task\/[A-Za-z0-9._-]+$/;
const SHA1_REGEX = /^[0-9a-f]{40}$/;
const REQUIRED_SCRIPTS = [
  "scripts/ci/generate_capsule_registry.mjs",
  "scripts/ci/validate_capsule_registry.mjs",
  "scripts/ci/validate_ruleset_lock.mjs",
  "scripts/lineage/validate.mjs",
  "scripts/ci/diff_firewall.mjs"
];
// Mirror the canonical firewall's default locks. Generated paths do not grant
// authority to previously unauthorized task-side changes.
const DEFAULT_LOCKED_PATHS = [
  /^\.env.*/, /^docs\/environment\/ENV-LEGACY-.*/,
  /^docs\/governance\/.*/, /^deployment\/.*/, /^infra\/.*/
];
const UNSUPPORTED_GIT_ENV = [
  "GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_NAMESPACE",
  "GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS", "GIT_REPLACE_REF_BASE"
];

export function canonicalJsonStringify(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "undefined" || typeof value === "symbol" || typeof value === "function") {
      throw new Error(`Unsupported non-serializable value in canonical JSON: ${typeof value}`);
    }
    if (typeof value === "number" && (!Number.isFinite(value) || Number.isNaN(value))) {
      throw new Error(`Non-finite number cannot be serialized canonically: ${value}`);
    }
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
  const res = spawnSync("git", [
    "--no-optional-locks", "--no-replace-objects", "-c", "gc.auto=0", "-c", "maintenance.auto=false", ...args
  ], { cwd: repoRoot, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options });
  if (res.error || res.signal) {
    throw new Error(`Git execution failed (${args[0]}): ${res.error?.message || res.signal}`);
  }
  return res;
}
function gitText(repoRoot, args) {
  const res = runGit(repoRoot, args);
  if (res.status !== 0) throw new Error(`Git command failed (${args[0]}): ${(res.stderr || res.stdout || "").trim()}`);
  return res.stdout || "";
}
function runGitOrThrow(repoRoot, args) { return gitText(repoRoot, args).trim(); }
function validPath(p) {
  if (typeof p !== "string" || !p || p.startsWith("/") ||
      /[\\\x00-\x20\x7f-\uffff"']/.test(p) ||
      p.split("/").some(s => !s || s === "." || s === ".." || s === ".git")) {
    throw new Error("Unsupported or unsafe repository path.");
  }
  return p;
}
function confinedFile(repoRoot, relative, absent = false) {
  validPath(relative);
  let cur = repoRoot;
  const parts = relative.split("/");
  for (let i = 0; i < parts.length; i++) {
    cur = path.join(cur, parts[i]);
    let st;
    try { st = fs.lstatSync(cur); }
    catch (err) {
      if (absent && i === parts.length - 1 && err.code === "ENOENT") return cur;
      throw err;
    }
    if (st.isSymbolicLink() || (i < parts.length - 1 ? !st.isDirectory() : !st.isFile())) {
      throw new Error(`Unsafe symlink or object type at ${relative}`);
    }
    if (absent && i === parts.length - 1) throw new Error(`Target alignment archive collision: ${relative}`);
  }
  return cur;
}
function readTree(repoRoot, ref) {
  const out = gitText(repoRoot, ["ls-tree", "-r", "-z", ref]);
  const entries = [];
  for (const record of out.split("\0").filter(Boolean)) {
    const m = record.match(/^(100644|100755|120000) blob ([0-9a-f]{40})\t(.+)$/);
    if (!m) throw new Error("Unsupported or malformed Git tree entry.");
    entries.push({ path: validPath(m[3]), oid: m[2], mode: m[1] });
  }
  return entries.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
export function snapshotBlobs(repoRoot, paths, ref) {
  const map = new Map(readTree(repoRoot, ref).map(e => [e.path, e]));
  return [...paths].sort().map(p => map.get(validPath(p)) || { path: p, oid: null, mode: null });
}
function changedPaths(repoRoot, from, to, cached = false) {
  return gitText(repoRoot, ["diff", "--no-renames", "--name-only", "-z", ...(cached ? ["--cached"] : []), from, ...(to ? [to] : []), "--"])
    .split("\0").filter(Boolean).map(validPath).sort();
}
function gitPath(repoRoot, name) {
  return runGitOrThrow(repoRoot, ["rev-parse", "--path-format=absolute", "--git-path", name]);
}
function mergeHead(repoRoot) {
  const p = gitPath(repoRoot, "MERGE_HEAD");
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8").trim();
}
function ensureSupportedState(repoRoot) {
  const callbacks = runGit(repoRoot, ["config", "--get-regexp", "^(core\\.(hookspath|fsmonitor)|gpg\\..*program|commit\\.gpgsign)$"]);
  if (![0,1].includes(callbacks.status)) throw new Error("Git callback configuration discovery failed.");
  for (const line of (callbacks.stdout || "").split("\n").filter(Boolean)) {
    const split = line.indexOf(" "), key = line.slice(0,split).toLowerCase(), value = line.slice(split + 1).trim();
    if ((key === "core.fsmonitor" || key === "commit.gpgsign") && value === "false") continue;
    throw new Error(`Unsupported external Git callback configuration: ${key}`);
  }
  const hooksDir = gitPath(repoRoot, "hooks");
  if (fs.existsSync(hooksDir)) {
    if (!fs.lstatSync(hooksDir).isDirectory()) throw new Error("Unsupported Git hooks directory.");
    for (const hook of fs.readdirSync(hooksDir).filter(name => !name.endsWith(".sample"))) {
      const st = fs.lstatSync(path.join(hooksDir,hook));
      if (st.isSymbolicLink() || (st.mode & 0o111)) throw new Error("Unsupported executable Git hook.");
    }
  }
  for (const name of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "sequencer", "index.lock", "MERGE_AUTOSTASH"]) {
    if (fs.existsSync(gitPath(repoRoot, name))) throw new Error(`Unsupported existing Git state: ${name}`);
  }
  if (fs.existsSync(gitPath(repoRoot, "info/grafts")) || gitText(repoRoot, ["for-each-ref", "--format=%(refname)", "refs/replace/"]).trim()) {
    throw new Error("Unsupported replacement or grafted Git history.");
  }
  if (gitText(repoRoot, ["ls-files", "-v", "-z"]).split("\0").filter(Boolean).some(s => !s.startsWith("H "))) {
    throw new Error("Unsupported index flags or unmerged entries.");
  }
}
function assertNoExternalDrivers(repoRoot, refs, paths) {
  const configured = runGit(repoRoot,["config","--get-regexp","^(merge\\..*\\.driver|merge\\.default|filter\\..*\\.(clean|smudge|process))$"]);
  if (![0,1].includes(configured.status)) throw new Error("Git driver configuration discovery failed.");
  // Git normalizes section/variable names, but driver subsections are case-sensitive.
  // Preserve them so an attribute such as merge=Untrusted cannot bypass discovery.
  const keys = new Set((configured.stdout || "").split("\n").filter(Boolean).map(line => line.split(" ")[0]));
  const defaultDriver = (configured.stdout || "").split("\n").find(line => line.startsWith("merge.default "))?.slice(14).trim();
  if (defaultDriver && keys.has(`merge.${defaultDriver}.driver`)) throw new Error("Unsupported external default Git merge driver.");
  for (const ref of refs) {
    const attrs = gitText(repoRoot,["check-attr",`--source=${ref}`,"-z","merge","filter","--",...paths]).split("\0");
    if (attrs.pop() !== "" || attrs.length % 3) throw new Error("Malformed Git attribute discovery.");
    for (let i = 0; i < attrs.length; i += 3) {
      const key = attrs[i + 1], driver = attrs[i + 2];
      if ((key === "merge" && keys.has(`merge.${driver}.driver`)) || (key === "filter" && ["clean","smudge","process"].some(name => keys.has(`filter.${driver}.${name}`)))) {
        throw new Error(`Unsupported active external Git ${key} driver.`);
      }
    }
  }
}
export function detectConflictsReadOnly(repoRoot, mergeBase, headSha, targetMainSha) {
  for (const sha of [mergeBase, headSha, targetMainSha]) if (!SHA1_REGEX.test(sha)) throw new Error("Invalid merge-tree SHA.");
  // merge-tree writes objects: quarantine them outside the repository so PLAN
  // leaves the actual object database, refs, index and worktree untouched.
  const quarantine = fs.mkdtempSync(path.join(os.tmpdir(), "syn-align-analysis-"));
  let failure;
  try {
    const res = runGit(repoRoot, ["merge-tree", "--write-tree", "--name-only", "-z", "--no-messages", headSha, targetMainSha], {
      env: { ...process.env, GIT_OBJECT_DIRECTORY: quarantine, GIT_ALTERNATE_OBJECT_DIRECTORIES: gitPath(repoRoot, "objects") }
    });
    const fields = (res.stdout || "").split("\0");
    if (![0,1].includes(res.status) || !SHA1_REGEX.test(fields.shift() || "") || res.stderr?.trim()) {
      throw new Error(`git merge-tree failed closed (status ${res.status}).`);
    }
    const conflicts = fields.filter(Boolean).map(validPath);
    if ((res.status === 0 && conflicts.length) || (res.status === 1 && !conflicts.length)) {
      throw new Error("Malformed merge-tree conflict result.");
    }
    return [...new Set(conflicts)].sort();
  } catch (err) { failure = err; throw err; }
  finally {
    try { fs.rmSync(quarantine, { recursive: true, force: true, maxRetries: 3, retryDelay: 10 }); }
    catch (err) { throw failure ? new AggregateError([failure,err], "Conflict analysis and cleanup failed") : err; }
  }
}
export function allocateNextSequence(repoRoot, originalTaskId) {
  if (!TASK_ID_REGEX.test(originalTaskId)) throw new Error("Invalid task ID for sequence allocation.");
  const dir = path.dirname(confinedFile(repoRoot, ".synthesis/task-capsules/.sequence-probe", true));
  const files = fs.readdirSync(dir);
  const regex = new RegExp(`^${originalTaskId}-MAIN-ALIGNMENT-(\\d{3})\\.json$`);
  let max = files.includes(`${originalTaskId}-MAIN-ALIGNMENT.json`) ? 1 : 0;
  for (const file of files) {
    const match = file.match(regex);
    if (match) max = Math.max(max, Number(match[1]));
  }
  if (max >= 999) throw new Error("Alignment sequence exhausted.");
  return String(max + 1).padStart(3, "0");
}
export function computeCumulativeAllowedPaths(taskChangedPaths, canonicalSharedPaths, newArchivePath) {
  return [...new Set([...taskChangedPaths.filter(p => !canonicalSharedPaths.includes(p)), ...canonicalSharedPaths, newArchivePath])].sort();
}
function runScript(repoRoot, script, branch) {
  confinedFile(repoRoot, script);
  const res = spawnSync(process.execPath, [path.join(repoRoot, script)], {
    cwd: repoRoot, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, GITHUB_HEAD_REF: branch, GITHUB_REF_NAME: branch, GIT_OPTIONAL_LOCKS: "0" }
  });
  if (res.error || res.signal || res.status !== 0) {
    throw new Error(`Required validator ${script} failed: ${res.error?.message || res.signal || res.stderr || res.stdout}`);
  }
  return script;
}
function validateGovernance(repoRoot, branch) {
  return REQUIRED_SCRIPTS.slice(1,4).map(script => runScript(repoRoot, script, branch));
}
function assertTaskScope(paths, capsule) {
  for (const p of paths) {
    if (matchesPattern(p, capsule.forbidden_paths)) throw new Error(`Forbidden task path: ${p}`);
    const allowed = matchesPattern(p, capsule.allowed_paths);
    if (matchesPattern(p, DEFAULT_LOCKED_PATHS) && !allowed) throw new Error(`Default-locked task path: ${p}`);
    if (!allowed) throw new Error(`Task path is not authorized by active capsule: ${p}`);
  }
}
function planInternal(options) {
  for (const key of UNSUPPORTED_GIT_ENV) if (process.env[key] !== undefined) throw new Error(`Unsupported inherited Git environment: ${key}`);
  const repoRoot = fs.realpathSync(options.repoRoot || resolveRepoRoot());
  if (fs.realpathSync(runGitOrThrow(repoRoot, ["rev-parse", "--show-toplevel"])) !== repoRoot) throw new Error("Repository root identity mismatch.");
  ensureSupportedState(repoRoot);
  const branch = runGitOrThrow(repoRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (!BRANCH_NAME_REGEX.test(branch) || runGit(repoRoot, ["check-ref-format", `refs/heads/${branch}`]).status !== 0) {
    throw new Error("Alignment is only permitted on authorized task branches.");
  }
  if (options.branch && options.branch !== branch) throw new Error("Supplied branch mismatch.");
  const taskHead = runGitOrThrow(repoRoot, ["rev-parse", "--verify", "HEAD^{commit}"]);
  if (options.taskHead && options.taskHead !== taskHead) throw new Error("Supplied task HEAD drift.");
  const remoteMain = runGit(repoRoot, ["show-ref", "--verify", "--quiet", "refs/remotes/origin/main"]);
  if (![0,1].includes(remoteMain.status)) throw new Error("Unable to resolve authoritative main ref.");
  const targetRef = remoteMain.status === 0 ? "refs/remotes/origin/main" : "refs/heads/main";
  const currentMain = runGitOrThrow(repoRoot, ["rev-parse", "--verify", `${targetRef}^{commit}`]);
  const targetMain = options.targetMain || currentMain;
  if (!SHA1_REGEX.test(targetMain) || targetMain !== currentMain) throw new Error("Target main SHA drift or invalid 40-character commit SHA.");
  const mergeBase = runGitOrThrow(repoRoot, ["merge-base", taskHead, targetMain]);
  if (mergeBase === targetMain) throw new Error("NO_ALIGNMENT_REQUIRED: target main is already in task history.");
  const activeCapsule = JSON.parse(fs.readFileSync(confinedFile(repoRoot, ".synthesis/task-capsule.json"), "utf8"));
  if (!TASK_ID_REGEX.test(activeCapsule.task_id || "") || !/^CAP-[A-Z0-9-]+$/.test(activeCapsule.capsule_id || "")) throw new Error("Invalid task/capsule ID.");
  if (activeCapsule.expected_branch !== branch) throw new Error("Active capsule expected_branch mismatch.");
  for (const key of ["allowed_paths", "forbidden_paths", "allowed_mutation_types"]) {
    if (!Array.isArray(activeCapsule[key]) || !activeCapsule[key].every(v => typeof v === "string")) throw new Error(`Invalid capsule ${key}.`);
  }
  for (const p of [...activeCapsule.allowed_paths, ...activeCapsule.forbidden_paths]) {
    validPath(p);
    if (p.includes("*") && !(/^([^*]+)\/\*\*$/.test(p) || /^([^*]+)\*$/.test(p))) throw new Error("Unsupported scope glob.");
  }
  const rootTaskId = activeCapsule.task_id.replace(/-MAIN-ALIGNMENT(-\d{3})?$/, "");
  const nextSeq = allocateNextSequence(repoRoot, rootTaskId);
  const alignmentTaskId = nextSeq === "001" ? `${rootTaskId}-MAIN-ALIGNMENT` : `${rootTaskId}-MAIN-ALIGNMENT-${nextSeq}`;
  const targetArchivePath = `.synthesis/task-capsules/${alignmentTaskId}.json`;
  confinedFile(repoRoot, targetArchivePath, true);
  for (const p of CANONICAL_SHARED_PATHS) confinedFile(repoRoot, p);
  for (const p of REQUIRED_SCRIPTS) confinedFile(repoRoot, p);
  const taskTree = readTree(repoRoot, taskHead), mainTree = readTree(repoRoot, targetMain), baseTree = readTree(repoRoot, mergeBase);
  assertNoExternalDrivers(repoRoot,[taskHead,targetMain],[...new Set([...taskTree,...mainTree].map(e => e.path).concat(targetArchivePath))]);
  if (runGitOrThrow(repoRoot,["status","--porcelain","--untracked-files=all"])) throw new Error("Worktree or index is dirty. Alignment requires a clean working tree.");
  const taskChangedPaths = changedPaths(repoRoot, mergeBase, taskHead);
  const mainChangedPaths = changedPaths(repoRoot, mergeBase, targetMain);
  assertTaskScope(taskChangedPaths, activeCapsule);
  const concurrentPaths = taskChangedPaths.filter(p => mainChangedPaths.includes(p));
  if (concurrentPaths.some(p => !CANONICAL_SHARED_PATHS.includes(p))) throw new Error(`Concurrent edit outside canonical shared paths: ${concurrentPaths.join(", ")}`);
  const conflictPaths = detectConflictsReadOnly(repoRoot, mergeBase, taskHead, targetMain);
  if (conflictPaths.some(p => !CANONICAL_SHARED_PATHS.includes(p))) throw new Error("Unexpected merge conflict outside canonical shared paths.");
  const archives = tree => tree.filter(e => e.path.startsWith(".synthesis/task-capsules/"));
  const taskArchives = archives(taskTree), mainArchives = archives(mainTree);
  const historical = new Map();
  for (const e of [...taskArchives, ...mainArchives]) {
    if (!/^\.synthesis\/task-capsules\/[A-Z0-9-]+\.json$/.test(e.path) || e.mode !== "100644") throw new Error("Unsafe historical archive path or mode.");
    const prev = historical.get(e.path);
    if (prev && (prev.oid !== e.oid || prev.mode !== e.mode)) throw new Error(`Immutable archive mismatch: ${e.path}`);
    historical.set(e.path,e);
  }
  const taskMap = new Map(taskTree.map(e => [e.path,e])), mainMap = new Map(mainTree.map(e => [e.path,e]));
  for (const p of [...REQUIRED_SCRIPTS,...CANONICAL_SHARED_PATHS,".synthesis/ruleset.lock.json"]) {
    if (mainMap.get(p)?.mode !== "100644" || taskMap.get(p)?.mode !== "100644") throw new Error(`Missing or unsafe required validator/governance file: ${p}`);
  }
  for (const e of archives(baseTree)) {
    if (taskMap.get(e.path)?.oid !== e.oid || mainMap.get(e.path)?.oid !== e.oid || taskMap.get(e.path)?.mode !== e.mode || mainMap.get(e.path)?.mode !== e.mode) {
      throw new Error(`Historical archive overwrite or deletion: ${e.path}`);
    }
  }
  if (historical.has(targetArchivePath)) throw new Error("Target alignment archive collision in Git tree.");
  const diskArchives = fs.readdirSync(path.join(repoRoot, ".synthesis/task-capsules")).sort();
  if (JSON.stringify(diskArchives) !== JSON.stringify(taskArchives.map(e => path.basename(e.path)).sort())) throw new Error("Archive directory contains untracked, ignored or unsupported entries.");
  for (const e of taskArchives) confinedFile(repoRoot, e.path);
  const preservedBlobs = snapshotBlobs(repoRoot, taskChangedPaths.filter(p => !CANONICAL_SHARED_PATHS.includes(p) && !p.startsWith(".synthesis/task-capsules/")), taskHead);
  const adoptedMainBlobs = snapshotBlobs(repoRoot, mainChangedPaths.filter(p => !CANONICAL_SHARED_PATHS.includes(p) && !p.startsWith(".synthesis/task-capsules/")), targetMain);
  const projectedAllowedPaths = computeCumulativeAllowedPaths(taskChangedPaths, CANONICAL_SHARED_PATHS, targetArchivePath);
  for (const p of projectedAllowedPaths) if (matchesPattern(p, activeCapsule.forbidden_paths)) throw new Error(`Forbidden projected path: ${p}`);
  const validatorEvidence = validateGovernance(repoRoot, branch);
  const remotes = gitText(repoRoot, ["remote"]).trim().split("\n");
  const origin = remotes.includes("origin") ? gitText(repoRoot, ["remote", "get-url", "origin"]) : "";
  const originHash = crypto.createHash("sha256").update(origin).digest("hex");
  const hashPayload = {
    tool_contract_version: TOOL_CONTRACT_VERSION, repo_identity: repoRoot,
    git_dir: gitPath(repoRoot, ""), origin_hash: originHash, branch, task_head_sha: taskHead,
    target_main_sha: targetMain, target_ref: targetRef, merge_base_sha: mergeBase,
    active_capsule: activeCapsule, task_changed_paths: taskChangedPaths, main_changed_paths: mainChangedPaths,
    concurrent_paths: concurrentPaths, conflict_paths: conflictPaths,
    preserved_blobs: preservedBlobs, adopted_main_blobs: adoptedMainBlobs,
    task_archives: taskArchives, main_archives: mainArchives, target_archive_path: targetArchivePath,
    next_sequence: nextSeq, projected_allowed_paths: projectedAllowedPaths,
    task_tree: taskTree, main_tree: mainTree, required_scripts: REQUIRED_SCRIPTS
  };
  return { valid: true, errors: [], repoRoot, branch, taskHead, targetMain, targetRef, mergeBase, activeCapsule,
    rootTaskId, nextSeq, targetArchivePath, taskChangedPaths, mainChangedPaths, concurrentPaths,
    conflictPaths, taskArchives, mainArchives, preservedBlobs, adoptedMainBlobs,
    projectedAllowedPaths, hashPayload, planHash: computePlanHash(hashPayload), validatorEvidence };
}
export function planAlignment(options = {}) {
  try { return planInternal(options); }
  catch (err) { return { valid: false, errors: [err.message] }; }
}
function expectedTree(plan, generated) {
  const map = new Map(plan.hashPayload.main_tree.map(e => [e.path,e]));
  const taskMap = new Map(plan.hashPayload.task_tree.map(e => [e.path,e]));
  for (const p of plan.taskChangedPaths) {
    if (CANONICAL_SHARED_PATHS.includes(p)) continue;
    if (taskMap.has(p)) map.set(p,taskMap.get(p)); else map.delete(p);
  }
  for (const e of [...plan.taskArchives,...plan.mainArchives,...generated]) map.set(e.path,e);
  return [...map.values()].sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
function indexTree(repoRoot) {
  return gitText(repoRoot, ["ls-files", "--stage", "-z"]).split("\0").filter(Boolean).map(s => {
    const m = s.match(/^(100644|100755|120000) ([0-9a-f]{40}) 0\t(.+)$/);
    if (!m) throw new Error("Unmerged or unsupported prepared-index entry.");
    return { path: validPath(m[3]), oid: m[2], mode: m[1] };
  }).sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
function verifyPrepared(repoRoot, plan, generated, committed = false) {
  if (gitText(repoRoot, ["ls-files", "-v", "-z"]).split("\0").filter(Boolean).some(s => !s.startsWith("H "))) throw new Error("Unsupported prepared-index flags.");
  const tree = committed ? readTree(repoRoot, "HEAD") : indexTree(repoRoot);
  if (canonicalJsonStringify(tree) !== canonicalJsonStringify(expectedTree(plan, generated))) {
    throw new Error("Prepared-index object/mode integrity or fourth write-set category violation.");
  }
  const actualPaths = changedPaths(repoRoot, plan.targetMain, committed ? "HEAD" : null, !committed);
  if (canonicalJsonStringify(actualPaths) !== canonicalJsonStringify(plan.projectedAllowedPaths)) throw new Error("Exact projected allowed_paths mismatch.");
  assertTaskScope(actualPaths.filter(p => !CANONICAL_SHARED_PATHS.includes(p) && p !== plan.targetArchivePath), plan.activeCapsule);
  for (const p of actualPaths) if (matchesPattern(p, plan.activeCapsule.forbidden_paths)) throw new Error(`Forbidden prepared path: ${p}`);
  const unstaged = runGit(repoRoot, ["diff", "--exit-code", "--"]);
  if (unstaged.status !== 0) throw new Error("Working-tree versus prepared-index integrity mismatch.");
  if (gitText(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"])) throw new Error("Unexpected untracked write-set category.");
  const check = runGit(repoRoot, ["diff", "--cached", "--check"]);
  if (check.status !== 0) throw new Error("Prepared diff whitespace check failed.");
}
function recoverPreCommit(repoRoot, plan, mergeAttempted, archiveIdentity, primary) {
  const errors = [primary.message];
  try {
    if (runGitOrThrow(repoRoot, ["rev-parse", "HEAD"]) !== plan.taskHead || runGitOrThrow(repoRoot, ["symbolic-ref", "--short", "HEAD"]) !== plan.branch) throw new Error("HEAD or branch moved; recovery prohibited.");
    const mh = mergeHead(repoRoot);
    if (mh) {
      if (!mergeAttempted || mh !== plan.targetMain || runGitOrThrow(repoRoot, ["rev-parse", "ORIG_HEAD"]) !== plan.taskHead) throw new Error("Merge ownership cannot be proven.");
      const abort = runGit(repoRoot, ["merge", "--abort"]);
      if (abort.status !== 0) throw new Error("Owned merge abort failed; evidence preserved.");
    } else if (mergeAttempted) {
      throw new Error("Owned merge state absent; automatic recovery cannot be proven.");
    }
    if (archiveIdentity) {
      const archive = path.join(repoRoot, plan.targetArchivePath);
      let st;
      try { st = fs.lstatSync(archive); } catch (e) { if (e.code !== "ENOENT") throw e; }
      if (st) {
        if (!st.isFile() || st.dev !== archiveIdentity.dev || st.ino !== archiveIdentity.ino || !fs.readFileSync(archive).equals(archiveIdentity.bytes)) throw new Error("Created archive identity changed; evidence preserved.");
        if (runGit(repoRoot, ["ls-files", "--error-unmatch", "--", plan.targetArchivePath]).status !== 1) throw new Error("Archive still tracked or lookup failed; deletion prohibited.");
        fs.unlinkSync(archive);
      }
    }
    if (mergeHead(repoRoot) || runGitOrThrow(repoRoot, ["rev-parse", "HEAD"]) !== plan.taskHead || runGitOrThrow(repoRoot, ["status", "--porcelain", "--untracked-files=all"]) || runGit(repoRoot, ["diff", "--cached", "--quiet"]).status !== 0) throw new Error("Original HEAD and clean index/worktree not restored.");
    return { success: false, errors, status: "PRE_COMMIT_VALIDATION_FAILED", recovery: "RESTORED", recoveryVerified: true };
  } catch (err) {
    return { success: false, errors: [...errors,err.message], status: "PRE_COMMIT_VALIDATION_FAILED", recovery: "RECOVERY_REQUIRED" };
  }
}
export function applyAlignment(options = {}) {
  if (!/^[0-9a-f]{64}$/.test(options.planHash || "")) return { success: false, errors: ["Missing or invalid required 64-char --plan-hash argument."] };
  const plan = planAlignment(options);
  if (!plan.valid) return { success: false, errors: ["Plan preflight failed:",...plan.errors] };
  if (plan.planHash !== options.planHash) return { success: false, errors: ["Plan hash mismatch. TOCTOU guard triggered."] };
  const repoRoot = plan.repoRoot;
  let mergeAttempted = false, commitCreated = false, archiveIdentity;
  let generated, alignmentTaskId, alignmentCapsuleId;
  const validatorEvidence = { pre: [], post: [] };
  try {
    mergeAttempted = true;
    const merge = runGit(repoRoot, ["merge", "--no-commit", "--no-ff", "--no-autostash", "--no-edit", plan.targetMain]);
    if (mergeHead(repoRoot) !== plan.targetMain || runGitOrThrow(repoRoot, ["rev-parse", "HEAD"]) !== plan.taskHead || runGitOrThrow(repoRoot, ["rev-parse", "ORIG_HEAD"]) !== plan.taskHead) throw new Error("Expected owned merge state was not established.");
    const conflicts = gitText(repoRoot, ["diff", "--name-only", "--diff-filter=U", "-z"]).split("\0").filter(Boolean).map(validPath).sort();
    if (canonicalJsonStringify(conflicts) !== canonicalJsonStringify(plan.conflictPaths) || (merge.status !== 0 && (merge.status !== 1 || !conflicts.length))) throw new Error("Merge command failed or conflict result drifted.");
    const nowIso = new Date().toISOString();
    alignmentTaskId = plan.nextSeq === "001" ? `${plan.rootTaskId}-MAIN-ALIGNMENT` : `${plan.rootTaskId}-MAIN-ALIGNMENT-${plan.nextSeq}`;
    alignmentCapsuleId = `CAP-${alignmentTaskId}-${nowIso.slice(0,10).replace(/-/g,"")}-001`;
    const capsule = {
      version: "1.1.0", capsule_id: alignmentCapsuleId, task_id: alignmentTaskId,
      title: `${plan.activeCapsule.title || plan.rootTaskId} Main Alignment ${plan.nextSeq}`,
      environment: plan.activeCapsule.environment, base_sha: plan.targetMain,
      expected_branch: plan.branch, owner: plan.activeCapsule.owner,
      parent_capsule_id: plan.activeCapsule.capsule_id, supersedes_capsule_id: null,
      created_at: nowIso, status: "COMPLETED",
      allowed_mutation_types: [...new Set([...plan.activeCapsule.allowed_mutation_types,"GOVERNANCE","EVIDENCE"])].sort(),
      allowed_paths: plan.projectedAllowedPaths, forbidden_paths: plan.activeCapsule.forbidden_paths
    };
    const bytes = Buffer.from(JSON.stringify(capsule,null,2) + "\n");
    const archive = confinedFile(repoRoot,plan.targetArchivePath,true);
    const fd = fs.openSync(archive,"wx",0o644);
    try {
      fs.writeFileSync(fd,bytes);
      const st = fs.fstatSync(fd); archiveIdentity = { dev: st.dev, ino: st.ino, bytes };
    } finally { fs.closeSync(fd); }
    fs.writeFileSync(confinedFile(repoRoot,".synthesis/task-capsule.json"),bytes);
    // Abort cannot restore a symlink collision or an unknown generated target.
    confinedFile(repoRoot,".synthesis/lineage/capsules.json");
    runScript(repoRoot,REQUIRED_SCRIPTS[0],plan.branch);
    generated = [...CANONICAL_SHARED_PATHS,plan.targetArchivePath].sort().map(p => ({ path: p,
      oid: runGitOrThrow(repoRoot,["hash-object","--no-filters","--",confinedFile(repoRoot,p)]), mode: "100644" }));
    runGitOrThrow(repoRoot,["add","--",...generated.map(e => e.path)]);
    verifyPrepared(repoRoot,plan,generated);
    validatorEvidence.pre = validateGovernance(repoRoot,plan.branch);
    verifyPrepared(repoRoot,plan,generated);
    if (runGitOrThrow(repoRoot,["rev-parse","HEAD"]) !== plan.taskHead || mergeHead(repoRoot) !== plan.targetMain || runGitOrThrow(repoRoot,["symbolic-ref","--short","HEAD"]) !== plan.branch || runGitOrThrow(repoRoot,["rev-parse",`${plan.targetRef}^{commit}`]) !== plan.targetMain) throw new Error("Pre-commit ref/merge TOCTOU guard failed.");
    const message = options.commitMessage || `chore(alignment): align ${plan.branch} with main (${plan.targetMain.slice(0,7)})\n\nTASK_ID: ${alignmentTaskId}\nCAPSULE_ID: ${alignmentCapsuleId}\nBASE_SHA: ${plan.targetMain}\nPARENT_CAPSULE_ID: ${capsule.parent_capsule_id}\nPLAN_HASH: ${plan.planHash}`;
    const commit = runGit(repoRoot,["commit","-m",message]);
    // A failing command can still have committed (e.g. post-commit/provider fault).
    commitCreated = runGitOrThrow(repoRoot,["rev-parse","HEAD"]) !== plan.taskHead;
    if (commit.status !== 0 || !commitCreated) throw new Error("Standard merge commit failed or did not move HEAD.");
    const newHead = runGitOrThrow(repoRoot,["rev-parse","HEAD"]);
    const ancestry = runGitOrThrow(repoRoot,["rev-list","--parents","-n","1","HEAD"]).split(/\s+/);
    if (canonicalJsonStringify(ancestry) !== canonicalJsonStringify([newHead,plan.taskHead,plan.targetMain])) throw new Error("Merge ancestry is not exactly the two ordered authorized parents.");
    verifyPrepared(repoRoot,plan,generated,true);
    validatorEvidence.post = validateGovernance(repoRoot,plan.branch);
    validatorEvidence.post.push(runScript(repoRoot,"scripts/ci/diff_firewall.mjs",plan.branch));
    verifyPrepared(repoRoot,plan,generated,true);
    if (runGitOrThrow(repoRoot,["rev-parse","HEAD"]) !== newHead || runGitOrThrow(repoRoot,["symbolic-ref","--short","HEAD"]) !== plan.branch || runGitOrThrow(repoRoot,["rev-parse",`${plan.targetRef}^{commit}`]) !== plan.targetMain) throw new Error("Post-commit ref identity drift.");
    if (runGitOrThrow(repoRoot,["status","--porcelain","--untracked-files=all"]) || mergeHead(repoRoot)) throw new Error("Post-commit repository is not clean.");
    return { success: true, newHeadSha: newHead, alignmentTaskId, alignmentCapsuleId,
      planHash: plan.planHash, targetMainSha: plan.targetMain, validatorEvidence };
  } catch (err) {
    // Inspect actual HEAD even when the Git command threw before returning.
    let observedHead;
    try { observedHead = runGitOrThrow(repoRoot,["rev-parse","HEAD"]); }
    catch { return { success: false, recovery: "RECOVERY_REQUIRED", errors: [err.message,"Cannot establish actual HEAD; recovery prohibited."] }; }
    if (commitCreated || observedHead !== plan.taskHead) return {
      success: false, postCommitFailure: true, newHeadSha: observedHead,
      status: "POST_COMMIT_VALIDATION_FAILED", recovery: "RECOVERY_REQUIRED", errors: [err.message], validatorEvidence
    };
    return recoverPreCommit(repoRoot,plan,mergeAttempted,archiveIdentity,err);
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
      adopted_main_blob_count: res.adoptedMainBlobs.length,
      projected_allowed_paths: res.projectedAllowedPaths
    }, null, 2));
    process.exit(0);
  } else if (mode === "apply") {
    const res = applyAlignment({ planHash, targetMain });
    if (!res.success) {
      console.error(JSON.stringify({
        success: false, errors: res.errors, status: res.status || "PRE_COMMIT_VALIDATION_FAILED",
        recovery: res.recovery || null, post_commit_failure: res.postCommitFailure || false,
        new_head_sha: res.newHeadSha || null, recovery_verified: res.recoveryVerified || false
      }, null, 2));
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
