const fs = require('fs');

const headers = {
  "Authorization": `Bearer ${process.env.NOTION_TOKEN_CMS_DEV}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json"
};

async function run() {
  try {
      console.log("--- READ CURRENT STATE ---");
      const rbRes = await fetch(`https://api.notion.com/v1/pages/${process.env.NOTION_RULEBOOK_ROOT_ID}`, {headers});
      const rb = await rbRes.json();
      console.log("Rulebook last edited:", rb.last_edited_time);
      
      const envRes = await fetch(`https://api.notion.com/v1/pages/${process.env.NOTION_ENV_PROFILE_PAGE_ID}`, {headers});
      const env = await envRes.json();
      console.log("Env Profile last edited:", env.last_edited_time);
      
      console.log("--- EXECUTING NOTION MUTATIONS ---");
      
      const createPayload = {
        parent: { database_id: process.env.NOTION_CONTRACT_REGISTRY_ID },
        properties: {
          "Název": { title: [{ text: { content: "Synthesis Canonicalization & Hash Contract" } }] },
          "Contract ID": { rich_text: [{ text: { content: "SYN-HASH-CONTRACT" } }] },
          "Projekt": { select: { name: "SYNTHESIS_CMS" } },
          "Typ": { select: { name: "RULESET" } },
          "Stav": { select: { name: "DRAFT" } },
          "Verze": { rich_text: [{ text: { content: "1.0.0" } }] },
          "Hash": { rich_text: [{ text: { content: "PENDING_GIT_MIRROR" } }] },
          "Git SHA": { rich_text: [{ text: { content: "PENDING_GIT_MIRROR" } }] }
        },
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                { text: { content: "CANONICALIZATION_ID: SYN-NOTION-CANONICAL-1\n" } },
                { text: { content: "HASH_ALGORITHM: SHA-256\n" } },
                { text: { content: "Canonical JSON format excludes Notion operational metadata (IDs, timestamps, authors)." } }
              ]
            }
          }
        ]
      };

      const res1 = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers,
        body: JSON.stringify(createPayload)
      });
      const data1 = await res1.json();
      if (data1.object === "page") console.log("Created Hash Contract Page ID:", data1.id);
      else console.log("Failed to create Hash Contract:", data1);

      const appendRulebook = {
        children: [
          {
            object: "block",
            type: "bulleted_list_item",
            bulleted_list_item: {
              rich_text: [{ text: { content: "REQUIRED dependency pro Git mirror, hashing, integrity checks a governance synchronization: SYN-HASH-CONTRACT, VERSION 1.0.0" } }]
            }
          }
        ]
      };
      const res2 = await fetch(`https://api.notion.com/v1/blocks/${process.env.NOTION_RULEBOOK_ROOT_ID}/children`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(appendRulebook)
      });
      const data2 = await res2.json();
      if (data2.object === "list") console.log("Appended to Rulebook successfully.");
      else console.log("Failed to append to Rulebook:", data2);

      const appendEnv = {
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ text: { content: "Contract Registry authority = NOTION_CONTRACT_REGISTRY_ID. DATA_SOURCE_ID není pro tento workflow REQUIRED." } }]
            }
          }
        ]
      };
      const res3 = await fetch(`https://api.notion.com/v1/blocks/${process.env.NOTION_ENV_PROFILE_PAGE_ID}/children`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(appendEnv)
      });
      const data3 = await res3.json();
      if (data3.object === "list") console.log("Appended to ENV-CMS-DEV successfully.");
      else console.log("Failed to append to ENV-CMS-DEV:", data3);

  } catch (e) {
      console.error(e);
  }
}
run();
