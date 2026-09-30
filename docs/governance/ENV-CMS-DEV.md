# Environment Contract — CMS_DEV

contract_id: ENV-CMS-DEV
version: 0.2.0
status: CURRENT_REVIEW
source_notion_page_id: 3daa127f-178a-8141-8a2b-d21d8c7f4191
source_notion_url: https://app.notion.com/p/3daa127f178a81418a2bd21d8c7f4191
frozen_at: 2026-09-30T09:58:22+02:00
frozen_base_main_sha: da6a7b0d8cf667f10db9025982af4d708b61e7a3
supersedes: 0.1.0-draft

## Normative Rules
## 1. Environment Identity & Isolation
CMS_DEV is the primary isolated development and verification environment for Synthesis CMS 1.0. It must remain strictly isolated from legacy environments (ENV-LEGACY-DEV3, PROD).

## 2. Persistence & Database Safety
- Authoritative persistence engine is PostgreSQL managed via Prisma migrations.
- Automatic database resets, dropping tables, or db push with data loss are strictly forbidden without explicit approved justification.
- Migration rollback and restore implications must be evaluated before applying structural database changes.

## 3. Preflight & Deployment Gates
- Preflight checks (CMD-CMS-000-PREFLIGHT) must execute and pass before deployments or runtime restarts.
- CMS_DEV deployment never implies production release approval.

---
*Note: Historical evidence, incident reports, and revision audits remain recorded in Notion and Git history.*
