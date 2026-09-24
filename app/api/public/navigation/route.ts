import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parsePublishedNavigationSnapshot } from "@/lib/domain/navigation/snapshot";
import { resolvePublicProjectContext } from "@/lib/domain/navigation/public-context";
import { PublishedNavigationSnapshot } from "@/lib/domain/navigation/types";

export async function GET(req: Request) {
  try {
    const projectId = await resolvePublicProjectContext(req);
    if (!projectId) {
      return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    }

    const navSets = await prisma.navigationSet.findMany({
      where: {
        projectId,
        status: "PUBLISHED"
      },
      select: {
        publishedSnapshot: true,
      },
    });

    const parsedSnapshots: PublishedNavigationSnapshot[] = [];
    for (const set of navSets) {
      if (set.publishedSnapshot) {
        const parsed = parsePublishedNavigationSnapshot(set.publishedSnapshot);
        if (parsed) {
          parsedSnapshots.push(parsed);
        }
      }
    }

    // Collect all referenced PAGE pageIds across parsed snapshots
    const allPageIds: string[] = [];
    for (const snapshot of parsedSnapshots) {
      for (const item of snapshot.items) {
        if (item.type === "PAGE" && item.pageId) {
          allPageIds.push(item.pageId);
        }
      }
    }

    let validPageIdSet = new Set<string>();
    if (allPageIds.length > 0) {
      const existingPages = await prisma.page.findMany({
        where: {
          id: { in: Array.from(new Set(allPageIds)) },
          projectId: projectId,
        },
        select: { id: true },
      });
      validPageIdSet = new Set(existingPages.map((p: any) => p.id));
    }

    // Fail closed: omit any snapshot whose PAGE items reference deleted or cross-project pages
    const validatedSnapshots = parsedSnapshots.filter(snapshot => {
      return snapshot.items.every(item => {
        if (item.type === "PAGE") {
          return Boolean(item.pageId && validPageIdSet.has(item.pageId));
        }
        return true;
      });
    });

    // Sort deterministically by snapshot name
    validatedSnapshots.sort((a, b) => a.name.localeCompare(b.name));

    const result = validatedSnapshots.map(set => ({
      key: set.key,
      name: set.name,
      context: set.context,
      ...(set.description ? { description: set.description } : {}),
      items: set.items.map(item => ({
        id: item.id,
        parentId: item.parentId,
        type: item.type,
        label: item.label,
        pageId: item.pageId,
        externalUrl: item.externalUrl,
        anchor: item.anchor,
        icon: item.icon,
        openInNewTab: item.openInNewTab,
        order: item.order,
      })),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching public navigation:", error);
    return NextResponse.json({ error: "Failed to fetch public navigation" }, { status: 500 });
  }
}
