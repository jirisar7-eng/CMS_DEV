import { logAudit } from "@/lib/auth/audit";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActiveProjectContext } from "@/lib/domain/pages-client/server-context";
import { hasPermission } from "@/lib/auth/rbac";
import { isSafeUrl, sanitizeLabel, flattenAndCalculateDepths, MAX_NAVIGATION_DEPTH } from "@/lib/domain/navigation/validation";
import { buildPublishedNavigationSnapshot } from "@/lib/domain/navigation/snapshot";

async function fetchSetWithItems(setId: string, projectId: string, db: any = prisma) {
  const set = await db.navigationSet.findUnique({
    where: { id: setId, projectId },
    include: { items: { orderBy: { order: "asc" } } }
  });
  if (!set) throw new Error("Navigační sada nebyla nalezena.");
  return set;
}

function formatSetResponse(set: any) {
  return {
    id: set.id,
    projectId: set.projectId,
    key: set.key,
    name: set.name,
    context: set.context,
    description: set.description,
    status: set.status,
    version: set.version,
    publishedVersion: set.publishedVersion,
    publishedAt: set.publishedAt ? (set.publishedAt instanceof Date ? set.publishedAt.toISOString() : set.publishedAt) : null,
    updatedAt: set.updatedAt ? (set.updatedAt instanceof Date ? set.updatedAt.toISOString() : set.updatedAt) : new Date().toISOString(),
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
  };
}

