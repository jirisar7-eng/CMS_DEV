import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

export const REQUIRED_CONTRACT_IDS = [
  "SYN-RULEBOOK-ROOT",
  "ENV-CMS-DEV",
  "SYN-AI-STUDIO-GLOBAL",
  "SYN-CHATGPT-WORKING-CONTRACT",
  "SYN-AI-STUDIO-CAGE",
  "SYN-CODE-COMMAND-CONTRACT"
];

export function sha256File(filePath) {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function validateRulesetLock(repoRoot = process.cwd()) {
  const errors = [];

  function fail(msg) {
    errors.push(msg);
  }

  // 1. Check AGENTS.md exists
  const agentsPath = path.join(repoRoot, "AGENTS.md");
  if (!fs.existsSync(agentsPath)) {
    fail("AGENTS.md is missing at repository root");
  }

  // 2. Check .synthesis/ruleset.lock.json exists
  const lockPath = path.join(repoRoot, ".synthesis/ruleset.lock.json");
  if (!fs.existsSync(lockPath)) {
    fail("Ruleset lockfile missing: .synthesis/ruleset.lock.json");
    return { valid: false, errors };
  }

  let lock;
  try {
    const raw = fs.readFileSync(lockPath, "utf8");
    lock = JSON.parse(raw);
  } catch (err) {
    fail(`Malformed JSON in ruleset lockfile: ${err.message}`);
    return { valid: false, errors };
  }

  // 3. Schema & Root Attributes validation
  if (lock.schema !== "SYN-RULESET-LOCK-1") {
    fail(`Invalid schema: expected SYN-RULESET-LOCK-1, got ${lock.schema}`);
  }
  if (lock.ruleset_id !== "SYN-RULEBOOK-ROOT") {
    fail(`Invalid ruleset_id: expected SYN-RULEBOOK-ROOT, got ${lock.ruleset_id}`);
  }
  if (lock.ruleset_version !== "0.2.0") {
    fail(`Invalid ruleset_version: expected 0.2.0, got ${lock.ruleset_version}`);
  }
  if (lock.hash_algorithm !== "SHA-256") {
    fail(`Invalid hash_algorithm: expected SHA-256, got ${lock.hash_algorithm}`);
  }
  if (lock.encoding !== "UTF-8") {
    fail(`Invalid encoding: expected UTF-8, got ${lock.encoding}`);
  }
  if (lock.line_endings !== "LF") {
    fail(`Invalid line_endings: expected LF, got ${lock.line_endings}`);
  }
  if (lock.agents_path !== "AGENTS.md") {
    fail(`Invalid agents_path: expected AGENTS.md, got ${lock.agents_path}`);
  }

  // 4. Contracts list validation
  if (!Array.isArray(lock.contracts)) {
    fail("lock.contracts must be an array");
    return { valid: false, errors };
  }

  const seenIds = new Set();
  const seenSnapshotPaths = new Set();
  const seenCanonicalPaths = new Set();
  const contractIdsInLock = lock.contracts.map(c => c.contract_id);

  // Check required contract IDs exact match
  for (const reqId of REQUIRED_CONTRACT_IDS) {
    if (!contractIdsInLock.includes(reqId)) {
      fail(`Missing required contract: ${reqId}`);
    }
  }
  for (const id of contractIdsInLock) {
    if (!REQUIRED_CONTRACT_IDS.includes(id)) {
      fail(`Unexpected replacement or unknown contract in lock: ${id}`);
    }
  }

  for (const contract of lock.contracts) {
    const cid = contract.contract_id;
    if (!cid) {
      fail("Contract entry missing contract_id");
      continue;
    }

    // Duplicate ID check
    if (seenIds.has(cid)) {
      fail(`Duplicate contract_id in lockfile: ${cid}`);
    }
    seenIds.add(cid);

    if (contract.required !== true) {
      fail(`Contract ${cid} must have required=true`);
    }

    const snapPath = contract.snapshot_path;
    const canonPath = contract.canonical_metadata_path;

    if (!snapPath || typeof snapPath !== "string") {
      fail(`Contract ${cid} missing or invalid snapshot_path`);
      continue;
    }
    if (!canonPath || typeof canonPath !== "string") {
      fail(`Contract ${cid} missing or invalid canonical_metadata_path`);
      continue;
    }

    // Path traversal / absolute path checks
    if (path.isAbsolute(snapPath) || snapPath.includes("..") || !snapPath.startsWith("docs/governance/")) {
      fail(`Contract ${cid} snapshot_path must be relative inside docs/governance/: ${snapPath}`);
    }
    if (path.isAbsolute(canonPath) || canonPath.includes("..") || !canonPath.startsWith("docs/governance/")) {
      fail(`Contract ${cid} canonical_metadata_path must be relative inside docs/governance/: ${canonPath}`);
    }

    // Duplicate path check
    if (seenSnapshotPaths.has(snapPath)) {
      fail(`Duplicate snapshot_path in lockfile: ${snapPath}`);
    }
    seenSnapshotPaths.add(snapPath);

    if (seenCanonicalPaths.has(canonPath)) {
      fail(`Duplicate canonical_metadata_path in lockfile: ${canonPath}`);
    }
    seenCanonicalPaths.add(canonPath);

    // Hash checks
    const hash = contract.sha256;
    if (!hash || typeof hash !== "string" || hash.includes("PENDING") || !/^[a-f0-9]{64}$/.test(hash)) {
      fail(`Contract ${cid} has invalid or PENDING sha256 hash: ${hash}`);
    }

    // Snapshot file existence and SHA256 integrity
    const fullSnapPath = path.join(repoRoot, snapPath);
    if (!fs.existsSync(fullSnapPath)) {
      fail(`Contract ${cid} snapshot file does not exist: ${snapPath}`);
    } else {
      const actualHash = sha256File(fullSnapPath);
      if (actualHash !== hash) {
        fail(`Contract ${cid} snapshot SHA-256 mismatch: expected ${hash}, computed ${actualHash}`);
      }
    }

    // Canonical metadata existence and validation
    const fullCanonPath = path.join(repoRoot, canonPath);
    if (!fs.existsSync(fullCanonPath)) {
      fail(`Contract ${cid} canonical metadata file does not exist: ${canonPath}`);
    } else {
      try {
        const canonDoc = JSON.parse(fs.readFileSync(fullCanonPath, "utf8"));
        if (canonDoc.schema !== "SYN-GOVERNANCE-SNAPSHOT-1") {
          fail(`Contract ${cid} canonical metadata schema mismatch: ${canonDoc.schema}`);
        }
        if (canonDoc.contract_id !== cid) {
          fail(`Contract ${cid} canonical metadata contract_id mismatch: ${canonDoc.contract_id}`);
        }
        if (canonDoc.version !== contract.version) {
          fail(`Contract ${cid} canonical metadata version mismatch: ${canonDoc.version} vs ${contract.version}`);
        }
        if (canonDoc.status !== "CURRENT_REVIEW") {
          fail(`Contract ${cid} canonical metadata status must be CURRENT_REVIEW, got: ${canonDoc.status}`);
        }
        if (canonDoc.source_notion_page_id !== contract.source_notion_page_id) {
          fail(`Contract ${cid} canonical metadata source_notion_page_id mismatch`);
        }
        if (canonDoc.source_notion_url !== contract.source_notion_url) {
          fail(`Contract ${cid} canonical metadata source_notion_url mismatch`);
        }
        if (canonDoc.snapshot_path !== snapPath) {
          fail(`Contract ${cid} canonical metadata snapshot_path mismatch`);
        }
        if (canonDoc.snapshot_sha256 !== hash) {
          fail(`Contract ${cid} canonical metadata snapshot_sha256 mismatch: ${canonDoc.snapshot_sha256} vs ${hash}`);
        }
      } catch (err) {
        fail(`Contract ${cid} invalid JSON in canonical metadata file ${canonPath}: ${err.message}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    contractCount: seenIds.size
  };
}

// CLI entrypoint
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log("--- Validating Synthesis Ruleset Lock ---");
  const result = validateRulesetLock(process.cwd());
  if (!result.valid) {
    console.error("FAIL: Ruleset lock validation failed with errors:");
    for (const err of result.errors) {
      console.error(` - ${err}`);
    }
    process.exit(1);
  }
  console.log(`PASS: All ${result.contractCount} governance contracts verified with immutable SHA-256 hashes.`);
}
