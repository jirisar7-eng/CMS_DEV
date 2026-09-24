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
  const projectId = context.projectId;
  const userId = context.userId;

  if (!await hasPermission(userId, "navigation.edit", projectId)) {
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
        const set = await fetchSetWithItems(setId, projectId, tx);
        if (set.status === "ARCHIVED") {
          throw new Error("ARCHIVED_IMMUTABLE");
        }

        const updateData: any = {};
        if (body.name !== undefined) {
          const cleanName = sanitizeLabel(body.name);
          if (!cleanName) throw new Error("INVALID_NAME");
          updateData.name = cleanName;
        }
        if (body.key !== undefined) {
          const cleanKey = String(body.key).trim();
          if (!cleanKey) throw new Error("INVALID_KEY");
          updateData.key = cleanKey;
        }
        if (body.context !== undefined) {
          if (!["HEADER", "FOOTER", "MOBILE", "PORTAL", "CUSTOM"].includes(body.context)) {
            throw new Error("INVALID_CONTEXT");
          }
          updateData.context = body.context;
        }
        if (body.description !== undefined) {
          updateData.description = body.description ? String(body.description).trim() : null;
        }

        updateData.version = { increment: 1 };

        const updateResult = await tx.navigationSet.updateMany({
          where: {
            id: setId,
            projectId,
            version: set.version,
            status: { not: "ARCHIVED" },
          },
          data: updateData,
        });

        if (updateResult.count !== 1) {
          throw new Error("CONFLICT_CONCURRENT_MUTATION");
        }

        return fetchSetWithItems(setId, projectId, tx);
      });

      await logAudit({
        action: "NAVIGATION_SET_UPDATED",
        scopeType: "PROJECT",
        scopeId: projectId,
        actorId: userId,
        metadata: {
          setId: updatedSet.id,
          name: updatedSet.name,
          itemCount: updatedSet.items.length,
        },
      });

      return NextResponse.json(formatSetResponse(updatedSet));
    }

    // 2. Update Single Item
    if (action[0] === "items" && action.length === 2) {
      const itemId = action[1];
      const updatedSet = await prisma.$transaction(async (tx: any) => {
        const set = await fetchSetWithItems(setId, projectId, tx);
        if (set.status === "ARCHIVED") {
          throw new Error("ARCHIVED_IMMUTABLE");
        }

        const item = set.items.find((i: any) => i.id === itemId);
        if (!item) throw new Error("ITEM_NOT_FOUND");

        const updateItemData: any = {};
        if (body.label !== undefined) {
          const cleanLabel = sanitizeLabel(body.label);
          if (!cleanLabel) throw new Error("INVALID_LABEL");
          updateItemData.label = cleanLabel;
        }
        if (body.type !== undefined) {
          if (!["PAGE", "EXTERNAL_LINK", "ANCHOR", "GROUP"].includes(body.type)) {
            throw new Error("INVALID_TYPE");
          }
          updateItemData.type = body.type;
        }
        if (body.pageId !== undefined) {
          updateItemData.pageId = body.pageId ? String(body.pageId).trim() : null;
        }
        if (body.externalUrl !== undefined) {
          if (body.externalUrl) {
            const urlCheck = isSafeUrl(body.externalUrl);
            if (!urlCheck.safe) throw new Error("INVALID_EXTERNAL_URL");
            updateItemData.externalUrl = urlCheck.sanitizedUrl;
          } else {
            updateItemData.externalUrl = null;
          }
        }
        if (body.anchor !== undefined) {
          if (body.anchor) {
            if (!isValidAnchor(body.anchor)) throw new Error("INVALID_ANCHOR");
            updateItemData.anchor = String(body.anchor).trim();
          } else {
            updateItemData.anchor = null;
          }
        }
        if (body.icon !== undefined) {
          updateItemData.icon = body.icon ? String(body.icon).trim() : null;
        }
        if (body.visibility !== undefined) {
          updateItemData.visibility = Boolean(body.visibility);
        }
        if (body.openInNewTab !== undefined) {
          updateItemData.openInNewTab = Boolean(body.openInNewTab);
        }
        if (body.order !== undefined) {
          updateItemData.order = Number(body.order);
        }
        if (body.parentId !== undefined) {
          const newParentId = body.parentId ? String(body.parentId).trim() : null;
          if (newParentId === itemId) throw new Error("SELF_PARENT");
          if (newParentId && checkCycle(set.items, itemId, newParentId)) {
            throw new Error("CYCLIC_HIERARCHY");
          }
          updateItemData.parentId = newParentId;
        }

        await tx.navigationItem.update({
          where: { id: itemId },
          data: updateItemData,
        });

        const vRes = await tx.navigationSet.updateMany({
          where: {
            id: setId,
            projectId,
            version: set.version,
            status: { not: "ARCHIVED" },
          },
          data: { version: { increment: 1 } },
        });

        if (vRes.count !== 1) {
          throw new Error("CONFLICT_CONCURRENT_MUTATION");
        }

        return fetchSetWithItems(setId, projectId, tx);
      });

      await logAudit({
        action: "NAVIGATION_SET_UPDATED",
        scopeType: "PROJECT",
        scopeId: projectId,
        actorId: userId,
        metadata: {
          setId: updatedSet.id,
          name: updatedSet.name,
          itemCount: updatedSet.items.length,
        },
      });

      return NextResponse.json(formatSetResponse(updatedSet));
    }

    // 3. Batch Reorder Items
    if (action[0] === "items" && action[1] === "reorder") {
      const itemsPayload: Array<{ id: string; order: number; parentId?: string | null }> =
        body.items || [];

      if (!Array.isArray(itemsPayload)) {
        return NextResponse.json({ error: "Invalid items payload" }, { status: 400 });
      }

      const updatedSet = await prisma.$transaction(async (tx: any) => {
        const set = await fetchSetWithItems(setId, projectId, tx);
        if (set.status === "ARCHIVED") {
          throw new Error("ARCHIVED_IMMUTABLE");
        }

        for (const item of itemsPayload) {
          if (item.parentId === item.id) throw new Error("SELF_PARENT");
          if (item.parentId && checkCycle(set.items, item.id, item.parentId)) {
            throw new Error("CYCLIC_HIERARCHY");
          }
          await tx.navigationItem.update({
            where: { id: item.id },
            data: {
              order: item.order,
              ...(item.parentId !== undefined ? { parentId: item.parentId } : {}),
            },
          });
        }

        const vRes = await tx.navigationSet.updateMany({
          where: {
            id: setId,
            projectId,
            version: set.version,
            status: { not: "ARCHIVED" },
          },
          data: { version: { increment: 1 } },
        });

        if (vRes.count !== 1) {
          throw new Error("CONFLICT_CONCURRENT_MUTATION");
        }

        return fetchSetWithItems(setId, projectId, tx);
      });

      await logAudit({
        action: "NAVIGATION_SET_UPDATED",
        scopeType: "PROJECT",
        scopeId: projectId,
        actorId: userId,
        metadata: {
          setId: updatedSet.id,
          name: updatedSet.name,
          itemCount: updatedSet.items.length,
        },
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
      return NextResponse.json(
        { error: "Souběžná změna nebo neplatný stav navigační sady (konflikt verzí)." },
        { status: 409 }
      );
    }
    if (error.message === "CYCLIC_HIERARCHY" || error.message === "SELF_PARENT") {
      return NextResponse.json({ error: "Cyklická závislost v hierarchii navigace." }, { status: 400 });
    }
    if (error.message === "INVALID_EXTERNAL_URL") {
      return NextResponse.json({ error: "Nebezpečná nebo neplatná externí URL." }, { status: 400 });
    }
    if (error.message === "INVALID_ANCHOR") {
      return NextResponse.json({ error: "Neplatný formát kotvy." }, { status: 400 });
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
  const projectId = context.projectId;
  const userId = context.userId;

  const { setId, action } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    // 1. Publish Navigation Set
    if (action?.[0] === "publish") {
      if (!await hasPermission(userId, "navigation.publish", projectId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const updatedSet = await prisma.$transaction(async (tx: any) => {
        const set = await fetchSetWithItems(setId, projectId, tx);

        if (set.status === "ARCHIVED") {
          throw new Error("ARCHIVED_IMMUTABLE");
        }

        const expectedVersion = body.expectedVersion !== undefined ? Number(body.expectedVersion) : set.version;
        if (expectedVersion !== set.version) {
          throw new Error("CONFLICT_CONCURRENT_MUTATION");
        }

        const pages: Array<{ id: string }> = await tx.page.findMany({
          where: { projectId },
          select: { id: true },
        });
        const availablePageIds = new Set<string>(pages.map((p) => p.id));

        const snapshotResult = buildPublishedNavigationSnapshot(
          {
            key: set.key,
            name: set.name,
            context: set.context,
            description: set.description,
            items: set.items.map((i: any) => ({
              id: i.id,
              parentId: i.parentId,
              type: i.type,
              label: i.label,
              pageId: i.pageId,
              externalUrl: i.externalUrl,
              anchor: i.anchor,
              icon: i.icon,
              visibility: i.visibility,
              openInNewTab: i.openInNewTab,
              order: i.order,
            })),
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
            projectId,
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

        return fetchSetWithItems(setId, projectId, tx);
      });

      await logAudit({
        action: "NAVIGATION_SET_UPDATED",
        scopeType: "PROJECT",
        scopeId: projectId,
        actorId: userId,
        metadata: {
          setId: updatedSet.id,
          name: updatedSet.name,
          itemCount: updatedSet.items.length,
        },
      });

      return NextResponse.json(formatSetResponse(updatedSet));
    }

    // 2. Unpublish Navigation Set
    if (action?.[0] === "unpublish") {
      if (!await hasPermission(userId, "navigation.publish", projectId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const updatedSet = await prisma.$transaction(async (tx: any) => {
        const set = await fetchSetWithItems(setId, projectId, tx);

        if (set.status === "ARCHIVED") {
          throw new Error("ARCHIVED_IMMUTABLE");
        }

        const expectedVersion = body.expectedVersion !== undefined ? Number(body.expectedVersion) : set.version;
        if (expectedVersion !== set.version) {
          throw new Error("CONFLICT_CONCURRENT_MUTATION");
        }

        const updateResult = await tx.navigationSet.updateMany({
          where: {
            id: setId,
            projectId,
            version: set.version,
            status: "PUBLISHED",
          },
          data: {
            status: "DRAFT",
          },
        });

        if (updateResult.count !== 1) {
          throw new Error("CONFLICT_CONCURRENT_MUTATION");
        }

        return fetchSetWithItems(setId, projectId, tx);
      });

      await logAudit({
        action: "NAVIGATION_SET_UPDATED",
        scopeType: "PROJECT",
        scopeId: projectId,
        actorId: userId,
        metadata: {
          setId: updatedSet.id,
          name: updatedSet.name,
          itemCount: updatedSet.items.length,
        },
      });

      return NextResponse.json(formatSetResponse(updatedSet));
    }

    // 3. Archive Navigation Set
    if (action?.[0] === "archive") {
      if (!await hasPermission(userId, "navigation.delete", projectId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const updatedSet = await prisma.$transaction(async (tx: any) => {
        const set = await fetchSetWithItems(setId, projectId, tx);

        if (set.status === "PUBLISHED") {
          throw new Error("CANNOT_ARCHIVE_PUBLISHED");
        }

        const expectedVersion = body.expectedVersion !== undefined ? Number(body.expectedVersion) : set.version;
        if (expectedVersion !== set.version) {
          throw new Error("CONFLICT_CONCURRENT_MUTATION");
        }

        const updateResult = await tx.navigationSet.updateMany({
          where: {
            id: setId,
            projectId,
            version: set.version,
            status: "DRAFT",
          },
          data: {
            status: "ARCHIVED",
          },
        });

        if (updateResult.count !== 1) {
          throw new Error("CONFLICT_CONCURRENT_MUTATION");
        }

        return fetchSetWithItems(setId, projectId, tx);
      });

      await logAudit({
        action: "NAVIGATION_SET_UPDATED",
        scopeType: "PROJECT",
        scopeId: projectId,
        actorId: userId,
        metadata: {
          setId: updatedSet.id,
          name: updatedSet.name,
          itemCount: updatedSet.items.length,
        },
      });

      return NextResponse.json(formatSetResponse(updatedSet));
    }

    // 4. Create Navigation Item
    if (action?.[0] === "items" && action.length === 1) {
      if (!await hasPermission(userId, "navigation.edit", projectId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const {
        parentId,
        type,
        label,
        pageId,
        externalUrl,
        anchor,
        icon,
        visibility = true,
        openInNewTab = false,
      } = body;

      const cleanLabel = sanitizeLabel(label);
      if (!cleanLabel) {
        return NextResponse.json({ error: "Neplatný název položky." }, { status: 400 });
      }

      if (!["PAGE", "EXTERNAL_LINK", "ANCHOR", "GROUP"].includes(type)) {
        return NextResponse.json({ error: "Neplatný typ položky." }, { status: 400 });
      }

      let sanitizedUrl: string | null = null;
      if (type === "EXTERNAL_LINK") {
        if (!externalUrl) {
          return NextResponse.json({ error: "Externí odkaz vyžaduje URL." }, { status: 400 });
        }
        const urlCheck = isSafeUrl(externalUrl);
        if (!urlCheck.safe) {
          return NextResponse.json({ error: "Nebezpečná nebo neplatná externí URL." }, { status: 400 });
        }
        sanitizedUrl = urlCheck.sanitizedUrl;
      }

      let sanitizedAnchor: string | null = null;
      if (type === "ANCHOR") {
        if (!isValidAnchor(anchor)) {
          return NextResponse.json({ error: "Neplatný formát kotvy (očekáván tvar #sekce)." }, { status: 400 });
        }
        sanitizedAnchor = String(anchor).trim();
      }

      const updatedSet = await prisma.$transaction(async (tx: any) => {
        const set = await fetchSetWithItems(setId, projectId, tx);
        if (set.status === "ARCHIVED") {
          throw new Error("ARCHIVED_IMMUTABLE");
        }

        const siblings = set.items.filter((i: any) => i.parentId === (parentId || null));
        const maxOrder = siblings.length > 0 ? Math.max(...siblings.map((s: any) => s.order)) : 0;
        const newOrder = maxOrder + 1;

        await tx.navigationItem.create({
          data: {
            setId,
            parentId: parentId || null,
            type,
            label: cleanLabel,
            pageId: type === "PAGE" ? pageId || null : null,
            externalUrl: sanitizedUrl,
            anchor: sanitizedAnchor,
            icon: icon ? String(icon).trim() : null,
            visibility: Boolean(visibility),
            openInNewTab: Boolean(openInNewTab),
            order: newOrder,
          },
        });

        const vRes = await tx.navigationSet.updateMany({
          where: {
            id: setId,
            projectId,
            version: set.version,
            status: { not: "ARCHIVED" },
          },
          data: { version: { increment: 1 } },
        });

        if (vRes.count !== 1) {
          throw new Error("CONFLICT_CONCURRENT_MUTATION");
        }

        return fetchSetWithItems(setId, projectId, tx);
      });

      await logAudit({
        action: "NAVIGATION_SET_UPDATED",
        scopeType: "PROJECT",
        scopeId: projectId,
        actorId: userId,
        metadata: {
          setId: updatedSet.id,
          name: updatedSet.name,
          itemCount: updatedSet.items.length,
        },
      });

      return NextResponse.json(formatSetResponse(updatedSet));
    }

    // 5. Item Hierarchy Actions (indent, outdent, move)
    if (action?.[0] === "items" && action.length === 3) {
      if (!await hasPermission(userId, "navigation.edit", projectId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const itemId = action[1];
      const itemAction = action[2];

      const updatedSet = await prisma.$transaction(async (tx: any) => {
        const set = await fetchSetWithItems(setId, projectId, tx);
        if (set.status === "ARCHIVED") {
          throw new Error("ARCHIVED_IMMUTABLE");
        }

        const item = set.items.find((i: any) => i.id === itemId);
        if (!item) throw new Error("ITEM_NOT_FOUND");

        if (itemAction === "indent") {
          const siblings = set.items
            .filter((i: any) => i.parentId === item.parentId)
            .sort((a: any, b: any) => a.order - b.order);
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
            projectId,
            version: set.version,
            status: { not: "ARCHIVED" },
          },
          data: { version: { increment: 1 } },
        });

        if (vRes.count !== 1) {
          throw new Error("CONFLICT_CONCURRENT_MUTATION");
        }

        return fetchSetWithItems(setId, projectId, tx);
      });

      await logAudit({
        action: "NAVIGATION_SET_UPDATED",
        scopeType: "PROJECT",
        scopeId: projectId,
        actorId: userId,
        metadata: {
          setId: updatedSet.id,
          name: updatedSet.name,
          itemCount: updatedSet.items.length,
        },
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
  const projectId = context.projectId;
  const userId = context.userId;

  const { setId, action } = await params;

  try {
    // 1. Delete Item requires navigation.edit
    if (action?.[0] === "items" && action.length === 2) {
      if (!await hasPermission(userId, "navigation.edit", projectId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const itemId = action[1];

      const updatedSet = await prisma.$transaction(async (tx: any) => {
        const set = await fetchSetWithItems(setId, projectId, tx);
        if (set.status === "ARCHIVED") {
          throw new Error("ARCHIVED_IMMUTABLE");
        }

        const itemExists = set.items.some((i: any) => i.id === itemId);
        if (!itemExists) throw new Error("ITEM_NOT_FOUND");

        await tx.navigationItem.delete({ where: { id: itemId } });

        const vRes = await tx.navigationSet.updateMany({
          where: {
            id: setId,
            projectId,
            version: set.version,
            status: { not: "ARCHIVED" },
          },
          data: { version: { increment: 1 } },
        });

        if (vRes.count !== 1) {
          throw new Error("CONFLICT_CONCURRENT_MUTATION");
        }

        return fetchSetWithItems(setId, projectId, tx);
      });

      await logAudit({
        action: "NAVIGATION_SET_UPDATED",
        scopeType: "PROJECT",
        scopeId: projectId,
        actorId: userId,
        metadata: {
          setId: updatedSet.id,
          name: updatedSet.name,
          itemCount: updatedSet.items.length,
        },
      });

      return NextResponse.json(formatSetResponse(updatedSet));
    }

    // 2. Delete Set requires navigation.delete
    if (!action || action.length === 0) {
      if (!await hasPermission(userId, "navigation.delete", projectId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Conditional delete: only succeeds if status is DRAFT or ARCHIVED
      const delResult = await prisma.navigationSet.deleteMany({
        where: {
          id: setId,
          projectId,
          status: { in: ["DRAFT", "ARCHIVED"] },
        },
      });

      if (delResult.count === 0) {
        // Check if set exists and is PUBLISHED
        const existingSet = await prisma.navigationSet.findUnique({
          where: { id: setId, projectId },
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
        scopeId: projectId,
        actorId: userId,
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
