// @ts-nocheck
import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { generateCapsuleRegistry, resolveRepoRoot } from "../scripts/ci/generate_capsule_registry.mjs";
import { validateCapsuleRegistry } from "../scripts/ci/validate_capsule_registry.mjs";

const repoRoot = resolveRepoRoot();
const registryPath = path.join(repoRoot, ".synthesis/lineage/capsules.json");
const archivesDir = path.join(repoRoot, ".synthesis/task-capsules");

describe("SYN-GOV-CAPSULE-002: Task Capsule Identity & Registry Foundation", () => {
  it("1. Generates deterministic registry byte-for-byte matching on-disk capsules.json", () => {
    const { outputJson } = generateCapsuleRegistry({ repoRoot, dryRun: true });
    assert.ok(fs.existsSync(registryPath), "capsules.json must exist on disk");
    const diskContent = fs.readFileSync(registryPath, "utf8");
    assert.strictEqual(diskContent, outputJson, "Disk capsules.json must match generator output byte-for-byte");
  });

  it("2. Validates existing repository capsule registry with zero errors", () => {
    const result = validateCapsuleRegistry({ repoRoot });
    assert.strictEqual(result.valid, true, `Validation failed: ${result.errors.join(", ")}`);
    assert.strictEqual(result.errors.length, 0);
    assert.ok(result.count >= 38, "Expected at least 38 indexed capsules");
  });

  it("3. Confirms all 38 existing legacy archives remain byte-for-byte unchanged", () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    const legacyRecords = registry.capsules.filter((c: any) => c.legacy === true);
    assert.strictEqual(legacyRecords.length, 38, "Expected exactly 38 legacy records");

    for (const record of legacyRecords) {
      assert.ok(record.capsule_id.startsWith("CAP-LEGACY-"), `Legacy ID format mismatch: ${record.capsule_id}`);
      const fullPath = path.join(repoRoot, record.archive_path);
      assert.ok(fs.existsSync(fullPath), `Legacy archive missing: ${record.archive_path}`);
      const raw = fs.readFileSync(fullPath);
      const computedHash = crypto.createHash("sha256").update(raw).digest("hex");
      assert.strictEqual(computedHash, record.sha256, `SHA-256 drift on legacy archive: ${record.archive_path}`);
      const parsed = JSON.parse(raw.toString("utf8"));
      assert.strictEqual(parsed.capsule_id, undefined, `Historical legacy archive must not be modified: ${record.archive_path}`);
    }
  });

  it("4. Fails closed when duplicate capsule_id is present", () => {
    const tempDir = fs.mkdtempSync(path.join(repoRoot, ".temp-test-dup-"));
    try {
      const tempArchives = path.join(tempDir, ".synthesis/task-capsules");
      const tempLineage = path.join(tempDir, ".synthesis/lineage");
      fs.mkdirSync(tempArchives, { recursive: true });
      fs.mkdirSync(tempLineage, { recursive: true });

      // Create two archives with same capsule_id
      const cap1 = {
        version: "1.1.0",
        capsule_id: "CAP-TEST-DUP-001",
        task_id: "TASK-1",
        title: "Test 1",
        environment: "CMS_DEV",
        created_at: "2026-09-21T08:00:00Z",
        base_sha: "0123456789012345678901234567890123456789",
        expected_branch: "task/t1",
        owner: "AI_STUDIO",
        status: "COMPLETED",
        parent_capsule_id: null,
        supersedes_capsule_id: null,
        allowed_mutation_types: ["TEST"],
        allowed_paths: []
      };
      const cap2 = { ...cap1, task_id: "TASK-2" };

      fs.writeFileSync(path.join(tempArchives, "cap1.json"), JSON.stringify(cap1, null, 2) + "\n");
      fs.writeFileSync(path.join(tempArchives, "cap2.json"), JSON.stringify(cap2, null, 2) + "\n");

      generateCapsuleRegistry({ repoRoot: tempDir });
      const val = validateCapsuleRegistry({ repoRoot: tempDir });
      assert.strictEqual(val.valid, false);
      assert.ok(val.errors.some((e: string) => e.includes("Duplicate capsule_id detected")));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("5. Fails closed when hash drift (SHA-256 mismatch) occurs", () => {
    const tempDir = fs.mkdtempSync(path.join(repoRoot, ".temp-test-hash-"));
    try {
      const tempArchives = path.join(tempDir, ".synthesis/task-capsules");
      const tempLineage = path.join(tempDir, ".synthesis/lineage");
      fs.mkdirSync(tempArchives, { recursive: true });
      fs.mkdirSync(tempLineage, { recursive: true });

      const cap = {
        version: "1.1.0",
        capsule_id: "CAP-TEST-HASH-001",
        task_id: "TASK-HASH",
        title: "Test Hash",
        environment: "CMS_DEV",
        created_at: "2026-09-21T08:00:00Z",
        base_sha: "0123456789012345678901234567890123456789",
        expected_branch: "task/thash",
        owner: "AI_STUDIO",
        status: "COMPLETED",
        parent_capsule_id: null,
        supersedes_capsule_id: null,
        allowed_mutation_types: ["TEST"],
        allowed_paths: []
      };

      const capPath = path.join(tempArchives, "cap.json");
      fs.writeFileSync(capPath, JSON.stringify(cap, null, 2) + "\n");
      generateCapsuleRegistry({ repoRoot: tempDir });

      // Modify the archive on disk after registry generation without updating registry
      fs.writeFileSync(capPath, JSON.stringify({ ...cap, title: "Tampered Title" }, null, 2) + "\n");

      const val = validateCapsuleRegistry({ repoRoot: tempDir });
      assert.strictEqual(val.valid, false);
      assert.ok(val.errors.some((e: string) => e.includes("SHA-256 hash mismatch") || e.includes("not byte-deterministic")));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("6. Fails closed when indexed archive file is missing from disk", () => {
    const tempDir = fs.mkdtempSync(path.join(repoRoot, ".temp-test-missing-"));
    try {
      const tempArchives = path.join(tempDir, ".synthesis/task-capsules");
      const tempLineage = path.join(tempDir, ".synthesis/lineage");
      fs.mkdirSync(tempArchives, { recursive: true });
      fs.mkdirSync(tempLineage, { recursive: true });

      const cap = {
        version: "1.1.0",
        capsule_id: "CAP-TEST-MISSING-001",
        task_id: "TASK-MISSING",
        title: "Test Missing",
        environment: "CMS_DEV",
        created_at: "2026-09-21T08:00:00Z",
        base_sha: "0123456789012345678901234567890123456789",
        expected_branch: "task/tmiss",
        owner: "AI_STUDIO",
        status: "COMPLETED",
        parent_capsule_id: null,
        supersedes_capsule_id: null,
        allowed_mutation_types: ["TEST"],
        allowed_paths: []
      };

      const capPath = path.join(tempArchives, "cap.json");
      fs.writeFileSync(capPath, JSON.stringify(cap, null, 2) + "\n");
      generateCapsuleRegistry({ repoRoot: tempDir });

      // Delete archive file
      fs.unlinkSync(capPath);

      const val = validateCapsuleRegistry({ repoRoot: tempDir });
      assert.strictEqual(val.valid, false);
      assert.ok(val.errors.some((e: string) => e.includes("does not exist on disk")));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("7. Fails closed when parent_capsule_id references non-existent capsule", () => {
    const tempDir = fs.mkdtempSync(path.join(repoRoot, ".temp-test-parent-"));
    try {
      const tempArchives = path.join(tempDir, ".synthesis/task-capsules");
      const tempLineage = path.join(tempDir, ".synthesis/lineage");
      fs.mkdirSync(tempArchives, { recursive: true });
      fs.mkdirSync(tempLineage, { recursive: true });

      const cap = {
        version: "1.1.0",
        capsule_id: "CAP-TEST-CHILD-001",
        task_id: "TASK-CHILD",
        title: "Test Child",
        environment: "CMS_DEV",
        created_at: "2026-09-21T08:00:00Z",
        base_sha: "0123456789012345678901234567890123456789",
        expected_branch: "task/tchild",
        owner: "AI_STUDIO",
        status: "COMPLETED",
        parent_capsule_id: "CAP-NON-EXISTENT-PARENT",
        supersedes_capsule_id: null,
        allowed_mutation_types: ["TEST"],
        allowed_paths: []
      };

      fs.writeFileSync(path.join(tempArchives, "cap.json"), JSON.stringify(cap, null, 2) + "\n");
      generateCapsuleRegistry({ repoRoot: tempDir });

      const val = validateCapsuleRegistry({ repoRoot: tempDir });
      assert.strictEqual(val.valid, false);
      assert.ok(val.errors.some((e: string) => e.includes("invalid parent_capsule_id reference")));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("8. Fails closed when supersedes_capsule_id references non-existent capsule", () => {
    const tempDir = fs.mkdtempSync(path.join(repoRoot, ".temp-test-supersedes-"));
    try {
      const tempArchives = path.join(tempDir, ".synthesis/task-capsules");
      const tempLineage = path.join(tempDir, ".synthesis/lineage");
      fs.mkdirSync(tempArchives, { recursive: true });
      fs.mkdirSync(tempLineage, { recursive: true });

      const cap = {
        version: "1.1.0",
        capsule_id: "CAP-TEST-SUPERSEDE-001",
        task_id: "TASK-SUPERSEDE",
        title: "Test Supersede",
        environment: "CMS_DEV",
        created_at: "2026-09-21T08:00:00Z",
        base_sha: "0123456789012345678901234567890123456789",
        expected_branch: "task/tsuper",
        owner: "AI_STUDIO",
        status: "COMPLETED",
        parent_capsule_id: null,
        supersedes_capsule_id: "CAP-NON-EXISTENT-SUPERSEDED",
        allowed_mutation_types: ["TEST"],
        allowed_paths: []
      };

      fs.writeFileSync(path.join(tempArchives, "cap.json"), JSON.stringify(cap, null, 2) + "\n");
      generateCapsuleRegistry({ repoRoot: tempDir });

      const val = validateCapsuleRegistry({ repoRoot: tempDir });
      assert.strictEqual(val.valid, false);
      assert.ok(val.errors.some((e: string) => e.includes("invalid supersedes_capsule_id reference")));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("9. Fails closed on malformed v1.1+ capsule missing required fields", () => {
    const tempDir = fs.mkdtempSync(path.join(repoRoot, ".temp-test-malformed-"));
    try {
      const tempArchives = path.join(tempDir, ".synthesis/task-capsules");
      const tempLineage = path.join(tempDir, ".synthesis/lineage");
      fs.mkdirSync(tempArchives, { recursive: true });
      fs.mkdirSync(tempLineage, { recursive: true });

      const cap = {
        version: "1.1.0",
        capsule_id: "CAP-TEST-MALFORMED-001",
        task_id: "TASK-MALFORMED",
        // missing title, environment, created_at, owner, etc.
        base_sha: "0123456789012345678901234567890123456789",
        expected_branch: "task/tmal"
      };

      fs.writeFileSync(path.join(tempArchives, "cap.json"), JSON.stringify(cap, null, 2) + "\n");
      generateCapsuleRegistry({ repoRoot: tempDir });

      const val = validateCapsuleRegistry({ repoRoot: tempDir });
      assert.strictEqual(val.valid, false);
      assert.ok(val.errors.some((e: string) => e.includes("Malformed v1.1+ capsule archive missing required field")));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
