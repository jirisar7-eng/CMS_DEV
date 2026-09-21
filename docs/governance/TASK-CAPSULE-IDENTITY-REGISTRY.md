# Task Capsule Identity & Registry Foundation (SYN-GOV-CAPSULE-002)

## 1. Git SSOT Architecture
Git remains the single source of truth (SSOT) for all task execution, commit records, task capsules, SHA verification, diff enforcement, and CI validation.

## 2. Active Capsule Lifecycle
- **Active Task Capsule**: Located at `.synthesis/task-capsule.json`.
- Governs the currently running task lifecycle, branch constraints, base commit SHA, status (`IN_PROGRESS` vs `COMPLETED`), allowed mutation types, and explicitly bounded `allowed_paths`.
- Evaluated by the fail-closed Diff Firewall (`scripts/ci/diff_firewall.mjs`) on every CI push or local validation.

## 3. Immutable Task Capsule Archives
- **Archive Storage**: Located under `.synthesis/task-capsules/*.json`.
- Created at task completion with snapshot state.
- Once created and merged, archive files are permanently immutable and must never be modified, deleted, or retroactively edited.

## 4. Deterministic Capsule Registry
- **Authoritative Registry**: Located at `.synthesis/lineage/capsules.json`.
- Generated deterministically by `scripts/ci/generate_capsule_registry.mjs` from all archive files under `.synthesis/task-capsules/`.
- Validated by `scripts/ci/validate_capsule_registry.mjs` and integrated directly into Governance CI (`scripts/ci/validate_governance.mjs`).
- Generation is 100% byte-deterministic with stable sorting, strict property formatting, and zero unseeded timestamps.

## 5. Notion Task Capsule Registry Mirror
- A human-facing mirror exists in the Notion Task Capsule Registry for high-visibility tracking and auditing.
- The Notion registry mirrors the authoritative Git records, referencing canonical capsule IDs, task IDs, base SHAs, and verification statuses.

## 6. Capsule Identity Contract (v1.1+)
For all new and updated capsules starting from v1.1+:
- `capsule_id`: Unique, immutable instance identifier (format: `CAP-<TASK_ID>-<YYYYMMDD>-<SEQ>`).
- `task_id`: Logical task identifier (e.g. `SYN-GOV-CAPSULE-002`).
- `title`: Descriptive human-readable task title.
- `version`: Version string (e.g. `1.1.0`).
- `environment`: Environment tag (e.g. `CMS_DEV`).
- `created_at`: UTC ISO timestamp of creation.
- `base_sha`: 40-char commit SHA from which the task branched.
- `expected_branch`: Exact git branch name.
- `owner`: Execution owner identifier (e.g. `AI_STUDIO`).
- `status`: Status enum (`IN_PROGRESS` | `COMPLETED`).
- `parent_capsule_id`: Lineage linkage to predecessor capsule, or `null`.
- `supersedes_capsule_id`: Explicit replacement identifier if replacing an older capsule, or `null`.
- `allowed_mutation_types`: Array of mutation classifications.
- `allowed_paths`: Strict whitelist of file paths allowed to be mutated.

## 7. Lineage Verification
- `parent_capsule_id` and `supersedes_capsule_id` must refer to existing `capsule_id` records in the registry.
- Dangling, cyclic, or self-referential lineage links fail closed during validation.

## 8. Integrity & Non-Circular Hashing
- Registry records compute and store the SHA-256 hash of the exact bytes of each immutable archive file.
- Hashing is external/non-circular: the capsule JSON file itself does not contain a self-referential hash field.
- Any discrepancy between on-disk archive content and registry hash results in an immediate fail-closed validation rejection.

## 9. Historical Legacy Compatibility (v1.0)
- The 38 pre-existing v1.0 task capsules in `.synthesis/task-capsules/` remain byte-for-byte untouched.
- Legacy capsules without `capsule_id` receive a deterministic, stable registry ID of the form `CAP-LEGACY-<filename_slug>` and have `legacy: true`.
- No retroactive schema requirements are imposed on historical archives.

## 10. Fail-Closed Failure Rules
Governance validation fails immediately and blocks CI on:
1. Duplicate `capsule_id` in registry.
2. Malformed v1.1+ capsule archive missing any required field.
3. Unindexed archive on disk or missing archive file referenced by registry.
4. SHA-256 hash drift between archive file on disk and registry entry.
5. Non-deterministic registry file format / drift from generator output.
6. Invalid parent or superseded capsule ID references.
7. Task ID mismatch between archive JSON content and registry entry.
8. File mutations outside `allowed_paths` (blocked by Diff Firewall).
