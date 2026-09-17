const fs = require('fs');

const dynamicPath = 'app/api/admin/navigation/[setId]/[[...action]]/route.ts';
let dynamicCode = fs.readFileSync(dynamicPath, 'utf8');

dynamicCode = dynamicCode.replace(
  /if \(body.pageId !== undefined\) dataToUpdate.pageId = body.pageId;/s,
  `if (body.pageId !== undefined) {
        if (body.pageId) {
          const page = await prisma.page.findUnique({ where: { id: body.pageId } });
          if (!page || page.projectId !== context.projectId) {
            return NextResponse.json({ error: 'Stránka nebyla nalezena nebo nepatří k tomuto projektu.' }, { status: 400 });
          }
        }
        dataToUpdate.pageId = body.pageId;
      }`
);

dynamicCode = dynamicCode.replace(
  /label: sanitizeLabel\(body.label\),/s,
  `label: sanitizeLabel(body.label),` // Need to insert before await prisma.navigationItem.create
);

// We need to inject the page validation in POST (Create Item) before item creation
dynamicCode = dynamicCode.replace(
  /await prisma\.navigationItem\.create\(\{/s,
  `if (body.pageId) {
        const page = await prisma.page.findUnique({ where: { id: body.pageId } });
        if (!page || page.projectId !== context.projectId) {
          return NextResponse.json({ error: 'Stránka nebyla nalezena nebo nepatří k tomuto projektu.' }, { status: 400 });
        }
      }
      await prisma.navigationItem.create({`
);

fs.writeFileSync(dynamicPath, dynamicCode);
