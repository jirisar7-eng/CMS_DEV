const fs = require('fs');
const file = 'lib/navigation/adminNav.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /id: 'navigation',\s+name: 'Navigace',\s+href: '\/admin\/navigation',\s+icon: Compass,\s+group: 'OBSAH',\s+status: 'POUZE UI',/,
  `id: 'navigation',
        name: 'Navigace',
        href: '/admin/navigation',
        icon: Compass,
        group: 'OBSAH',
        status: 'ZÁKLAD',`
);

fs.writeFileSync(file, code);
