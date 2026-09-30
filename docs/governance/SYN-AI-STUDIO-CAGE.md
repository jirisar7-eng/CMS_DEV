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
## 1. Boundary Confinement
- Mutations are strictly restricted to paths declared in the active task capsule's `allowed_paths`.
- Any mutation of forbidden paths (including authentication, core database, CI configurations, or registries without explicit authorization) is an immediate fatal violation.

## 2. Security Boundaries & Protection
- Never expose, log, or leak secrets, environment keys, or credentials.
- Do not bypass server-side authorization, MFA verification, RBAC rules, or project context isolation.
- Automatic or silent dependency expansion is prohibited.

---
*Note: Historical evidence, incident reports, and revision audits remain recorded in Notion and Git history.*