function checkCycle(items: any[], startId: string, newParentId: string | null): boolean {
  let currentParentId = newParentId;
  while (currentParentId) {
    if (currentParentId === startId) return true;
    const parentItem = items.find(i => i.id === currentParentId);
    currentParentId = parentItem ? parentItem.parentId : null;
  }
  return false;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ setId: string; action?: string[] }> }
) {
  const context = await getActiveProjectContext();
  if (context.status !== "PROJECT_VALID" || !context.projectId || !context.userId) {
    return NextResponse.json({ error: context.status }, { status: 403 });
  }
  if (!await hasPermission(context.userId, "navigation.edit", context.projectId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { setId, action } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const set = await fetchSetWithItems(setId, context.projectId);

    if (set.status === "ARCHIVED") {
      return NextResponse.json({ error: "Archivovanou navigační sadu nelze upravovat." }, { status: 400 });
    }

    // Update Set
    if (!action || action.length === 0) {
      // Reject generic attempts to mutate lifecycle or snapshot fields
      if (
        body.status !== undefined ||
        body.publishedSnapshot !== undefined ||
        body.publishedVersion !== undefined ||
        body.publishedAt !== undefined
      ) {
        return NextResponse.json({
          error: "Stav a publikovaný snapshot nelze měnit přímo přes PATCH. Použijte explicitní operace (publish, unpublish, archive)."
        }, { status: 400 });
      }

      const updated = await prisma.navigationSet.update({
        where: { id: setId },
        data: {
          name: body.name !== undefined ? body.name : set.name,
          key: body.key !== undefined ? body.key : set.key,
          description: body.description !== undefined ? body.description : set.description,
          context: body.context !== undefined ? body.context : set.context,
          version: { increment: 1 }
        },
        include: { items: { orderBy: { order: "asc" } } }
      });

      await prisma.auditLog.create({
        data: {
          action: "NAVIGATION_SET_UPDATED",
          scopeType: "PROJECT",
          scopeId: context.projectId,
          actorId: context.userId,
          metadata: { setId, name: updated.name, key: updated.key },
        },
      });

      return NextResponse.json(formatSetResponse(updated));
    }

    // Update Item
    if (action[0] === "items" && action.length === 2) {
      const itemId = action[1];
      const item = set.items.find((i: any) => i.id === itemId);
      if (!item) return NextResponse.json({ error: "Položka nebyla nalezena" }, { status: 404 });

      const dataToUpdate: any = {};
      const nextType = body.type !== undefined ? body.type : item.type;

      if (body.label !== undefined) dataToUpdate.label = sanitizeLabel(body.label);
      if (body.type !== undefined) dataToUpdate.type = body.type;

      if (body.externalUrl !== undefined) {
        if (nextType === "EXTERNAL_LINK" && body.externalUrl) {
          const urlCheck = isSafeUrl(body.externalUrl);
          if (!urlCheck.safe) return NextResponse.json({ error: urlCheck.reason }, { status: 400 });
        }
        dataToUpdate.externalUrl = nextType === "EXTERNAL_LINK" ? body.externalUrl : null;
      }

      if (body.pageId !== undefined) {
        if (nextType === "PAGE" && body.pageId) {
          const page = await prisma.page.findUnique({ where: { id: body.pageId } });
          if (!page || page.projectId !== context.projectId) {
            return NextResponse.json({ error: "Stránka nebyla nalezena nebo nepatří k tomuto projektu." }, { status: 400 });
          }
        }
        dataToUpdate.pageId = nextType === "PAGE" ? body.pageId : null;
      }

      if (body.anchor !== undefined) dataToUpdate.anchor = nextType === "ANCHOR" ? body.anchor : null;
      if (body.icon !== undefined) dataToUpdate.icon = body.icon;
      if (body.visibility !== undefined) dataToUpdate.visibility = body.visibility;
      if (body.openInNewTab !== undefined) dataToUpdate.openInNewTab = body.openInNewTab;

      if (body.parentId !== undefined) {
        if (body.parentId !== null && !set.items.some((i: any) => i.id === body.parentId)) {
          return NextResponse.json({ error: "Rodičovská položka nepatří do stejné sady." }, { status: 400 });
        }
        if (body.parentId === itemId) {
          return NextResponse.json({ error: "Položka nemůže být svým vlastním rodičem." }, { status: 400 });
        }
        if (checkCycle(set.items, itemId, body.parentId)) {
          return NextResponse.json({ error: "Zanořením by vznikl cyklus v hierarchii." }, { status: 400 });
        }
        dataToUpdate.parentId = body.parentId;
      }

      // Execute atomically in transaction
      const updatedSet = await prisma.$transaction(async (tx: any) => {
        await tx.navigationItem.update({
          where: { id: itemId },
          data: dataToUpdate
        });
        return tx.navigationSet.update({
          where: { id: setId },
          data: { version: { increment: 1 } },
          include: { items: { orderBy: { order: "asc" } } }
        });
      });

      return NextResponse.json(formatSetResponse(updatedSet));
    }

    return NextResponse.json({ error: "Invalid PATCH route" }, { status: 404 });
  } catch (error: any) {
    console.error("PATCH error:", error);
    return NextResponse.json({ error: error.message || "Failed to update" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ setId: string; action?: string[] }> }
) {
  const context = await getActiveProjectContext();
  if (context.status !== "PROJECT_VALID" || !context.projectId || !context.userId) {
    return NextResponse.json({ error: context.status }, { status: 403 });
  }

  const { setId, action } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    // 1. Explicit PUBLISH Action
    if (action?.[0] === "publish" && action.length === 1) {
      if (!await hasPermission(context.userId, "navigation.publish", context.projectId)) {
        return NextResponse.json({ error: "Forbidden: Missing navigation.publish permission" }, { status: 403 });
      }

      const set = await fetchSetWithItems(setId, context.projectId);
      if (set.status === "ARCHIVED") {
        return NextResponse.json({ error: "Archivovanou navigační sadu nelze publikovat." }, { status: 400 });
      }

      // Read pages in the active project for PAGE verification
      const pages = await prisma.page.findMany({
        where: { projectId: context.projectId },
        select: { id: true },
      });
      const availablePageIds = new Set(pages.map((p: any) => p.id));

      const snapshotResult = buildPublishedNavigationSnapshot(
        {
          key: set.key,
          name: set.name,
          context: set.context,
          description: set.description,
          items: set.items as any,
        },
        { availablePageIds }
      );

      if (!snapshotResult.success || !snapshotResult.snapshot) {
        return NextResponse.json({
          error: "Chyba validace publikování",
          errors: snapshotResult.errors
        }, { status: 400 });
      }

      // Check idempotency if version === publishedVersion
      if (set.status === "PUBLISHED" && set.publishedVersion === set.version && set.publishedSnapshot) {
        return NextResponse.json(formatSetResponse(set));
      }

      const now = new Date();
      const updatedSet = await prisma.navigationSet.update({
        where: { id: setId },
        data: {
          status: "PUBLISHED",
          publishedSnapshot: snapshotResult.snapshot as any,
          publishedVersion: set.version,
          publishedAt: now,
        },
        include: { items: { orderBy: { order: "asc" } } }
      });

      await logAudit({
        action: "NAVIGATION_SET_PUBLISHED",
        scopeType: "PROJECT",
        scopeId: context.projectId,
        actorId: context.userId,
        metadata: { setId, publishedVersion: set.version },
      });

      return NextResponse.json(formatSetResponse(updatedSet));
    }

    // 2. Explicit UNPUBLISH Action
    if (action?.[0] === "unpublish" && action.length === 1) {
      if (!await hasPermission(context.userId, "navigation.publish", context.projectId)) {
        return NextResponse.json({ error: "Forbidden: Missing navigation.publish permission" }, { status: 403 });
      }

      const set = await fetchSetWithItems(setId, context.projectId);
      if (set.status === "ARCHIVED") {
        return NextResponse.json({ error: "Archivovanou navigační sadu nelze odpublikovat." }, { status: 400 });
      }

      if (set.status === "DRAFT") {
        return NextResponse.json(formatSetResponse(set));
      }

      const updatedSet = await prisma.navigationSet.update({
        where: { id: setId },
        data: {
          status: "DRAFT",
        },
        include: { items: { orderBy: { order: "asc" } } }
      });

      await logAudit({
        action: "NAVIGATION_SET_UNPUBLISHED",
        scopeType: "PROJECT",
        scopeId: context.projectId,
        actorId: context.userId,
        metadata: { setId },
      });

      return NextResponse.json(formatSetResponse(updatedSet));
    }

    // 3. Explicit ARCHIVE Action
    if (action?.[0] === "archive" && action.length === 1) {
      if (!await hasPermission(context.userId, "navigation.publish", context.projectId)) {
        return NextResponse.json({ error: "Forbidden: Missing navigation.publish permission" }, { status: 403 });
      }

      const set = await fetchSetWithItems(setId, context.projectId);
      if (set.status === "PUBLISHED") {
        return NextResponse.json({ error: "Publikovanou navigační sadu nelze přímo archivovat. Nejprve ji odpublikujte." }, { status: 400 });
      }

      if (set.status === "ARCHIVED") {
        return NextResponse.json(formatSetResponse(set));
      }

      const updatedSet = await prisma.navigationSet.update({
        where: { id: setId },
        data: {
          status: "ARCHIVED",
        },
        include: { items: { orderBy: { order: "asc" } } }
      });

      await logAudit({
        action: "NAVIGATION_SET_ARCHIVED",
        scopeType: "PROJECT",
        scopeId: context.projectId,
        actorId: context.userId,
        metadata: { setId },
      });

      return NextResponse.json(formatSetResponse(updatedSet));
    }

    // Standard item edit operations require navigation.edit
    if (!await hasPermission(context.userId, "navigation.edit", context.projectId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const set = await fetchSetWithItems(setId, context.projectId);
    if (set.status === "ARCHIVED") {
      return NextResponse.json({ error: "Archivovanou navigační sadu nelze upravovat." }, { status: 400 });
    }

    // Create Item
    if (action?.[0] === "items" && action.length === 1) {
      if (body.type === "EXTERNAL_LINK" && body.externalUrl) {
        const urlCheck = isSafeUrl(body.externalUrl);
        if (!urlCheck.safe) return NextResponse.json({ error: urlCheck.reason }, { status: 400 });
      }
      if (body.pageId && body.type === "PAGE") {
        const page = await prisma.page.findUnique({ where: { id: body.pageId } });
        if (!page || page.projectId !== context.projectId) {
          return NextResponse.json({ error: "Stránka nebyla nalezena nebo nepatří k tomuto projektu." }, { status: 400 });
        }
      }
      if (body.parentId && !set.items.some((i: any) => i.id === body.parentId)) {
        return NextResponse.json({ error: "Rodičovská položka nepatří do stejné sady." }, { status: 400 });
      }

      const order = set.items.filter((i: any) => i.parentId === (body.parentId || null)).length + 1;

      const updatedSet = await prisma.$transaction(async (tx: any) => {
        await tx.navigationItem.create({
          data: {
            setId,
            parentId: body.parentId || null,
            type: body.type,
            label: sanitizeLabel(body.label),
            pageId: body.type === "PAGE" ? body.pageId : null,
            externalUrl: body.type === "EXTERNAL_LINK" ? body.externalUrl : null,
            anchor: body.type === "ANCHOR" ? body.anchor : null,
            icon: body.icon,
            visibility: body.visibility ?? true,
            openInNewTab: body.openInNewTab ?? false,
            order
          }
        });
        return tx.navigationSet.update({
          where: { id: setId },
          data: { version: { increment: 1 } },
          include: { items: { orderBy: { order: "asc" } } }
        });
      });

      return NextResponse.json(formatSetResponse(updatedSet));
    }

    // Action on Item (move, indent, outdent, toggle-visibility)
    if (action?.[0] === "items" && action.length === 3) {
      const itemId = action[1];
      const itemAction = action[2];
      const item = set.items.find((i: any) => i.id === itemId);
      if (!item) return NextResponse.json({ error: "Položka nebyla nalezena" }, { status: 404 });

      const updatedSet = await prisma.$transaction(async (tx: any) => {
        if (itemAction === "toggle-visibility") {
          await tx.navigationItem.update({
            where: { id: itemId },
            data: { visibility: !item.visibility }
          });
        } else if (itemAction === "indent") {
          const { flatItems } = flattenAndCalculateDepths(set.items as any);
          const currentIndex = flatItems.findIndex((i: any) => i.id === itemId);
          const currentItem = flatItems[currentIndex];
          if (currentItem.depth! >= MAX_NAVIGATION_DEPTH) {
            throw new Error(`Dosažena maximální úroveň zanoření (${MAX_NAVIGATION_DEPTH}).`);
          }
          const siblings = flatItems.filter((i: any) => i.parentId === currentItem.parentId);
          const siblingIndex = siblings.findIndex((i: any) => i.id === itemId);
          if (siblingIndex <= 0) {
            throw new Error("Položku nelze zanořit, protože před ní není žádná nadřazená položka ve stejné úrovni.");
          }
          const previousSibling = siblings[siblingIndex - 1];
          const newSiblings = set.items.filter((i: any) => i.parentId === previousSibling.id && i.id !== itemId);
          const newOrder = newSiblings.length > 0 ? Math.max(...newSiblings.map((s: any) => s.order)) + 1 : 1;

          await tx.navigationItem.update({
            where: { id: itemId },
            data: { parentId: previousSibling.id, order: newOrder }
          });
        } else if (itemAction === "outdent") {
          if (!item.parentId) {
            throw new Error("Položka se již nachází v nejvyšší (kořenové) úrovni.");
          }
          const parentItem = set.items.find((i: any) => i.id === item.parentId);
          const newParentId = parentItem ? parentItem.parentId : null;
          const newOrder = (parentItem?.order || 0) + 1;
          await tx.navigationItem.update({
            where: { id: itemId },
            data: { parentId: newParentId, order: newOrder }
          });
        } else if (itemAction === "move") {
          const direction = body.direction;
          const { flatItems } = flattenAndCalculateDepths(set.items as any);
          const currentIndex = flatItems.findIndex((i: any) => i.id === itemId);
          const currentItem = flatItems[currentIndex];
          const siblings = flatItems.filter((i: any) => i.parentId === currentItem.parentId);
          const siblingIndex = siblings.findIndex((i: any) => i.id === itemId);

          if (direction === "UP" && siblingIndex > 0) {
            const targetSibling = siblings[siblingIndex - 1];
            await tx.navigationItem.update({ where: { id: currentItem.id }, data: { order: targetSibling.order } });
            await tx.navigationItem.update({ where: { id: targetSibling.id }, data: { order: currentItem.order } });
          } else if (direction === "DOWN" && siblingIndex < siblings.length - 1) {
            const targetSibling = siblings[siblingIndex + 1];
            await tx.navigationItem.update({ where: { id: currentItem.id }, data: { order: targetSibling.order } });
            await tx.navigationItem.update({ where: { id: targetSibling.id }, data: { order: currentItem.order } });
          }
        }

        return tx.navigationSet.update({
          where: { id: setId },
          data: { version: { increment: 1 } },
          include: { items: { orderBy: { order: "asc" } } }
        });
      });

      return NextResponse.json(formatSetResponse(updatedSet));
    }

    return NextResponse.json({ error: "Invalid POST route" }, { status: 404 });
  } catch (error: any) {
    console.error("POST error:", error);
    return NextResponse.json({ error: error.message || "Failed to process action" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ setId: string; action?: string[] }> }
) {
  const context = await getActiveProjectContext();
  if (context.status !== "PROJECT_VALID" || !context.projectId || !context.userId) {
    return NextResponse.json({ error: context.status }, { status: 403 });
  }

  const { setId, action } = await params;

  try {
    const set = await fetchSetWithItems(setId, context.projectId); // verify existence & project access

    // Item delete requires navigation.edit
    if (action?.[0] === "items" && action.length === 2) {
      if (!await hasPermission(context.userId, "navigation.edit", context.projectId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (set.status === "ARCHIVED") {
        return NextResponse.json({ error: "Archivovanou navigační sadu nelze upravovat." }, { status: 400 });
      }

      const itemId = action[1];
      const updatedSet = await prisma.$transaction(async (tx: any) => {
        await tx.navigationItem.delete({ where: { id: itemId } });
        return tx.navigationSet.update({
          where: { id: setId },
          data: { version: { increment: 1 } },
          include: { items: { orderBy: { order: "asc" } } }
        });
      });

      return NextResponse.json(formatSetResponse(updatedSet));
    }

    // Set delete requires navigation.delete
    if (!action || action.length === 0) {
      if (!await hasPermission(context.userId, "navigation.delete", context.projectId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Reject deleting a currently PUBLISHED set
      if (set.status === "PUBLISHED") {
        return NextResponse.json({
          error: "Publikovanou navigační sadu nelze smazat. Nejprve ji odpublikujte."
        }, { status: 409 });
      }

      await prisma.navigationSet.delete({ where: { id: setId } });
      await logAudit({
        action: "NAVIGATION_SET_DELETED",
        scopeType: "PROJECT",
        scopeId: context.projectId,
        actorId: context.userId,
        metadata: { setId },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid DELETE route" }, { status: 404 });
  } catch (error: any) {
    console.error("DELETE error:", error);
    return NextResponse.json({ error: error.message || "Failed to delete" }, { status: 500 });
  }
}
