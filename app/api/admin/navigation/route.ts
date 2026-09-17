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
