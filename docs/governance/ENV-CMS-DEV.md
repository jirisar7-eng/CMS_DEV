# Environment Contract — CMS_DEV

contract_id: ENV-CMS-DEV
version: 0.2.0
status: CURRENT_REVIEW
source_notion_page_id: 3daa127f-178a-8141-8a2b-d21d8c7f4191
source_notion_url: https://app.notion.com/p/3daa127f178a81418a2bd21d8c7f4191
frozen_at: 2026-09-30T09:58:22+02:00
frozen_base_main_sha: da6a7b0d8cf667f10db9025982af4d708b61e7a3
supersedes: ENV-CMS-DEV@0.1.0-draft

## Normative Rules
## 1. Environment Classification & Identity
- Environment ID: CMS_DEV.
- Classification: PREPRODUCTION development environment.
- Canonical Repository: jirisar7-eng/CMS_DEV, tracking base branch `main`.
- Development Public Domain: cms-dev.tatovacesta.cz.
- Application Container: synthesis_cms_dev_app.
- Internal Network: synthesis_cms_dev_internal.
- Edge Network: synthesis-edge-net.
- Object Storage: Garage integrated via generic S3-compatible storage contract.

## 2. Secrets & Boundary Isolation
- Secrets are represented in configuration only by stable aliases; real secret values are never committed to Git or stored in Notion.
- Strict architectural isolation between database, object storage, cache, secret management, DNS/domain, and container boundaries.
- CMS_DEV must remain strictly isolated from legacy environments (ENV-LEGACY-DEV3, PROD).

## 3. Preflight & Deployment Governance
- Live VPS, container runtime, and image states must be actively reverified before any deployment.
- Deployment operations strictly require read-only preflight (CMD-CMS-000-PREFLIGHT), full backup, database migration review, readiness probing, smoke testing, and documented rollback evidence.
- No prisma db push or --accept-data-loss commands are permitted.
- No public exposure of PostgreSQL database ports.
- No direct AI agent access to production environments, production databases, host control sockets, or production secrets.
- This governance contract execution performs zero deployment or runtime infrastructure mutation.

---
*Note: Historical evidence, incident reports, and revision audits remain recorded in Notion and Git history.*
