import fs from 'fs';

const pages = [
  'app/admin/pages/page.tsx',
  'app/admin/pages/[id]/page.tsx',
  'app/admin/pages/[id]/edit/page.tsx',
  'app/admin/pages/new/page.tsx'
];

for (const p of pages) {
  let content = fs.readFileSync(p, 'utf8');
  content = content.replace(
    /import \{ normalizeAdminProjectId \} from '@\/lib\/domain\/pages-client\/project-context';/g,
    "import { getActiveProjectId } from '@/lib/domain/pages-client/project-context';"
  );
  
  content = content.replace(
    /const projectId = normalizeAdminProjectId\(resolvedSearchParams\?\.projectId\);/g,
    "const projectId = await getActiveProjectId();"
  );
  fs.writeFileSync(p, content);
}
