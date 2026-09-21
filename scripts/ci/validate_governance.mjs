import fs from "fs";
import path from "path";
import crypto from "crypto";
import canonicalize from "canonicalize";
import { validateCapsuleRegistry } from "./validate_capsule_registry.mjs";

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

// 1. Secret scanning
const forbiddenPatterns = [/\.env/, /\.key$/];

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === ".git" || file === "node_modules") continue;
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath);
    } else {
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(file)) {
          reportError(`Forbidden file detected: ${filePath}`);
        }
      }
      
      // 2. Canonical JSON validation
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

if (hasError) {
  console.error("CI Validation FAILED.");
  process.exit(1);
} else {
  console.log("CI Validation PASSED.");
}
