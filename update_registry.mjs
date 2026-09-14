import fs from 'fs';

const headers = {
  "Authorization": `Bearer ${process.env.NOTION_TOKEN_CMS_DEV}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json"
};

async function run() {
  try {
    const registryId = process.env.NOTION_CONTRACT_REGISTRY_ID;
    const res = await fetch(`https://api.notion.com/v1/databases/${registryId}/query`, { method:"POST", headers, body: "{}" });
    const data = await res.json();
    
    const hashData = JSON.parse(fs.readFileSync("hash_results.json", "utf8")).results;
    const gitSha = "6782bc2d9f5624e13a65932fc3a4c63d7073d3f8";
    
    for(const p of data.results) {
      let contractId = "";
      for(let k in p.properties) {
        if(k === "Contract ID") contractId = p.properties[k].rich_text.map(t=>t.plain_text).join("");
      }
      
      const hd = hashData.find(h => h.contractId === contractId);
      if(hd) {
        console.log(`Updating ${contractId} with Hash=${hd.hash} and GitSHA=${gitSha}`);
        const updatePayload = {
          properties: {
            "Hash": { rich_text: [{ text: { content: hd.hash } }] },
            "Git SHA": { rich_text: [{ text: { content: gitSha } }] },
            "Git path": { rich_text: [{ text: { content: `docs/**/${contractId}.canonical.json` } }] }
          }
        };
        const ures = await fetch(`https://api.notion.com/v1/pages/${p.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(updatePayload)
        });
        const udata = await ures.json();
        if(udata.object !== "page") console.error("Failed to update:", udata);
      }
    }
    console.log("REGISTRY_UPDATED");
  } catch(e) {
    console.error(e);
  }
}

run();
