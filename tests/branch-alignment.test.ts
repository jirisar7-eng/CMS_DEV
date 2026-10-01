import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { planAlignment, applyAlignment, computePlanHash, snapshotBlobs } from "../scripts/ci/align_branch.mjs";
import { generateCapsuleRegistry } from "../scripts/ci/generate_capsule_registry.mjs";
import { validateCapsuleRegistry } from "../scripts/ci/validate_capsule_registry.mjs";
import { validateLineage } from "../scripts/lineage/validate.mjs";

const rootRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const actualGit = spawnSync("which", ["git"], { encoding: "utf8" }).stdout.trim();
const taskId = "SYN-TEST-FEATURE";
const branch = `task/${taskId}`;
const shared = [".synthesis/task-capsule.json", ".synthesis/lineage/capsules.json"];
const archivePath = `.synthesis/task-capsules/${taskId}.json`;
const alignmentPath = `.synthesis/task-capsules/${taskId}-MAIN-ALIGNMENT.json`;
type Fixture = { dir: string; base: string; main: string; head: string; branch: string };
type Fault = { event?: string; action?: string; file?: string; content?: string; mode?: string; command?: string; status?: number; stdout?: string; abortFails?: boolean; once?: boolean };
type ApplyResult = { success: boolean; errors?: string[]; status?: string; recovery?: string; recoveryVerified?: boolean; postCommitFailure?: boolean; newHeadSha?: string; alignmentTaskId?: string; alignmentCapsuleId?: string; validatorEvidence?: { pre: string[]; post: string[] } };
function git(dir: string, args: string[]): string {
  const res = spawnSync(actualGit, ["-c", "gc.auto=0", "-c", "maintenance.auto=false", ...args], { cwd: dir, encoding: "utf8" });
  assert.equal(res.error, undefined);
  assert.equal(res.status, 0, `git ${args[0]}: ${res.stderr || res.stdout}`);
  return res.stdout.trim();
}
function write(dir: string, name: string, content: string): void {
  const target = path.join(dir, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content);
}
function commit(dir: string, message = "fixture checkpoint"): string {
  git(dir, ["add", "-A"]); git(dir, ["commit", "-m", message]); return git(dir, ["rev-parse", "HEAD"]);
}
function capsule(dir: string, id: string, expectedBranch: string, base: string, extra: string[] = []): void {
  const cap = { version: "1.1.0", capsule_id: `CAP-${id}-20260101-001`, task_id: id, title: id, environment: "CMS_DEV",
    base_sha: base, expected_branch: expectedBranch, owner: "TEST_RUNNER", parent_capsule_id: id === "SYN-TEST-BASE" ? null : "CAP-SYN-TEST-BASE-20260101-001",
    supersedes_capsule_id: null, created_at: "2026-01-01T00:00:00Z", status: "IN_PROGRESS", allowed_mutation_types: ["GOVERNANCE", "TEST"],
    allowed_paths: [...shared, `.synthesis/task-capsules/${id}.json`, "task.txt", "domain.txt", "script.sh", "remove.txt", "link.txt", ...extra].sort(), forbidden_paths: ["app/**"] };
  const bytes = JSON.stringify(cap, null, 2) + "\n";
  write(dir, ".synthesis/task-capsule.json", bytes); write(dir, `.synthesis/task-capsules/${id}.json`, bytes);
  generateCapsuleRegistry({ repoRoot: dir });
}
function fixture(conflict = false): Fixture {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "syn-align-test-"));
  try {
    git(dir, ["init", "-b", "main"]); git(dir, ["config", "user.name", "Security Test Runner"]);
    git(dir, ["config", "user.email", "security-test@synthesis.local"]);
    // Git may otherwise detach automatic GC after commits, racing rmSync in CI.
    git(dir, ["config", "gc.auto", "0"]); git(dir, ["config", "gc.autoDetach", "false"]);
    git(dir, ["config", "maintenance.auto", "false"]); git(dir, ["config", "core.autocrlf", "false"]);
    for (const p of [".synthesis", "docs/governance", "scripts/ci", "scripts/lineage"]) fs.cpSync(path.join(rootRepo, p), path.join(dir, p), { recursive: true });
    fs.copyFileSync(path.join(rootRepo, "AGENTS.md"), path.join(dir, "AGENTS.md"));
    // Copy genuine tracked capability owner files, rather than replacing validators.
    const capabilities = JSON.parse(fs.readFileSync(path.join(dir, ".synthesis/lineage/capabilities.json"), "utf8")).capabilities as Array<{ canonical_owner_paths: string[] }>;
    const patterns = capabilities.flatMap(c => c.canonical_owner_paths);
    for (const p of git(rootRepo, ["ls-files"]).split("\n")) {
      if (patterns.some(pattern => p === pattern || (pattern.endsWith("/**") && p.startsWith(pattern.slice(0, -2))) || (pattern.endsWith("*") && p.startsWith(pattern.slice(0, -1))))) {
        const target = path.join(dir, p); if (!fs.existsSync(target)) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(rootRepo, p), target); }
      }
    }
    write(dir, "base.txt", "base\n"); write(dir, "domain.txt", "one\ntwo\nthree\n"); write(dir, "remove.txt", "remove me\n");
    capsule(dir, "SYN-TEST-BASE", "task/SYN-TEST-BASE", "0".repeat(40));
    const base = commit(dir, "fixture base");
    write(dir, "main.txt", "main adoption\n");
    if (conflict) capsule(dir, "SYN-TEST-MAIN", "task/SYN-TEST-MAIN", base);
    const main = commit(dir, "fixture main advance");
    git(dir, ["switch", "-c", branch, base]); capsule(dir, taskId, branch, base);
    write(dir, "task.txt", "protected task\n"); const head = commit(dir, "fixture feature");
    return { dir, base, main, head, branch };
  } catch (primary) {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 4, retryDelay: 25 }); }
    catch (cleanup) { throw new AggregateError([primary, cleanup], "Fixture construction and cleanup failed"); }
    throw primary;
  }
}
function withFixture(body: (f: Fixture) => void, conflict = false): void {
  const f = fixture(conflict); let primary: unknown;
  try { body(f); } catch (err) { primary = err; }
  try { fs.rmSync(f.dir, { recursive: true, force: true, maxRetries: 4, retryDelay: 25 }); }
  catch (cleanup) { throw primary ? new AggregateError([primary, cleanup], "Assertion and fixture cleanup failed") : cleanup; }
  if (primary) throw primary;
}
function plan(f: Fixture) {
  const res = planAlignment({ repoRoot: f.dir, targetMain: f.main });
  assert.equal(res.valid, true, JSON.stringify(res.errors)); assert.ok("planHash" in res); return res;
}
function apply(f: Fixture, hash = plan(f).planHash): ApplyResult { return applyAlignment({ repoRoot: f.dir, targetMain: f.main, planHash: hash }); }
function assertRestored(f: Fixture): void {
  assert.equal(git(f.dir, ["rev-parse", "HEAD"]), f.head); assert.equal(git(f.dir, ["status", "--porcelain"]), "");
  assert.equal(fs.existsSync(path.join(f.dir, ".git/MERGE_HEAD")), false); assert.equal(fs.existsSync(path.join(f.dir, alignmentPath)), false);
}
function trace(f: Fixture): string[][] {
  const p = path.join(f.dir, ".git/git-trace.jsonl"); return fs.existsSync(p) ? fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map(s => JSON.parse(s) as string[]) : [];
}
function withFault(f: Fixture, fault: Fault, body: () => void): void {
  const bin = path.join(f.dir, ".git/test-bin"); fs.mkdirSync(bin, { recursive: true });
  write(f.dir, ".git/fault.json", JSON.stringify(fault));
  const shim = `#!/usr/bin/env python3
import os,sys,json,subprocess
args=sys.argv[1:];root=os.getcwd();cfgpath=os.path.join(root,'.git/fault.json')
with open(os.path.join(root,'.git/git-trace.jsonl'),'a') as out:out.write(json.dumps(args)+'\\n')
with open(cfgpath) as inp:cfg=json.load(inp)
index=0
while index<len(args) and args[index].startswith('-'):
 index+=2 if args[index]=='-c' else 1
cmd=args[index] if index<len(args) else ''
if cfg.get('abortFails') and cmd=='merge' and '--abort' in args:sys.exit(128)
firewall=(args[:2]==['diff','--name-only'])
if cfg.get('event')=='firewall' and firewall:
 sys.stdout.write(cfg.get('stdout','unauthorized.txt\\n'));sys.exit(cfg.get('status',0))
if cfg.get('event')=='before' and cmd==cfg.get('command'):
 sys.stdout.write(cfg.get('stdout',''));sys.exit(cfg.get('status',128))
res=subprocess.run([${JSON.stringify(actualGit)}]+args,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
sys.stdout.buffer.write(res.stdout);sys.stderr.buffer.write(res.stderr)
event=('after-'+cmd) if not (cmd=='merge' and '--abort' in args) else 'after-abort'
if cfg.get('event')==event and not cfg.get('used'):
 cfg['used']=True
 with open(cfgpath,'w') as out:json.dump(cfg,out)
 file=cfg.get('file','task.txt');target=os.path.join(root,file);action=cfg.get('action')
 if action in ['stage','worktree','write']:
  os.makedirs(os.path.dirname(target),exist_ok=True)
  with open(target,'w') as out:out.write(cfg.get('content','tampered\\n'))
  if action=='stage':subprocess.run([${JSON.stringify(actualGit)},'add','--',file],check=True)
 elif action=='index-mode':
  oid=subprocess.check_output([${JSON.stringify(actualGit)},'rev-parse','HEAD:'+file]).decode().strip()
  subprocess.run([${JSON.stringify(actualGit)},'update-index','--cacheinfo',cfg.get('mode','100644')+','+oid+','+file],check=True)
 elif action=='symlink':os.symlink(cfg['content'],target)
 elif action=='remove':os.unlink(target)
 elif action=='fail':sys.exit(cfg.get('status',128))
sys.exit(res.returncode)
`;
  write(f.dir, ".git/test-bin/git", shim); fs.chmodSync(path.join(bin, "git"), 0o755);
  const oldPath = process.env.PATH; process.env.PATH = bin + path.delimiter + oldPath;
  try { body(); } finally { process.env.PATH = oldPath; }
}
function snapshotDirectory(dir: string): string {
  const hashes: Record<string, string> = {};
  function walk(current: string): void {
    for (const name of fs.readdirSync(current).sort()) {
      const p = path.join(current, name), st = fs.lstatSync(p), relative = path.relative(dir, p);
      if (st.isDirectory()) walk(p);
      else hashes[relative] = crypto.createHash("sha256").update(st.isSymbolicLink() ? fs.readlinkSync(p) : fs.readFileSync(p)).digest("hex") + ":" + (st.mode & 0o777);
    }
  }
  walk(dir); return JSON.stringify(hashes);
}

