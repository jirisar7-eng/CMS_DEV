import fs from "fs";
import path from "path";
import crypto from "crypto";
import { generateCapsuleRegistry, resolveRepoRoot } from "./generate_capsule_registry.mjs";

const SHA1_REGEX = /^[0-9a-f]{40}$/;
const SHA256_REGEX = /^[0-9a-f]{64}$/;

export function validateCapsuleRegistry(options = {}) {
  const repoRoot = options.repoRoot || resolveRepoRoot();
  const registryPath = path.join(repoRoot, ".synthesis/lineage/capsules.json");
  const archivesDir = path.join(repoRoot, ".synthesis/task-capsules");

  const errors = [];
  const warnings = [];

  if (!fs.existsSync(registryPath)) {
    errors.push("Missing capsule registry file at " + registryPath);
    return { valid: false, errors, warnings, count: 0 };
  }

  if (!fs.existsSync(archivesDir)) {
    errors.push("Missing task capsules directory at " + archivesDir);
    return { valid: false, errors, warnings, count: 0 };
  }

  // 1. Check byte determinism against generator
  try {
    const diskContent = fs.readFileSync(registryPath, "utf8");
    const { outputJson } = generateCapsuleRegistry({ repoRoot, dryRun: true });
    if (diskContent !== outputJson) {
      errors.push("Capsule registry is not byte-deterministic (disk content differs from generator output). Run generate_capsule_registry.mjs.");
    }
  } catch (e) {
    errors.push("Failed to verify determinism: " + e.message);
  }

  // 2. Parse registry
  let registry;
  try {
    const raw = fs.readFileSync(registryPath, "utf8");
    registry = JSON.parse(raw);
  } catch (e) {
    errors.push("Invalid JSON in capsule registry: " + e.message);
    return { valid: false, errors, warnings, count: 0 };
  }

  if (registry.registry_version !== "1.0.0") {
    errors.push("Unsupported capsule registry version: expected '1.0.0', got '" + registry.registry_version + "'");
  }

  if (!Array.isArray(registry.capsules)) {
    errors.push("Registry 'capsules' field must be an array");
    return { valid: false, errors, warnings, count: 0 };
  }

  if (registry.total_capsules !== registry.capsules.length) {
    errors.push("Registry total_capsules (" + registry.total_capsules + ") does not match capsules array length (" + registry.capsules.length + ")");
  }

  // Check disk archive files vs registry
  const diskFiles = fs.readdirSync(archivesDir).filter(f => f.endsWith(".json")).sort();
  const diskSet = new Set(diskFiles.map(f => ".synthesis/task-capsules/" + f));

  const seenCapsuleIds = new Set();
  const seenArchivePaths = new Set();
  const registeredCapsuleIds = new Set();
  const parentReferences = [];
  const supersedesReferences = [];

  for (let i = 0; i < registry.capsules.length; i++) {
    const cap = registry.capsules[i];
    const prefix = "Capsule record [" + i + "] (" + (cap.capsule_id || "unknown") + ")";

    // Required fields check
    if (!cap.capsule_id || typeof cap.capsule_id !== "string") {
      errors.push(prefix + ": Missing or non-string capsule_id");
    } else {
      if (seenCapsuleIds.has(cap.capsule_id)) {
        errors.push("Duplicate capsule_id detected: '" + cap.capsule_id + "'");
      }
      seenCapsuleIds.add(cap.capsule_id);
      registeredCapsuleIds.add(cap.capsule_id);
    }

    if (!cap.task_id || typeof cap.task_id !== "string") {
      errors.push(prefix + ": Missing or non-string task_id");
    }

    if (!cap.archive_path || typeof cap.archive_path !== "string") {
      errors.push(prefix + ": Missing or non-string archive_path");
    } else {
      if (seenArchivePaths.has(cap.archive_path)) {
        errors.push("Duplicate archive_path entry in registry: '" + cap.archive_path + "'");
      }
      seenArchivePaths.add(cap.archive_path);
    }

    if (!cap.sha256 || !SHA256_REGEX.test(cap.sha256)) {
      errors.push(prefix + ": Invalid or missing sha256: '" + cap.sha256 + "'");
    }

    if (typeof cap.legacy !== "boolean") {
      errors.push(prefix + ": 'legacy' field must be boolean");
    }

    if (cap.base_sha && !SHA1_REGEX.test(cap.base_sha)) {
      errors.push(prefix + ": Malformed base_sha: '" + cap.base_sha + "'");
    }

    if (cap.parent_capsule_id !== null && typeof cap.parent_capsule_id === "string") {
      parentReferences.push({ capsule_id: cap.capsule_id, parent_capsule_id: cap.parent_capsule_id });
    } else if (cap.parent_capsule_id !== null) {
      errors.push(prefix + ": parent_capsule_id must be a string or null");
    }

    if (cap.supersedes_capsule_id !== null && typeof cap.supersedes_capsule_id === "string") {
      supersedesReferences.push({ capsule_id: cap.capsule_id, supersedes_capsule_id: cap.supersedes_capsule_id });
    } else if (cap.supersedes_capsule_id !== null) {
      errors.push(prefix + ": supersedes_capsule_id must be a string or null");
    }

    // Disk archive verification
    if (cap.archive_path) {
      const fullPath = path.join(repoRoot, cap.archive_path);
      if (!fs.existsSync(fullPath)) {
        errors.push(prefix + ": Referenced archive file does not exist on disk: '" + cap.archive_path + "'");
      } else {
        const raw = fs.readFileSync(fullPath);
        const actualHash = crypto.createHash("sha256").update(raw).digest("hex");
        if (actualHash !== cap.sha256) {
          errors.push(prefix + ": SHA-256 hash mismatch! Registry has '" + cap.sha256 + "', disk archive computed '" + actualHash + "'");
        }

        let parsedArchive;
        try {
          parsedArchive = JSON.parse(raw.toString("utf8"));
        } catch (e) {
          errors.push(prefix + ": Failed to parse archive JSON: " + e.message);
        }

        if (parsedArchive) {
          if (parsedArchive.task_id && parsedArchive.task_id !== cap.task_id) {
            errors.push(prefix + ": task_id mismatch! Registry has '" + cap.task_id + "', archive has '" + parsedArchive.task_id + "'");
          }

          // If v1.1+ (has capsule_id or version >= 1.1)
          if (!cap.legacy || (parsedArchive.version && parsedArchive.version.startsWith("1.1"))) {
            const requiredV11Fields = [
              "capsule_id",
              "task_id",
              "title",
              "version",
              "environment",
              "created_at",
              "base_sha",
              "expected_branch",
              "owner",
              "parent_capsule_id",
              "supersedes_capsule_id",
              "status",
              "allowed_mutation_types",
              "allowed_paths"
            ];
            for (const f of requiredV11Fields) {
              if (parsedArchive[f] === undefined) {
                errors.push(prefix + ": Malformed v1.1+ capsule archive missing required field '" + f + "'");
              }
            }
            if (parsedArchive.capsule_id !== cap.capsule_id) {
              errors.push(prefix + ": capsule_id mismatch! Registry has '" + cap.capsule_id + "', archive has '" + parsedArchive.capsule_id + "'");
            }
          }
        }
      }
    }
  }

  // Check for unindexed disk archives
  for (const diskRel of diskSet) {
    if (!seenArchivePaths.has(diskRel)) {
      errors.push("Disk archive '" + diskRel + "' is not indexed in capsules.json");
    }
  }

  // Validate parent lineage references
  for (const ref of parentReferences) {
    if (!registeredCapsuleIds.has(ref.parent_capsule_id)) {
      errors.push("Capsule '" + ref.capsule_id + "' has invalid parent_capsule_id reference '" + ref.parent_capsule_id + "' (not found in registry)");
    }
  }

  // Validate supersedes lineage references
  for (const ref of supersedesReferences) {
    if (!registeredCapsuleIds.has(ref.supersedes_capsule_id)) {
      errors.push("Capsule '" + ref.capsule_id + "' has invalid supersedes_capsule_id reference '" + ref.supersedes_capsule_id + "' (not found in registry)");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    count: registry.capsules.length
  };
}

if (process.argv[1] && process.argv[1].endsWith("validate_capsule_registry.mjs")) {
  console.log("--- Synthesis CMS Task Capsule Registry Validator ---");
  const result = validateCapsuleRegistry();
  if (!result.valid) {
    console.error("\n[FAIL] Capsule Registry validation failed with errors:");
    for (const err of result.errors) {
      console.error("  - " + err);
    }
    process.exit(1);
  }
  console.log("\n[SUCCESS] Capsule Registry validation passed deterministically (" + result.count + " capsules verified).");
  process.exit(0);
}
