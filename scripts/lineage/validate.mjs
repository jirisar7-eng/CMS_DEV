import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SHA1_REGEX = /^[0-9a-f]{40}$/;
const SHA256_REGEX = /^[0-9a-f]{64}$/;
const VALID_VISIBILITY = new Set(['OWNER_INTERNAL', 'SAFE_PUBLIC_METADATA']);
const REQUIRED_CAPABILITIES = [
  'governance',
  'identity_rbac',
  'project_context',
  'content_lifecycle',
  'admin_pages',
  'visual_editor',
  'navigation',
  'seo',
  'redirects',
  'public_routing',
  'search',
  'media',
  'brand',
  'plugin_registry'
];

export function resolveRepoRoot(customRoot) {
  if (customRoot && fs.existsSync(customRoot)) {
    return customRoot;
  }
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const candidate = path.resolve(__dirname, '../..');
  if (fs.existsSync(path.join(candidate, '.synthesis'))) {
    return candidate;
  }
  if (fs.existsSync(path.join(process.cwd(), '.synthesis'))) {
    return process.cwd();
  }
  if (fs.existsSync(path.join(process.cwd(), 'cms_web002', '.synthesis'))) {
    return path.join(process.cwd(), 'cms_web002');
  }
  return candidate;
}

export function patternToRegex(pattern) {
  const DOUBLE_STAR = '___DSTAR___';
  const SINGLE_STAR = '___SSTAR___';
  const p1 = pattern.replace(/\*\*/g, DOUBLE_STAR).replace(/\*/g, SINGLE_STAR);
  const escaped = p1.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const regexStr = '^' + escaped
    .replace(new RegExp('/' + DOUBLE_STAR, 'g'), '(?:/.*)?')
    .replace(new RegExp(DOUBLE_STAR, 'g'), '.*')
    .replace(new RegExp(SINGLE_STAR, 'g'), '[^/]*')
    + '$';
  return new RegExp(regexStr);
}

export function matchesOwnerPath(filePath, pattern) {
  const normFile = filePath.replace(/\\/g, '/');
  const normPattern = pattern.replace(/\\/g, '/');
  const re = patternToRegex(normPattern);
  return re.test(normFile);
}

function listFilesRecursive(dir, baseDir = dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (['node_modules', '.git', '.next', 'dist', 'build'].includes(entry.name)) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(full, baseDir));
    } else if (entry.isFile()) {
      results.push(path.relative(baseDir, full).replace(/\\/g, '/'));
    }
  }
  return results;
}

