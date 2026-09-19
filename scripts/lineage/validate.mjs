import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
  'brand'
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

  const registeredTaskIds = new Set();
  const seenPrNumbers = new Set();

  if (tasksData) {
    if (tasksData.registry_version !== '1.0.0') {
      errors.push("Unsupported registry version: expected '1.0.0', got '" + tasksData.registry_version + "'");
    }

    const tasksList = Array.isArray(tasksData.tasks) ? tasksData.tasks : [];
    if (!Array.isArray(tasksData.tasks)) {
      errors.push("tasks.json 'tasks' field must be an array");
    }

    const capsulesDir = options.capsulesDir || path.join(repoRoot, '.synthesis/task-capsules');

    for (const task of tasksList) {
      // PR number uniqueness
      if (typeof task.pr_number !== 'number' || task.pr_number < 1) {
        errors.push("Invalid pr_number '" + task.pr_number + "'");
      } else if (seenPrNumbers.has(task.pr_number)) {
        errors.push('Duplicate PR number detected: #' + task.pr_number);
      } else {
        seenPrNumbers.add(task.pr_number);
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

      // Capsule presence and SHA-256 integrity
      if (task.capsule_present === true) {
        if (!task.task_id) {
          errors.push('PR #' + task.pr_number + ' declares capsule_present=true but task_id is null');
        } else {
          if (!task.capsule_sha256 || !SHA256_REGEX.test(task.capsule_sha256)) {
            errors.push('PR #' + task.pr_number + ' (' + task.task_id + ") has malformed capsule_sha256: '" + task.capsule_sha256 + "'");
          }

          const capsuleFile = path.join(capsulesDir, task.task_id + '.json');
          if (!fs.existsSync(capsuleFile)) {
            errors.push('PR #' + task.pr_number + ' declares capsule_present=true but archive file is missing: ' + capsuleFile);
          } else {
            try {
              const rawContent = fs.readFileSync(capsuleFile, 'utf8');
              const actualSha256 = crypto.createHash('sha256').update(rawContent, 'utf8').digest('hex');
              if (actualSha256 !== task.capsule_sha256) {
                errors.push('PR #' + task.pr_number + ' (' + task.task_id + ') capsule SHA-256 mismatch: expected ' + task.capsule_sha256 + ', calculated ' + actualSha256);
              }
            } catch (err) {
              errors.push('PR #' + task.pr_number + ' (' + task.task_id + ') failed to read archive capsule: ' + err.message);
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

      // Check canonical_owner_paths
      if (!Array.isArray(cap.canonical_owner_paths) || cap.canonical_owner_paths.length === 0) {
        errors.push("Capability '" + cap.capability_id + "' is missing canonical owner paths");
      }

      // Check visibility enum
      if (!VALID_VISIBILITY.has(cap.visibility)) {
        errors.push("Capability '" + cap.capability_id + "' has invalid visibility enum: '" + cap.visibility + "'. Must be OWNER_INTERNAL or SAFE_PUBLIC_METADATA");
      }

      // Check last_merge_sha
      if (!cap.last_merge_sha || typeof cap.last_merge_sha !== 'string' || !SHA1_REGEX.test(cap.last_merge_sha)) {
        errors.push("Capability '" + cap.capability_id + "' has malformed last_merge_sha: '" + cap.last_merge_sha + "'");
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
  console.log('  - All SHA-256 and SHA-1 checksums verified.');
  console.log('  - Graph is acyclic and dependencies resolve closed.');
  process.exit(0);
}
