const fs = require('fs');
let content = fs.readFileSync('components/admin/composer/PageComposerWorkspace.tsx', 'utf8');
content = content.replace(
  'const client = createAdminPagesClient(projectId);',
  'const client = createAdminPagesClient(projectId || "default");'
);
content = content.replace(
  /headerPath=\{[\s\S]*?\}\n/,
  'headerPath={page.title}\n'
);
fs.writeFileSync('components/admin/composer/PageComposerWorkspace.tsx', content);

let pageContent = fs.readFileSync('app/admin/pages/[id]/edit/page.tsx', 'utf8');
pageContent = pageContent.replace(
  'const projectId = (await getActiveProjectId()) || undefined;',
  'const projectId = (await getActiveProjectId()) || undefined;'
); // wait, in page.tsx: Type 'string | null' is not assignable to type 'string | undefined'.
pageContent = pageContent.replace(
  'const projectId = (await getActiveProjectId()) || undefined;',
  'const p = await getActiveProjectId(); const projectId = p === null ? undefined : p;'
);
fs.writeFileSync('app/admin/pages/[id]/edit/page.tsx', pageContent);
