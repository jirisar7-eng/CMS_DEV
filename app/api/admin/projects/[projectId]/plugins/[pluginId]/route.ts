import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/rbac';
import { getSession } from '@/lib/auth/session';
import { getActiveProjectContext } from '@/lib/domain/pages-client/server-context';
import { pluginLifecycleService, PluginServiceError } from '@/lib/domain/plugin/service';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ projectId: string; pluginId: string }> }
) {
  try {
    const params = await context.params;
    const { projectId, pluginId } = params;

    const projectContext = await getActiveProjectContext(projectId);
    if (projectContext.status !== 'PROJECT_VALID' || !projectContext.projectId) {
      const status = projectContext.status === 'PROJECT_NOT_FOUND' ? 404 : 403;
      return NextResponse.json({ error: projectContext.status }, { status });
    }

    await requirePermission('plugin.manage', projectContext.projectId);

    const { user } = await getSession();
    const actorId = user?.id;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
    }

    const { action, config, cascade } = body || {};

    if (!action || !['ENABLE', 'DISABLE', 'CONFIGURE'].includes(action)) {
      return NextResponse.json(
        { error: 'INVALID_ACTION', message: 'Action must be ENABLE, DISABLE, or CONFIGURE.' },
        { status: 400 }
      );
    }

    let resultState;
    if (action === 'ENABLE') {
      resultState = await pluginLifecycleService.enablePlugin(
        projectContext.projectId,
        pluginId,
        actorId,
        config
      );
    } else if (action === 'DISABLE') {
      resultState = await pluginLifecycleService.disablePlugin(
        projectContext.projectId,
        pluginId,
        actorId,
        { cascade: cascade === true }
      );
    } else if (action === 'CONFIGURE') {
      resultState = await pluginLifecycleService.configurePlugin(
        projectContext.projectId,
        pluginId,
        config || {},
        actorId
      );
    }

    return NextResponse.json({ state: resultState });
  } catch (err: any) {
    if (err instanceof PluginServiceError) {
      return NextResponse.json(
        { error: err.code, message: err.message, details: err.details },
        { status: err.status }
      );
    }
    if (err.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    if (err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 403 });
    }
    return NextResponse.json({ error: 'INTERNAL_SERVER_ERROR', message: err.message }, { status: 500 });
  }
}
