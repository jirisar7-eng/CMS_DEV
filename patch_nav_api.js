const fs = require('fs');

const routePath = 'app/api/admin/navigation/route.ts';
let routeCode = fs.readFileSync(routePath, 'utf8');
routeCode = routeCode.replace("import { getActiveProjectContext } from '@/lib/domain/pages-client/server-context';", "import { getActiveProjectContext } from '@/lib/domain/pages-client/server-context';\nimport { hasPermission } from '@/lib/auth/rbac';");
routeCode = routeCode.replace(
  "return NextResponse.json({ error: context.status }, { status: 403 });",
  "return NextResponse.json({ error: context.status }, { status: 403 });\n  }\n  if (!await hasPermission(context.userId!, 'navigation.view', context.projectId!)) {\n    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });"
);
routeCode = routeCode.replace(
  "export async function POST(req: Request) {",
  `export async function POST(req: Request) {`
);
// I need to patch the POST method too
routeCode = routeCode.replace(
  /export async function POST.*?return NextResponse.json\(\{ error: context.status \}, \{ status: 403 \}\);\s+\}/s,
  `export async function POST(req: Request) {
  const context = await getActiveProjectContext();
  if (context.status !== 'PROJECT_VALID' || !context.projectId || !context.userId) {
    return NextResponse.json({ error: context.status }, { status: 403 });
  }
  if (!await hasPermission(context.userId, 'navigation.create', context.projectId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }`
);
fs.writeFileSync(routePath, routeCode);

const dynamicPath = 'app/api/admin/navigation/[setId]/[[...action]]/route.ts';
let dynamicCode = fs.readFileSync(dynamicPath, 'utf8');
dynamicCode = dynamicCode.replace("import { getActiveProjectContext } from '@/lib/domain/pages-client/server-context';", "import { getActiveProjectContext } from '@/lib/domain/pages-client/server-context';\nimport { hasPermission } from '@/lib/auth/rbac';");

dynamicCode = dynamicCode.replace(
  /export async function PATCH.*?return NextResponse.json\(\{ error: context.status \}, \{ status: 403 \}\);\s+\}/s,
  `export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ setId: string; action?: string[] }> }
) {
  const context = await getActiveProjectContext();
  if (context.status !== 'PROJECT_VALID' || !context.projectId || !context.userId) {
    return NextResponse.json({ error: context.status }, { status: 403 });
  }
  if (!await hasPermission(context.userId, 'navigation.edit', context.projectId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }`
);

dynamicCode = dynamicCode.replace(
  /export async function POST.*?return NextResponse.json\(\{ error: context.status \}, \{ status: 403 \}\);\s+\}/s,
  `export async function POST(
  req: Request,
  { params }: { params: Promise<{ setId: string; action?: string[] }> }
) {
  const context = await getActiveProjectContext();
  if (context.status !== 'PROJECT_VALID' || !context.projectId || !context.userId) {
    return NextResponse.json({ error: context.status }, { status: 403 });
  }
  if (!await hasPermission(context.userId, 'navigation.edit', context.projectId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }`
);

dynamicCode = dynamicCode.replace(
  /export async function DELETE.*?return NextResponse.json\(\{ error: context.status \}, \{ status: 403 \}\);\s+\}/s,
  `export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ setId: string; action?: string[] }> }
) {
  const context = await getActiveProjectContext();
  if (context.status !== 'PROJECT_VALID' || !context.projectId || !context.userId) {
    return NextResponse.json({ error: context.status }, { status: 403 });
  }
  if (!await hasPermission(context.userId, 'navigation.delete', context.projectId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }`
);

fs.writeFileSync(dynamicPath, dynamicCode);
