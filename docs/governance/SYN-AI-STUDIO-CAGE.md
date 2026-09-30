# AI Studio Confinement & Cage Rules

contract_id: SYN-AI-STUDIO-CAGE
version: 1.0.0
status: CURRENT_REVIEW
source_notion_page_id: 3daa127f-178a-81e4-b499-c638f1dd112b
source_notion_url: https://app.notion.com/p/3daa127f178a81e4b499c638f1dd112b
frozen_at: 2026-09-30T09:58:22+02:00
frozen_base_main_sha: da6a7b0d8cf667f10db9025982af4d708b61e7a3
supersedes: null

## Normative Rules
## 1. Confinement & Error Boundaries
- Textual instructions or conversational slips never authorize mutation outside the active Task Capsule.
- Strictly forbidden authority: no direct access to main branch, production environments, production databases/storage, host system shells, or production secrets.
- Formal operational work levels: READ / PLAN / BRANCH WRITE / PR / STAGING REQUEST; direct PRODUCTION execution is strictly forbidden.

## 2. Capsule Confinement & Scope Enforcement
- The active Task Capsule defines task identity, base SHA, task branch, allowed paths, forbidden paths, and required validation checks.
- Diff Firewall and pre-commit scope audits enforce strict mutation boundaries before any commit or push.
- Prohibited actions without separate task authorization: no repository-wide --fix commands, no dependency or toolchain upgrades, no git reset/rebase/force-push, no security gate weakening, no mock remotes, and no test weakening.
- Governance, dependency, database, security, and feature changes must remain strictly isolated into separate bounded tasks.

## 3. Mandatory STOP Triggers & Operational Limitations
- Immediate hard STOP required upon: repository or base SHA mismatch, dirty untracked state, unexpected git diff, out-of-scope database/dependency mutation, failed validation check, execution timeout, credential failure, specification ambiguity, or unknown systemic impact.
- AI Studio is not the final result authority; exact commit SHA remote GitHub CI is.
- Current CMS_DEV AI Studio execution environment possesses GitHub access but no Notion credentials, and must not attempt direct Notion writes.
- Missing root AGENTS.md and .synthesis/ruleset.lock.json represented the exact governance drift repaired by this task.

---
*Note: Historical evidence, incident reports, and revision audits remain recorded in Notion and Git history.*
