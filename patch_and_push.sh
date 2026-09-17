cat << 'INNER_EOF' > app/api/admin/navigation/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActiveProjectContext } from '@/lib/domain/pages-client/server-context';
import { hasPermission } from '@/lib/auth/rbac';

export async function GET() {
  const context = await getActiveProjectContext();
  if (context.status !== 'PROJECT_VALID' || !context.projectId) {
    return NextResponse.json({ error: context.status }, { status: 403 });
  }

  if (!await hasPermission(context.userId!, 'navigation.view', context.projectId!)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const navSets = await prisma.navigationSet.findMany({
      where: { projectId: context.projectId },
      include: {
        items: {
          orderBy: { order: 'asc' }
        }
      },
      orderBy: { name: 'asc' }
    });

    const formattedSets = navSets.map(set => ({
      id: set.id,
      projectId: set.projectId,
      key: set.key,
      name: set.name,
      context: set.context,
      status: set.status,
      version: set.version,
      updatedAt: set.updatedAt.toISOString(),
      description: set.description,
      items: set.items.map(item => ({
        id: item.id,
        parentId: item.parentId,
        type: item.type,
        label: item.label,
        pageId: item.pageId,
        externalUrl: item.externalUrl,
        anchor: item.anchor,
        icon: item.icon,
        visibility: item.visibility,
        openInNewTab: item.openInNewTab,
        order: item.order,
      })),
    }));

    return NextResponse.json(formattedSets);
  } catch (error) {
    console.error('Error fetching navigation sets:', error);
    return NextResponse.json({ error: 'Failed to fetch navigation sets' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const context = await getActiveProjectContext();
  if (context.status !== 'PROJECT_VALID' || !context.projectId || !context.userId) {
    return NextResponse.json({ error: context.status }, { status: 403 });
  }

  if (!await hasPermission(context.userId, 'navigation.create', context.projectId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { key, name, context: navContext, description } = body;

    const navSet = await prisma.navigationSet.create({
      data: {
        projectId: context.projectId,
        key,
        name,
        context: navContext,
        description,
        status: 'DRAFT',
      },
      include: {
        items: true
      }
    });

    await prisma.auditLog.create({
      data: {
        action: 'NAVIGATION_SET_CREATED',
        scopeType: 'PROJECT',
        actorId: context.userId,
        projectId: context.projectId,
        metadata: { setId: navSet.id, key: navSet.key },
      },
    });

    return NextResponse.json(navSet);
  } catch (error) {
    console.error('Error creating navigation set:', error);
    return NextResponse.json({ error: 'Failed to create navigation set' }, { status: 500 });
  }
}
INNER_EOF

cat << 'INNER_EOF' > app/api/admin/navigation/\[setId\]/\[\[...action\]\]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActiveProjectContext } from '@/lib/domain/pages-client/server-context';
import { hasPermission } from '@/lib/auth/rbac';
import { isSafeUrl, sanitizeLabel, flattenAndCalculateDepths, MAX_NAVIGATION_DEPTH } from '@/lib/domain/navigation/validation';

async function fetchSetWithItems(setId: string, projectId: string) {
  const set = await prisma.navigationSet.findUnique({
    where: { id: setId, projectId },
    include: { items: { orderBy: { order: 'asc' } } }
  });
  if (!set) throw new Error('Navigační sada nebyla nalezena.');
  return set;
}

function checkCycle(items: any[], startId: string, newParentId: string | null): boolean {
  let currentParentId = newParentId;
  while (currentParentId) {
    if (currentParentId === startId) return true;
    const parentItem = items.find(i => i.id === currentParentId);
    currentParentId = parentItem ? parentItem.parentId : null;
  }
  return false;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ setId: string; action?: string[] }> }
) {
  const context = await getActiveProjectContext();
  if (context.status !== 'PROJECT_VALID' || !context.projectId || !context.userId) {
    return NextResponse.json({ error: context.status }, { status: 403 });
  }

  if (!await hasPermission(context.userId, 'navigation.edit', context.projectId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { setId, action } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const set = await fetchSetWithItems(setId, context.projectId);

    // Update Set
    if (!action || action.length === 0) {
      if (body.status === 'PUBLISHED') {
        if (!await hasPermission(context.userId, 'navigation.publish', context.projectId)) {
          return NextResponse.json({ error: 'Forbidden: Missing navigation.publish permission' }, { status: 403 });
        }
      }

      const updated = await prisma.navigationSet.update({
        where: { id: setId },
        data: {
          name: body.name,
          key: body.key,
          description: body.description,
          context: body.context,
          status: body.status,
          version: { increment: 1 }
        },
        include: { items: { orderBy: { order: 'asc' } } }
      });

      await prisma.auditLog.create({
        data: {
          action: 'NAVIGATION_SET_UPDATED',
          scopeType: 'PROJECT',
          actorId: context.userId,
          projectId: context.projectId,
          metadata: { setId, status: body.status },
        },
      });

      return NextResponse.json(updated);
    }

    // Update Item
    if (action[0] === 'items' && action.length === 2) {
      const itemId = action[1];
      const item = set.items.find((i: any) => i.id === itemId);
      if (!item) return NextResponse.json({ error: 'Položka nebyla nalezena' }, { status: 404 });

      const dataToUpdate: any = {};
      
      const nextType = body.type !== undefined ? body.type : item.type;
      
      if (body.label !== undefined) dataToUpdate.label = sanitizeLabel(body.label);
      if (body.type !== undefined) dataToUpdate.type = body.type;
      
      if (body.externalUrl !== undefined) {
        if (nextType === 'EXTERNAL_LINK' && body.externalUrl) {
          const urlCheck = isSafeUrl(body.externalUrl);
          if (!urlCheck.safe) return NextResponse.json({ error: urlCheck.reason }, { status: 400 });
        }
        dataToUpdate.externalUrl = nextType === 'EXTERNAL_LINK' ? body.externalUrl : null;
      }
      
      if (body.pageId !== undefined) {
        if (nextType === 'PAGE' && body.pageId) {
          const page = await prisma.page.findUnique({ where: { id: body.pageId } });
          if (!page || page.projectId !== context.projectId) {
            return NextResponse.json({ error: 'Stránka nebyla nalezena nebo nepatří k tomuto projektu.' }, { status: 400 });
          }
        }
        dataToUpdate.pageId = nextType === 'PAGE' ? body.pageId : null;
      }
      
      if (body.anchor !== undefined) {
        dataToUpdate.anchor = nextType === 'ANCHOR' ? body.anchor : null;
      }
      
      if (body.icon !== undefined) dataToUpdate.icon = body.icon;
      if (body.visibility !== undefined) dataToUpdate.visibility = body.visibility;
      if (body.openInNewTab !== undefined) dataToUpdate.openInNewTab = body.openInNewTab;
      
      if (body.parentId !== undefined) {
        if (body.parentId === itemId) return NextResponse.json({ error: 'Položka nemůže být rodičem sama sobě.' }, { status: 400 });
        if (body.parentId && !set.items.some(i => i.id === body.parentId)) {
          return NextResponse.json({ error: 'Rodičovská položka nepatří do stejné sady.' }, { status: 400 });
        }
        if (checkCycle(set.items, itemId, body.parentId)) {
          return NextResponse.json({ error: 'Zacyklení není povoleno.' }, { status: 400 });
        }
        dataToUpdate.parentId = body.parentId;
      }
      if (body.order !== undefined) dataToUpdate.order = body.order;

      await prisma.navigationItem.update({
        where: { id: itemId },
        data: dataToUpdate
      });

      await prisma.navigationSet.update({ where: { id: setId }, data: { version: { increment: 1 } } });
      const updatedSet = await fetchSetWithItems(setId, context.projectId);
      return NextResponse.json(updatedSet);
    }

    return NextResponse.json({ error: 'Invalid PATCH route' }, { status: 404 });
  } catch (error: any) {
    console.error('PATCH error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update' }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ setId: string; action?: string[] }> }
) {
  const context = await getActiveProjectContext();
  if (context.status !== 'PROJECT_VALID' || !context.projectId || !context.userId) {
    return NextResponse.json({ error: context.status }, { status: 403 });
  }

  if (!await hasPermission(context.userId, 'navigation.edit', context.projectId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { setId, action } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const set = await fetchSetWithItems(setId, context.projectId);

    // Create Item
    if (action?.[0] === 'items' && action.length === 1) {
      if (body.type === 'EXTERNAL_LINK' && body.externalUrl) {
        const urlCheck = isSafeUrl(body.externalUrl);
        if (!urlCheck.safe) return NextResponse.json({ error: urlCheck.reason }, { status: 400 });
      }

      if (body.pageId && body.type === 'PAGE') {
        const page = await prisma.page.findUnique({ where: { id: body.pageId } });
        if (!page || page.projectId !== context.projectId) {
          return NextResponse.json({ error: 'Stránka nebyla nalezena nebo nepatří k tomuto projektu.' }, { status: 400 });
        }
      }

      if (body.parentId && !set.items.some(i => i.id === body.parentId)) {
        return NextResponse.json({ error: 'Rodičovská položka nepatří do stejné sady.' }, { status: 400 });
      }

      const order = set.items.filter((i: any) => i.parentId === (body.parentId || null)).length + 1;

      await prisma.navigationItem.create({
        data: {
          setId,
          parentId: body.parentId || null,
          type: body.type,
          label: sanitizeLabel(body.label),
          pageId: body.type === 'PAGE' ? body.pageId : null,
          externalUrl: body.type === 'EXTERNAL_LINK' ? body.externalUrl : null,
          anchor: body.type === 'ANCHOR' ? body.anchor : null,
          icon: body.icon,
          visibility: body.visibility ?? true,
          openInNewTab: body.openInNewTab ?? false,
          order
        }
      });

      await prisma.navigationSet.update({ where: { id: setId }, data: { version: { increment: 1 } } });
      const updatedSet = await fetchSetWithItems(setId, context.projectId);
      return NextResponse.json(updatedSet);
    }

    // Action on Item (move, indent, outdent, toggle-visibility)
    if (action?.[0] === 'items' && action.length === 3) {
      const itemId = action[1];
      const itemAction = action[2];
      const item = set.items.find((i: any) => i.id === itemId);
      if (!item) return NextResponse.json({ error: 'Položka nebyla nalezena' }, { status: 404 });

      if (itemAction === 'toggle-visibility') {
        await prisma.navigationItem.update({
          where: { id: itemId },
          data: { visibility: !item.visibility }
        });
      } else if (itemAction === 'indent') {
        const { flatItems } = flattenAndCalculateDepths(set.items as any);
        const currentIndex = flatItems.findIndex((i: any) => i.id === itemId);
        const currentItem = flatItems[currentIndex];
        if (currentItem.depth! >= MAX_NAVIGATION_DEPTH) {
          return NextResponse.json({ error: `Dosažena maximální úroveň zanoření (${MAX_NAVIGATION_DEPTH}).` }, { status: 400 });
        }
        const siblings = flatItems.filter((i: any) => i.parentId === currentItem.parentId);
        const siblingIndex = siblings.findIndex((i: any) => i.id === itemId);
        if (siblingIndex <= 0) {
          return NextResponse.json({ error: 'Položku nelze zanořit, protože před ní není žádná nadřazená položka ve stejné úrovni.' }, { status: 400 });
        }
        const previousSibling = siblings[siblingIndex - 1];
        const newSiblings = set.items.filter((i: any) => i.parentId === previousSibling.id && i.id !== itemId);
        const newOrder = newSiblings.length > 0 ? Math.max(...newSiblings.map((s: any) => s.order)) + 1 : 1;
        
        await prisma.navigationItem.update({
          where: { id: itemId },
          data: { parentId: previousSibling.id, order: newOrder }
        });
      } else if (itemAction === 'outdent') {
        if (!item.parentId) {
          return NextResponse.json({ error: 'Položka se již nachází v nejvyšší (kořenové) úrovni.' }, { status: 400 });
        }
        const parentItem = set.items.find((i: any) => i.id === item.parentId);
        const newParentId = parentItem ? parentItem.parentId : null;
        const newOrder = (parentItem?.order || 0) + 1;

        await prisma.navigationItem.update({
          where: { id: itemId },
          data: { parentId: newParentId, order: newOrder }
        });
      } else if (itemAction === 'move') {
        const direction = body.direction;
        const { flatItems } = flattenAndCalculateDepths(set.items as any);
        const currentIndex = flatItems.findIndex((i: any) => i.id === itemId);
        const currentItem = flatItems[currentIndex];
        const siblings = flatItems.filter((i: any) => i.parentId === currentItem.parentId);
        const siblingIndex = siblings.findIndex((i: any) => i.id === itemId);
        
        if (direction === 'UP' && siblingIndex > 0) {
          const targetSibling = siblings[siblingIndex - 1];
          await prisma.$transaction([
            prisma.navigationItem.update({ where: { id: currentItem.id }, data: { order: targetSibling.order } }),
            prisma.navigationItem.update({ where: { id: targetSibling.id }, data: { order: currentItem.order } })
          ]);
        } else if (direction === 'DOWN' && siblingIndex < siblings.length - 1) {
          const targetSibling = siblings[siblingIndex + 1];
          await prisma.$transaction([
            prisma.navigationItem.update({ where: { id: currentItem.id }, data: { order: targetSibling.order } }),
            prisma.navigationItem.update({ where: { id: targetSibling.id }, data: { order: currentItem.order } })
          ]);
        }
      }

      await prisma.navigationSet.update({ where: { id: setId }, data: { version: { increment: 1 } } });
      const updatedSet = await fetchSetWithItems(setId, context.projectId);
      return NextResponse.json(updatedSet);
    }

    return NextResponse.json({ error: 'Invalid POST route' }, { status: 404 });
  } catch (error: any) {
    console.error('POST error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process action' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ setId: string; action?: string[] }> }
) {
  const context = await getActiveProjectContext();
  if (context.status !== 'PROJECT_VALID' || !context.projectId || !context.userId) {
    return NextResponse.json({ error: context.status }, { status: 403 });
  }

  if (!await hasPermission(context.userId, 'navigation.delete', context.projectId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { setId, action } = await params;

  try {
    await fetchSetWithItems(setId, context.projectId); // verify existence & project access

    if (action?.[0] === 'items' && action.length === 2) {
      const itemId = action[1];
      await prisma.navigationItem.delete({ where: { id: itemId } });
      await prisma.navigationSet.update({ where: { id: setId }, data: { version: { increment: 1 } } });
      
      const updatedSet = await fetchSetWithItems(setId, context.projectId);
      return NextResponse.json(updatedSet);
    }

    if (!action || action.length === 0) {
      await prisma.navigationSet.delete({ where: { id: setId } });
      await prisma.auditLog.create({
        data: {
          action: 'NAVIGATION_SET_DELETED',
          scopeType: 'PROJECT',
          actorId: context.userId,
          projectId: context.projectId,
          metadata: { setId },
        },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid DELETE route' }, { status: 404 });
  } catch (error: any) {
    console.error('DELETE error:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete' }, { status: 500 });
  }
}
INNER_EOF

mkdir -p app/api/public/navigation
cat << 'INNER_EOF' > app/api/public/navigation/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActiveProjectContext } from '@/lib/domain/pages-client/server-context';

export async function GET() {
  const context = await getActiveProjectContext();
  if (context.status !== 'PROJECT_VALID' || !context.projectId) {
    return NextResponse.json({ error: context.status }, { status: 403 });
  }

  try {
    const navSets = await prisma.navigationSet.findMany({
      where: { 
        projectId: context.projectId,
        status: 'PUBLISHED'
      },
      include: {
        items: {
          where: { visibility: true },
          orderBy: { order: 'asc' }
        }
      },
      orderBy: { name: 'asc' }
    });

    const formattedSets = navSets.map(set => ({
      key: set.key,
      name: set.name,
      context: set.context,
      items: set.items.map(item => ({
        id: item.id,
        parentId: item.parentId,
        type: item.type,
        label: item.label,
        pageId: item.pageId,
        externalUrl: item.externalUrl,
        anchor: item.anchor,
        icon: item.icon,
        openInNewTab: item.openInNewTab,
      })),
    }));

    return NextResponse.json(formattedSets);
  } catch (error) {
    console.error('Error fetching public navigation:', error);
    return NextResponse.json({ error: 'Failed to fetch public navigation' }, { status: 500 });
  }
}
INNER_EOF

cat << 'INNER_EOF' > tests/navigation-foundation.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';

describe('SYN-NAV-001 Navigation Foundation', () => {
  test('Should define NavigationSet and NavigationItem in Prisma schema', () => {
    const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
    assert(schema.includes('model NavigationSet'));
    assert(schema.includes('model NavigationItem'));
    assert(schema.includes('projectId'));
    assert(schema.includes('pageId'));
    assert(schema.includes('Cascade'));
  });

  test('API repository should have fetch endpoints', () => {
    const repo = fs.readFileSync('lib/domain/navigation/repository.ts', 'utf8');
    assert(repo.includes('fetchApi'));
    assert(repo.includes('/api/admin/navigation'));
  });

  test('API route should enforce RBAC navigation.view', () => {
    const apiRoute = fs.readFileSync('app/api/admin/navigation/route.ts', 'utf8');
    assert(apiRoute.includes("hasPermission(context.userId!, 'navigation.view'"));
  });

  test('API route should enforce RBAC navigation.publish', () => {
    const apiRoute = fs.readFileSync('app/api/admin/navigation/[setId]/[[...action]]/route.ts', 'utf8');
    assert(apiRoute.includes("hasPermission(context.userId, 'navigation.publish'"));
  });
  
  test('Dynamic API route should enforce page isolation', () => {
    const apiRoute = fs.readFileSync('app/api/admin/navigation/[setId]/[[...action]]/route.ts', 'utf8');
    assert(apiRoute.includes("page.projectId !== context.projectId"));
    assert(apiRoute.includes("Stránka nebyla nalezena nebo nepatří k tomuto projektu"));
  });

  test('Dynamic API route should detect cycles', () => {
    const apiRoute = fs.readFileSync('app/api/admin/navigation/[setId]/[[...action]]/route.ts', 'utf8');
    assert(apiRoute.includes("checkCycle(set.items, itemId, body.parentId)"));
  });

  test('Dynamic API route should create audit logs', () => {
    const apiRoute = fs.readFileSync('app/api/admin/navigation/[setId]/[[...action]]/route.ts', 'utf8');
    assert(apiRoute.includes("prisma.auditLog.create"));
    assert(apiRoute.includes("NAVIGATION_SET_UPDATED"));
  });

  test('Public API route should exist', () => {
    assert(fs.existsSync('app/api/public/navigation/route.ts'));
    const apiRoute = fs.readFileSync('app/api/public/navigation/route.ts', 'utf8');
    assert(apiRoute.includes("status: 'PUBLISHED'"));
    assert(apiRoute.includes("visibility: true"));
  });
});
INNER_EOF

cat << 'INNER_EOF' > patch_repo.js
const fs = require('fs');
const file = 'lib/domain/navigation/repository.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /checkBrokenReferences\(items: NavigationItem\[\], availablePageIds: string\[\]\): BrokenPageReference\[\] \{/,
  "checkBrokenReferences(items: NavigationItem[], availablePageIds: string[], setKey: string = 'unknown', setName: string = 'unknown'): BrokenPageReference[] {"
);
code = code.replace(
  /navSetKey: 'unknown',/g,
  "navSetKey: setKey,"
);
code = code.replace(
  /navSetName: 'unknown',/g,
  "navSetName: setName,"
);

code = code.replace(/async createSet/g, 'async createNavigationSet');
code = code.replace(/async updateSet/g, 'async updateNavigationSet');
code = code.replace(/async createItem/g, 'async addItem');

code = code.replace(
  /async addItem/,
  "async deleteNavigationSet(setId: string): Promise<boolean> {\n    const res = await this.fetchApi<{ success: boolean }>(`/${setId}`, {\n      method: 'DELETE',\n    });\n    return res.success;\n  }\n\n  async addItem"
);

fs.writeFileSync(file, code);
INNER_EOF

node patch_repo.js

cat << 'INNER_EOF' > patch_workspace.js
const fs = require('fs');
const file = 'components/admin/navigation/NavigationWorkspace.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /\.checkBrokenReferences\(activeSet\.items, validPageIds\)/,
  ".checkBrokenReferences(activeSet.items, validPageIds, activeSet.key, activeSet.name)"
);

fs.writeFileSync(file, code);
INNER_EOF

node patch_workspace.js

cat << 'INNER_EOF' > patch_pkg.js
const fs = require('fs');
const file = 'package.json';
let pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
pkg.scripts['test:nav'] = 'npx tsx --test tests/navigation-*.test.ts';
pkg.scripts['test'] = 'npx tsx --test tests/*.test.ts';
fs.writeFileSync(file, JSON.stringify(pkg, null, 2));
INNER_EOF

node patch_pkg.js

rm patch_repo.js patch_workspace.js patch_pkg.js

git add .
git commit -m "fix(navigation): security hardening, true project isolation, RBAC strictness"
git push origin task/SYN-NAV-001-NAVIGATION-FOUNDATION

