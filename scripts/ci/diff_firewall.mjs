import fs from "fs";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const CAPSULE_PATH = ".synthesis/task-capsule.json";

// Locked by default policies
const DEFAULT_LOCKED_PATHS = [
  /^\.env.*/,
  /^docs\/environment\/ENV-LEGACY-.*/,
  /^docs\/governance\/.*/, // Governance files unless explicitly allowed
  /^deployment\/.*/,
  /^infra\/.*/
];

function runCmd(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch (e) {
    console.error(`Command failed: ${cmd}`);
    process.exit(1);
  }
}

export function matchesPattern(file, patterns) {
  return patterns.some(pattern => {
    if (pattern instanceof RegExp) return pattern.test(file);
    if (pattern.endsWith("/**")) {
      const prefix = pattern.slice(0, -2);
      return file.startsWith(prefix);
    }
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      return file.startsWith(prefix);
    }
    return file === pattern;
  });
}

export function main() {
  console.log("=== DIFF FIREWALL ===");
  let current_branch = process.env.GITHUB_HEAD_REF;
  if (!current_branch) {
      current_branch = process.env.GITHUB_REF_NAME;
  }
  if (!current_branch) {
      current_branch = runCmd("git rev-parse --abbrev-ref HEAD");
  }
  if (current_branch === "HEAD") {
      current_branch = "detached";
  }

  if (current_branch === "main") {
      console.log("On main branch. Task-scope Diff Firewall is not applicable. Returning success.");
      return;
  }

  if (!fs.existsSync(CAPSULE_PATH)) {
    console.error(`FAIL: Missing task capsule at ${CAPSULE_PATH}`);
    process.exit(1);
  }

  let capsule;
  try {
    const data = fs.readFileSync(CAPSULE_PATH, "utf8");
    capsule = JSON.parse(data);
  } catch (e) {
    console.error(`FAIL: Malformed task capsule. ${e.message}`);
    process.exit(1);
  }

  const {
    base_sha,
    expected_branch,
    allowed_paths = [],
    forbidden_paths = []
  } = capsule;

  if (!base_sha || !expected_branch) {
    console.error("FAIL: Invalid capsule. Missing base_sha or expected_branch.");
    process.exit(1);
  }

  if (current_branch !== expected_branch && current_branch !== "detached") {
    console.error(`FAIL: Branch mismatch. Expected ${expected_branch}, got ${current_branch}`);
    process.exit(1);
  }

  // Check base_sha
  let diffFiles = [];
  try {
    // Fetch base_sha if not present locally (helpful in CI)
    // Actually we just diff with base_sha
    const out = runCmd(`git diff --name-only ${base_sha} HEAD`);
    diffFiles = out.split("\n").filter(Boolean);
  } catch(e) {
    console.error(`FAIL: Could not diff against base_sha ${base_sha}. Does it exist?`);
    process.exit(1);
  }

  console.log(`Checking ${diffFiles.length} changed files against capsule...`);
  
  let failed = false;

  for (const file of diffFiles) {
    let allowed = false;

    // Check explicitly forbidden
    if (matchesPattern(file, forbidden_paths)) {
      console.error(`[BLOCKED] File matches explicitly forbidden path: ${file}`);
      failed = true;
      continue;
    }

    // Check locked by default
    const isLockedByDefault = matchesPattern(file, DEFAULT_LOCKED_PATHS);
    
    // Check allowed paths
    const isAllowed = matchesPattern(file, allowed_paths);

    if (isLockedByDefault && !isAllowed) {
      console.error(`[BLOCKED] File is locked by default (needs explicit allow in capsule): ${file}`);
      failed = true;
      continue;
    }

    if (!isAllowed) {
      console.error(`[BLOCKED] File is not in allowed_paths: ${file}`);
      failed = true;
      continue;
    }

    console.log(`[PASS] ${file}`);
  }

  if (failed) {
    console.error("=== DIFF FIREWALL REJECTED ===");
    process.exit(1);
  }

  console.log("=== DIFF FIREWALL PASSED ===");
}

const isDirectRun = process.argv[1] && (
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
  (fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)))
);

if (isDirectRun) {
  main();
}
