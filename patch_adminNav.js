const fs = require('fs');
const file = 'lib/navigation/adminNav.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /id: 'projects',\s+name: 'Projekty',\s+href: '\/admin\/projects',\s+icon: FolderKanban,\s+group: 'PLATFORMA',\s+status: 'POUZE UI',\s+helpKey: 'platform\.projects\.view',\s+description: 'Přepínání projektů a správa vývojových prostředí\.',/,
  `id: 'projects',
        name: 'Projekty',
        href: '/admin/projects',
        icon: FolderKanban,
        group: 'PLATFORMA',
        status: 'ZÁKLAD',
        helpKey: 'platform.projects.view',
        description: 'Autorizovaný registr projektů, přepínání projektového kontextu a tenantová izolace.',`
);

fs.writeFileSync(file, code);
