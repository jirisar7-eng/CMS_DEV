import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import {
  scanContent,
  scanRepository,
  redactSecret,
  isSafePlaceholder,
  SECRET_PATTERNS
} from "../scripts/ci/secret_scanner.mjs";

describe("SYN-SEC-006: Secret Hygiene & Scanning Policy", () => {
  const repoRoot = process.cwd();

  describe("1. Environment Files & .gitignore Policy", () => {
    it("must have .gitignore containing .env* and !.env.example", () => {
      const gitignorePath = path.join(repoRoot, ".gitignore");
      assert.strictEqual(fs.existsSync(gitignorePath), true);

      const content = fs.readFileSync(gitignorePath, "utf8");
      assert.ok(content.includes(".env*"));
      assert.ok(content.includes("!.env.example"));
    });

    it("must have a safe .env.example file tracked without real secrets", () => {
      const envExamplePath = path.join(repoRoot, ".env.example");
      assert.strictEqual(fs.existsSync(envExamplePath), true);

      const content = fs.readFileSync(envExamplePath, "utf8");
      const findings = scanContent(content, ".env.example");
      assert.strictEqual(findings.length, 0);
    });

    it("must ignore .env, .env.local, .env.production via .gitignore", () => {
      const checkIgnored = (filename: string) => {
        try {
          const out = execSync(`git check-ignore -v "${filename}"`, { cwd: repoRoot, encoding: "utf8" }).trim();
          return out.includes(".gitignore");
        } catch {
          return false;
        }
      };

      assert.strictEqual(checkIgnored(".env"), true);
      assert.strictEqual(checkIgnored(".env.local"), true);
      assert.strictEqual(checkIgnored(".env.production"), true);
      assert.strictEqual(checkIgnored(".env.staging"), true);
    });
  });

  describe("2. Secret Detection & Pattern Matching", () => {
    it("must detect GitHub Tokens", () => {
      const sample = "const token = \"ghp_123456789012345678901234567890123456\";";
      const findings = scanContent(sample, "src/sample.ts");
      assert.ok(findings.length > 0);
      assert.strictEqual(findings[0].patternId, "GITHUB_TOKEN");
      assert.ok(!findings[0].redactedMatch.includes("123456789012345678901234567890123456"));
    });

    it("must detect Private Keys", () => {
      const sample = "-----BEGIN " + "PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC..."; // secret-scanner-ignore
      const findings = scanContent(sample, "src/key.pem");
      assert.ok(findings.length > 0);
      assert.strictEqual(findings[0].patternId, "PRIVATE_KEY");
      assert.ok(findings[0].redactedMatch.includes("[REDACTED]"));
    });

    it("must detect Stripe Secret Keys", () => {
      const sample = "const stripe = \"sk" + "_live_51abcdefghijklmnopqrstuvwxyz123456\";";
      const findings = scanContent(sample, "src/stripe.ts");
      assert.ok(findings.length > 0);
      assert.strictEqual(findings[0].patternId, "STRIPE_KEY");
    });

    it("must detect AWS Access Key IDs", () => {
      const sample = "AWS_ACCESS_KEY_ID=" + "AKIAIOSFODNN7EXAMPLE"; // secret-scanner-ignore
      const findings = scanContent(sample, "src/aws.ts");
      assert.ok(findings.length > 0);
      assert.strictEqual(findings[0].patternId, "AWS_ACCESS_KEY");
    });

    it("must allow safe placeholders and example values", () => {
      const sample = "DATABASE_URL=\"postgresql://user:password@localhost:5432/cms_dev?example=true\"";
      const findings = scanContent(sample, ".env.example");
      assert.strictEqual(findings.length, 0);
    });

    it("must support inline secret-scanner-ignore annotations", () => {
      const sample = "const key = \"ghp_123456789012345678901234567890\"; // secret-scanner-ignore";
      const findings = scanContent(sample, "src/exempt.ts");
      assert.strictEqual(findings.length, 0);
    });
  });

  describe("3. Secret Redaction & Log Safety", () => {
    it("must mask secret values in redacted matches and never return raw secrets", () => {
      const rawSecret = "ghp" + "_123456789012345678901234567890";
      const redacted = redactSecret(rawSecret);

      assert.notStrictEqual(redacted, rawSecret);
      assert.ok(redacted.includes("***[REDACTED]***"));
      assert.ok(redacted.length < rawSecret.length + 20);
    });

    it("must scan the clean repository without reporting any unexempted secrets", () => {
      const findings = scanRepository(repoRoot);
      assert.strictEqual(findings.length, 0);
    });
  });
});