export function getTrackedFiles(repoRoot) {
  try {
    const stdout = execSync('git ls-files', { cwd: repoRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const files = stdout.split('\n').map(l => l.trim().replace(/\\/g, '/')).filter(Boolean);
    if (files.length > 0) {
      return files;
    }
  } catch {
    // fallback to directory crawl
  }
  return listFilesRecursive(repoRoot);
}

export function validateLineage(options = {}) {
  const repoRoot = resolveRepoRoot(options.repoRoot);
  const errors = [];
  const warnings = [];

  // 1. Schema check
  const schemaPath = path.join(repoRoot, '.synthesis/lineage/schema.json');
  if (!fs.existsSync(schemaPath)) {
    errors.push('Missing schema file at ' + schemaPath);
  } else {
    try {
      JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    } catch (e) {
      errors.push('Invalid JSON in schema.json: ' + e.message);
    }
  }

  // 2. Tasks Registry
  let tasksData = options.tasksData;
  if (!tasksData) {
    const tasksPath = path.join(repoRoot, '.synthesis/lineage/tasks.json');
    if (!fs.existsSync(tasksPath)) {
      errors.push('Missing tasks registry at ' + tasksPath);
    } else {
      try {
        tasksData = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
      } catch (e) {
        errors.push('Invalid JSON in tasks.json: ' + e.message);
      }
    }
  }

  // Load Capsule Registry for task_id -> archive mapping
  let capsulesData = options.capsulesData;
  if (!capsulesData) {
    const capsulesPath = path.join(repoRoot, '.synthesis/lineage/capsules.json');
    if (!fs.existsSync(capsulesPath)) {
      errors.push('Missing capsule registry at ' + capsulesPath);
    } else {
      try {
        capsulesData = JSON.parse(fs.readFileSync(capsulesPath, 'utf8'));
      } catch (e) {
        errors.push('Invalid JSON in capsules.json: ' + e.message);
      }
    }
  }

  const capsuleRegistryMap = new Map();
  if (capsulesData) {
    const capsList = Array.isArray(capsulesData.capsules) ? capsulesData.capsules : [];
    for (const capRec of capsList) {
      if (capRec.task_id) {
        if (capsuleRegistryMap.has(capRec.task_id)) {
          errors.push("Duplicate task_id in capsule registry: '" + capRec.task_id + "'");
        } else {
          capsuleRegistryMap.set(capRec.task_id, capRec);
        }
      }
    }
  }

  const registeredTaskIds = new Set();
  const seenPrNumbers = new Set();
  const validMergeShas = new Set();
  let lastPrNumber = 0;

  if (tasksData) {
    if (tasksData.registry_version !== '1.0.0') {
      errors.push("Unsupported registry version: expected '1.0.0', got '" + tasksData.registry_version + "'");
    }
    const tasksList = Array.isArray(tasksData.tasks) ? tasksData.tasks : [];
    if (!Array.isArray(tasksData.tasks)) {
      errors.push("tasks.json 'tasks' field must be an array");
    }

    if (tasksData.total_tasks !== tasksList.length) {
      errors.push("tasks.json 'total_tasks' (" + tasksData.total_tasks + ") does not match tasks array length (" + tasksList.length + ")");
    }

    for (const task of tasksList) {
      // PR number validation
      if (typeof task.pr_number !== 'number' || !Number.isInteger(task.pr_number) || task.pr_number < 1) {
        errors.push("Invalid pr_number '" + task.pr_number + "'");
      } else if (seenPrNumbers.has(task.pr_number)) {
        errors.push('Duplicate PR number detected: #' + task.pr_number);
      } else if (task.pr_number <= lastPrNumber) {
        errors.push('PR #' + task.pr_number + ' is not in strictly ascending order (previous: #' + lastPrNumber + ')');
      } else {
        seenPrNumbers.add(task.pr_number);
        lastPrNumber = task.pr_number;
      }

      // task_id uniqueness (where non-null)
      if (task.task_id !== null && task.task_id !== undefined) {
        if (typeof task.task_id !== 'string' || task.task_id.trim() === '') {
          errors.push('PR #' + task.pr_number + ' has invalid task_id');
        } else if (registeredTaskIds.has(task.task_id)) {
          errors.push("Duplicate task_id detected: '" + task.task_id + "' (PR #" + task.pr_number + ")");
        } else {
          registeredTaskIds.add(task.task_id);
        }
      }

      // SHA verification
      for (const shaField of ['base_sha', 'source_head_sha', 'merge_sha']) {
        const val = task[shaField];
        if (!val || typeof val !== 'string' || !SHA1_REGEX.test(val)) {
          errors.push('PR #' + task.pr_number + " has malformed SHA in '" + shaField + "': '" + val + "'");
        }
      }
      if (task.merge_sha && SHA1_REGEX.test(task.merge_sha)) {
        validMergeShas.add(task.merge_sha);
      }

      // Capsule presence and SHA-256 integrity
      if (task.capsule_present === true) {
        if (!task.task_id) {
          errors.push('PR #' + task.pr_number + ' declares capsule_present=true but task_id is null');
        } else {
          if (!task.capsule_sha256 || !SHA256_REGEX.test(task.capsule_sha256)) {
            errors.push('PR #' + task.pr_number + ' (' + task.task_id + ") has malformed capsule_sha256: '" + task.capsule_sha256 + "'");
          }
          const capRecord = capsuleRegistryMap.get(task.task_id);
          if (!capRecord) {
            errors.push('PR #' + task.pr_number + " ('" + task.task_id + "') has no matching record in capsule registry");
          } else {
            if (task.capsule_sha256 !== capRecord.sha256) {
              errors.push('PR #' + task.pr_number + " ('" + task.task_id + "') capsule_sha256 mismatch with capsule registry: task has '" + task.capsule_sha256 + "', registry has '" + capRecord.sha256 + "'");
            }
            const archivePath = path.join(repoRoot, capRecord.archive_path);
            if (!fs.existsSync(archivePath)) {
              errors.push('PR #' + task.pr_number + ' declares capsule_present=true but archive file is missing: ' + capRecord.archive_path);
            } else {
              try {
                const rawContent = fs.readFileSync(archivePath, 'utf8');
                const actualSha256 = crypto.createHash('sha256').update(rawContent, 'utf8').digest('hex');
                if (actualSha256 !== task.capsule_sha256) {
                  errors.push('PR #' + task.pr_number + ' (' + task.task_id + ') capsule SHA-256 mismatch: expected ' + task.capsule_sha256 + ', calculated ' + actualSha256);
                }
                let parsedArchive;
                try {
                  parsedArchive = JSON.parse(rawContent);
                } catch (e) {
                  errors.push('PR #' + task.pr_number + " ('" + task.task_id + "') failed to parse archive JSON: " + e.message);
                }
                if (parsedArchive && parsedArchive.task_id && parsedArchive.task_id !== task.task_id) {
                  errors.push('PR #' + task.pr_number + " parsed archive task_id mismatch: task has '" + task.task_id + "', archive has '" + parsedArchive.task_id + "'");
                }
              } catch (err) {
                errors.push('PR #' + task.pr_number + ' (' + task.task_id + ') failed to read archive capsule: ' + err.message);
              }
            }
          }
        }
      } else if (task.capsule_present === false) {
        if (task.pr_number === 1) {
          // PR #1 is explicit bootstrap without capsule
          if (task.task_id !== null) {
            errors.push('PR #1 is bootstrap record and must have task_id: null');
          }
          if (task.capsule_sha256 !== null) {
            errors.push('PR #1 must have capsule_sha256: null');
          }
        } else {
          errors.push('PR #' + task.pr_number + ' declares capsule_present=false (only PR #1 is permitted without capsule)');
        }
      } else {
        errors.push('PR #' + task.pr_number + ' must specify boolean capsule_present');
      }

      // Derived status check
      if (task.derived_status !== 'MERGED') {
        errors.push('PR #' + task.pr_number + " must have derived_status: 'MERGED'");
      }

      // Allowed paths check
      if (!Array.isArray(task.allowed_paths)) {
        errors.push('PR #' + task.pr_number + ' allowed_paths must be an array');
      }

      // Actual changed files check
      if (!Array.isArray(task.actual_changed_files)) {
        errors.push('PR #' + task.pr_number + ' actual_changed_files must be an array');
      }

      // Touches capabilities
      if (!Array.isArray(task.touches_capabilities)) {
        errors.push('PR #' + task.pr_number + ' touches_capabilities must be an array');
      }
    }

    // Historical baseline 1..34 completeness
    for (let i = 1; i <= 34; i++) {
      if (!seenPrNumbers.has(i)) {
        errors.push('Missing required PR #' + i + ' from baseline range 1..34');
      }
    }
  }

  // 3. Capabilities Registry
  let capabilitiesData = options.capabilitiesData;
  if (!capabilitiesData) {
    const capabilitiesPath = path.join(repoRoot, '.synthesis/lineage/capabilities.json');
    if (!fs.existsSync(capabilitiesPath)) {
      errors.push('Missing capabilities registry at ' + capabilitiesPath);
    } else {
      try {
        capabilitiesData = JSON.parse(fs.readFileSync(capabilitiesPath, 'utf8'));
      } catch (e) {
        errors.push('Invalid JSON in capabilities.json: ' + e.message);
      }
    }
  }

  const registeredCapabilityIds = new Set();
  const capabilityDepGraph = new Map();

  // Tracked files for owner path verification
  const trackedFiles = options.trackedFiles || getTrackedFiles(repoRoot);

  if (capabilitiesData) {
    if (capabilitiesData.registry_version !== '1.0.0') {
      errors.push("Unsupported capabilities registry version: expected '1.0.0', got '" + capabilitiesData.registry_version + "'");
    }

    const capsList = Array.isArray(capabilitiesData.capabilities) ? capabilitiesData.capabilities : [];
    if (!Array.isArray(capabilitiesData.capabilities)) {
      errors.push("capabilities.json 'capabilities' field must be an array");
    }

    for (const cap of capsList) {
      // Check duplicate capability_id
      if (!cap.capability_id || typeof cap.capability_id !== 'string') {
        errors.push('Capability has missing or non-string capability_id');
        continue;
      }

      if (registeredCapabilityIds.has(cap.capability_id)) {
        errors.push("Duplicate capability_id detected: '" + cap.capability_id + "'");
      } else {
        registeredCapabilityIds.add(cap.capability_id);
        capabilityDepGraph.set(cap.capability_id, Array.isArray(cap.depends_on_capabilities) ? cap.depends_on_capabilities : []);
      }

      // Check canonical_owner_paths existence against tracked repository files
      if (!Array.isArray(cap.canonical_owner_paths) || cap.canonical_owner_paths.length === 0) {
        errors.push("Capability '" + cap.capability_id + "' is missing canonical owner paths");
      } else {
        for (const ownerPath of cap.canonical_owner_paths) {
          if (typeof ownerPath !== 'string' || ownerPath.trim() === '') {
            errors.push("Capability '" + cap.capability_id + "' has invalid empty owner path");
            continue;
          }
          let matches = 0;
          for (const tf of trackedFiles) {
            if (matchesOwnerPath(tf, ownerPath)) {
              matches++;
            }
          }
          if (matches === 0) {
            errors.push("Capability '" + cap.capability_id + "' canonical owner path '" + ownerPath + "' matches 0 tracked repository files");
          }
        }
      }

      // Check visibility enum
      if (!VALID_VISIBILITY.has(cap.visibility)) {
        errors.push("Capability '" + cap.capability_id + "' has invalid visibility enum: '" + cap.visibility + "'. Must be OWNER_INTERNAL or SAFE_PUBLIC_METADATA");
      }

      // Check last_merge_sha
      if (!cap.last_merge_sha || typeof cap.last_merge_sha !== 'string' || !SHA1_REGEX.test(cap.last_merge_sha)) {
        errors.push("Capability '" + cap.capability_id + "' has malformed last_merge_sha: '" + cap.last_merge_sha + "'");
      } else if (!validMergeShas.has(cap.last_merge_sha)) {
        errors.push("Capability '" + cap.capability_id + "' references unknown last_merge_sha: '" + cap.last_merge_sha + "'");
      }

      // Check source_tasks
      if (!Array.isArray(cap.source_tasks)) {
        errors.push("Capability '" + cap.capability_id + "' source_tasks must be an array");
      } else {
        for (const st of cap.source_tasks) {
          if (typeof st !== 'string' || st.trim() === '') {
            errors.push("Capability '" + cap.capability_id + "' has invalid source_task entry");
          } else if (!registeredTaskIds.has(st)) {
            errors.push("Capability '" + cap.capability_id + "' references unknown source_task: '" + st + "'");
          }
        }
      }

      // Check security boundary
      if (!cap.security_boundary || typeof cap.security_boundary !== 'string' || cap.security_boundary.trim() === '') {
        errors.push("Capability '" + cap.capability_id + "' has missing security_boundary");
      }

      // Check project_scoped
      if (typeof cap.project_scoped !== 'boolean') {
        errors.push("Capability '" + cap.capability_id + "' must specify boolean project_scoped");
      }
    }

    // Check all required minimum capabilities exist
    for (const reqCap of REQUIRED_CAPABILITIES) {
      if (!registeredCapabilityIds.has(reqCap)) {
        errors.push("Missing required minimum capability: '" + reqCap + "'");
      }
    }

    // Check for unknown capability dependencies
    for (const [capId, deps] of capabilityDepGraph.entries()) {
      for (const dep of deps) {
        if (!registeredCapabilityIds.has(dep)) {
          errors.push("Capability '" + capId + "' has unknown capability dependency: '" + dep + "'");
        }
      }
    }

    // Check for capability dependency cycles using DFS
    const visited = new Set();
    const inStack = new Set();
    const cycleNodes = [];

    function detectCycle(node, pathStack = []) {
      visited.add(node);
      inStack.add(node);
      pathStack.push(node);

      const neighbors = capabilityDepGraph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (detectCycle(neighbor, pathStack)) {
            return true;
          }
        } else if (inStack.has(neighbor)) {
          const cyclePath = pathStack.slice(pathStack.indexOf(neighbor)).concat(neighbor);
          cycleNodes.push(cyclePath.join(' -> '));
          return true;
        }
      }

      inStack.delete(node);
      pathStack.pop();
      return false;
    }

    for (const capId of registeredCapabilityIds) {
      if (!visited.has(capId)) {
        if (detectCycle(capId)) {
          errors.push('Capability dependency cycle detected: ' + cycleNodes.join(', '));
          break;
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      tasksCount: seenPrNumbers.size,
      capabilitiesCount: registeredCapabilityIds.size
    }
  };
}


export function parsePrNumberFromSubject(subject) {
  if (typeof subject !== "string") return { matched: false };
  const trimmed = subject.trim();
  const results = [];

  // Format 1: subject ends with (#N)
  const match1 = trimmed.match(/\(#(\d+)\)$/);
  if (match1) {
    results.push(parseInt(match1[1], 10));
  }

  // Format 2: subject begins with Merge pull request #N
  const match2 = trimmed.match(/^Merge pull request #(\d+)(?:\s|$)/i);
  if (match2) {
    results.push(parseInt(match2[1], 10));
  }

  // Format 3: subject begins with Merge PR #N
  const match3 = trimmed.match(/^Merge PR #(\d+)(?:\s|$|:)/i);
  if (match3) {
    results.push(parseInt(match3[1], 10));
  }

  if (results.length === 0) return { matched: false };
  const uniqueNums = Array.from(new Set(results));
  if (uniqueNums.length > 1) {
    return { matched: false, conflict: true, found: uniqueNums };
  }
  return { matched: true, prNumber: uniqueNums[0] };
}

export function isAllowedSyncPath(filePath) {
  const norm = filePath.replace(/\\/g, "/");
  if (norm === ".synthesis/task-capsule.json") return true;
  if (norm.startsWith(".synthesis/task-capsules/")) return true;
  if (norm === ".synthesis/lineage/tasks.json") return true;
  if (norm === ".synthesis/lineage/capsules.json") return true;
  if (norm === ".synthesis/lineage/capabilities.json") return true;
  return false;
}

export function validateGitHistoryAlignment(options = {}) {
  const repoRoot = resolveRepoRoot(options.repoRoot);
  const errors = [];
  const warnings = [];

  // 1. Shallow repository check (Step 2A)
  let isShallow = options.isShallow;
  if (isShallow === undefined) {
    try {
      const shallowOutput = execSync("git rev-parse --is-shallow-repository", {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"]
      }).trim();
      isShallow = shallowOutput === "true";
    } catch (e) {
      errors.push("Failed to check if repository is shallow: " + e.message);
    }
  }
  if (isShallow) {
    errors.push("Repository is shallow; full git history required for lineage alignment validation");
    return {
      valid: false,
      errors,
      warnings,
      summary: {
        classifiedNormalPrs: 0,
        syncCommits: 0,
        unmatchedNormalPrs: 0
      }
    };
  }

  // 2. Load Tasks Registry and PR #34 baseline (Step 2C)
  let tasksData = options.tasksData;
  if (!tasksData) {
    const tasksPath = path.join(repoRoot, ".synthesis/lineage/tasks.json");
    if (!fs.existsSync(tasksPath)) {
      errors.push("Missing tasks registry at " + tasksPath);
      return { valid: false, errors, warnings, summary: { classifiedNormalPrs: 0, syncCommits: 0, unmatchedNormalPrs: 0 } };
    }
    try {
      tasksData = JSON.parse(fs.readFileSync(tasksPath, "utf8"));
    } catch (e) {
      errors.push("Invalid JSON in tasks.json: " + e.message);
      return { valid: false, errors, warnings, summary: { classifiedNormalPrs: 0, syncCommits: 0, unmatchedNormalPrs: 0 } };
    }
  }

  const tasksList = Array.isArray(tasksData.tasks) ? tasksData.tasks : [];
  const tasksByPr = new Map();
  for (const t of tasksList) {
    if (typeof t.pr_number === "number") {
      tasksByPr.set(t.pr_number, t);
    }
  }

  const pr34Record = tasksByPr.get(34);
  if (!pr34Record || !pr34Record.merge_sha || !SHA1_REGEX.test(pr34Record.merge_sha)) {
    errors.push("Missing or invalid PR #34 baseline record in tasks.json");
    return { valid: false, errors, warnings, summary: { classifiedNormalPrs: 0, syncCommits: 0, unmatchedNormalPrs: 0 } };
  }
  const baselineSha = pr34Record.merge_sha;

  // 3. Determine Mode and Target (Step 2B)
  let mode = options.mode;
  if (!mode) {
    if (process.env.GITHUB_EVENT_NAME === "pull_request") {
      mode = "pull_request";
    } else if (process.env.GITHUB_EVENT_NAME === "push" && (process.env.GITHUB_REF === "refs/heads/main" || process.env.GITHUB_REF_NAME === "main")) {
      mode = "main_push";
    } else {
      mode = "local";
    }
  }

  let historyTarget = options.historyTarget;
  if (!historyTarget) {
    if (mode === "main_push") {
      historyTarget = "HEAD";
    } else {
      historyTarget = "origin/main";
    }
  }

  // Target resolution (fail closed)
  let isTargetResolvable;
  if (typeof options.isTargetResolvable === "boolean") {
    isTargetResolvable = options.isTargetResolvable;
  } else if (typeof options.resolveTarget === "function") {
    try {
      isTargetResolvable = Boolean(options.resolveTarget(historyTarget, repoRoot));
    } catch {
      isTargetResolvable = false;
    }
  } else if (!options.commits) {
    try {
      execSync(`git rev-parse --verify ${historyTarget}`, { cwd: repoRoot, stdio: ["pipe", "pipe", "ignore"] });
      isTargetResolvable = true;
    } catch {
      isTargetResolvable = false;
    }
  } else {
    isTargetResolvable = true;
  }

  if (!isTargetResolvable) {
    errors.push("Cannot resolve history target: " + historyTarget);
    return { valid: false, errors, warnings, summary: { classifiedNormalPrs: 0, syncCommits: 0, unmatchedNormalPrs: 0 } };
  }

  // 4. Retrieve or walk first-parent commits (Step 2D)
  let commits = options.commits;
  if (!commits) {

    try {
      execSync(`git merge-base --is-ancestor ${baselineSha} ${historyTarget}`, { cwd: repoRoot, stdio: ["pipe", "pipe", "ignore"] });
    } catch {
      errors.push(`Baseline commit ${baselineSha} (PR #34) is not an ancestor of history target ${historyTarget}`);
      return { valid: false, errors, warnings, summary: { classifiedNormalPrs: 0, syncCommits: 0, unmatchedNormalPrs: 0 } };
    }

    try {
      const revListOutput = execSync(`git rev-list --first-parent --reverse ${baselineSha}..${historyTarget}`, {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"]
      }).trim();

      const shas = revListOutput.split("\n").map(s => s.trim()).filter(Boolean);
      commits = [];
      for (const sha of shas) {
        const fullMessage = execSync(`git log -1 --format=%B ${sha}`, {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: ["pipe", "pipe", "ignore"]
        });
        const subject = fullMessage.split(/\r?\n/)[0].trim();
        let changedFiles;
        try {
          const diffOut = execSync(`git diff-tree --no-commit-id --name-only -r ${sha}^1 ${sha}`, {
            cwd: repoRoot,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "ignore"]
          }).trim();
          changedFiles = diffOut ? diffOut.split("\n").map(s => s.trim()).filter(Boolean) : [];
        } catch (e) {
          errors.push(`Failed to discover changed files for commit ${sha}: ${e.message}`);
          return { valid: false, errors, warnings, summary: { classifiedNormalPrs: 0, syncCommits: 0, unmatchedNormalPrs: 0 } };
        }
        commits.push({ sha, subject, message: fullMessage, changedFiles });
      }
    } catch (e) {
      errors.push("Failed to retrieve git history: " + e.message);
      return { valid: false, errors, warnings, summary: { classifiedNormalPrs: 0, syncCommits: 0, unmatchedNormalPrs: 0 } };
    }
  }

  // 5. Walk commits and classify (Steps 2E, 2F, 3, 4)
  const seenHistoryPrs = new Set();
  const classifiedNormalCommits = [];
  const syncCommits = [];
  const unmatchedNormalCommits = [];

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const fullMsg = commit.message || commit.subject || "";
    const subject = commit.subject || fullMsg.split(/\r?\n/)[0] || "";

    // Lineage-sync classification order: 1. check marker
    const isSync = fullMsg.split(/\r?\n/).some(line => line.startsWith("SYN-GOV-LINEAGE-SYNC"));

    if (isSync) {
      if (!Array.isArray(commit.changedFiles)) {
        errors.push(`Lineage-sync commit ${commit.sha} is missing changed-files evidence`);
        continue;
      }
      for (const file of commit.changedFiles) {
        if (!isAllowedSyncPath(file)) {
          errors.push(`Lineage-sync commit ${commit.sha} touches forbidden path: ${file}`);
        }
      }
      syncCommits.push(commit);
      continue;
    }

    // 2. parse normal PR pattern
    const parsed = parsePrNumberFromSubject(subject);
    if (!parsed.matched) {
      if (parsed.conflict) {
        errors.push(`Commit ${commit.sha} subject has conflicting PR numbers: ${parsed.found.join(", ")}`);
      } else {
        errors.push(`Unrecognized first-parent commit format: ${commit.sha} - "${subject}"`);
      }
      continue;
    }

    const prNumber = parsed.prNumber;
    if (seenHistoryPrs.has(prNumber)) {
      errors.push(`Duplicate PR #${prNumber} detected in first-parent history (${commit.sha})`);
    }
    seenHistoryPrs.add(prNumber);

    const normalEntry = {
      sha: commit.sha,
      prNumber,
      subject,
      index: i
    };
    classifiedNormalCommits.push(normalEntry);

    const taskRecord = tasksByPr.get(prNumber);
    if (!taskRecord) {
      unmatchedNormalCommits.push(normalEntry);
    } else {
      if (taskRecord.merge_sha !== commit.sha) {
        errors.push(`PR #${prNumber} merge_sha mismatch: tasks.json has ${taskRecord.merge_sha}, git commit is ${commit.sha}`);
      }
    }
  }

  // 6. Mode enforcement on unmatched commits (Step 4)
  if (mode === "pull_request" || mode === "local") {
    if (unmatchedNormalCommits.length > 0) {
      for (const u of unmatchedNormalCommits) {
        errors.push(`Unmatched normal PR #${u.prNumber} (${u.sha}) in history is not recorded in tasks.json`);
      }
    }
  } else if (mode === "main_push") {
    if (unmatchedNormalCommits.length > 1) {
      errors.push(`Multiple unmatched normal PRs in main history (${unmatchedNormalCommits.length}): ${unmatchedNormalCommits.map(u => "#" + u.prNumber).join(", ")}`);
    } else if (unmatchedNormalCommits.length === 1) {
      const unmatched = unmatchedNormalCommits[0];
      const lastCommit = commits[commits.length - 1];
      if (unmatched.sha !== lastCommit.sha) {
        errors.push(`Unmatched normal PR #${unmatched.prNumber} (${unmatched.sha}) is not the final entry in first-parent history (final is ${lastCommit.sha})`);
      }
    }
  }

  // 7. Verify no fabricated/stale tasks.json records > 34 (Step 2F)
  for (const t of tasksList) {
    if (t.pr_number > 34) {
      if (!seenHistoryPrs.has(t.pr_number)) {
        errors.push(`tasks.json contains record for PR #${t.pr_number} (${t.task_id || "null"}) which does not exist in first-parent history`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      mode,
      historyTarget,
      baselineSha,
      totalFirstParentCommits: commits.length,
      classifiedNormalPrs: classifiedNormalCommits.length,
      syncCommits: syncCommits.length,
      unmatchedNormalPrs: unmatchedNormalCommits.length
    }
  };
}

// CLI Execution entry point
if (process.argv[1] && process.argv[1].endsWith('validate.mjs')) {
  console.log('--- Synthesis CMS Lineage & Capability Validator ---');
  const result = validateLineage();

  if (!result.valid) {
    console.error('\n[FAIL] Lineage validation failed with errors:');
    for (const err of result.errors) {
      console.error('  - ' + err);
    }
    process.exit(1);
  }

  console.log('\n[SUCCESS] Lineage validation passed deterministically:');
  console.log('  - Total Tasks Verified: ' + result.summary.tasksCount);
  console.log('  - Total Capabilities Verified: ' + result.summary.capabilitiesCount);
  console.log('  - Capsule SHA-256 integrity verified.');
  console.log('  - SHA reference formats and registry relationships verified.');
  console.log('  - Capability owner paths verified against current repository files.');
  console.log('  - Dependency graph acyclic.');
  process.exit(0);
}
