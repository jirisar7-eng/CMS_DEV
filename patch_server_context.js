const fs = require('fs');
const file = 'lib/domain/pages-client/server-context.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  'export interface ProjectContextResult {',
  `export interface ProjectContextResult {
  userId?: string | null;`
);

code = code.replace(
  /return { status: 'PROJECT_VALID', projectId: project\.id };/,
  `return { status: 'PROJECT_VALID', projectId: project.id, userId: user.id };`
);

fs.writeFileSync(file, code);
