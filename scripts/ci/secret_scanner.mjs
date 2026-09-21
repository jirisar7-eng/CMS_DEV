import fs from "fs";
import path from "path";
import { execSync } from "child_process";

export const SECRET_PATTERNS = [
  {
    id: "PRIVATE_KEY",
    name: "Private Key",
    regex: /-----BEGIN\s+(?:RSA|OPENSSH|EC|PGP|DSA|PRIVATE)\s+KEY-----/i,
  },
  {
    id: "GITHUB_TOKEN",
    name: "GitHub Token",
    regex: /(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}/,
  },
  {
    id: "STRIPE_KEY",
    name: "Stripe Secret Key",
    regex: /(?:sk|rk)_live_[0-9a-zA-Z]{24,}/,
  },
  {
    id: "AWS_ACCESS_KEY",
    name: "AWS Access Key ID",
    regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/,
  },
  {
    id: "SLACK_TOKEN",
    name: "Slack Token",
    regex: /xox[baprs]-[0-9a-zA-Z]{10,}/,
  },
  {
    id: "JWT_TOKEN",
    name: "JSON Web Token",
    regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
  {
    id: "GENERIC_API_KEY",
    name: "Generic Secret Assignment",
    regex: /(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key|db[_-]?password)\s*[:=]\s*["\x27](?!(?:example|mock|placeholder|test|stub|your[_-]|YOUR[_-]|\$\{|\$[A-Z_]+|CHANGE_ME|<|[0-9a-fA-F]{32,64}$)).*?["\x27]/i,
  }
];

export function redactSecret(secretStr) {
  if (!secretStr) return "[REDACTED]";
  const len = secretStr.length;
  if (len <= 8) return "[REDACTED_SECRET]";
  return `${secretStr.slice(0, 3)}***[REDACTED]***${secretStr.slice(-2)}`;
}

export function isSafePlaceholder(match, line, filePath, patternId) {
  const lowerLine = line.toLowerCase();
  const lowerPath = filePath.toLowerCase();
  const lowerMatch = match.toLowerCase();

  // Explicit ignore flags or .env.example file
  if (
    lowerLine.includes("secret-scanner-disable") ||
    lowerLine.includes("secret-scanner-ignore") ||
    lowerPath.endsWith(".env.example")
  ) {
    return true;
  }

  // Word-boundary check for safe placeholders in lines (e.g., // example or "your-secret-here")
  if (
    /\b(placeholder|localhost|dummy|your-secret|your-token|your-key|your-password|change_me)\b/i.test(line)
  ) {
    return true;
  }

  // In test files or mock fixtures: allow generic API key/token mock assignments
  if (lowerPath.startsWith("tests/") || lowerPath.includes(".test.") || lowerPath.includes(".spec.")) {
    if (patternId === "GENERIC_API_KEY") {
      return true;
    }
    if (
      lowerMatch.includes("123456") ||
      lowerMatch.includes("test") ||
      lowerMatch.includes("mock") ||
      lowerMatch.includes("sample") ||
      lowerMatch.includes("fake")
    ) {
      return true;
    }
  }

  return false;
}

export function scanContent(content, filePath = "unknown") {
  const lines = content.split("\n");
  const findings = [];

  lines.forEach((line, index) => {
    if (line.includes("secret-scanner-disable-line") || line.includes("secret-scanner-ignore")) {
      return;
    }

    for (const pattern of SECRET_PATTERNS) {
      const match = pattern.regex.exec(line);
      if (match) {
        const fullMatch = match[0];
        if (isSafePlaceholder(fullMatch, line, filePath, pattern.id)) {
          continue;
        }

        findings.push({
          file: filePath,
          line: index + 1,
          patternId: pattern.id,
          patternName: pattern.name,
          redactedMatch: redactSecret(fullMatch)
        });
      }
    }
  });

  return findings;
}

export function scanRepository(repoRoot = process.cwd()) {
  let files = [];
  try {
    const tracked = execSync("git ls-files", { cwd: repoRoot, encoding: "utf8" })
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);
    files = tracked;
  } catch {
    files = [];
  }

  try {
    const untracked = execSync("git status --porcelain", { cwd: repoRoot, encoding: "utf8" })
      .split("\n")
      .map(s => s.trim())
      .filter(s => s.startsWith("?? "))
      .map(s => s.slice(3).trim())
      .filter(Boolean);
    for (const u of untracked) {
      if (!files.includes(u)) {
        files.push(u);
      }
    }
  } catch {}

  const allFindings = [];

  for (const relPath of files) {
    if (
      relPath.startsWith("node_modules/") ||
      relPath.startsWith(".git/") ||
      relPath.endsWith(".png") ||
      relPath.endsWith(".jpg") ||
      relPath.endsWith(".ico") ||
      relPath.endsWith(".lock") ||
      relPath.endsWith("package-lock.json")
    ) {
      continue;
    }

    const fullPath = path.join(repoRoot, relPath);
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
      continue;
    }

    const content = fs.readFileSync(fullPath, "utf8");
    const findings = scanContent(content, relPath);
    if (findings.length > 0) {
      allFindings.push(...findings);
    }
  }

  return allFindings;
}

if (process.argv[1] && process.argv[1].endsWith("secret_scanner.mjs")) {
  console.log("=== Running Secret Scanner ===");
  const findings = scanRepository();
  if (findings.length > 0) {
    console.error(`FOUND ${findings.length} POTENTIAL SECRET(S):`);
    for (const f of findings) {
      console.error(`[BLOCKED] File: ${f.file} Line: ${f.line} | Pattern: ${f.patternName} | Match: ${f.redactedMatch}`);
    }
    process.exit(1);
  } else {
    console.log("No secrets detected. PASS.");
  }
}
