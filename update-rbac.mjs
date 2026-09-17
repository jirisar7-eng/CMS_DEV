import fs from 'fs';

let rbac = fs.readFileSync('lib/auth/rbac.ts', 'utf8');
rbac = rbac.replace(
  "| 'system.manage'",
  "| 'system.manage'\n  | 'projects.view'\n  | 'projects.manage'"
);
fs.writeFileSync('lib/auth/rbac.ts', rbac);

let bootstrap = fs.readFileSync('scripts/bootstrap-admin.ts', 'utf8');
bootstrap = bootstrap.replace(
  "'system.manage',",
  "'system.manage', 'projects.view', 'projects.manage',"
);
fs.writeFileSync('scripts/bootstrap-admin.ts', bootstrap);
