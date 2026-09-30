# Engineering Code Command Contract

contract_id: SYN-CODE-COMMAND-CONTRACT
version: 1.0.0
status: CURRENT_REVIEW
source_notion_page_id: 3daa127f-178a-816f-9323-d97ee71a6eb2
source_notion_url: https://app.notion.com/p/3daa127f178a816f9323d97ee71a6eb2
frozen_at: 2026-09-30T09:58:22+02:00
frozen_base_main_sha: da6a7b0d8cf667f10db9025982af4d708b61e7a3
supersedes: null

## Normative Rules
## 1. Authority Division & Artifact Identity
- Notion owns approved intent, business rules, architecture, and rationale.
- Git owns executable implementation code, commit history, and CI technical proof.
- Reusable code contracts are identified by CODE_ID.
- Every working execution command is identified by COMMAND_ID.
- Every governance ruleset is bound to RULESET_ID, version, and cryptographic hash.

## 2. Packet Structures & Handshake Verification
- Code Packets bind ID, version, status, repository path, commit SHA, SHA-256 hash, unit tests, security assertions, licensing, and provenance.
- Command Packets bind goal, non-goals, ruleset ID, environment ID, code versions, base commit SHA, target branch, allowed paths, forbidden paths, command execution lines, verification tests, and explicit STOP triggers.
- Notion-to-Git Handshake: pre-mutation validation of IDs, versions, statuses, hashes, and base commit SHAs.
- Git-to-Notion Evidence: durable write-back recording repository, branch, base SHA, head commit SHA, PR number, changed files, validation checks, and artifact hashes.

## 3. Anti-Self-Approval & Minimum CI Enforcement
- AI Studio is prohibited from modifying a Rulebook and self-approving implementation work under that modified rulebook within the same uncontrolled step.
- Minimum repository governance enforcement requires root AGENTS.md, `.synthesis/ruleset.lock.json`, and a fail-closed CI validation gate.
- Any ruleset, hash, or version mismatch must trigger a fail-closed reject, never silent approval regeneration or lock tampering.

---
*Note: Historical evidence, incident reports, and revision audits remain recorded in Notion and Git history.*
