import fs from 'fs';

let content = fs.readFileSync('components/admin/AdminShell.tsx', 'utf8');

content = content.replace(
  'import { LogoutButton } from \'./auth/LogoutButton\';',
  'import { LogoutButton } from \'./auth/LogoutButton\';\nimport { ProjectSelector } from \'./ProjectSelector\';'
);

content = content.replace(
  '        {/* Quick capability filter in sidebar */}',
  '        <div className="px-4 py-3 border-b shrink-0">\n          <ProjectSelector />\n        </div>\n\n        {/* Quick capability filter in sidebar */}'
);

fs.writeFileSync('components/admin/AdminShell.tsx', content);
