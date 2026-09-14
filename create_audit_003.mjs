import fs from 'fs';

const headers = {
  "Authorization": `Bearer ${process.env.NOTION_TOKEN_CMS_DEV}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json"
};

async function createAudit() {
  const auditContent = `
COMMAND_ID: CMD-CMS-003-CI-PIPELINE-SETUP
PROJECT_ID: SYNTHESIS_CMS
ENV_ID: CMS_DEV
BASELINE_SHA: 6782bc2d9f5624e13a65932fc3a4c63d7073d3f8
BRANCH: chore/CMD-CMS-003-ci-safety-cage
NEW_MAIN_SHA: c070c01db40ca75cbeeedf3f97943c1c758bcf3a
CI_STATUS: PASS
NEGATIVE_TESTS: PASS
DEPENDENCIES: canonicalize via npm
CODEOWNERS: @jirisar7-eng
BRANCH_PROTECTION: ENABLED
SECURITY_REVIEW: PASS
SECRETS_EXPOSED: false
DRIFT: NONE
FINAL_VERDICT: PASS
  `.trim();

  const createPayload = {
    parent: { database_id: process.env.NOTION_CONTRACT_REGISTRY_ID },
    properties: {
      "Název": { title: [{ text: { content: "AUDIT-CMD-CMS-003" } }] },
      "Contract ID": { rich_text: [{ text: { content: "EVD-CMD-CMS-003" } }] },
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