test("Branch Alignment Security Engine — 26 behavioral integration cases", async t => {
  await t.test("01. PLAN leaves refs, index, object database and worktree byte-identical", () => withFixture(f => {
    const before = snapshotDirectory(f.dir); const a = plan(f), b = plan(f);
    assert.equal(a.planHash, b.planHash); assert.equal(snapshotDirectory(f.dir), before);
  }));
  await t.test("02. Real divergent PLAN/APPLY invokes production registry, lineage and firewall", () => withFixture(f => {
    withFault(f, {}, () => {
      const res = apply(f); assert.equal(res.success, true, JSON.stringify(res.errors));
      assert.equal(validateCapsuleRegistry({ repoRoot: f.dir }).valid, true); assert.equal(validateLineage({ repoRoot: f.dir }).valid, true);
      assert.deepEqual(res.validatorEvidence?.post, ["scripts/ci/validate_capsule_registry.mjs", "scripts/ci/validate_ruleset_lock.mjs", "scripts/lineage/validate.mjs", "scripts/ci/diff_firewall.mjs"]);
      assert.ok(trace(f).some(args => args[0] === "diff" && args[1] === "--name-only"));
    });
  }));
  await t.test("03. Real canonical conflicts resolve without manual registry merging", () => withFixture(f => {
    assert.deepEqual(plan(f).conflictPaths, shared.slice().sort()); const res = apply(f);
    assert.equal(res.success, true, JSON.stringify(res.errors)); assert.equal(fs.readFileSync(path.join(f.dir, "main.txt"), "utf8"), "main adoption\n");
    assert.equal(validateCapsuleRegistry({ repoRoot: f.dir }).valid, true);
  }, true));
  await t.test("04. Unexpected real conflict is rejected before Git merge", () => withFixture(f => {
    git(f.dir, ["switch", "main"]); write(f.dir, "domain.txt", "main\n"); f.main = commit(f.dir);
    git(f.dir, ["switch", branch]); write(f.dir, "domain.txt", "task\n"); f.head = commit(f.dir);
    withFault(f, {}, () => { const r = planAlignment({ repoRoot: f.dir, targetMain: f.main }); assert.equal(r.valid, false); assert.match(r.errors.join(" "), /Concurrent edit/); assert.equal(trace(f).some(a => a.includes("--no-commit")), false); });
    assertRestored(f);
  }));
  await t.test("05. Auto-mergeable concurrent domain edits are also rejected", () => withFixture(f => {
    git(f.dir, ["switch", "main"]); write(f.dir, "domain.txt", "main\ntwo\nthree\n"); f.main = commit(f.dir);
    git(f.dir, ["switch", branch]); write(f.dir, "domain.txt", "one\ntwo\ntask\n"); f.head = commit(f.dir);
    assert.equal(planAlignment({ repoRoot: f.dir, targetMain: f.main }).valid, false); assertRestored(f);
  }));
  await t.test("06. Actual protected task blob corruption is rejected during APPLY", () => withFixture(f => {
    const p = plan(f); withFault(f, { event: "after-add", action: "stage", file: "task.txt" }, () => {
      const r = apply(f, p.planHash); assert.equal(r.success, false); assert.match(r.errors?.join(" ") || "", /Prepared-index/);
      assert.equal(r.recovery, "RESTORED"); assertRestored(f);
    });
  }));
  await t.test("07. Existing archive overwrite and archive creation collision are rejected", () => withFixture(f => {
    const historical = ".synthesis/task-capsules/SYN-TEST-BASE.json", original = fs.readFileSync(path.join(f.dir, historical));
    withFault(f, { event: "after-add", action: "stage", file: historical, content: "{}\n" }, () => {
      const r = apply(f); assert.equal(r.success, false); assertRestored(f); assert.deepEqual(fs.readFileSync(path.join(f.dir, historical)), original);
    });
    withFault(f, { event: "after-merge", action: "write", file: alignmentPath, content: "third-party evidence\n" }, () => {
      const r = apply(f); assert.equal(r.success, false); assert.equal(r.recovery, "RECOVERY_REQUIRED");
      assert.equal(fs.readFileSync(path.join(f.dir, alignmentPath), "utf8"), "third-party evidence\n"); assert.equal(git(f.dir, ["rev-parse", "HEAD"]), f.head);
    });
  }));
  await t.test("08. Same historical archive path with different committed OID fails closed", () => withFixture(f => {
    const cap = JSON.parse(fs.readFileSync(path.join(f.dir, ".synthesis/task-capsule.json"), "utf8"));
    cap.allowed_paths.push(".synthesis/task-capsules/SYN-TEST-BASE.json");
    write(f.dir, ".synthesis/task-capsule.json", JSON.stringify(cap));
    write(f.dir, ".synthesis/task-capsules/SYN-TEST-BASE.json", "{}\n"); generateCapsuleRegistry({ repoRoot: f.dir }); f.head = commit(f.dir);
    const r = planAlignment({ repoRoot: f.dir, targetMain: f.main }); assert.equal(r.valid, false); assert.match(r.errors.join(" "), /archive mismatch|overwrite|Concurrent/);
  }));
  await t.test("09. Target symlink collision cannot escape archive confinement", () => withFixture(f => {
    const outside = path.join(f.dir, ".git/outside-evidence"); fs.writeFileSync(outside, "preserve\n");
    withFault(f, { event: "after-merge", action: "symlink", file: alignmentPath, content: outside }, () => {
      const r = apply(f); assert.equal(r.success, false); assert.equal(r.recovery, "RECOVERY_REQUIRED");
      assert.equal(fs.readFileSync(outside, "utf8"), "preserve\n"); assert.equal(fs.lstatSync(path.join(f.dir, alignmentPath)).isSymbolicLink(), true);
    });
  }));
  await t.test("10. Dirty worktree, dirty index and hidden index flags reject APPLY", () => withFixture(f => {
    const hash = plan(f).planHash; write(f.dir, "task.txt", "unstaged\n"); assert.equal(apply(f, hash).success, false);
    git(f.dir, ["add", "task.txt"]); assert.equal(apply(f, hash).success, false);
    write(f.dir, "task.txt", "protected task\n"); git(f.dir, ["add", "task.txt"]);
    git(f.dir, ["update-index", "--assume-unchanged", "task.txt"]); assert.equal(apply(f, hash).success, false);
    git(f.dir, ["update-index", "--no-assume-unchanged", "task.txt"]); assertRestored(f);
  }));
  await t.test("11. Main, detached HEAD and unauthorized branch reject PLAN/APPLY", () => withFixture(f => {
    const hash = plan(f).planHash;
    for (const args of [["switch", "main"], ["switch", "--detach", f.head], ["switch", "-c", "feature/unauthorized", f.head]]) {
      git(f.dir, args); assert.equal(planAlignment({ repoRoot: f.dir, targetMain: f.main }).valid, false); assert.equal(apply(f, hash).success, false);
    }
  }));
  await t.test("12. Real main SHA, task HEAD and capsule branch drift reject stale APPLY", () => withFixture(f => {
    const hash = plan(f).planHash; git(f.dir, ["switch", "main"]); write(f.dir, "new-main.txt", "advance\n"); commit(f.dir);
    git(f.dir, ["switch", branch]); assert.equal(apply(f, hash).success, false); f.main = git(f.dir, ["rev-parse", "main"]);
    const newHash = plan(f).planHash; write(f.dir, "task.txt", "new checkpoint\n"); commit(f.dir); assert.equal(apply(f, newHash).success, false);
    const cap = JSON.parse(fs.readFileSync(path.join(f.dir, ".synthesis/task-capsule.json"), "utf8")); cap.expected_branch = "task/OTHER";
    write(f.dir, ".synthesis/task-capsule.json", JSON.stringify(cap)); commit(f.dir); assert.equal(planAlignment({ repoRoot: f.dir, targetMain: f.main }).valid, false);
  }));
  await t.test("13. Hash binds nested OID, mode, authority and stale authorization", () => withFixture(f => {
    const p = plan(f); const payload = structuredClone(p.hashPayload); assert.ok(payload);
    for (const field of ["oid", "mode"] as const) {
      const changed = structuredClone(payload); assert.ok(changed); changed.preserved_blobs[0][field] = field === "mode" ? "100755" : "0".repeat(40);
      assert.notEqual(computePlanHash(changed), p.planHash);
    }
    const changed = structuredClone(payload); assert.ok(changed); changed.active_capsule.forbidden_paths.push("task.txt"); assert.notEqual(computePlanHash(changed), p.planHash);
    const r = apply(f, "0".repeat(64)); assert.equal(r.success, false); assert.match(r.errors?.join(" ") || "", /Plan hash mismatch/); assertRestored(f);
  }));
  await t.test("14. Sequence advances from real prior alignment archive on next APPLY", () => withFixture(f => {
    assert.equal(apply(f).success, true); git(f.dir, ["switch", "main"]); write(f.dir, "second-main.txt", "second\n"); f.main = commit(f.dir);
    git(f.dir, ["switch", branch]); const p = plan(f); assert.equal(p.nextSeq, "002"); assert.match(p.targetArchivePath || "", /-002\.json$/);
    const r = apply(f, p.planHash); assert.equal(r.success, true, JSON.stringify(r.errors)); assert.equal(fs.existsSync(path.join(f.dir, p.targetArchivePath || "")), true);
  }));
  await t.test("15. Generated capsule ID, path, parent and active bytes agree", () => withFixture(f => {
    const p = plan(f), r = apply(f, p.planHash); assert.equal(r.success, true);
    const bytes = fs.readFileSync(path.join(f.dir, p.targetArchivePath || "")); const cap = JSON.parse(bytes.toString());
    assert.equal(cap.task_id, r.alignmentTaskId); assert.equal(cap.capsule_id, r.alignmentCapsuleId);
    assert.equal(cap.parent_capsule_id, p.activeCapsule?.capsule_id); assert.equal(cap.base_sha, f.main);
    assert.deepEqual(fs.readFileSync(path.join(f.dir, ".synthesis/task-capsule.json")), bytes);
  }));
  await t.test("16. Registry regenerates complete main/task archive union deterministically", () => withFixture(f => {
    const p = plan(f); assert.equal(apply(f, p.planHash).success, true);
    const registryPath = path.join(f.dir, ".synthesis/lineage/capsules.json"), before = fs.readFileSync(registryPath, "utf8");
    const reg = generateCapsuleRegistry({ repoRoot: f.dir, dryRun: true }); assert.equal(reg.outputJson, before);
    const union = new Set([...(p.taskArchives || []).map((a: { path: string }) => a.path), ...(p.mainArchives || []).map((a: { path: string }) => a.path), p.targetArchivePath]);
    assert.deepEqual(new Set(reg.registry.capsules.map(c => c.archive_path)), union); assert.equal(reg.count, union.size);
  }, true));
  await t.test("17. Prepared index cannot differ from matching working-tree bytes", () => withFixture(f => {
    write(f.dir, "script.sh", "#!/bin/sh\nexit 0\n"); fs.chmodSync(path.join(f.dir, "script.sh"), 0o755); f.head = commit(f.dir);
    withFault(f, { event: "after-add", action: "index-mode", file: "script.sh", mode: "100644" }, () => {
      const r = apply(f); assert.equal(r.success, false); assert.match(r.errors?.join(" ") || "", /Prepared-index/);
      assert.equal(r.recovery, "RECOVERY_REQUIRED"); assert.equal(git(f.dir, ["rev-parse", "HEAD"]), f.head);
      assert.equal(fs.existsSync(path.join(f.dir, ".git/MERGE_HEAD")), true);
      assert.equal(fs.existsSync(path.join(f.dir, alignmentPath)), true);
    });
  }));
  await t.test("18. Registry count is derived from all real fixture archives", () => withFixture(f => {
    const before = fs.readdirSync(path.join(f.dir, ".synthesis/task-capsules")).length;
    assert.equal(apply(f).success, true); const registry = JSON.parse(fs.readFileSync(path.join(f.dir, ".synthesis/lineage/capsules.json"), "utf8"));
    assert.equal(registry.total_capsules, before + 1); assert.equal(registry.total_capsules, registry.capsules.length);
    assert.equal(validateCapsuleRegistry({ repoRoot: f.dir }).count, before + 1);
  }));
  await t.test("19. Main executable mode and symlink objects are adopted; corruption rejected", () => withFixture(f => {
    git(f.dir, ["switch", "main"]); write(f.dir, "main-script.sh", "#!/bin/sh\nexit 0\n"); fs.chmodSync(path.join(f.dir, "main-script.sh"), 0o755);
    fs.symlinkSync("main.txt", path.join(f.dir, "main-link")); f.main = commit(f.dir); git(f.dir, ["switch", branch]);
    const expected = snapshotBlobs(f.dir, ["main-script.sh", "main-link"], f.main);
    withFault(f, { event: "after-add", action: "stage", file: "main-script.sh", content: "corrupted\n" }, () => { const r = apply(f); assert.equal(r.success, false); assertRestored(f); });
    assert.equal(apply(f).success, true); assert.deepEqual(snapshotBlobs(f.dir, ["main-script.sh", "main-link"], "HEAD"), expected);
    assert.deepEqual(expected.map(e => e.mode), ["120000", "100755"]);
  }));
  await t.test("20. Real forbidden/default-locked and fourth-category violations fail closed", () => {
    for (const forbidden of ["app/unauthorized.ts", ".env.unauthorized"]) withFixture(f => {
      write(f.dir, forbidden, "fixture data\n"); if (forbidden.startsWith("app/")) {
        const cap = JSON.parse(fs.readFileSync(path.join(f.dir, ".synthesis/task-capsule.json"), "utf8")); cap.allowed_paths.push(forbidden); write(f.dir, ".synthesis/task-capsule.json", JSON.stringify(cap));
      }
      commit(f.dir); const r = planAlignment({ repoRoot: f.dir, targetMain: f.main }); assert.equal(r.valid, false); assert.match(r.errors.join(" "), /Forbidden|Default-locked/);
    });
    withFixture(f => withFault(f, { event: "after-add", action: "stage", file: "fourth-category.txt" }, () => { const r = apply(f); assert.equal(r.success, false); assertRestored(f); }));
  });
  await t.test("21. Actual pre-commit validation failure aborts only its proven merge", () => withFixture(f => {
    withFault(f, { event: "after-add", action: "stage", file: "task.txt" }, () => {
      const r = apply(f); assert.equal(r.success, false); assert.equal(r.recoveryVerified, true); assert.equal(r.recovery, "RESTORED");
      assert.ok(trace(f).some(a => a.includes("merge") && a.includes("--abort"))); assertRestored(f);
    });
    withFault(f, { event: "after-add", action: "stage", file: "task.txt", abortFails: true }, () => {
      const r = apply(f); assert.equal(r.success, false); assert.equal(r.recovery, "RECOVERY_REQUIRED"); assert.equal(git(f.dir, ["rev-parse", "HEAD"]), f.head);
      assert.equal(fs.existsSync(path.join(f.dir, ".git/MERGE_HEAD")), true); assert.equal(fs.existsSync(path.join(f.dir, alignmentPath)), true);
    });
  }));
  await t.test("22. Standard merge has exactly two correctly ordered parents and retains history", () => withFixture(f => {
    const r = apply(f); assert.equal(r.success, true); assert.deepEqual(git(f.dir, ["rev-list", "--parents", "-n", "1", "HEAD"]).split(" "), [r.newHeadSha, f.head, f.main]);
    assert.equal(git(f.dir, ["merge-base", f.head, "HEAD"]), f.head); assert.equal(git(f.dir, ["rev-parse", "main"]), f.main);
    const r2 = planAlignment({ repoRoot: f.dir, targetMain: f.main }); assert.equal(r2.valid, false); assert.match(r2.errors.join(" "), /NO_ALIGNMENT_REQUIRED/);
  }));
  await t.test("23. Canonical firewall runs despite inherited main CI context; missing validator fails", () => {
    withFixture(f => {
    const old = process.env.GITHUB_HEAD_REF; process.env.GITHUB_HEAD_REF = "main";
    try { withFault(f, { event: "firewall", stdout: "unauthorized.txt\n" }, () => { const r = apply(f); assert.equal(r.success, false); assert.equal(r.postCommitFailure, true); assert.match(r.errors?.join(" ") || "", /diff_firewall/); }); }
    finally { if (old === undefined) delete process.env.GITHUB_HEAD_REF; else process.env.GITHUB_HEAD_REF = old; }
    });
    withFixture(f => {
      const hash = plan(f).planHash; fs.unlinkSync(path.join(f.dir, "scripts/ci/diff_firewall.mjs")); commit(f.dir);
      const r = apply(f, hash); assert.equal(r.success, false); assert.equal(fs.existsSync(path.join(f.dir, alignmentPath)), false);
    });
  });
  await t.test("24. Firewall failure and commit-command failure after movement preserve commit/files", () => {
    for (const fault of [{ event: "firewall", stdout: "unauthorized.txt\n" }, { event: "after-commit", action: "fail", status: 128 }]) withFixture(f => withFault(f, fault, () => {
      const hash = plan(f).planHash;
      const cli = spawnSync(process.execPath, [path.join(f.dir, "scripts/ci/align_branch.mjs"), "--mode=apply", `--target-main=${f.main}`, `--plan-hash=${hash}`], { cwd: f.dir, encoding: "utf8" });
      assert.equal(cli.status, 1); const r = JSON.parse(cli.stderr) as ApplyResult & { post_commit_failure: boolean };
      assert.equal(r.success, false); assert.equal(r.status, "POST_COMMIT_VALIDATION_FAILED"); assert.equal(r.recovery, "RECOVERY_REQUIRED"); assert.equal(r.post_commit_failure, true);
      assert.notEqual(git(f.dir, ["rev-parse", "HEAD"]), f.head); assert.equal(fs.existsSync(path.join(f.dir, alignmentPath)), true); assert.equal(git(f.dir, ["status", "--porcelain"]), "");
      assert.equal(trace(f).some(a => a.includes("reset") || a.includes("clean") || (a.includes("merge") && a.includes("--abort"))), false);
    }));
  });
  await t.test("25. Configured disposable remote refs remain unchanged and engine never pushes", () => withFixture(f => {
    const remote = path.join(f.dir, ".git/remote-fixture.git"); git(f.dir, ["clone", "--bare", f.dir, remote]); git(f.dir, ["remote", "add", "origin", remote]); git(f.dir, ["fetch", "origin"]);
    const refs = () => git(remote, ["for-each-ref", "--format=%(refname) %(objectname)"]); const before = refs();
    withFault(f, {}, () => { assert.equal(apply(f).success, true); assert.equal(refs(), before); assert.equal(trace(f).some(a => a.includes("push") || a.includes("update-ref")), false); });
  }));
  await t.test("26. Every historical archive preserves bytes, modes and OIDs across APPLY", () => withFixture(f => {
    const p = plan(f), union = [...(p.taskArchives || []), ...(p.mainArchives || [])];
    const expected = new Map(union.map(a => [a.path, git(f.dir, ["show", `${(p.taskArchives || []).some((t: { path: string }) => t.path === a.path) ? f.head : f.main}:${a.path}`])]));
    assert.equal(apply(f, p.planHash).success, true);
    for (const a of union) { assert.deepEqual(snapshotBlobs(f.dir, [a.path], "HEAD")[0], a); assert.equal(fs.readFileSync(path.join(f.dir, a.path), "utf8").trim(), expected.get(a.path)); }
  }, true));
});

