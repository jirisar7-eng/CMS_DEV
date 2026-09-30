# Synthesis CMS — Root Rulebook

contract_id: SYN-RULEBOOK-ROOT
version: 0.2.0
status: CURRENT_REVIEW
source_notion_page_id: 3daa127f-178a-81d9-8dc8-d6790ee39c37
source_notion_url: https://app.notion.com/p/3daa127f178a81d98dc8d6790ee39c37
frozen_at: 2026-09-30T09:58:22+02:00
frozen_base_main_sha: da6a7b0d8cf667f10db9025982af4d708b61e7a3
supersedes: SYN-RULEBOOK-ROOT@0.1.0-provisional

## Normative Rules
## 1. CMS 1.0 Absolute Priority & Scope Freeze
- CMS 1.0 is the absolute implementation priority.
- Critical-path scope is strictly frozen.
- Only tasks on the current release task list, direct blockers, regressions, security hardening, and release evidence may be executed prior to CMS 1.0 release completion.
- Post-1.0 ideas (Orion Studio, CMS_AI, Theme Engine expansion, Marketplace) must not interrupt active release tasks.

## 2. Mandatory Engineering Workflow
Every implementation task must execute:
DISCOVER -> VERIFY AUTHORITATIVE STATE -> ANALYZE -> PLAN -> IMPLEMENT -> TEST -> SECURITY REVIEW -> VERIFY REMOTE STATE -> DOCUMENT -> KNOWLEDGE WRITE-BACK -> HANDOFF.
- Only explicitly authorized phases may be executed.
- Combined phases require explicit internal verification gates between steps.

## 3. Hierarchy of Values
Optimize strictly in this order:
SECURITY -> DATA INTEGRITY -> PRIVACY -> AUTHORIZATION -> STABILITY -> TESTABILITY -> ARCHITECTURE -> AUDITABILITY -> MAINTAINABILITY -> PERFORMANCE -> SPEED.

## 4. Domain-Specific Authority Separation
- GitHub: Authoritative single source of truth (SSOT) for code, commits, branches, PRs, remote SHA, and CI technical gates.
- Notion: Authoritative source for approved intent, governance, architecture, and durable evidence.
- PostgreSQL / Prisma: Authoritative persistence layer for application state.
- VPS / Runtime / Containers: Authoritative runtime deployed state.
- Task Capsule / Contract: Authoritative allowed mutation scope.
- AI or chat output is never authoritative by itself; historical chat logs do not constitute current-state proof.
- Any conflict or missing evidence results in DRIFT / NOT_VERIFIED and fails closed.

## 5. Repository & Pre-Mutation Safety
- Mandatory pre-mutation verification of repository, task identity, environment, branch, base/head SHA, scope, and clean worktree.
- No direct push to protected main branch; no force-push, rebase, reset, or destructive drop operations.
- Clean task-scoped recovery checkout under /tmp preferred when workspace is ambiguous.

## 6. Security, Authorization & Data Safety
- Default authorization is fail-closed DENY.
- Never weaken or bypass authentication, MFA verification, RBAC permissions, or project context isolation.
- No secrets permitted in Git, Notion, logs, URLs, or frontend bundles.
- No prisma db push, automatic drop, reset, or accept-data-loss shortcuts.
- No mock or in-memory persistence fallback following real backend failure.

## 7. Technical Verification & Definition of Done
- Exact pushed commit SHA evaluated by GitHub CI is the authoritative technical gate; local PASS is strictly insufficient.
- Full DONE chain requires implementation, proportional tests, security review, push, exact SHA verification, CI pass, merge to main, runtime verification (where applicable), and durable Notion write-back.
- Notion governance history is strictly append-only; update by superseding records, never by silent deletion or rewriting.
- Every new mutating or test AI Studio command must carry a stable COMMAND_ID and map to exactly one centralized ledger row.
- Provider or tool failure recovery preserves all verified work and strictly prevents blind mutation retries.

---
*Note: Historical evidence, incident reports, and revision audits remain recorded in Notion and Git history.*
