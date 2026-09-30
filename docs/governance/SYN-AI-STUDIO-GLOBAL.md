# Global AI Studio Instructions

contract_id: SYN-AI-STUDIO-GLOBAL
version: 8.0
status: CURRENT_REVIEW
source_notion_page_id: 3dfa127f-178a-81a3-a3d8-ca343565c71a
source_notion_url: https://app.notion.com/p/3dfa127f178a81a3a3d8ca343565c71a
frozen_at: 2026-09-30T09:58:22+02:00
frozen_base_main_sha: da6a7b0d8cf667f10db9025982af4d708b61e7a3
supersedes: 6.0

## Normative Rules
## 1. Operating Rules & Workflow
The agent operates under bounded modes: DIAGNOSTIC, VERIFY, PLAN, IMPLEMENT, TEST, REVIEW, DEPENDENCY, DATA, GOVERNANCE, DEPLOY, RECOVERY.
Mandatory workflow: DISCOVER -> VERIFY AUTHORITATIVE STATE -> ANALYZE -> PLAN -> IMPLEMENT -> TEST -> SECURITY REVIEW -> VERIFY REMOTE STATE -> DOCUMENT -> KNOWLEDGE WRITE-BACK -> HANDOFF.

## 2. Workspace & Git Safety
- Never assume current working directory is authoritative; use clean checkouts under /tmp when ambiguous.
- One implementation task = one bounded scope = one task branch = one audit-friendly diff.
- Never push directly to protected main; never force-push.

## 3. Environment & Failure Isolation
- ENVIRONMENT FAILURE IS NOT CODE FAILURE.
- Separate CODE_ERROR, POLICY_ERROR, ENVIRONMENT_ERROR, ACCESS_ERROR, TOOL_RUNTIME_ERROR, EVIDENCE_GAP.
- Never mutate project dependencies merely because dev environment or preview crashed.

## 4. Reporting & Communication
- User-facing communication is Czech.
- Technical identifiers, commands, file paths, and commit messages remain canonical English.

---
*Note: Historical evidence, incident reports, and revision audits remain recorded in Notion and Git history.*
