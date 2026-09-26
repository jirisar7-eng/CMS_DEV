import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import { validateCreateProjectInput } from '@/lib/domain/projects/validation';
import { getProjectService } from '@/lib/domain/projects/service';
import { ProjectDomainError } from '@/lib/domain/projects/types';

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

export async function POST(request: Request) {
  try {
    const { session, user } = await getSession();
    if (!user || user.status !== 'ACTIVE') {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const canManageProjects = await hasPermission(user.id, 'projects.manage', null);
    if (!canManageProjects) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const input = validateCreateProjectInput(body);
    const service = getProjectService();
    const project = await service.createProject(input, user.id);

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    if (error instanceof ProjectDomainError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('POST /api/admin/projects error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
