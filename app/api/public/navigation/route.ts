import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { normalizeAdminProjectId } from '@/lib/domain/pages-client/project-context';
import { formatPublicNavigation } from '@/lib/domain/navigation/validation';
import { cookies } from 'next/headers';

/**
 * Resolves a safe public project context without requiring admin session/RBAC.
 */
async function resolvePublicProjectContext(req?: Request): Promise<string | null> {
  let requestedProject: string | null = null;
  
  if (req) {
    try {
      const url = new URL(req.url);
      requestedProject = normalizeAdminProjectId(
        url.searchParams.get('projectId') || 
        url.searchParams.get('project') || 
        url.searchParams.get('siteId')
      );
      if (!requestedProject) {
        requestedProject = normalizeAdminProjectId(req.headers.get('x-project-id'));
      }
    } catch {
      // safe fallback
    }
  }

  if (!requestedProject) {
    try {
      const cookieStore = await cookies();
      requestedProject = normalizeAdminProjectId(cookieStore.get('syn_project_id')?.value);
    } catch {
      // outside cookie context
    }
  }

  if (requestedProject) {
    const project = await prisma.project.findFirst({
      where: {
        OR: [
          { id: requestedProject },
          { key: requestedProject }
        ],
        status: 'ACTIVE'
      },
      select: { id: true }
    });
    return project?.id || null;
  }

  // Safe fallback to first active project if not explicitly scoped
  const defaultProject = await prisma.project.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true }
  });

  return defaultProject?.id || null;
}

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
