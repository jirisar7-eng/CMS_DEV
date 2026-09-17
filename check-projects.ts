import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const models = ['userRole', 'userPermissionOverride', 'mediaAsset', 'brand', 'page', 'contentRelease'];
  const allProjectIds = new Set<string>();
  for (const m of models) {
    const records = await (prisma as any)[m].findMany({
      select: { projectId: true },
      distinct: ['projectId']
    });
    for (const r of records) {
      if (r.projectId) allProjectIds.add(r.projectId);
    }
  }
  console.log("Found project IDs:", Array.from(allProjectIds));
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
