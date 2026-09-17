import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { formatPublicNavigation } from '@/lib/domain/navigation/validation';
import { resolvePublicProjectContext } from '@/lib/domain/navigation/public-context';

export async function GET(req: Request) {
  try {
    const projectId = await resolvePublicProjectContext(req);
    if (!projectId) {
      return NextResponse.json({ error: 'PROJECT_NOT_FOUND' }, { status: 404 });
    }

    const navSets = await prisma.navigationSet.findMany({
      where: { 
        projectId,
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

    const result = formatPublicNavigation(navSets);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching public navigation:', error);
    return NextResponse.json({ error: 'Failed to fetch public navigation' }, { status: 500 });
  }
}
