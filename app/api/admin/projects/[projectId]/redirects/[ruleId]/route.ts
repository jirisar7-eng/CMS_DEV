import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/rbac';
import { RedirectService } from '@/lib/domain/redirects/service';
import { RedirectType } from '@prisma/client';
import { getActiveProjectContext } from '@/lib/domain/pages-client/server-context';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ projectId: string; ruleId: string }> }
) {
  try {
    const params = await context.params;
    const { projectId, ruleId } = params;

    if (!ruleId || typeof ruleId !== 'string') {
      return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
    }

    const projectContext = await getActiveProjectContext(projectId);
    if (projectContext.status !== 'PROJECT_VALID' || !projectContext.projectId) {
      const status = projectContext.status === 'PROJECT_NOT_FOUND' ? 404 : 403;
      return NextResponse.json({ error: projectContext.status }, { status });
    }

    await requirePermission('redirects.update', projectContext.projectId);

    let data: any;
    try {
      data = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
    }

    if (!data || typeof data !== 'object') {
      return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
    }

    if (data.sourcePath !== undefined && (typeof data.sourcePath !== 'string' || data.sourcePath.trim() === '')) {
      return NextResponse.json({ error: 'INVALID_PATH' }, { status: 400 });
    }

    if (data.targetPath !== undefined && (typeof data.targetPath !== 'string' || data.targetPath.trim() === '')) {
      return NextResponse.json({ error: 'INVALID_PATH' }, { status: 400 });
    }

    if (data.type !== undefined && data.type !== 'MOVED_PERMANENTLY' && data.type !== 'FOUND') {
      return NextResponse.json({ error: 'INVALID_REDIRECT_TYPE' }, { status: 400 });
    }

    if (data.active !== undefined && typeof data.active !== 'boolean') {
      return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
    }

    if (data.priority !== undefined && (typeof data.priority !== 'number' || !Number.isInteger(data.priority))) {
      return NextResponse.json({ error: 'INVALID_PRIORITY' }, { status: 400 });
    }

    const updated = await RedirectService.updateRedirect(
      projectContext.projectId,
      ruleId,
      {
        sourcePath: data.sourcePath,
        targetPath: data.targetPath,
        type: data.type as RedirectType,
        active: data.active,
        priority: data.priority,
      }
    );

    return NextResponse.json(updated);
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED' || err.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: err.message }, { status: err.message === 'UNAUTHENTICATED' ? 401 : 403 });
    }
    if (err.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    if (
      err.message === 'RESERVED_ROUTE' ||
      err.message === 'EXTERNAL_TARGET_NOT_ALLOWED' ||
      err.message === 'SELF_REDIRECT' ||
      err.message === 'CYCLE_DETECTED' ||
      err.message === 'INVALID_PATH' ||
      err.message === 'INVALID_REDIRECT_TYPE' ||
      err.message === 'INVALID_PRIORITY' ||
      err.message === 'INVALID_INPUT' ||
      err.message === 'DUPLICATE_SOURCE_PATH'
    ) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ projectId: string; ruleId: string }> }
) {
  try {
    const params = await context.params;
    const { projectId, ruleId } = params;

    if (!ruleId || typeof ruleId !== 'string') {
      return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
    }

    const projectContext = await getActiveProjectContext(projectId);
    if (projectContext.status !== 'PROJECT_VALID' || !projectContext.projectId) {
      const status = projectContext.status === 'PROJECT_NOT_FOUND' ? 404 : 403;
      return NextResponse.json({ error: projectContext.status }, { status });
    }

    await requirePermission('redirects.delete', projectContext.projectId);

    const result = await RedirectService.deleteRedirect(projectContext.projectId, ruleId);

    return NextResponse.json(result);
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED' || err.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: err.message }, { status: err.message === 'UNAUTHENTICATED' ? 401 : 403 });
    }
    if (err.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    if (err.message === 'INVALID_INPUT') {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
