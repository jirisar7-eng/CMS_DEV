# Synthesis CMS — Root Rulebook

contract_id: SYN-RULEBOOK-ROOT
version: 0.2.0
status: CURRENT_REVIEW
source_notion_page_id: 3daa127f-178a-81d9-8dc8-d6790ee39c37
source_notion_url: https://app.notion.com/p/3daa127f178a81d98dc8d6790ee39c37
frozen_at: 2026-09-30T09:58:22+02:00
frozen_base_main_sha: da6a7b0d8cf667f10db9025982af4d708b61e7a3
supersedes: 0.1.0-provisional

## Normative Rules
## 1. Absolute Priority
Until Synthesis CMS 1.0 is released, CMS 1.0 is the absolute implementation priority. Ecosystem expansions (Orion Studio, CMS_AI, Theme Engine expansion, Marketplace) are deferred post-1.0 unless directly unblocking a release blocker.

## 2. Hierarchy of Values
Optimize strictly in this order:
SECURITY -> DATA INTEGRITY -> PRIVACY -> AUTHORIZATION -> STABILITY -> TESTABILITY -> ARCHITECTURE -> AUDITABILITY -> MAINTAINABILITY -> PERFORMANCE -> SPEED.

## 3. Authoritative Sources of Truth
- GitHub: source code, commits, branches, PRs, remote SHA, CI history.
- Notion: approved intent, governance, architecture, durable evidence.
- PostgreSQL / Prisma: authoritative persistence data.
- VPS / Runtime: deployed runtime container state.
- Secret Provider: secret configuration values.
- Task Capsule: bounded mutation contract and allowed scope.
AI output is never authoritative by itself.

## 4. Master Principles
- NO EVIDENCE = NO CLAIM.
- NO VERIFIED REMOTE SHA = NO REMOTE CLAIM.
- NO VERIFIED CI = NO TECHNICAL RELEASE CLAIM.
- NO VERIFIED RELEASE GATE = NO RELEASE.
- Default authorization is DENY (fail-closed security).

---
*Note: Historical evidence, incident reports, and revision audits remain recorded in Notion and Git history.*
