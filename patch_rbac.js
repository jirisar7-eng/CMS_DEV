const fs = require('fs');

const rbacPath = 'lib/auth/rbac.ts';
let rbacCode = fs.readFileSync(rbacPath, 'utf8');

rbacCode = rbacCode.replace(
  /\| 'content\.archive';/,
  `| 'content.archive'
  | 'navigation.view'
  | 'navigation.create'
  | 'navigation.edit'
  | 'navigation.delete'
  | 'navigation.publish';`
);

fs.writeFileSync(rbacPath, rbacCode);
