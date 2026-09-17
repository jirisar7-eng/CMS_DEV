const fs = require('fs');
const file = 'scripts/bootstrap-admin.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /'content\.archive'/,
  `'content.archive',
    'navigation.view', 'navigation.create', 'navigation.edit', 'navigation.delete', 'navigation.publish'`
);

fs.writeFileSync(file, code);
