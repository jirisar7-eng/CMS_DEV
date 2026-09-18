import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import { getActiveProjectContext } from '@/lib/domain/pages-client/server-context';
import { BrokenLinkValidator } from '@/lib/domain/routing/broken-links';

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

    const { user } = await getSession();
    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }

    // Fail-closed RBAC reusing existing suitable read permissions: redirects.read or seo.read
    const canReadRedirects = await hasPermission(user.id, 'redirects.read', projectContext.projectId);
    const canReadSeo = await hasPermission(user.id, 'seo.read', projectContext.projectId);

    if (!canReadRedirects && !canReadSeo) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 403 });
    }

    // Run broken-link validation strictly for this project
    const findings = await BrokenLinkValidator.validateProject(projectContext.projectId);

    return NextResponse.json({
      projectId: projectContext.projectId,
      findings,
      total: findings.length,
    });
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED' || err.message === 'UNAUTHENTICATED') {
      return NextResponse.json(
        { error: err.message },
        { status: err.message === 'UNAUTHENTICATED' ? 401 : 403 }
      );
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
