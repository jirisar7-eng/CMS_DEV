import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { validateRulesetLock, REQUIRED_CONTRACT_IDS } from "./validate_ruleset_lock.mjs";

function setupFixture(tDir) {
  fs.mkdirSync(path.join(tDir, ".synthesis"), { recursive: true });
  fs.mkdirSync(path.join(tDir, "docs/governance"), { recursive: true });

  fs.writeFileSync(path.join(tDir, "AGENTS.md"), "# Agents Rules\n", "utf8");

  const contracts = [];
  for (const id of REQUIRED_CONTRACT_IDS) {
    const snapRel = `docs/governance/${id}.md`;
    const canonRel = `docs/governance/${id}.canonical.json`;
    const fullSnap = path.join(tDir, snapRel);
    const fullCanon = path.join(tDir, canonRel);

    const content = `# Contract ${id}\nNormative rules...\n`;
    fs.writeFileSync(fullSnap, content, "utf8");
    const hash = crypto.createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");

    const canonDoc = {
      canonicalization: "SYN-NOTION-CANONICAL-1",
      schema: "SYN-GOVERNANCE-SNAPSHOT-1",
      contract_id: id,
      version: "1.0.0",
      status: "CURRENT_REVIEW",
      source_notion_page_id: "test-page-id",
      source_notion_url: "https://notion.example/page",
      frozen_at: "2026-09-30T09:58:22+02:00",
      frozen_base_main_sha: "da6a7b0d8cf667f10db9025982af4d708b61e7a3",
      snapshot_path: snapRel,
      snapshot_sha256: hash,
      supersedes: null
    };
    fs.writeFileSync(fullCanon, JSON.stringify(canonDoc), "utf8");

    contracts.push({
      contract_id: id,
      version: "1.0.0",
      required: true,
      snapshot_path: snapRel,
      canonical_metadata_path: canonRel,
      sha256: hash,
      source_notion_page_id: "test-page-id",
      source_notion_url: "https://notion.example/page"
    });
  }

  const lock = {
    schema: "SYN-RULESET-LOCK-1",
    ruleset_id: "SYN-RULEBOOK-ROOT",
    ruleset_version: "0.2.0",
    frozen_at: "2026-09-30T09:58:22+02:00",
    frozen_base_main_sha: "da6a7b0d8cf667f10db9025982af4d708b61e7a3",
    hash_algorithm: "SHA-256",
    encoding: "UTF-8",
    line_endings: "LF",
    agents_path: "AGENTS.md",
    contracts
  };
  fs.writeFileSync(path.join(tDir, ".synthesis/ruleset.lock.json"), JSON.stringify(lock, null, 2), "utf8");
}

