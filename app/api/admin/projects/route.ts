import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.user.status !== 'ACTIVE') {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Check if user has global project view permission
    const hasGlobalView = await hasPermission(session.user.id, 'projects.view', null);

    let projects;

    if (hasGlobalView) {
      // User can see all projects
      projects = await prisma.project.findMany({
        orderBy: { createdAt: 'desc' }
      });
    } else {
      // User can only see projects they have explicit roles in
      const userRoles = await prisma.userRole.findMany({
        where: { userId: session.user.id, projectId: { not: null } },
        select: { projectId: true }
      });
      const projectIds = Array.from(new Set(userRoles.map(ur => ur.projectId as string)));
      
      projects = await prisma.project.findMany({
        where: { id: { in: projectIds } },
        orderBy: { createdAt: 'desc' }
      });
    }

    return NextResponse.json(projects);
  } catch (error) {
    console.error('GET /api/admin/projects error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
