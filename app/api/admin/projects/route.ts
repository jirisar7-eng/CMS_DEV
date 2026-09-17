import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';

export async function GET(request: Request) {
  try {
    const { session, user } = await getSession();
    if (!user || user.status !== 'ACTIVE') {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const allProjects = await prisma.project.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' }
    });

    // We must evaluate RBAC for each project individually
    // using the canonical hasPermission algorithm.
    // We check if the user has either 'admin.access' or 'projects.view'
    // for each specific project. (Global permissions will return true here too).
    const authorizedProjects = [];
    for (const project of allProjects) {
      const canAccessAdmin = await hasPermission(user.id, 'admin.access', project.id);
      const canViewProject = await hasPermission(user.id, 'projects.view', project.id);
      if (canAccessAdmin || canViewProject) {
        authorizedProjects.push(project);
      }
    }

    return NextResponse.json(authorizedProjects);
  } catch (error) {
    console.error('GET /api/admin/projects error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
