import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { RedirectService } from '@/lib/domain/redirects/service';
import { RedirectType } from '@prisma/client';
import { getSession } from '@/lib/auth/session';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> } | { params: { projectId: string } }
) {
  try {
    const params = await context.params;
    const { projectId } = params;
    await requirePermission('redirects.read', projectId);

    const rules = await prisma.redirectRule.findMany({
      where: { projectId },
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
  context: { params: Promise<{ projectId: string }> } | { params: { projectId: string } }
) {
  try {
    const params = await context.params;
    const { projectId } = params;
    await requirePermission('redirects.create', projectId);

    const { user } = await getSession();
    const data = await req.json();

    const rule = await RedirectService.createRedirect(
      projectId,
      data.sourcePath,
      data.targetPath,
      data.type as RedirectType,
      data.priority || 0,
      user?.id
    );

    return NextResponse.json(rule, { status: 201 });
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED' || err.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: err.message }, { status: err.message === 'UNAUTHENTICATED' ? 401 : 403 });
    }
    if (err.message === 'RESERVED_ROUTE' || err.message === 'EXTERNAL_TARGET_NOT_ALLOWED' || err.message === 'SELF_REDIRECT') {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
