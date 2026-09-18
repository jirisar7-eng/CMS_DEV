import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { RedirectService } from '@/lib/domain/redirects/service';
import { RedirectType } from '@prisma/client';
import { getSession } from '@/lib/auth/session';
import { getActiveProjectContext } from '@/lib/domain/pages-client/server-context';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const params = await context.params;
    const { projectId } = params;

    const projectContext = await getActiveProjectContext(projectId);
    if (projectContext.status !== 'PROJECT_VALID' || !projectContext.projectId) {
      const status = projectContext.status === 'PROJECT_NOT_FOUND' ? 404 : 403;
      return NextResponse.json({ error: projectContext.status }, { status });
    }

    await requirePermission('redirects.read', projectContext.projectId);

    const rules = await prisma.redirectRule.findMany({
      where: { projectId: projectContext.projectId },
      orderBy: { priority: 'desc' },
    });

    return NextResponse.json(rules);
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED' || err.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: err.message }, { status: err.message === 'UNAUTHENTICATED' ? 401 : 403 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const params = await context.params;
    const { projectId } = params;

    const projectContext = await getActiveProjectContext(projectId);
    if (projectContext.status !== 'PROJECT_VALID' || !projectContext.projectId) {
      const status = projectContext.status === 'PROJECT_NOT_FOUND' ? 404 : 403;
      return NextResponse.json({ error: projectContext.status }, { status });
    }

    await requirePermission('redirects.create', projectContext.projectId);

    const { user } = await getSession();
    let data: any;
    try {
      data = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
    }

    if (!data || typeof data !== 'object') {
      return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
    }

    if (!data.sourcePath || typeof data.sourcePath !== 'string') {
      return NextResponse.json({ error: 'INVALID_PATH' }, { status: 400 });
    }

    if (!data.targetPath || typeof data.targetPath !== 'string') {
      return NextResponse.json({ error: 'INVALID_PATH' }, { status: 400 });
    }

    if (data.type !== 'MOVED_PERMANENTLY' && data.type !== 'FOUND') {
      return NextResponse.json({ error: 'INVALID_REDIRECT_TYPE' }, { status: 400 });
    }

    const priority = data.priority !== undefined ? data.priority : 0;
    if (typeof priority !== 'number' || !Number.isInteger(priority)) {
      return NextResponse.json({ error: 'INVALID_PRIORITY' }, { status: 400 });
    }

    const rule = await RedirectService.createRedirect(
      projectContext.projectId,
      data.sourcePath,
      data.targetPath,
      data.type as RedirectType,
      priority,
      user?.id
    );

    return NextResponse.json(rule, { status: 201 });
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED' || err.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: err.message }, { status: err.message === 'UNAUTHENTICATED' ? 401 : 403 });
    }
    if (
      err.message === 'RESERVED_ROUTE' ||
      err.message === 'EXTERNAL_TARGET_NOT_ALLOWED' ||
      err.message === 'SELF_REDIRECT' ||
      err.message === 'CYCLE_DETECTED' ||
      err.message === 'INVALID_PATH' ||
      err.message === 'INVALID_REDIRECT_TYPE' ||
      err.message === 'INVALID_PRIORITY' ||
      err.message === 'INVALID_INPUT'
    ) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
