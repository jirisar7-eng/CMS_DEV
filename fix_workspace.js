const fs = require('fs');
const content = fs.readFileSync('components/admin/composer/PageComposerWorkspace.tsx', 'utf8');
let modified = content
  .replace('pageData.draftContent || pageData.publishedContent', 'pageData.content')
  .replace('const isDraft = page.status === "DRAFT";', 'const isDraft = page.status === "Koncept";')
  .replace('const projectId = normalizeAdminProjectId(rawProjectId || "");', 'const projectId = normalizeAdminProjectId(rawProjectId || "default");')
  .replace(/headerPath:\s*\(\)\s*=>\s*\([\s\S]*?\),/, '') // remove headerPath from overrides
  .replace('overrides={{', 'headerPath={ <div className="flex items-center gap-2 px-2 text-sm text-black dark:text-white"><button onClick={() => router.push(withAdminProjectContext(`/admin/pages/${pageId}`, projectId))} className="font-medium hover:underline mr-4 opacity-70">Zpět</button><span className="font-semibold">{page.title}</span></div> }\n          overrides={{');
fs.writeFileSync('components/admin/composer/PageComposerWorkspace.tsx', modified);