// Separate fail-closed checks supplement the 26-case contract, rather than count
// parser/helper checks as security integration coverage.
test("Mixed-case external Git driver names cannot execute during PLAN or APPLY", () => {
  for (const kind of ["merge", "filter"]) for (const driver of ["Untrusted", "Mixed.Case"]) withFixture(f => {
    const hash = plan(f).planHash;
    const setting = kind === "merge" ? "driver" : "clean";
    const command = kind === "merge" ? "touch .git/callback-ran; exit 1" : "touch .git/callback-ran; cat";
    git(f.dir, ["config", `${kind}.${driver}.${setting}`, command]);
    write(f.dir, ".git/info/attributes", `.synthesis/task-capsule.json ${kind}=${driver}\n`);
    const r = planAlignment({ repoRoot: f.dir, targetMain: f.main });
    assert.equal(r.valid, false, `${kind}=${driver}: callback executed=${fs.existsSync(path.join(f.dir, ".git/callback-ran"))}`);
    assert.match(r.errors.join(" "), new RegExp(`Unsupported active external Git ${kind} driver`));
    assert.equal(apply(f, hash).success, false);
    assert.equal(fs.existsSync(path.join(f.dir, ".git/callback-ran")), false);
    assertRestored(f);
  }, true);
});

test("Alignment rejects failing Git discovery, missing validators and unsafe state", () => {
  withFixture(f => {
    for (const command of ["merge-tree", "ls-tree"]) withFault(f, { event: "before", command, stdout: "1".repeat(40) + "\0unexpected\0", status: 128 }, () => {
      const r = planAlignment({ repoRoot: f.dir, targetMain: f.main }); assert.equal(r.valid, false); assertRestored(f);
    });
    const cap = JSON.parse(fs.readFileSync(path.join(f.dir, ".synthesis/task-capsule.json"), "utf8")); cap.task_id = "../../UNSAFE";
    write(f.dir, ".synthesis/task-capsule.json", JSON.stringify(cap)); commit(f.dir);
    const r = planAlignment({ repoRoot: f.dir, targetMain: f.main }); assert.equal(r.valid, false); assert.match(r.errors.join(" "), /Invalid task/);
  });
  withFixture(f => {
    write(f.dir, ".git/CHERRY_PICK_HEAD", f.head + "\n"); const r = planAlignment({ repoRoot: f.dir, targetMain: f.main }); assert.equal(r.valid, false); assert.match(r.errors.join(" "), /Unsupported existing Git state/);
  });
  withFixture(f => {
    const hash = plan(f).planHash; git(f.dir, ["config", "merge.untrusted.driver", "exit 0"]);
    write(f.dir, ".git/info/attributes", "task.txt merge=untrusted\n");
    assert.equal(apply(f, hash).success, false); assertRestored(f);
    git(f.dir, ["config", "--unset", "merge.untrusted.driver"]);
    fs.unlinkSync(path.join(f.dir, ".git/info/attributes"));
    write(f.dir, ".git/hooks/pre-commit", "#!/bin/sh\ntouch callback-ran\n"); fs.chmodSync(path.join(f.dir, ".git/hooks/pre-commit"), 0o755);
    assert.equal(apply(f, hash).success, false); assert.equal(fs.existsSync(path.join(f.dir, "callback-ran")), false); assertRestored(f);
  });
  withFixture(f => {
    const hash = plan(f).planHash; git(f.dir, ["switch", "main"]); fs.unlinkSync(path.join(f.dir, "scripts/ci/diff_firewall.mjs")); f.main = commit(f.dir); git(f.dir, ["switch", branch]);
    const r = apply(f, hash); assert.equal(r.success, false); assert.equal(fs.existsSync(path.join(f.dir, alignmentPath)), false); assertRestored(f);
  });
  withFixture(f => {
    fs.unlinkSync(path.join(f.dir, "remove.txt")); f.head = commit(f.dir); const p = plan(f);
    assert.ok(p.preservedBlobs?.some(e => e.path === "remove.txt" && e.oid === null && e.mode === null));
    assert.equal(apply(f, p.planHash).success, true); assert.equal(fs.existsSync(path.join(f.dir, "remove.txt")), false);
  });
});
