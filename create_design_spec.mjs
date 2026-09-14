import fs from 'fs';

const headers = {
  "Authorization": `Bearer ${process.env.NOTION_TOKEN_CMS_DEV}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json"
};

async function createContract() {
  const createPayload = {
    parent: { database_id: process.env.NOTION_CONTRACT_REGISTRY_ID },
    properties: {
      "Název": { title: [{ text: { content: "Synthesis Design Foundation" } }] },
      "Contract ID": { rich_text: [{ text: { content: "SYN-DESIGN-FOUNDATION" } }] },
      "Projekt": { select: { name: "SYNTHESIS_CMS" } },
      "Typ": { select: { name: "RULESET" } },
      "Stav": { select: { name: "APPROVED" } },
      "Verze": { rich_text: [{ text: { content: "0.1" } }] }
    },
    children: [
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ text: { content: "Základní architektonický předpis pro designový systém Synthesis CMS. Definuje neutrální core, sémantické tokeny, oddělení Theme a Brand packů (např. pro Táta má právo) a administrátorský shell." } }]
        }
      }
    ]
  };

  const res = await fetch("https://api.api.notion.com/v1/pages".replace("api.api", "api"), {
    method: "POST",
    headers,
    body: JSON.stringify(createPayload)
  });
  const data = await res.json();
  if (data.object === "page") console.log("CONTRACT_CREATED:", data.url);
  else console.log("FAILED:", JSON.stringify(data, null, 2));
}
createContract();
