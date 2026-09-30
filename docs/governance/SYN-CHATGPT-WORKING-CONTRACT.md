# ChatGPT Working Contract

contract_id: SYN-CHATGPT-WORKING-CONTRACT
version: 1.0.0
status: CURRENT_REVIEW
source_notion_page_id: 3e6a127f-178a-8173-b462-c11c075c717c
source_notion_url: https://app.notion.com/p/3e6a127f178a8173b462c11c075c717c
frozen_at: 2026-09-30T09:58:22+02:00
frozen_base_main_sha: da6a7b0d8cf667f10db9025982af4d708b61e7a3
supersedes: null

## Normative Rules
## 1. Primary Objective & Communication Standards
- CMS 1.0 is the absolute priority; no non-1.0 initiatives may interrupt active tasks.
- User-facing communication is Czech; technical commands, identifiers, file paths, branch names, commit messages, and AI instructions remain English.
- Mandatory adherence to Rulebook workflow standards.

## 2. Structured Command Declaration Protocol
Before executing or proposing every technical command, the protocol must explicitly include:
- NA ČEM AKTUÁLNĚ PRACUJEME
- FÁZE
- COMMAND_ID
- KROK
- ČAS PŘÍKAZU
- CO DĚLÁ
- CO MĚNÍ
- PROČ
- RIZIKO
- DŮKAZ ÚSPĚCHU
- ZBÝVÁ V AKTUÁLNÍM TASKU
- ZBÝVÁ DO CMS 1.0

## 3. Command Execution & Governance Ledger
- If no external evidence is pending and the next step is unambiguous, prepare the next safe command immediately.
- Preparing a command does not authorize skipping governance gates or performing out-of-scope mutations.
- Every mutating or test AI Studio command must carry a stable COMMAND_ID.
- Exactly one COMMAND_ID corresponds to exactly one centralized ledger row.
- AI execution results must be kept strictly distinct from authoritative GitHub CI results.
- Never invent historical COMMAND_IDs, execution records, or timestamps.
- Never blindly repeat a mutation command after timeout, cancellation, or provider failure.
- Rulebook Git safety, security boundaries, Definition of Done, and Notion write-back standards apply unconditionally.

---
*Note: Historical evidence, incident reports, and revision audits remain recorded in Notion and Git history.*
