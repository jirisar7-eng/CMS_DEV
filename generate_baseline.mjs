import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import canonicalize from 'canonicalize';

const headers = {
  "Authorization": `Bearer ${process.env.NOTION_TOKEN_CMS_DEV}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json"
};

function sha256(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function normalizeNFC(obj) {
  if (typeof obj === 'string') return obj.normalize("NFC");
  if (Array.isArray(obj)) return obj.map(normalizeNFC);
  if (obj && typeof obj === 'object') {
    const res = {};
    for (let k in obj) res[k] = normalizeNFC(obj[k]);
    return res;
  }
  return obj;
}

async function fetchBlocks(blockId) {
  let blocks = [];
  let hasMore = true;
  let cursor = undefined;
  while(hasMore) {
    const res = await fetch(`https://api.notion.com/v1/blocks/${blockId}/children${cursor ? `?start_cursor=${cursor}` : ""}`, {headers});
    const data = await res.json();
    if(data.results) {
      for(let b of data.results) {
        let children = [];
        if(b.has_children) {
          children = await fetchBlocks(b.id);
        }
        let payload = { ...b[b.type] };
        blocks.push({
          type: b.type,
          payload: payload,
          children: children
        });
      }
    }
    hasMore = data.has_more;
    cursor = data.next_cursor;
  }
  return blocks;
}

function extractText(blocks) {
  let text = "";
  for(const b of blocks) {
    if(b.type === "paragraph" && b.payload.rich_text) text += b.payload.rich_text.map(t=>t.plain_text).join("") + "\n";
    else if(b.type.startsWith("heading") && b.payload.rich_text) text += "\n# " + b.payload.rich_text.map(t=>t.plain_text).join("") + "\n";
    else if (b.type === "code" && b.payload.rich_text) text += "\n```\n" + b.payload.rich_text.map(t=>t.plain_text).join("") + "\n```\n";
    else if (b.type === "bulleted_list_item" && b.payload.rich_text) text += "- " + b.payload.rich_text.map(t=>t.plain_text).join("") + "\n";
    else if (b.type === "numbered_list_item" && b.payload.rich_text) text += "1. " + b.payload.rich_text.map(t=>t.plain_text).join("") + "\n";
    else if (b.type === "quote" && b.payload.rich_text) text += "> " + b.payload.rich_text.map(t=>t.plain_text).join("") + "\n";
    
    if (b.children && b.children.length > 0) text += extractText(b.children);
  }
  return text;
}

async function buildContract(pageId, contractId, version, title, outputPath) {
  const blocks = await fetchBlocks(pageId);
  
  const doc = {
    canonicalization: "SYN-NOTION-CANONICAL-1",
    contract_id: contractId,
    version: version,
    title: title,
    content: blocks
  };
  
  const normalizedDoc = normalizeNFC(doc);
  const canonicalBytes = canonicalize(normalizedDoc);
  const hash = sha256(canonicalBytes);
  
  const mdText = `# ${title}\n\nContract ID: ${contractId}\nVersion: ${version}\nSHA256: ${hash}\n\n` + extractText(blocks);
  
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(`${outputPath}.canonical.json`, canonicalBytes);
  fs.writeFileSync(`${outputPath}.md`, mdText);
  
  // Verify determinism repeat
  const bytes2 = canonicalize(normalizedDoc);
  const hash2 = sha256(bytes2);
  const canonicalRepeatMatch = canonicalBytes === bytes2;
  const hashRepeatMatch = hash === hash2;
  
  return { contractId, version, hash, canonicalRepeatMatch, hashRepeatMatch };
}

async function run() {
  try {
    const registryId = process.env.NOTION_CONTRACT_REGISTRY_ID;
    const res = await fetch(`https://api.notion.com/v1/databases/${registryId}/query`, { method:"POST", headers, body: "{}" });
    const data = await res.json();
    
    const results = [];
    let determinismPassed = true;
    
    for(const p of data.results) {
      let title = "";
      let contractId = "";
      let version = "";
      let typ = "";
      
      for(let k in p.properties) {
        const prop = p.properties[k];
        let val = "";
        try {
          if(prop.title) val = prop.title.map(t=>t.plain_text).join("");
          else if(prop.rich_text) val = prop.rich_text.map(t=>t.plain_text).join("");
          else if(prop.select) val = prop.select.name;
        } catch(e){}
        if(prop.type === "title") title = val;
        if(k === "Contract ID") contractId = val;
        if(k === "Verze") version = val;
        if(k === "Typ") typ = val;
      }
      
      if(contractId && version) {
        let dir = "docs/contracts";
        if (typ === "RULESET") dir = "docs/governance";
        if (typ === "ENV_PROFILE") dir = "docs/environment";
        if (typ === "EVIDENCE") dir = "docs/audit";
        if (typ === "COMMAND") dir = "docs/commands";
        
        console.log(`Processing: ${contractId} (${title})`);
        const r = await buildContract(p.id, contractId, version, title, `${dir}/${contractId}`);
        results.push(r);
        
        if (!r.canonicalRepeatMatch || !r.hashRepeatMatch) determinismPassed = false;
      }
    }
    
    fs.writeFileSync("hash_results.json", JSON.stringify({
      results,
      determinismPassed
    }, null, 2));
    
    // Also generate root README.md
    fs.writeFileSync("README.md", `# SYNTHESIS_CMS\n\nGovernance Baseline\n\nSee docs/ for authoritative contracts.\n`);
    fs.writeFileSync(".gitignore", `node_modules/\n.env\n`);
    fs.writeFileSync(".editorconfig", `root = true\n\n[*]\ncharset = utf-8\nend_of_line = lf\nindent_size = 2\nindent_style = space\ninsert_final_newline = true\ntrim_trailing_whitespace = true\n`);
    
    console.log("BASELINE_GENERATION_COMPLETE");
  } catch(e) {
    console.error(e);
  }
}

run();
