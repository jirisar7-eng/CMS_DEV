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
