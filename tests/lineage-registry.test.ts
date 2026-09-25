// @ts-nocheck
import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { validateLineage, validateGitHistoryAlignment, parsePrNumberFromSubject, isAllowedSyncPath, resolveRepoRoot, matchesOwnerPath } from "../scripts/lineage/validate.mjs";
import { matchesPattern as matchesFirewallPattern } from "../scripts/ci/diff_firewall.mjs";

const repoRoot = resolveRepoRoot();
const tasksPath = path.join(repoRoot, ".synthesis/lineage/tasks.json");
const capabilitiesPath = path.join(repoRoot, ".synthesis/lineage/capabilities.json");
const capsulesPath = path.join(repoRoot, ".synthesis/lineage/capsules.json");
const capsulesDir = path.join(repoRoot, ".synthesis/task-capsules");

describe("SYN-GOV-LINEAGE-001 / SYN-GOV-LINEAGE-002: Authoritative Implementation Lineage & Capability Registry", () => {
  const rawTasks = JSON.parse(fs.readFileSync(tasksPath, "utf8"));
  const rawCapabilities = JSON.parse(fs.readFileSync(capabilitiesPath, "utf8"));
  const rawCapsules = JSON.parse(fs.readFileSync(capsulesPath, "utf8"));

  it("1. Validates current production graph deterministically with zero errors", () => {
    const res = validateLineage({ repoRoot });
    assert.strictEqual(res.valid, true, `Expected valid lineage, got errors: ${res.errors.join(", ")}`);
    assert.strictEqual(res.errors.length, 0);
    assert.strictEqual(res.summary.tasksCount, rawTasks.tasks.length);
    assert.strictEqual(res.summary.capabilitiesCount, 14);
  });

  it("2. PR #1 bootstrap record without capsule is valid and explicitly recorded", () => {
    const pr1 = rawTasks.tasks.find((t: any) => t.pr_number === 1);
    assert.ok(pr1, "PR #1 record must exist");
    assert.strictEqual(pr1.capsule_present, false, "PR #1 capsule_present must be false");
    assert.strictEqual(pr1.task_id, null, "PR #1 task_id must be null");
    assert.strictEqual(pr1.capsule_sha256, null, "PR #1 capsule_sha256 must be null");
    assert.strictEqual(pr1.derived_status, "MERGED", "PR #1 derived_status must be MERGED");
    assert.ok(Array.isArray(pr1.actual_changed_files) && pr1.actual_changed_files.length > 0);
  });

  it("3. Historical baseline PR #1-#34 and live PR range are all represented without gaps or duplicates", () => {
    assert.strictEqual(rawTasks.tasks.length, rawTasks.total_tasks);
    const prNumbers = rawTasks.tasks.map((t: any) => t.pr_number);
    // Historical baseline 1..34 must all exist
    for (let i = 1; i <= 34; i++) {
      assert.ok(prNumbers.includes(i), `Historical baseline PR #${i} must exist`);
    }
    const maxPr = rawTasks.tasks[rawTasks.tasks.length - 1].pr_number;
    const expected = [];
    for (let i = 1; i <= maxPr; i++) {
      if (i !== 58) expected.push(i);
    }
    assert.deepStrictEqual(prNumbers, expected);
    assert.strictEqual(prNumbers.includes(58), false, "PR #58 must be absent");
    // Verify ascending order
    for (let i = 1; i < prNumbers.length; i++) {
      assert.ok(prNumbers[i] > prNumbers[i - 1], "PR numbers must be strictly ascending");
    }
  });

  it("4. Non-null task IDs are strictly unique across all historical tasks", () => {
    const nonNullTaskIds = rawTasks.tasks.filter((t: any) => t.task_id !== null).map((t: any) => t.task_id);
    const expectedCount = rawTasks.tasks.length - 1;
    assert.strictEqual(nonNullTaskIds.length, expectedCount);
    const uniqueTaskIds = new Set(nonNullTaskIds);
    assert.strictEqual(uniqueTaskIds.size, expectedCount, `Expected ${expectedCount} unique task IDs`);
  });

  it("5. Historical IN_PROGRESS capsule + derived MERGED is valid evidence", () => {
    const inProgressTasks = rawTasks.tasks.slice(0, 34).filter((t: any) => t.capsule_declared_status === "IN_PROGRESS");
    assert.ok(inProgressTasks.length > 0, "Expected historical tasks with declared status IN_PROGRESS");
    for (const t of inProgressTasks) {
      assert.strictEqual(t.derived_status, "MERGED", `Task ${t.task_id} derived status must be MERGED`);
      const capRecord = rawCapsules.capsules.find((c: any) => c.task_id === t.task_id);
      assert.ok(capRecord, `Capsule record must exist for ${t.task_id}`);
      const capsuleFile = path.join(repoRoot, capRecord.archive_path);
      assert.ok(fs.existsSync(capsuleFile), `Archived capsule must exist for ${t.task_id}`);
      const raw = JSON.parse(fs.readFileSync(capsuleFile, "utf8"));
      assert.strictEqual(raw.status, "IN_PROGRESS", "Raw archive must preserve historical IN_PROGRESS status");
    }
  });

  it("6. Archived capsule SHA-256 integrity holds for all historical capsules", () => {
    const capsuleTasks = rawTasks.tasks.filter((t: any) => t.capsule_present === true);
    assert.strictEqual(capsuleTasks.length, rawTasks.tasks.length - 1);
    for (const t of capsuleTasks) {
      const capRecord = rawCapsules.capsules.find((c: any) => c.task_id === t.task_id);
      assert.ok(capRecord, `Capsule record missing for ${t.task_id}`);
      const capsuleFile = path.join(repoRoot, capRecord.archive_path);
      assert.ok(fs.existsSync(capsuleFile), `Archived file missing: ${capsuleFile}`);
      const rawContent = fs.readFileSync(capsuleFile, "utf8");
      const hash = crypto.createHash("sha256").update(rawContent, "utf8").digest("hex");
      assert.strictEqual(hash, t.capsule_sha256, `SHA-256 mismatch for task ${t.task_id}`);
    }
  });

  it("7. Fails closed when duplicate task ID is introduced", () => {
    const mutated = JSON.parse(JSON.stringify(rawTasks));
    mutated.tasks[2].task_id = mutated.tasks[1].task_id; // introduce duplicate
    const res = validateLineage({ repoRoot, tasksData: mutated });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("Duplicate task_id detected")));
  });

  it("8. Fails closed when malformed SHA is introduced", () => {
    const mutated = JSON.parse(JSON.stringify(rawTasks));
    mutated.tasks[5].base_sha = "not-a-valid-sha";
    const res = validateLineage({ repoRoot, tasksData: mutated });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("malformed SHA")));
  });

  it("9. Fails closed when archive capsule file or registry mapping is missing", () => {
    const mutated = JSON.parse(JSON.stringify(rawTasks));
    mutated.tasks[10].task_id = "SYN-NON-EXISTENT-TASK-999";
    const res = validateLineage({ repoRoot, tasksData: mutated });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("no matching record in capsule registry") || e.includes("archive file is missing")));
  });

  it("10. Fails closed when unknown capability dependency is declared", () => {
    const mutated = JSON.parse(JSON.stringify(rawCapabilities));
    mutated.capabilities[0].depends_on_capabilities.push("phantom_capability");
    const res = validateLineage({ repoRoot, capabilitiesData: mutated });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("unknown capability dependency")));
  });

  it("11. Fails closed when capability dependency cycle is introduced", () => {
    const mutated = JSON.parse(JSON.stringify(rawCapabilities));
    const capA = mutated.capabilities.find((c: any) => c.capability_id === "identity_rbac");
    const capB = mutated.capabilities.find((c: any) => c.capability_id === "project_context");
    assert.ok(capA && capB);
    capA.depends_on_capabilities.push("project_context");
    const res = validateLineage({ repoRoot, capabilitiesData: mutated });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("Capability dependency cycle detected")));
  });

  it("12. Fails closed when missing canonical owner paths or invalid visibility", () => {
    const mutatedPaths = JSON.parse(JSON.stringify(rawCapabilities));
    mutatedPaths.capabilities[1].canonical_owner_paths = [];
    const res1 = validateLineage({ repoRoot, capabilitiesData: mutatedPaths });
    assert.strictEqual(res1.valid, false);
    assert.ok(res1.errors.some((e: string) => e.includes("missing canonical owner paths")));

    const mutatedVis = JSON.parse(JSON.stringify(rawCapabilities));
    mutatedVis.capabilities[1].visibility = "INVALID_VISIBILITY";
    const res2 = validateLineage({ repoRoot, capabilitiesData: mutatedVis });
    assert.strictEqual(res2.valid, false);
    assert.ok(res2.errors.some((e: string) => e.includes("invalid visibility enum")));
  });

  it("13. Explicitly records canonical architectural SSOT rules", () => {
    const ssot = rawCapabilities.ssot_rules;
    assert.ok(ssot, "ssot_rules must exist in capabilities.json");
    assert.ok(ssot.content_ssot.includes("canonical content SSOT"));
    assert.ok(ssot.visual_editor_role.includes("adapter, NOT SSOT"));
    assert.ok(ssot.search_role.includes("derived/rebuildable index, NOT SSOT"));
    assert.ok(ssot.project_context_role.includes("canonical project/tenant boundary"));
    assert.ok(ssot.capability_map_role.includes("status/product navigation authority, NOT business-data SSOT"));
    assert.ok(ssot.redirect_runtime_role.includes("consumes published content + RedirectRule"));
    assert.ok(ssot.media_replace_role.includes("File replacement is implemented"));
    assert.ok(ssot.sitemap_runtime_role.includes("sitemap derives from published public routes and page SEO"));
    assert.ok(ssot.plugin_registry_role.includes("Code PluginRegistry is the manifest authority"));
  });

  it("14. Fails closed when unknown syntactically-valid last_merge_sha is referenced", () => {
    const mutated = JSON.parse(JSON.stringify(rawCapabilities));
    mutated.capabilities[0].last_merge_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const res = validateLineage({ repoRoot, capabilitiesData: mutated });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("references unknown last_merge_sha")));
  });

  it("15. Fails closed when unknown source_task is referenced", () => {
    const mutated = JSON.parse(JSON.stringify(rawCapabilities));
    mutated.capabilities[1].source_tasks.push("SYN-UNKNOWN-TASK-999");
    const res = validateLineage({ repoRoot, capabilitiesData: mutated });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("references unknown source_task")));
  });

  it("16. Fails closed when canonical owner path matches zero tracked repository files", () => {
    const mutated = JSON.parse(JSON.stringify(rawCapabilities));
    mutated.capabilities[1].canonical_owner_paths.push("app/admin/nonexistent_fake_path/**");
    const res = validateLineage({ repoRoot, capabilitiesData: mutated });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("matches 0 tracked repository files")));
  });

  it("17. Accurately treats route-group (auth) as literal path and not regex group", () => {
    const pattern = "app/(auth)/admin/login/**";
    assert.strictEqual(matchesOwnerPath("app/(auth)/admin/login/page.tsx", pattern), true);
    assert.strictEqual(matchesOwnerPath("app/(auth)/admin/login/actions.ts", pattern), true);
    assert.strictEqual(matchesOwnerPath("app/admin/login/page.tsx", pattern), false);
    assert.strictEqual(matchesOwnerPath("app/auth/admin/login/page.tsx", pattern), false);
  });

  it("18. Accurately treats dynamic segment [projectId] as literal path and not regex character class", () => {
    const pattern = "app/api/admin/projects/[projectId]/seo/**";
    assert.strictEqual(matchesOwnerPath("app/api/admin/projects/[projectId]/seo/route.ts", pattern), true);
    assert.strictEqual(matchesOwnerPath("app/api/admin/projects/seo/route.ts", pattern), false);
    assert.strictEqual(matchesOwnerPath("app/api/admin/projects/p/seo/route.ts", pattern), false);
  });

  it("19. Fails closed when PR baseline 1..34 range is incomplete", () => {
    const mutatedMissing = JSON.parse(JSON.stringify(rawTasks));
    mutatedMissing.tasks = mutatedMissing.tasks.filter((t: any) => t.pr_number !== 5);
    mutatedMissing.total_tasks = mutatedMissing.tasks.length;
    const resMissing = validateLineage({ repoRoot, tasksData: mutatedMissing });
    assert.strictEqual(resMissing.valid, false);
    assert.ok(resMissing.errors.some((e: string) => e.includes("Missing required PR #5")));
  });

  it("20. Allows non-contiguous PR numbering after #34 (e.g. absent #58)", () => {
    const res = validateLineage({ repoRoot });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(rawTasks.tasks.some((t: any) => t.pr_number === 58), false);
  });

  it("21. Fails closed when duplicate PR number is introduced", () => {
    const mutated = JSON.parse(JSON.stringify(rawTasks));
    mutated.tasks[35].pr_number = mutated.tasks[34].pr_number;
    const res = validateLineage({ repoRoot, tasksData: mutated });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("Duplicate PR number detected")));
  });

  it("22. Fails closed when PR numbers are out of strictly ascending order", () => {
    const mutated = JSON.parse(JSON.stringify(rawTasks));
    // Swap PR #40 and PR #41 positions to create an out-of-order sequence with unique PRs
    const tmp = mutated.tasks[39].pr_number;
    mutated.tasks[39].pr_number = mutated.tasks[40].pr_number;
    mutated.tasks[40].pr_number = tmp;
    const res = validateLineage({ repoRoot, tasksData: mutated });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("not in strictly ascending order")));
  });

  it("23. Fails closed when total_tasks does not match tasks array length", () => {
    const mutated = JSON.parse(JSON.stringify(rawTasks));
    mutated.total_tasks = 999;
    const res = validateLineage({ repoRoot, tasksData: mutated });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("does not match tasks array length")));
  });

  it("24. Fails closed when capsule registry record is missing for task", () => {
    const mutatedTasks = JSON.parse(JSON.stringify(rawTasks));
    mutatedTasks.tasks[20].task_id = "SYN-UNKNOWN-TASK-NO-CAP";
    const res = validateLineage({ repoRoot, tasksData: mutatedTasks });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("no matching record in capsule registry")));
  });

  it("25. Fails closed when capsule SHA-256 hash mismatch occurs", () => {
    const mutatedTasks = JSON.parse(JSON.stringify(rawTasks));
    mutatedTasks.tasks[20].capsule_sha256 = "0".repeat(64);
    const res = validateLineage({ repoRoot, tasksData: mutatedTasks });
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some((e: string) => e.includes("capsule_sha256 mismatch") || e.includes("capsule SHA-256 mismatch")));
  });

  it("26. Post-baseline tasks (PR > #34) declare verified evidence-backed touches_capabilities", () => {
    const post34 = rawTasks.tasks.filter((t: any) => t.pr_number > 34);
    assert.strictEqual(post34.length, rawTasks.total_tasks - 34);

    const pr35 = post34.find((t: any) => t.pr_number === 35);
    assert.deepStrictEqual(pr35.touches_capabilities, ["governance"]);

    const pr40 = post34.find((t: any) => t.pr_number === 40);
    assert.deepStrictEqual(pr40.touches_capabilities, ["identity_rbac", "plugin_registry"]);

    const pr47 = post34.find((t: any) => t.pr_number === 47);
    assert.deepStrictEqual(pr47.touches_capabilities, ["identity_rbac", "navigation"]);

    const pr59 = post34.find((t: any) => t.pr_number === 59);
    assert.deepStrictEqual(pr59.touches_capabilities, ["identity_rbac", "content_lifecycle"]);

    const pr60 = post34.find((t: any) => t.pr_number === 60);
    assert.deepStrictEqual(pr60.touches_capabilities, ["admin_pages", "visual_editor"]);

    const pr62 = post34.find((t: any) => t.pr_number === 62);
    assert.deepStrictEqual(pr62.touches_capabilities, ["content_lifecycle", "media"]);

    const pr66 = post34.find((t: any) => t.pr_number === 66);
    assert.deepStrictEqual(pr66.touches_capabilities, ["seo"]);

    const pr67 = post34.find((t: any) => t.pr_number === 67);
    assert.deepStrictEqual(pr67.touches_capabilities, ["governance"]);

    // Routine closeouts without mechanism changes are empty
    const pr61 = post34.find((t: any) => t.pr_number === 61);
    assert.deepStrictEqual(pr61.touches_capabilities, []);
    const pr63 = post34.find((t: any) => t.pr_number === 63);
    assert.deepStrictEqual(pr63.touches_capabilities, []);
    const pr65 = post34.find((t: any) => t.pr_number === 65);
    assert.deepStrictEqual(pr65.touches_capabilities, []);
  });

  it("27. Capability source provenance and last_merge_sha reflect post-baseline integrations through PR #67", () => {
    const gov = rawCapabilities.capabilities.find((c: any) => c.capability_id === "governance");
    assert.ok(gov.source_tasks.includes("SYN-GOV-LINEAGE-001-IMMUTABLE-TASK-ARCHIVE"));
    assert.ok(gov.source_tasks.includes("SYN-OPS-002"));
    assert.ok(gov.source_tasks.includes("SYN-GOV-LINEAGE-002-LIVE-LINEAGE-DRIFT-REPAIR"));
    assert.strictEqual(gov.last_merge_sha, "a309224dbc3285d9d63a2eed1a142b0378393def");

    const idRbac = rawCapabilities.capabilities.find((c: any) => c.capability_id === "identity_rbac");
    assert.ok(idRbac.source_tasks.includes("SYN-SYSTEM-MAP-001"));
    assert.ok(idRbac.source_tasks.includes("SYN-CONTENT-006"));
    assert.strictEqual(idRbac.last_merge_sha, "7b45ffea82220946e3aab088768ca5d32e8a4598");

    const content = rawCapabilities.capabilities.find((c: any) => c.capability_id === "content_lifecycle");
    assert.ok(content.source_tasks.includes("SYN-CONTENT-003"));
    assert.ok(content.source_tasks.includes("SYN-MEDIA-002"));
    assert.strictEqual(content.last_merge_sha, "6e17f95056c91c22b35f67a267704a77c2011e45");

    const seo = rawCapabilities.capabilities.find((c: any) => c.capability_id === "seo");
    assert.ok(seo.source_tasks.includes("SYN-SEO-002"));
    assert.strictEqual(seo.last_merge_sha, "dab847fedfe086167b4932032e88dd3b3d46131b");

    // Unmodified capabilities preserved
    const search = rawCapabilities.capabilities.find((c: any) => c.capability_id === "search");
    assert.deepStrictEqual(search.source_tasks, ["SYN-SEARCH-001-SEARCH-FOUNDATION"]);
    assert.strictEqual(search.last_merge_sha, "6887f26deb3849676e9c0c3ac3bce40d11b8cf7b");
  });

  it("28. SEO capability truthfully records implemented runtime and SSOT boundaries", () => {
    const seo = rawCapabilities.capabilities.find((c: any) => c.capability_id === "seo");
    assert.ok(seo.ssot_role.toLowerCase().includes("project seo metadata is ssot"));
    assert.ok(seo.ssot_role.includes("robots.txt runtime is implemented"));
    assert.ok(seo.ssot_role.includes("sitemap.xml runtime is implemented"));
    assert.ok(seo.ssot_role.includes("sitemap derives from publish"));
    assert.strictEqual(seo.project_scoped, true);
    assert.strictEqual(seo.security_boundary, "PROJECT_SCOPED_RBAC_SEO_MANAGE");
  });

  it("29. Capability description closeout asserts truthful media, plugin, and SEO wording (Checkpoint 5.1)", () => {
    const fullCapabilities = fs.readFileSync(capabilitiesPath, "utf8");
    // obsolete media string absent
    assert.strictEqual(fullCapabilities.includes("Media Replace = SAFELY_DISABLED / deferred"), false);
    assert.strictEqual(fullCapabilities.includes("SAFELY_DISABLED"), false);

    // obsolete plugin string absent
    assert.strictEqual(fullCapabilities.includes("NOT persistence/runtime activation SSOT"), false);

    // updated media wording present
    const media = rawCapabilities.capabilities.find((c: any) => c.capability_id === "media");
    const expectedMedia = "Media asset versioning and usage references are SSOT; file replacement is implemented for eligible non-PUBLISHED assets, preserves asset identity and usage links, enforces security validation, compensates storage on DB failure, and remains fail-closed for PUBLISHED assets.";
    assert.strictEqual(media.ssot_role, expectedMedia);
    assert.ok(rawCapabilities.ssot_rules.media_replace_role.includes("File replacement is implemented for eligible non-PUBLISHED assets"));
    assert.ok(rawCapabilities.ssot_rules.media_replace_role.includes("remains fail-closed for PUBLISHED assets."));

    // updated plugin wording present
    const plugin = rawCapabilities.capabilities.find((c: any) => c.capability_id === "plugin_registry");
    const expectedPlugin = "Code PluginRegistry is the manifest authority; ProjectPluginState provides project-scoped persisted enable/disable/config state; sensitive plugin config is not stored in ProjectPluginState.";
    assert.strictEqual(plugin.ssot_role, expectedPlugin);
    assert.strictEqual(rawCapabilities.ssot_rules.plugin_registry_role, expectedPlugin);

    // SEO wording contains published public routes and page SEO
    const seo = rawCapabilities.capabilities.find((c: any) => c.capability_id === "seo");
    assert.ok(seo.ssot_role.includes("published public routes and page SEO"));
    assert.ok(rawCapabilities.ssot_rules.sitemap_runtime_role.includes("published public routes and page SEO"));

    // search still does not contain SYN-SEARCH-002
    const search = rawCapabilities.capabilities.find((c: any) => c.capability_id === "search");
    assert.strictEqual(search.source_tasks.includes("SYN-SEARCH-002"), false);

    // tasks.json remains untouched by this checkpoint
    const diff = execSync("git diff -- .synthesis/lineage/tasks.json", { cwd: repoRoot, encoding: "utf8" });
    assert.strictEqual(diff.trim(), "", "tasks.json must remain untouched");
  });

  describe("SYN-GOV-LINEAGE-002: Git History Anti-Drift Gate Unit Tests", () => {
    function makeSyntheticCommits() {
      const tasks35Plus = rawTasks.tasks.filter((t: any) => t.pr_number > 34);
      return tasks35Plus.map((t: any) => ({
        sha: t.merge_sha,
        subject: `Feature commit for task ${t.task_id} (#${t.pr_number})`,
        message: `Feature commit for task ${t.task_id} (#${t.pr_number})\n\nBody description`,
        changedFiles: t.actual_changed_files || [".synthesis/lineage/tasks.json"]
      }));
    }

    it("1. Exact synchronized history => PASS", () => {
      const synthetic = makeSyntheticCommits();
      const res = validateGitHistoryAlignment({
        repoRoot,
        tasksData: rawTasks,
        isShallow: false,
        mode: "local",
        commits: synthetic
      });
      assert.strictEqual(res.valid, true, `Expected valid alignment, got errors: ${res.errors.join(", ")}`);
      assert.strictEqual(res.summary.classifiedNormalPrs, synthetic.length);
      assert.strictEqual(res.summary.unmatchedNormalPrs, 0);
    });

    it("2. Non-contiguous PR numbers => PASS", () => {
      const synthetic = makeSyntheticCommits();
      assert.strictEqual(synthetic.some((c: any) => c.subject.includes("#58")), false);
      const res = validateGitHistoryAlignment({
        repoRoot,
        tasksData: rawTasks,
        isShallow: false,
        mode: "local",
        commits: synthetic
      });
      assert.strictEqual(res.valid, true);
    });

    it("3. Trailing \"(#N)\" parsing => PASS", () => {
      const parsed = parsePrNumberFromSubject("feat(auth): add MFA support (#52)");
      assert.strictEqual(parsed.matched, true);
      assert.strictEqual(parsed.prNumber, 52);
    });

    it("4. \"Merge pull request #N\" parsing => PASS", () => {
      const parsed = parsePrNumberFromSubject("Merge pull request #40 from jirisar7-eng/task/branch");
      assert.strictEqual(parsed.matched, true);
      assert.strictEqual(parsed.prNumber, 40);
    });

    it("5. \"Merge PR #N\" parsing => PASS", () => {
      const parsed = parsePrNumberFromSubject("Merge PR #48: Secret Hygiene & Repository Secret Scanning");
      assert.strictEqual(parsed.matched, true);
      assert.strictEqual(parsed.prNumber, 48);
    });

    it("6. Duplicate PR number in history => FAIL", () => {
      const synthetic = makeSyntheticCommits();
      synthetic[2].subject = "Duplicate PR subject (#35)";
      const res = validateGitHistoryAlignment({
        repoRoot,
        tasksData: rawTasks,
        isShallow: false,
        mode: "local",
        commits: synthetic
      });
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some((e: string) => e.includes("Duplicate PR #35 detected")));
    });

    it("7. Tasks record missing for historical PR in pull_request mode => FAIL", () => {
      const synthetic = makeSyntheticCommits();
      const mutatedTasks = JSON.parse(JSON.stringify(rawTasks));
      mutatedTasks.tasks = mutatedTasks.tasks.filter((t: any) => t.pr_number !== 40);
      const res = validateGitHistoryAlignment({
        repoRoot,
        tasksData: mutatedTasks,
        isShallow: false,
        mode: "pull_request",
        commits: synthetic
      });
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some((e: string) => e.includes("Unmatched normal PR #40")));
    });

    it("8. Wrong merge_sha => FAIL", () => {
      const synthetic = makeSyntheticCommits();
      synthetic[5].sha = "0123456789abcdef0123456789abcdef01234567";
      const res = validateGitHistoryAlignment({
        repoRoot,
        tasksData: rawTasks,
        isShallow: false,
        mode: "local",
        commits: synthetic
      });
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some((e: string) => e.includes("merge_sha mismatch")));
    });

    it("9. Extra fabricated tasks record >34 => FAIL", () => {
      const synthetic = makeSyntheticCommits();
      const mutatedTasks = JSON.parse(JSON.stringify(rawTasks));
      mutatedTasks.tasks.push({
        pr_number: 99,
        task_id: "SYN-FAKE-099",
        merge_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      });
      const res = validateGitHistoryAlignment({
        repoRoot,
        tasksData: mutatedTasks,
        isShallow: false,
        mode: "local",
        commits: synthetic
      });
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some((e: string) => e.includes("which does not exist in first-parent history")));
    });

    it("10. Unrecognized normal first-parent commit => FAIL", () => {
      const synthetic = makeSyntheticCommits();
      synthetic[3].subject = "Random non-conventional unbracketed commit without PR";
      synthetic[3].message = "Random non-conventional unbracketed commit without PR";
      const res = validateGitHistoryAlignment({
        repoRoot,
        tasksData: rawTasks,
        isShallow: false,
        mode: "local",
        commits: synthetic
      });
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some((e: string) => e.includes("Unrecognized first-parent commit format")));
    });

    it("11. Valid lineage-sync marker + allowed diff => PASS", () => {
      const synthetic = makeSyntheticCommits();
      synthetic.splice(5, 0, {
        sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        subject: "chore(governance): synchronize lineage",
        message: "SYN-GOV-LINEAGE-SYNC: routine lineage catch-up\n\nSync description",
        changedFiles: [
          ".synthesis/lineage/tasks.json",
          ".synthesis/lineage/capsules.json",
          ".synthesis/task-capsule.json"
        ]
      });
      const res = validateGitHistoryAlignment({
        repoRoot,
        tasksData: rawTasks,
        isShallow: false,
        mode: "local",
        commits: synthetic
      });
      assert.strictEqual(res.valid, true, `Expected valid sync, got: ${res.errors.join(", ")}`);
      assert.strictEqual(res.summary.syncCommits, 1);
    });

    it("12. Generic sync + tests/lineage-registry.test.ts without repair marker => FAIL", () => {
      const synthetic = makeSyntheticCommits();
      synthetic.splice(5, 0, {
        sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        subject: "chore(governance): sync lineage",
        message: "SYN-GOV-LINEAGE-SYNC: routine lineage\n\nSync description",
        changedFiles: [
          ".synthesis/lineage/tasks.json",
          "tests/lineage-registry.test.ts"
        ]
      });
      const res = validateGitHistoryAlignment({
        repoRoot,
        tasksData: rawTasks,
        isShallow: false,
        mode: "local",
        commits: synthetic
      });
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some((e: string) => e.includes("touches forbidden path: tests/lineage-registry.test.ts")));
    });

    it("12b. Exact repair marker + scripts/lineage/validate.mjs + tests/lineage-registry.test.ts => PASS", () => {
      const synthetic = makeSyntheticCommits();
      synthetic.splice(5, 0, {
        sha: "cccccccccccccccccccccccccccccccccccccccc",
        subject: "fix(governance): repair lineage sync test baseline",
        message: "fix(governance): repair lineage sync test baseline\n\nSYN-GOV-LINEAGE-SYNC\nSYN-GOV-LINEAGE-SYNC-TEST-BASELINE-REPAIR",
        changedFiles: [
          ".synthesis/lineage/tasks.json",
          "scripts/lineage/validate.mjs",
          "tests/lineage-registry.test.ts"
        ]
      });
      const res = validateGitHistoryAlignment({
        repoRoot,
        tasksData: rawTasks,
        isShallow: false,
        mode: "local",
        commits: synthetic
      });
      assert.strictEqual(res.valid, true, `Expected PASS with repair marker, got errors: ${res.errors.join(", ")}`);
      assert.strictEqual(res.summary.syncCommits, 1);
    });

    it("12c. Exact repair marker + unrelated runtime path => FAIL", () => {
      const synthetic = makeSyntheticCommits();
      synthetic.splice(5, 0, {
        sha: "dddddddddddddddddddddddddddddddddddddddd",
        subject: "fix(governance): repair lineage sync test baseline",
        message: "fix(governance): repair lineage sync test baseline\n\nSYN-GOV-LINEAGE-SYNC\nSYN-GOV-LINEAGE-SYNC-TEST-BASELINE-REPAIR",
        changedFiles: [
          ".synthesis/lineage/tasks.json",
          "scripts/lineage/validate.mjs",
          "app/page.tsx"
        ]
      });
      const res = validateGitHistoryAlignment({
        repoRoot,
        tasksData: rawTasks,
        isShallow: false,
        mode: "local",
        commits: synthetic
      });
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some((e: string) => e.includes("touches forbidden path: app/page.tsx")));
    });

    it("13. Pull_request mode with one unmatched normal PR => FAIL", () => {
      const synthetic = makeSyntheticCommits();
      const mutatedTasks = JSON.parse(JSON.stringify(rawTasks));
      const removedTask = mutatedTasks.tasks.pop();
      const res = validateGitHistoryAlignment({
        repoRoot,
        tasksData: mutatedTasks,
        isShallow: false,
        mode: "pull_request",
        commits: synthetic
      });
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some((e: string) => e.includes(`Unmatched normal PR #${removedTask.pr_number}`)));
    });

    it("14. Local mode with one unmatched normal PR => FAIL", () => {
      const synthetic = makeSyntheticCommits();
      const mutatedTasks = JSON.parse(JSON.stringify(rawTasks));
      const removedTask = mutatedTasks.tasks.pop();
      const res = validateGitHistoryAlignment({
        repoRoot,
        tasksData: mutatedTasks,
        isShallow: false,
        mode: "local",
        commits: synthetic
      });
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some((e: string) => e.includes(`Unmatched normal PR #${removedTask.pr_number}`)));
    });

    it("15. Main-push mode with exactly one FINAL unmatched normal PR => PASS", () => {
      const synthetic = makeSyntheticCommits();
      const mutatedTasks = JSON.parse(JSON.stringify(rawTasks));
      mutatedTasks.tasks.pop();
      const res = validateGitHistoryAlignment({
        repoRoot,
        tasksData: mutatedTasks,
        isShallow: false,
        mode: "main_push",
        commits: synthetic
      });
      assert.strictEqual(res.valid, true, `Expected PASS on single final unmatched PR in main_push, got: ${res.errors.join(", ")}`);
      assert.strictEqual(res.summary.unmatchedNormalPrs, 1);
    });

    it("16. Main-push mode with two unmatched normal PRs => FAIL", () => {
      const synthetic = makeSyntheticCommits();
      const mutatedTasks = JSON.parse(JSON.stringify(rawTasks));
      mutatedTasks.tasks.pop();
      mutatedTasks.tasks.pop();
      const res = validateGitHistoryAlignment({
        repoRoot,
        tasksData: mutatedTasks,
        isShallow: false,
        mode: "main_push",
        commits: synthetic
      });
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some((e: string) => e.includes("Multiple unmatched normal PRs in main history (2)")));
    });

    it("17. Main-push mode where unmatched PR is not final history entry => FAIL", () => {
      const synthetic = makeSyntheticCommits();
      const mutatedTasks = JSON.parse(JSON.stringify(rawTasks));
      mutatedTasks.tasks = mutatedTasks.tasks.filter((t: any) => t.pr_number !== 65);
      const res = validateGitHistoryAlignment({
        repoRoot,
        tasksData: mutatedTasks,
        isShallow: false,
        mode: "main_push",
        commits: synthetic
      });
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some((e: string) => e.includes("is not the final entry in first-parent history")));
    });

    it("18. Shallow repository strict validation => FAIL CLOSED", () => {
      const synthetic = makeSyntheticCommits();
      const res = validateGitHistoryAlignment({
        repoRoot,
        tasksData: rawTasks,
        isShallow: true,
        mode: "local",
        commits: synthetic
      });
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some((e: string) => e.includes("Repository is shallow; full git history required")));
    });

    it("19. Local mode with missing origin/main => FAIL", () => {
      const synthetic = makeSyntheticCommits();
      const res = validateGitHistoryAlignment({
        repoRoot,
        tasksData: rawTasks,
        isShallow: false,
        mode: "local",
        isTargetResolvable: false,
        commits: synthetic
      });
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some((e: string) => e.includes("Cannot resolve history target: origin/main")));
    });

    it("20. Pull_request mode with missing origin/main => FAIL", () => {
      const synthetic = makeSyntheticCommits();
      const res = validateGitHistoryAlignment({
        repoRoot,
        tasksData: rawTasks,
        isShallow: false,
        mode: "pull_request",
        isTargetResolvable: false,
        commits: synthetic
      });
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some((e: string) => e.includes("Cannot resolve history target: origin/main")));
    });

    it("21. Sync commit with missing changedFiles evidence => FAIL", () => {
      const synthetic = makeSyntheticCommits();
      synthetic.splice(5, 0, {
        sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        subject: "chore(governance): sync lineage",
        message: "SYN-GOV-LINEAGE-SYNC: routine lineage\n\nSync description"
        // changedFiles omitted intentionally
      });
      const res = validateGitHistoryAlignment({
        repoRoot,
        tasksData: rawTasks,
        isShallow: false,
        mode: "local",
        commits: synthetic
      });
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some((e: string) => e.includes("is missing changed-files evidence")));
    });
  });


  describe("SYN-GOV-LINEAGE-002A: Diff Firewall Recursive Glob Matching", () => {
    it("1. .synthesis/task-capsules/** matches .synthesis/task-capsules/SYN-SEC-009.json", () => {
      assert.strictEqual(
        matchesFirewallPattern(".synthesis/task-capsules/SYN-SEC-009.json", [".synthesis/task-capsules/**"]),
        true
      );
    });

    it("2. .synthesis/task-capsules/** matches .synthesis/task-capsules/nested/example.json", () => {
      assert.strictEqual(
        matchesFirewallPattern(".synthesis/task-capsules/nested/example.json", [".synthesis/task-capsules/**"]),
        true
      );
    });

    it("3. .synthesis/task-capsules/** does NOT match .synthesis/task-capsules-other/example.json", () => {
      assert.strictEqual(
        matchesFirewallPattern(".synthesis/task-capsules-other/example.json", [".synthesis/task-capsules/**"]),
        false
      );
    });

    it("4. Existing exact matching still works", () => {
      assert.strictEqual(
        matchesFirewallPattern(".synthesis/task-capsule.json", [".synthesis/task-capsule.json"]),
        true
      );
      assert.strictEqual(
        matchesFirewallPattern(".synthesis/task-capsule.json.bak", [".synthesis/task-capsule.json"]),
        false
      );
    });

    it("5. Existing single trailing * behavior remains unchanged", () => {
      assert.strictEqual(
        matchesFirewallPattern(".env.local", [".env*"]),
        true
      );
      assert.strictEqual(
        matchesFirewallPattern(".env", [".env*"]),
        true
      );
      assert.strictEqual(
        matchesFirewallPattern("other/.env", [".env*"]),
        false
      );
    });
  });
});