describe("Ruleset Lock Validation Test Suite", () => {
  it("PASS: valid fixture passes deterministically", () => {
    const tDir = fs.mkdtempSync(path.join(os.tmpdir(), "syn-lock-pass-"));
    try {
      setupFixture(tDir);
      const res = validateRulesetLock(tDir);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.errors.length, 0);
      assert.strictEqual(res.contractCount, 6);
    } finally {
      fs.rmSync(tDir, { recursive: true, force: true });
    }
  });

  it("FAIL: missing AGENTS.md", () => {
    const tDir = fs.mkdtempSync(path.join(os.tmpdir(), "syn-lock-fail-"));
    try {
      setupFixture(tDir);
      fs.unlinkSync(path.join(tDir, "AGENTS.md"));
      const res = validateRulesetLock(tDir);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes("AGENTS.md is missing")));
    } finally {
      fs.rmSync(tDir, { recursive: true, force: true });
    }
  });

  it("FAIL: missing lockfile", () => {
    const tDir = fs.mkdtempSync(path.join(os.tmpdir(), "syn-lock-fail-"));
    try {
      setupFixture(tDir);
      fs.unlinkSync(path.join(tDir, ".synthesis/ruleset.lock.json"));
      const res = validateRulesetLock(tDir);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes("Ruleset lockfile missing")));
    } finally {
      fs.rmSync(tDir, { recursive: true, force: true });
    }
  });

  it("FAIL: malformed lockfile JSON", () => {
    const tDir = fs.mkdtempSync(path.join(os.tmpdir(), "syn-lock-fail-"));
    try {
      setupFixture(tDir);
      fs.writeFileSync(path.join(tDir, ".synthesis/ruleset.lock.json"), "NOT_JSON{{{", "utf8");
      const res = validateRulesetLock(tDir);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes("Malformed JSON")));
    } finally {
      fs.rmSync(tDir, { recursive: true, force: true });
    }
  });

  it("FAIL: PENDING hash", () => {
    const tDir = fs.mkdtempSync(path.join(os.tmpdir(), "syn-lock-fail-"));
    try {
      setupFixture(tDir);
      const lockPath = path.join(tDir, ".synthesis/ruleset.lock.json");
      const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      lock.contracts[0].sha256 = "PENDING_HASH_VALUE";
      fs.writeFileSync(lockPath, JSON.stringify(lock), "utf8");
      const res = validateRulesetLock(tDir);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes("PENDING")));
    } finally {
      fs.rmSync(tDir, { recursive: true, force: true });
    }
  });

  it("FAIL: missing current required contract", () => {
    const tDir = fs.mkdtempSync(path.join(os.tmpdir(), "syn-lock-fail-"));
    try {
      setupFixture(tDir);
      const lockPath = path.join(tDir, ".synthesis/ruleset.lock.json");
      const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      lock.contracts = lock.contracts.filter(c => c.contract_id !== "SYN-RULEBOOK-ROOT");
      fs.writeFileSync(lockPath, JSON.stringify(lock), "utf8");
      const res = validateRulesetLock(tDir);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes("Missing required contract: SYN-RULEBOOK-ROOT")));
    } finally {
      fs.rmSync(tDir, { recursive: true, force: true });
    }
  });

  it("FAIL: unknown replacement contract", () => {
    const tDir = fs.mkdtempSync(path.join(os.tmpdir(), "syn-lock-fail-"));
    try {
      setupFixture(tDir);
      const lockPath = path.join(tDir, ".synthesis/ruleset.lock.json");
      const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      lock.contracts.push({
        contract_id: "SYN-UNKNOWN-CONTRACT",
        version: "1.0.0",
        required: true,
        snapshot_path: "docs/governance/SYN-UNKNOWN-CONTRACT.md",
        canonical_metadata_path: "docs/governance/SYN-UNKNOWN-CONTRACT.canonical.json",
        sha256: "0000000000000000000000000000000000000000000000000000000000000000",
        source_notion_page_id: "test",
        source_notion_url: "https://test"
      });
      fs.writeFileSync(lockPath, JSON.stringify(lock), "utf8");
      const res = validateRulesetLock(tDir);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes("Unexpected replacement or unknown contract")));
    } finally {
      fs.rmSync(tDir, { recursive: true, force: true });
    }
  });

  it("FAIL: missing snapshot file", () => {
    const tDir = fs.mkdtempSync(path.join(os.tmpdir(), "syn-lock-fail-"));
    try {
      setupFixture(tDir);
      fs.unlinkSync(path.join(tDir, "docs/governance/SYN-RULEBOOK-ROOT.md"));
      const res = validateRulesetLock(tDir);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes("snapshot file does not exist")));
    } finally {
      fs.rmSync(tDir, { recursive: true, force: true });
    }
  });

  it("FAIL: tampered snapshot (hash mismatch)", () => {
    const tDir = fs.mkdtempSync(path.join(os.tmpdir(), "syn-lock-fail-"));
    try {
      setupFixture(tDir);
      fs.appendFileSync(path.join(tDir, "docs/governance/SYN-RULEBOOK-ROOT.md"), "\nTAMPERED_DATA");
      const res = validateRulesetLock(tDir);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes("snapshot SHA-256 mismatch")));
    } finally {
      fs.rmSync(tDir, { recursive: true, force: true });
    }
  });

  it("FAIL: duplicate contract_id", () => {
    const tDir = fs.mkdtempSync(path.join(os.tmpdir(), "syn-lock-fail-"));
    try {
      setupFixture(tDir);
      const lockPath = path.join(tDir, ".synthesis/ruleset.lock.json");
      const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      lock.contracts.push({ ...lock.contracts[0] });
      fs.writeFileSync(lockPath, JSON.stringify(lock), "utf8");
      const res = validateRulesetLock(tDir);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes("Duplicate contract_id")));
    } finally {
      fs.rmSync(tDir, { recursive: true, force: true });
    }
  });

  it("FAIL: duplicate snapshot path", () => {
    const tDir = fs.mkdtempSync(path.join(os.tmpdir(), "syn-lock-fail-"));
    try {
      setupFixture(tDir);
      const lockPath = path.join(tDir, ".synthesis/ruleset.lock.json");
      const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      lock.contracts[1].snapshot_path = lock.contracts[0].snapshot_path;
      fs.writeFileSync(lockPath, JSON.stringify(lock), "utf8");
      const res = validateRulesetLock(tDir);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes("Duplicate snapshot_path")));
    } finally {
      fs.rmSync(tDir, { recursive: true, force: true });
    }
  });

  it("FAIL: path traversal", () => {
    const tDir = fs.mkdtempSync(path.join(os.tmpdir(), "syn-lock-fail-"));
    try {
      setupFixture(tDir);
      const lockPath = path.join(tDir, ".synthesis/ruleset.lock.json");
      const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      lock.contracts[0].snapshot_path = "docs/governance/../escape.md";
      fs.writeFileSync(lockPath, JSON.stringify(lock), "utf8");
      const res = validateRulesetLock(tDir);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes("must be relative inside docs/governance/")));
    } finally {
      fs.rmSync(tDir, { recursive: true, force: true });
    }
  });

  it("FAIL: outside governance path", () => {
    const tDir = fs.mkdtempSync(path.join(os.tmpdir(), "syn-lock-fail-"));
    try {
      setupFixture(tDir);
      const lockPath = path.join(tDir, ".synthesis/ruleset.lock.json");
      const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      lock.contracts[0].snapshot_path = "app/outside.md";
      fs.writeFileSync(lockPath, JSON.stringify(lock), "utf8");
      const res = validateRulesetLock(tDir);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes("must be relative inside docs/governance/")));
    } finally {
      fs.rmSync(tDir, { recursive: true, force: true });
    }
  });

  it("FAIL: canonical metadata mismatch", () => {
    const tDir = fs.mkdtempSync(path.join(os.tmpdir(), "syn-lock-fail-"));
    try {
      setupFixture(tDir);
      const canonPath = path.join(tDir, "docs/governance/SYN-RULEBOOK-ROOT.canonical.json");
      const doc = JSON.parse(fs.readFileSync(canonPath, "utf8"));
      doc.version = "9.9.9-mismatch";
      fs.writeFileSync(canonPath, JSON.stringify(doc), "utf8");
      const res = validateRulesetLock(tDir);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes("canonical metadata version mismatch")));
    } finally {
      fs.rmSync(tDir, { recursive: true, force: true });
    }
  });
});
