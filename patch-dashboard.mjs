import fs from 'fs';

let content = fs.readFileSync('components/admin/AdminDashboard.tsx', 'utf8');

content = content.replace(
  "import { useSearchParams } from 'next/navigation';",
  "import { useSearchParams } from 'next/navigation';\nimport { useActiveProject } from '@/lib/domain/pages-client/useProject';"
);

content = content.replace(
  "const searchParams = useSearchParams();",
  "// const searchParams = useSearchParams();"
);

content = content.replace(
  "const rawProjectId = searchParams.get('projectId');",
  "// const rawProjectId = searchParams.get('projectId');"
);

content = content.replace(
  "const projectId = normalizeAdminProjectId(rawProjectId);",
  "const projectId = useActiveProject();"
);

fs.writeFileSync('components/admin/AdminDashboard.tsx', content);
