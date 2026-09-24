import { logAudit } from "@/lib/auth/audit";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActiveProjectContext } from "@/lib/domain/pages-client/server-context";
import { hasPermission } from "@/lib/auth/rbac";

export async function GET() {
  const context = await getActiveProjectContext();
  if (context.status !== "PROJECT_VALID" || !context.projectId || !context.userId) {
    return NextResponse.json({ error: context.status }, { status: 403 });
  }
  const projectId = context.projectId;
  const userId = context.userId;

  if (!await hasPermission(userId, "navigation.view", projectId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const navSets = await prisma.navigationSet.findMany({
      where: { projectId },
      include: {
        items: {
          orderBy: { order: "asc" }
        }
      },
      orderBy: { name: "asc" }
    });

    const formattedSets = navSets.map((set: any) => ({
      id: set.id,
      projectId: set.projectId,
      key: set.key,
      name: set.name,
      context: set.context,
      status: set.status,
      version: set.version,
      publishedVersion: set.publishedVersion,
      publishedAt: set.publishedAt ? set.publishedAt.toISOString() : null,
      updatedAt: set.updatedAt ? set.updatedAt.toISOString() : new Date().toISOString(),
      description: set.description,
      items: (set.items || []).map((item: any) => ({
        id: item.id,
        parentId: item.parentId,
        type: item.type,
        label: item.label,
        pageId: item.pageId,
        externalUrl: item.externalUrl,
        anchor: item.anchor,
        icon: item.icon,
        visibility: item.visibility,
        openInNewTab: item.openInNewTab,
        order: item.order,
      })),
    }));

    return NextResponse.json(formattedSets);
  } catch (error) {
    console.error("Error fetching navigation sets:", error);
    return NextResponse.json({ error: "Failed to fetch navigation sets" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const context = await getActiveProjectContext();
  if (context.status !== "PROJECT_VALID" || !context.projectId || !context.userId) {
    return NextResponse.json({ error: context.status }, { status: 403 });
  }
  const projectId = context.projectId;
  const userId = context.userId;

  if (!await hasPermission(userId, "navigation.create", projectId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { key, name, context: navContext, description } = body;

    const navSet = await prisma.navigationSet.create({
      data: {
        projectId,
        key: String(key).trim(),
        name: String(name).trim(),
        context: navContext,
        description: description ? String(description).trim() : null,
        status: "DRAFT",
        version: 1,
      },
      include: {
        items: true
      }
    });

    await logAudit({
      action: "NAVIGATION_SET_CREATED",
      scopeType: "PROJECT",
      scopeId: projectId,
      actorId: userId,
      metadata: { setId: navSet.id, name: navSet.name, key: navSet.key },
    });

    return NextResponse.json({
      id: navSet.id,
      projectId: navSet.projectId,
      key: navSet.key,
      name: navSet.name,
      context: navSet.context,
      description: navSet.description,
      status: navSet.status,
      version: navSet.version,
      publishedVersion: navSet.publishedVersion,
      publishedAt: navSet.publishedAt ? navSet.publishedAt.toISOString() : null,
      updatedAt: navSet.updatedAt.toISOString(),
      items: [],
    });
  } catch (error) {
    console.error("Error creating navigation set:", error);
    return NextResponse.json({ error: "Failed to create navigation set" }, { status: 500 });
  }
}
