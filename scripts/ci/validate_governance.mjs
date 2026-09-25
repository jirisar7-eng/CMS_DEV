import fs from "fs";
import path from "path";
import crypto from "crypto";
import canonicalize from "canonicalize";
import { validateCapsuleRegistry } from "./validate_capsule_registry.mjs";
import { validateLineage, validateGitHistoryAlignment } from "../lineage/validate.mjs";
import { scanRepository } from "./secret_scanner.mjs";

function sha256(data) {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

function normalizeNFC(obj) {
  if (typeof obj === "string") return obj.normalize("NFC");
  if (Array.isArray(obj)) return obj.map(normalizeNFC);
  if (obj && typeof obj === "object") {
    const res = {};
    for (let k in obj) res[k] = normalizeNFC(obj[k]);
    return res;
  }
  return obj;
}

let hasError = false;

function reportError(msg) {
  console.error("ERROR:", msg);
  hasError = true;
}

// 1. Secret Hygiene & Repository Secret Scanning
function validateSecretHygiene() {
  console.log("--- Validating Secret Hygiene & Scanning ---");
  
  // Check .gitignore exists and rules
  if (!fs.existsSync(".gitignore")) {
    reportError("Missing .gitignore in repository root");
  } else {
    const gitignore = fs.readFileSync(".gitignore", "utf8");
    if (!gitignore.includes(".env*")) {
      reportError(".gitignore must include .env*");
    }
    if (!gitignore.includes("!.env.example")) {
      reportError(".gitignore must include !.env.example");
    }
  }

  // Check safe .env.example
  if (!fs.existsSync(".env.example")) {
    reportError("Missing safe .env.example in repository root");
  }

  // Check forbidden .env files
  if (fs.existsSync(".env")) {
    reportError("Real .env file detected in repository root. Must not be tracked.");
  }
  const rootFiles = fs.readdirSync(".");
  for (const file of rootFiles) {
    if (file.startsWith(".env") && file !== ".env.example") {
      reportError(`Forbidden environment file detected: ${file}`);
    }
  }

  // Run repository secret scanner
  const findings = scanRepository();
  if (findings.length > 0) {
    for (const f of findings) {
      reportError(`Secret detected in ${f.file}:${f.line} [${f.patternName}]: ${f.redactedMatch}`);
    }
  } else {
    console.log("Secret Scanning Validation - PASSED");
  }
}

// 2. Walk directory for canonical JSON validation
function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === ".git" || file === "node_modules") continue;
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath);
    } else {
      if (file.endsWith(".canonical.json")) {
        validateCanonicalFile(filePath);
      }
    }
  }
}

function validateCanonicalFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  if (content.endsWith("\n")) {
    reportError(`Canonical JSON must not have trailing newline: ${filePath}`);
  }

  let doc;
  try {
    doc = JSON.parse(content);
  } catch (e) {
    reportError(`Invalid JSON in ${filePath}`);
    return;
  }

  if (doc.canonicalization !== "SYN-NOTION-CANONICAL-1") {
    reportError(`Missing or invalid canonicalization ID in ${filePath}`);
  }

  const normalizedDoc = normalizeNFC(doc);
  const canonBytes = canonicalize(normalizedDoc);
  if (canonBytes !== content) {
    reportError(`Content of ${filePath} is not perfectly canonicalized.`);
  }

  const hash = sha256(canonBytes);
  const hash2 = sha256(canonicalize(normalizedDoc));
  if (hash !== hash2) {
    reportError(`Determinism failure in ${filePath}`);
  }

  console.log(`Validated ${filePath} - Hash: ${hash}`);
}

console.log("--- Starting Governance CI Validation ---");
validateSecretHygiene();
walkDir(".");

// 3. Task Capsule Registry validation
console.log("--- Validating Task Capsule Registry ---");
const capsuleResult = validateCapsuleRegistry();
if (!capsuleResult.valid) {
  for (const err of capsuleResult.errors) {
    reportError(err);
  }
} else {
  console.log(`Validated Task Capsule Registry (${capsuleResult.count} capsules) - PASSED`);
}

// 4. Lineage Registry validation (offline)
console.log("--- Validating Lineage Registry ---");
const lineageResult = validateLineage();
if (!lineageResult.valid) {
  for (const err of lineageResult.errors) {
    reportError(err);
  }
} else {
  console.log(`Validated Lineage Registry (${lineageResult.summary.tasksCount} tasks, ${lineageResult.summary.capabilitiesCount} capabilities) - PASSED`);
}

// 5. Git History Alignment Anti-Drift Gate
console.log("--- Validating Git History Alignment (Anti-Drift Gate) ---");
const historyResult = validateGitHistoryAlignment();
if (!historyResult.valid) {
  for (const err of historyResult.errors) {
    reportError(err);
  }
} else {
  console.log(`Validated Git History Alignment (${historyResult.summary.classifiedNormalPrs} PRs, ${historyResult.summary.syncCommits} syncs, mode: ${historyResult.summary.mode}) - PASSED`);
}

if (hasError) {
  console.error("CI Validation FAILED.");
  process.exit(1);
} else {
  console.log("CI Validation PASSED.");
}
