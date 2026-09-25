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

  it("3. Confirms required legacy archives remain present and byte-for-byte unchanged", () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    const requiredLegacyPaths = [
      ".synthesis/task-capsules/SYN-ADMIN-STATUS-001-CAPABILITY-MAP.json",
      ".synthesis/task-capsules/SYN-AUDIT-001-ADMIN-VIEWER-CUTOVER.json",
      ".synthesis/task-capsules/SYN-BRAND-001-SYNTHESIS-CMS-BRAND-FOUNDATION.json",
      ".synthesis/task-capsules/SYN-BRAND-002-BRAND-STUDIO.json",
      ".synthesis/task-capsules/SYN-BRAND-003-COMPLETE-SYNTHESIS-CMS-BRAND.json",
      ".synthesis/task-capsules/SYN-CI-002-TECHNICAL-GATE-HARDENING.json",
      ".synthesis/task-capsules/SYN-CONTENT-001-CONTENT-LIFECYCLE-FOUNDATION.json",
      ".synthesis/task-capsules/SYN-CONTENT-001A-MEDIA-RUNTIME-R1.json",
      ".synthesis/task-capsules/SYN-CONTENT-001B-MEDIA-ADMIN-UI.json",
      ".synthesis/task-capsules/SYN-CONTENT-002-ADMIN-PERSISTENCE-ADAPTER.json",
      ".synthesis/task-capsules/SYN-CONTENT-003-PUBLISHING-REVISIONS-ADMIN-CUTOVER.json",
      ".synthesis/task-capsules/SYN-DATA-001-PERSISTENCE-RUNTIME-FOUNDATION.json",
      ".synthesis/task-capsules/SYN-DATA-002-PROVISIONING.json",
      ".synthesis/task-capsules/SYN-DATA-003-GARAGE-STORAGE.json",
      ".synthesis/task-capsules/SYN-DATA-004-GARAGE-CMD-FIX.json",
      ".synthesis/task-capsules/SYN-DATA-005-GARAGE-INIT-IMAGE.json",
      ".synthesis/task-capsules/SYN-DATA-006-GARAGE-IDEMPOTENCY-FIX.json",
      ".synthesis/task-capsules/SYN-DEPLOY-001-CMS-DEV-CONTAINER.json",
      ".synthesis/task-capsules/SYN-DEPLOY-003-CADDY-PERSISTENCE.json",
      ".synthesis/task-capsules/SYN-EDITOR-001-VISUAL-PAGE-EDITOR-FOUNDATION.json",
      ".synthesis/task-capsules/SYN-GOV-LINEAGE-001-IMMUTABLE-TASK-ARCHIVE.json",
      ".synthesis/task-capsules/SYN-INTEGRATE-001-PREPRISMA-CHECKPOINT.json",
      ".synthesis/task-capsules/SYN-MEDIA-001A-PERSISTENCE-FOUNDATION.json",
      ".synthesis/task-capsules/SYN-MEDIA-001B-MEDIA-LIBRARY-RUNTIME-SECURITY-CUTOVER.json",
      ".synthesis/task-capsules/SYN-NAV-001-NAVIGATION-FOUNDATION.json",
      ".synthesis/task-capsules/SYN-PLATFORM-001-PROJECT-CONTEXT-FOUNDATION.json",
      ".synthesis/task-capsules/SYN-PLUGIN-001.json",
      ".synthesis/task-capsules/SYN-PLUGIN-001A.json",
      ".synthesis/task-capsules/SYN-PLUGIN-002-PROJECT-PLUGIN-LIFECYCLE-PERSISTENCE.json",
      ".synthesis/task-capsules/SYN-PUBLIC-001-SYNTHESIS-CMS-HOMEPAGE.json",
      ".synthesis/task-capsules/SYN-SEARCH-001-SEARCH-FOUNDATION.json",
      ".synthesis/task-capsules/SYN-SEC-001-IDENTITY-ACCESS-FOUNDATION.json",
      ".synthesis/task-capsules/SYN-SEC-002-ADMIN-NODB-FALLBACK.json",
      ".synthesis/task-capsules/SYN-SEC-003-ADMIN-LOGIN-LAYOUT-ISOLATION.json",
      ".synthesis/task-capsules/SYN-SEC-004-DEPENDENCY-HARDENING.json",
      ".synthesis/task-capsules/SYN-SEC-005A-RBAC-PRECEDENCE-CONTRACT.json",
      ".synthesis/task-capsules/SYN-SVG-005-INTEGRATION.json",
      ".synthesis/task-capsules/SYN-SVG-006-ASSET-LIFECYCLE.json",
      ".synthesis/task-capsules/SYN-SYSTEM-MAP-001.json",
      ".synthesis/task-capsules/SYN-SYSTEM-MAP-002.json",
      ".synthesis/task-capsules/SYN-WEB-001-SEO-REDIRECTS-FOUNDATION.json",
      ".synthesis/task-capsules/SYN-WEB-002-ROUTING-REDIRECT-RUNTIME.json",
      ".synthesis/task-capsules/SYN-WEB-003-SEO-REDIRECTS-ADMIN-CUTOVER.json"
    ];

    const recordsByPath = new Map(registry.capsules.map((c: any) => [c.archive_path, c]));

    for (const archivePath of requiredLegacyPaths) {
      const record = recordsByPath.get(archivePath);
      assert.ok(record, `Required legacy record missing from registry: ${archivePath}`);
      assert.strictEqual(record.legacy, true, `Record must be marked legacy: ${archivePath}`);
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
