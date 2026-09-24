import { logAudit } from "@/lib/auth/audit";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActiveProjectContext } from "@/lib/domain/pages-client/server-context";
import { hasPermission } from "@/lib/auth/rbac";
import {
  isSafeUrl,
  isValidAnchor,
  sanitizeLabel,
  flattenAndCalculateDepths,
  MAX_NAVIGATION_DEPTH,
} from "@/lib/domain/navigation/validation";
import {
  buildPublishedNavigationSnapshot,
  parsePublishedNavigationSnapshot,
} from "@/lib/domain/navigation/snapshot";

async function fetchSetWithItems(setId: string, projectId: string, db: any = prisma) {
  const set = await db.navigationSet.findUnique({
    where: { id: setId, projectId },
    include: { items: { orderBy: { order: "asc" } } },
  });
  if (!set) throw new Error("NOT_FOUND");
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
    publishedAt: set.publishedAt
      ? set.publishedAt instanceof Date
        ? set.publishedAt.toISOString()
        : set.publishedAt
      : null,
    updatedAt: set.updatedAt
      ? set.updatedAt instanceof Date
        ? set.updatedAt.toISOString()
        : set.updatedAt
      : new Date().toISOString(),
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
    const parentItem = items.find((i: any) => i.id === currentParentId);
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
    // 1. Update Set Metadata
    if (!action || action.length === 0) {
      if (
        body.status !== undefined ||
        body.publishedSnapshot !== undefined ||
        body.publishedVersion !== undefined ||
        body.publishedAt !== undefined
      ) {
        return NextResponse.json(
          {
            error:
              "Stav a publikovaný snapshot nelze měnit přímo přes PATCH. Použijte explicitní operace (publish, unpublish, archive).",
          },
          { status: 400 }
        );
      }

      const updatedSet = await prisma.$transaction(async (tx: any) => {
        const set = await fetchSetWithItems(setId, context.projectId, tx);
        if (set.status === "ARCHIVED") {
          throw new Error("ARCHIVED_IMMUTABLE");
        }

        const updateResult = await tx.navigationSet.updateMany({
          where: {
            id: setId,
            projectId: context.projectId,
            version: set.version,
            status: { not: "ARCHIVED" },
          },
          data: {
            name: body.name !== undefined ? String(body.name).trim() : set.name,
            key: body.key !== undefined ? String(body.key).trim() : set.key,
            description:
              body.description !== undefined
                ? body.description
                  ? String(body.description).trim()
                  : null
                : set.description,
            context: body.context !== undefined ? body.context : set.context,
            version: { increment: 1 },
          },
        });

        if (updateResult.count !== 1) {
          throw new Error("CONFLICT_CONCURRENT_MUTATION");
        }

        return fetchSetWithItems(setId, context.projectId, tx);
      });

      await prisma.auditLog.create({
        data: {
          action: "NAVIGATION_SET_UPDATED",
          scopeType: "PROJECT",
          scopeId: context.projectId,
          actorId: context.userId,
          metadata: { setId, name: updatedSet.name, key: updatedSet.key },
        },
      });

      return NextResponse.json(formatSetResponse(updatedSet));
    }

    // 2. Update Item
    if (action[0] === "items" && action.length === 2) {
      const itemId = action[1];

      const updatedSet = await prisma.$transaction(async (tx: any) => {
        const set = await fetchSetWithItems(setId, context.projectId, tx);
        if (set.status === "ARCHIVED") {
          throw new Error("ARCHIVED_IMMUTABLE");
        }

        const item = set.items.find((i: any) => i.id === itemId);
        if (!item) throw new Error("ITEM_NOT_FOUND");

        const dataToUpdate: any = {};
        const nextType = body.type !== undefined ? body.type : item.type;

        if (body.label !== undefined) dataToUpdate.label = sanitizeLabel(body.label);
        if (body.type !== undefined) dataToUpdate.type = body.type;

        if (body.externalUrl !== undefined) {
          if (nextType === "EXTERNAL_LINK" && body.externalUrl) {
            const urlCheck = isSafeUrl(body.externalUrl);
            if (!urlCheck.safe) throw new Error("INVALID_URL: " + urlCheck.reason);
          }
          dataToUpdate.externalUrl = nextType === "EXTERNAL_LINK" ? body.externalUrl : null;
        }

        if (body.pageId !== undefined) {
          if (nextType === "PAGE" && body.pageId) {
            const page = await tx.page.findUnique({ where: { id: body.pageId } });
            if (!page || page.projectId !== context.projectId) {
              throw new Error("PAGE_NOT_FOUND_OR_CROSS_PROJECT");
            }
          }
          dataToUpdate.pageId = nextType === "PAGE" ? body.pageId : null;
        }

        if (body.anchor !== undefined) {
          if (nextType === "ANCHOR" && body.anchor) {
            if (!isValidAnchor(body.anchor)) throw new Error("INVALID_ANCHOR");
          }
          dataToUpdate.anchor = nextType === "ANCHOR" ? body.anchor : null;
        }

        if (body.icon !== undefined) dataToUpdate.icon = body.icon;
        if (body.visibility !== undefined) dataToUpdate.visibility = body.visibility;
        if (body.openInNewTab !== undefined) dataToUpdate.openInNewTab = body.openInNewTab;

        if (body.parentId !== undefined) {
          if (body.parentId !== null && !set.items.some((i: any) => i.id === body.parentId)) {
            throw new Error("PARENT_OUTSIDE_SET");
          }
          if (body.parentId === itemId) {
            throw new Error("SELF_PARENT");
          }
          if (checkCycle(set.items, itemId, body.parentId)) {
            throw new Error("CYCLE_DETECTED");
          }
          dataToUpdate.parentId = body.parentId;
        }

        await tx.navigationItem.update({
          where: { id: itemId },
          data: dataToUpdate,
        });

        const vRes = await tx.navigationSet.updateMany({
          where: {
            id: setId,
            projectId: context.projectId,
            version: set.version,
            status: { not: "ARCHIVED" },
          },
          data: { version: { increment: 1 } },
        });

        if (vRes.count !== 1) {
          throw new Error("CONFLICT_CONCURRENT_MUTATION");
        }

        return fetchSetWithItems(setId, context.projectId, tx);
      });

      return NextResponse.json(formatSetResponse(updatedSet));
    }

    return NextResponse.json({ error: "Invalid PATCH route" }, { status: 404 });
  } catch (error: any) {
    if (error.message === "NOT_FOUND" || error.message === "ITEM_NOT_FOUND") {
      return NextResponse.json({ error: "Navigační sada nebo položka nebyla nalezena." }, { status: 404 });
    }
    if (error.message === "ARCHIVED_IMMUTABLE") {
      return NextResponse.json({ error: "Archivovanou navigační sadu nelze upravovat." }, { status: 400 });
    }
    if (error.message === "CONFLICT_CONCURRENT_MUTATION") {
      return NextResponse.json({ error: "Souběžná změna navigační sady (konflikt verzí)." }, { status: 409 });
    }
    if (error.message === "PAGE_NOT_FOUND_OR_CROSS_PROJECT") {
      return NextResponse.json({ error: "Stránka nebyla nalezena nebo nepatří k tomuto projektu." }, { status: 400 });
    }
    if (error.message === "INVALID_ANCHOR") {
      return NextResponse.json({ error: "Kotva musí začínat znakem # a nesmí obsahovat mezery." }, { status: 400 });
    }
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

      const publishedSet = await prisma.$transaction(async (tx: any) => {
        const set = await fetchSetWithItems(setId, context.projectId, tx);
        if (set.status === "ARCHIVED") {
          throw new Error("ARCHIVED_IMMUTABLE");
        }

        // Validate idempotent publish: check if already published with identical version & valid snapshot
        if (set.status === "PUBLISHED" && set.publishedVersion === set.version && set.publishedSnapshot) {
          const parsed = parsePublishedNavigationSnapshot(set.publishedSnapshot);
          if (parsed) {
            return set; // Idempotent return
          }
        }

        // Fetch active project pages inside transaction
        const pages = await tx.page.findMany({
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
          const err: any = new Error("VALIDATION_FAILED");
          err.errors = snapshotResult.errors;
          throw err;
        }

        const now = new Date();
        const updateResult = await tx.navigationSet.updateMany({
          where: {
            id: setId,
            projectId: context.projectId,
            version: set.version,
            status: { not: "ARCHIVED" },
          },
          data: {
            status: "PUBLISHED",
            publishedSnapshot: snapshotResult.snapshot as any,
            publishedVersion: set.version,
            publishedAt: now,
          },
        });

        if (updateResult.count !== 1) {
          throw new Error("CONFLICT_CONCURRENT_MUTATION");
        }

        return fetchSetWithItems(setId, context.projectId, tx);
      });

      await logAudit({
        action: "NAVIGATION_SET_PUBLISHED",
        scopeType: "PROJECT",
        scopeId: context.projectId,
        actorId: context.userId,
        metadata: { setId, publishedVersion: publishedSet.publishedVersion },
      });

      return NextResponse.json(formatSetResponse(publishedSet));
    }

    // 2. Explicit UNPUBLISH Action
    if (action?.[0] === "unpublish" && action.length === 1) {
      if (!await hasPermission(context.userId, "navigation.publish", context.projectId)) {
        return NextResponse.json({ error: "Forbidden: Missing navigation.publish permission" }, { status: 403 });
      }

      const unpublishedSet = await prisma.$transaction(async (tx: any) => {
        const set = await fetchSetWithItems(setId, context.projectId, tx);
        if (set.status === "ARCHIVED") {
          throw new Error("ARCHIVED_IMMUTABLE");
        }
        if (set.status === "DRAFT") {
          return set; // Idempotent
        }

        const updateResult = await tx.navigationSet.updateMany({
          where: {
            id: setId,
            projectId: context.projectId,
            status: "PUBLISHED",
          },
          data: {
            status: "DRAFT",
          },
        });

        if (updateResult.count !== 1) {
          throw new Error("CONFLICT_CONCURRENT_MUTATION");
        }

        return fetchSetWithItems(setId, context.projectId, tx);
      });

      await logAudit({
        action: "NAVIGATION_SET_UNPUBLISHED",
        scopeType: "PROJECT",
        scopeId: context.projectId,
        actorId: context.userId,
        metadata: { setId },
      });

      return NextResponse.json(formatSetResponse(unpublishedSet));
    }

    // 3. Explicit ARCHIVE Action
    if (action?.[0] === "archive" && action.length === 1) {
      if (!await hasPermission(context.userId, "navigation.publish", context.projectId)) {
        return NextResponse.json({ error: "Forbidden: Missing navigation.publish permission" }, { status: 403 });
      }

      const archivedSet = await prisma.$transaction(async (tx: any) => {
        const set = await fetchSetWithItems(setId, context.projectId, tx);
        if (set.status === "PUBLISHED") {
          throw new Error("CANNOT_ARCHIVE_PUBLISHED");
        }
        if (set.status === "ARCHIVED") {
          return set; // Idempotent
        }

        const updateResult = await tx.navigationSet.updateMany({
          where: {
            id: setId,
            projectId: context.projectId,
            status: "DRAFT",
          },
          data: {
            status: "ARCHIVED",
          },
        });

        if (updateResult.count !== 1) {
          throw new Error("CONFLICT_CONCURRENT_MUTATION");
        }

        return fetchSetWithItems(setId, context.projectId, tx);
      });

      await logAudit({
        action: "NAVIGATION_SET_ARCHIVED",
        scopeType: "PROJECT",
        scopeId: context.projectId,
        actorId: context.userId,
        metadata: { setId },
      });

      return NextResponse.json(formatSetResponse(archivedSet));
    }

    // Item management operations require navigation.edit
    if (!await hasPermission(context.userId, "navigation.edit", context.projectId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 4. Create Item
    if (action?.[0] === "items" && action.length === 1) {
      const updatedSet = await prisma.$transaction(async (tx: any) => {
        const set = await fetchSetWithItems(setId, context.projectId, tx);
        if (set.status === "ARCHIVED") {
          throw new Error("ARCHIVED_IMMUTABLE");
        }

        if (body.type === "EXTERNAL_LINK" && body.externalUrl) {
          const urlCheck = isSafeUrl(body.externalUrl);
          if (!urlCheck.safe) throw new Error("INVALID_URL: " + urlCheck.reason);
        }
        if (body.pageId && body.type === "PAGE") {
          const page = await tx.page.findUnique({ where: { id: body.pageId } });
          if (!page || page.projectId !== context.projectId) {
            throw new Error("PAGE_NOT_FOUND_OR_CROSS_PROJECT");
          }
        }
        if (body.type === "ANCHOR" && body.anchor) {
          if (!isValidAnchor(body.anchor)) throw new Error("INVALID_ANCHOR");
        }
        if (body.parentId && !set.items.some((i: any) => i.id === body.parentId)) {
          throw new Error("PARENT_OUTSIDE_SET");
        }

        const order = set.items.filter((i: any) => i.parentId === (body.parentId || null)).length + 1;

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
            order,
          },
        });

        const vRes = await tx.navigationSet.updateMany({
          where: {
            id: setId,
            projectId: context.projectId,
            version: set.version,
            status: { not: "ARCHIVED" },
          },
          data: { version: { increment: 1 } },
        });

        if (vRes.count !== 1) {
          throw new Error("CONFLICT_CONCURRENT_MUTATION");
        }

        return fetchSetWithItems(setId, context.projectId, tx);
      });

      return NextResponse.json(formatSetResponse(updatedSet));
    }

    // 5. Action on Item (move, indent, outdent, toggle-visibility)
    if (action?.[0] === "items" && action.length === 3) {
      const itemId = action[1];
      const itemAction = action[2];

      const updatedSet = await prisma.$transaction(async (tx: any) => {
        const set = await fetchSetWithItems(setId, context.projectId, tx);
        if (set.status === "ARCHIVED") {
          throw new Error("ARCHIVED_IMMUTABLE");
        }

        const item = set.items.find((i: any) => i.id === itemId);
        if (!item) throw new Error("ITEM_NOT_FOUND");

        if (itemAction === "toggle-visibility") {
          await tx.navigationItem.update({
            where: { id: itemId },
            data: { visibility: !item.visibility },
          });
        } else if (itemAction === "indent") {
          const { flatItems } = flattenAndCalculateDepths(set.items as any);
          const currentIndex = flatItems.findIndex((i: any) => i.id === itemId);
          const currentItem = flatItems[currentIndex];
          if (currentItem.depth! >= MAX_NAVIGATION_DEPTH) {
            throw new Error("MAX_DEPTH_EXCEEDED");
          }
          const siblings = flatItems.filter((i: any) => i.parentId === currentItem.parentId);
          const siblingIndex = siblings.findIndex((i: any) => i.id === itemId);
          if (siblingIndex <= 0) {
            throw new Error("INDENT_NO_PREVIOUS_SIBLING");
          }
          const previousSibling = siblings[siblingIndex - 1];
          const newSiblings = set.items.filter(
            (i: any) => i.parentId === previousSibling.id && i.id !== itemId
          );
          const newOrder =
            newSiblings.length > 0
              ? Math.max(...newSiblings.map((s: any) => s.order)) + 1
              : 1;

          await tx.navigationItem.update({
            where: { id: itemId },
            data: { parentId: previousSibling.id, order: newOrder },
          });
        } else if (itemAction === "outdent") {
          if (!item.parentId) {
            throw new Error("OUTDENT_ROOT");
          }
          const parentItem = set.items.find((i: any) => i.id === item.parentId);
          const newParentId = parentItem ? parentItem.parentId : null;
          const newOrder = (parentItem?.order || 0) + 1;
          await tx.navigationItem.update({
            where: { id: itemId },
            data: { parentId: newParentId, order: newOrder },
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
            await tx.navigationItem.update({
              where: { id: currentItem.id },
              data: { order: targetSibling.order },
            });
            await tx.navigationItem.update({
              where: { id: targetSibling.id },
              data: { order: currentItem.order },
            });
          } else if (direction === "DOWN" && siblingIndex < siblings.length - 1) {
            const targetSibling = siblings[siblingIndex + 1];
            await tx.navigationItem.update({
              where: { id: currentItem.id },
              data: { order: targetSibling.order },
            });
            await tx.navigationItem.update({
              where: { id: targetSibling.id },
              data: { order: currentItem.order },
            });
          }
        } else {
          throw new Error("UNSUPPORTED_ACTION");
        }

        const vRes = await tx.navigationSet.updateMany({
          where: {
            id: setId,
            projectId: context.projectId,
            version: set.version,
            status: { not: "ARCHIVED" },
          },
          data: { version: { increment: 1 } },
        });

        if (vRes.count !== 1) {
          throw new Error("CONFLICT_CONCURRENT_MUTATION");
        }

        return fetchSetWithItems(setId, context.projectId, tx);
      });

      return NextResponse.json(formatSetResponse(updatedSet));
    }

    return NextResponse.json({ error: "Invalid POST route" }, { status: 404 });
  } catch (error: any) {
    if (error.message === "NOT_FOUND" || error.message === "ITEM_NOT_FOUND") {
      return NextResponse.json({ error: "Navigační sada nebo položka nebyla nalezena." }, { status: 404 });
    }
    if (error.message === "ARCHIVED_IMMUTABLE") {
      return NextResponse.json({ error: "Archivovanou navigační sadu nelze upravovat." }, { status: 400 });
    }
    if (error.message === "CANNOT_ARCHIVE_PUBLISHED") {
      return NextResponse.json(
        { error: "Publikovanou navigační sadu nelze přímo archivovat. Nejprve ji odpublikujte." },
        { status: 400 }
      );
    }
    if (error.message === "CONFLICT_CONCURRENT_MUTATION") {
      return NextResponse.json(
        { error: "Souběžná změna nebo neplatný stav navigační sady (konflikt verzí)." },
        { status: 409 }
      );
    }
    if (error.message === "VALIDATION_FAILED") {
      return NextResponse.json(
        { error: "Chyba validace publikování", errors: error.errors || [] },
        { status: 400 }
      );
    }
    if (error.message === "UNSUPPORTED_ACTION") {
      return NextResponse.json({ error: "Neplatná akce nad položkou." }, { status: 400 });
    }
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
    // 1. Delete Item requires navigation.edit
    if (action?.[0] === "items" && action.length === 2) {
      if (!await hasPermission(context.userId, "navigation.edit", context.projectId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const itemId = action[1];
      const updatedSet = await prisma.$transaction(async (tx: any) => {
        const set = await fetchSetWithItems(setId, context.projectId, tx);
        if (set.status === "ARCHIVED") {
          throw new Error("ARCHIVED_IMMUTABLE");
        }

        const itemExists = set.items.some((i: any) => i.id === itemId);
        if (!itemExists) throw new Error("ITEM_NOT_FOUND");

        await tx.navigationItem.delete({ where: { id: itemId } });

        const vRes = await tx.navigationSet.updateMany({
          where: {
            id: setId,
            projectId: context.projectId,
            version: set.version,
            status: { not: "ARCHIVED" },
          },
          data: { version: { increment: 1 } },
        });

        if (vRes.count !== 1) {
          throw new Error("CONFLICT_CONCURRENT_MUTATION");
        }

        return fetchSetWithItems(setId, context.projectId, tx);
      });

      return NextResponse.json(formatSetResponse(updatedSet));
    }

    // 2. Delete Set requires navigation.delete
    if (!action || action.length === 0) {
      if (!await hasPermission(context.userId, "navigation.delete", context.projectId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Conditional delete: only succeeds if status is DRAFT or ARCHIVED
      const delResult = await prisma.navigationSet.deleteMany({
        where: {
          id: setId,
          projectId: context.projectId,
          status: { in: ["DRAFT", "ARCHIVED"] },
        },
      });

      if (delResult.count === 0) {
        // Check if set exists and is PUBLISHED
        const existingSet = await prisma.navigationSet.findUnique({
          where: { id: setId, projectId: context.projectId },
          select: { status: true },
        });

        if (existingSet && existingSet.status === "PUBLISHED") {
          return NextResponse.json(
            { error: "Publikovanou navigační sadu nelze smazat. Nejprve ji odpublikujte." },
            { status: 409 }
          );
        }

        return NextResponse.json({ error: "Navigační sada nebyla nalezena." }, { status: 404 });
      }

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
    if (error.message === "NOT_FOUND" || error.message === "ITEM_NOT_FOUND") {
      return NextResponse.json({ error: "Navigační sada nebo položka nebyla nalezena." }, { status: 404 });
    }
    if (error.message === "ARCHIVED_IMMUTABLE") {
      return NextResponse.json({ error: "Archivovanou navigační sadu nelze upravovat." }, { status: 400 });
    }
    if (error.message === "CONFLICT_CONCURRENT_MUTATION") {
      return NextResponse.json(
        { error: "Souběžná změna nebo neplatný stav navigační sady (konflikt verzí)." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message || "Failed to delete" }, { status: 500 });
  }
}
