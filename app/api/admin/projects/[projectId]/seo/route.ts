import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> } | { params: { projectId: string } }
) {
  try {
    const params = await context.params;
    const { projectId } = params;
    await requirePermission('seo.read', projectId);

    const seoSettings = await prisma.projectSeoSettings.findUnique({
      where: { projectId },
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
  context: { params: Promise<{ projectId: string }> } | { params: { projectId: string } }
) {
  try {
    const params = await context.params;
    const { projectId } = params;
    await requirePermission('seo.manage_defaults', projectId);

    const data = await req.json();
    
    const seoSettings = await prisma.projectSeoSettings.upsert({
      where: { projectId },
      update: {
        defaultTitle: data.defaultTitle,
        titleTemplate: data.titleTemplate,
        defaultDescription: data.defaultDescription,
        defaultOgImage: data.defaultOgImage,
        robotsTxt: data.robotsTxt,
      },
      create: {
        projectId,
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
