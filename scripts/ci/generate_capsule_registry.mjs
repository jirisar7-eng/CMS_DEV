import fs from "fs";
import path from "path";
import crypto from "crypto";

export function resolveRepoRoot() {
  let cur = process.cwd();
  while (cur !== "/" && cur !== ".") {
    if (fs.existsSync(path.join(cur, ".synthesis"))) {
      return cur;
    }
    cur = path.dirname(cur);
  }
  return process.cwd();
}

export function generateCapsuleRegistry(options = {}) {
  const repoRoot = options.repoRoot || resolveRepoRoot();
  const archivesDir = path.join(repoRoot, ".synthesis/task-capsules");
  const outputPath = path.join(repoRoot, ".synthesis/lineage/capsules.json");

  if (!fs.existsSync(archivesDir)) {
    throw new Error(`Archives directory not found: ${archivesDir}`);
  }

  const files = fs.readdirSync(archivesDir).filter(f => f.endsWith(".json")).sort();
  const records = [];

  for (const file of files) {
    const filePath = path.join(archivesDir, file);
    const rawBytes = fs.readFileSync(filePath);
    const sha256 = crypto.createHash("sha256").update(rawBytes).digest("hex");
    const data = JSON.parse(rawBytes.toString("utf8"));

    const isLegacy = !data.capsule_id;
    const capsule_id = data.capsule_id || `CAP-LEGACY-${path.basename(file, ".json")}`;

    records.push({
      capsule_id,
      task_id: data.task_id || path.basename(file, ".json"),
      title: data.title || null,
      version: data.version || "1.0.0",
      status: data.status || "COMPLETED",
      archive_path: `.synthesis/task-capsules/${file}`,
      base_sha: data.base_sha || null,
      expected_branch: data.expected_branch || null,
      sha256,
      parent_capsule_id: data.parent_capsule_id || null,
      supersedes_capsule_id: data.supersedes_capsule_id || null,
      legacy: isLegacy
    });
  }

  const registry = {
    registry_version: "1.0.0",
    total_capsules: records.length,
    capsules: records
  };

  const outputJson = JSON.stringify(registry, null, 2) + "\n";
  if (!options.dryRun) {
    const lineageDir = path.dirname(outputPath);
    if (!fs.existsSync(lineageDir)) {
      fs.mkdirSync(lineageDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, outputJson, "utf8");
  }

  return { registry, outputJson, count: records.length };
}

if (process.argv[1] && process.argv[1].endsWith("generate_capsule_registry.mjs")) {
  try {
    const res = generateCapsuleRegistry();
    console.log(`Successfully generated capsule registry with ${res.count} records.`);
  } catch (e) {
    console.error("Failed to generate capsule registry:", e.message);
    process.exit(1);
  }
}
