import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { getActiveProjectContext } from '@/lib/domain/pages-client/server-context';
import { SeoService } from '@/lib/domain/seo/service';

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

    await requirePermission('seo.read', projectContext.projectId);

    const seoSettings = await prisma.projectSeoSettings.findUnique({
      where: { projectId: projectContext.projectId },
    });

    return NextResponse.json(seoSettings || {});
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED' || err.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: err.message }, { status: err.message === 'UNAUTHENTICATED' ? 401 : 403 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(
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

    await requirePermission('seo.manage_defaults', projectContext.projectId);

    let data: any;
    try {
      data = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
    }

    if (!data || typeof data !== 'object') {
      return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
    }

    if (data.canonicalUrl) {
      try {
        SeoService.validateCanonicalUrl(data.canonicalUrl);
      } catch (e: any) {
        return NextResponse.json({ error: e.message || 'INVALID_CANONICAL_URL' }, { status: 400 });
      }
    }

    const seoSettings = await prisma.projectSeoSettings.upsert({
      where: { projectId: projectContext.projectId },
      update: {
        defaultTitle: data.defaultTitle,
        titleTemplate: data.titleTemplate,
        defaultDescription: data.defaultDescription,
        defaultOgImage: data.defaultOgImage,
        robotsTxt: data.robotsTxt,
      },
      create: {
        projectId: projectContext.projectId,
        defaultTitle: data.defaultTitle,
        titleTemplate: data.titleTemplate,
        defaultDescription: data.defaultDescription,
        defaultOgImage: data.defaultOgImage,
        robotsTxt: data.robotsTxt,
      },
    });

    return NextResponse.json(seoSettings);
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED' || err.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: err.message }, { status: err.message === 'UNAUTHENTICATED' ? 401 : 403 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
