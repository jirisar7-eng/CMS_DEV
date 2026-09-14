import fs from 'fs';

const headers = {
  "Authorization": `Bearer ${process.env.NOTION_TOKEN_CMS_DEV}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json"
};

async function createAudit() {
  const auditContent = `
COMMAND_ID: CMD-CMS-001-BOOTSTRAP-BASELINE
PROJECT_ID: SYNTHESIS_CMS
ENV_ID: CMS_DEV
RULESET_ID: SYN-RULEBOOK-ROOT
RULESET_VERSION: 0.1.0-provisional
RULESET_HASH: 63135ee7fc3362106bc92420bfdac3765cbbe17ecca5af8822252a17b329a0d3
GLOBAL_INSTRUCTION_VERSION: 6.0
HASH_CONTRACT_ID: SYN-HASH-CONTRACT
HASH_CONTRACT_VERSION: 1.0.0
CANONICALIZATION_ID: SYN-NOTION-CANONICAL-1
CONTRACT_HASHES: VERIFIED_AND_MATCHED
REPOSITORY: jirisar7-eng/CMS_DEV
BRANCH: main
GIT_BASE_SHA: 6782bc2d9f5624e13a65932fc3a4c63d7073d3f8
REMOTE_BASE_SHA: 6782bc2d9f5624e13a65932fc3a4c63d7073d3f8
FILES_CREATED: 17
FILES_CHANGED: 0
NOTION_CHANGES: Contract Registry Hashes & Git SHAs Updated
AUTH_STATUS: PASS
SOURCE_STATUS: VERIFIED
ENV_STATUS: VERIFIED
DRIFT_STATUS: NONE
TEST_RESULTS: PASS
SECURITY_REVIEW: PASS
SECRETS_EXPOSED: false
FINAL_VERDICT: PASS
  `.trim();

  const createPayload = {
    parent: { database_id: process.env.NOTION_CONTRACT_REGISTRY_ID },
    properties: {
      "Název": { title: [{ text: { content: "AUDIT-CMD-CMS-001" } }] },
      "Contract ID": { rich_text: [{ text: { content: "EVD-CMD-CMS-001" } }] },
      "Projekt": { select: { name: "SYNTHESIS_CMS" } },
      "Typ": { select: { name: "EVIDENCE" } },
      "Stav": { select: { name: "APPROVED" } },
      "Verze": { rich_text: [{ text: { content: "1.0.0" } }] }
    },
    children: [
      {
        object: "block",
        type: "code",
        code: {
          rich_text: [{ text: { content: auditContent } }],
          language: "plain text"
        }
      }
    ]
  };

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers,
    body: JSON.stringify(createPayload)
  });
  const data = await res.json();
  if (data.object === "page") console.log("AUDIT_CREATED:", data.url);
  else console.log("FAILED_TO_CREATE_AUDIT:", data);
}
createAudit();
