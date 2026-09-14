const headers = { "Authorization": `Bearer ${process.env.NOTION_TOKEN_CMS_DEV}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" };

async function run() {
  const dbId = process.env.NOTION_CONTRACT_REGISTRY_ID;
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, { method:"POST", headers, body: "{}" });
  const data = await res.json();
  
  for(const p of data.results) {
    let name = "";
    let hash = "";
    let gitSha = "";
    let status = "";
    let type = "";
    for(let k in p.properties) {
      const prop = p.properties[k];
      let val = "";
      try {
        if(prop.title) val = prop.title.map(t=>t.plain_text).join("");
        else if(prop.rich_text) val = prop.rich_text.map(t=>t.plain_text).join("");
        else if(prop.select) val = prop.select.name;
      } catch(e){}
      if(prop.type==="title") name = val;
      if(k === "Hash") hash = val;
      if(k === "Git SHA") gitSha = val;
      if(k === "Stav") status = val;
      if(k === "Typ") type = val;
    }
    console.log(`CONTRACT: ${name} | TYPE: ${type} | STATUS: ${status} | HASH: ${hash} | GIT_SHA: ${gitSha}`);
  }
}
run();
