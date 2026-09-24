/**
 * SYNTHESIS CMS — POSTGRESQL REAL INTEGRATION TEST
 * Navigation published snapshot persistence, lifecycle state transitions,
 * atomic version increments, and project isolation.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { buildPublishedNavigationSnapshot, parsePublishedNavigationSnapshot } from "../lib/domain/navigation/snapshot";

describe("PostgreSQL Real Integration - Navigation Published Snapshot & Lifecycle", () => {
  let prisma: PrismaClient;
  const testProjectIdA = `test-nav-proj-a-${Date.now()}`;
  const testProjectIdB = `test-nav-proj-b-${Date.now()}`;
  let navSetAId = "";
  let pageAId = "";
  let pageBId = "";

  before(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required for PostgreSQL integration tests.");
    }
    prisma = new PrismaClient();

    // Create test projects
    await prisma.project.createMany({
      data: [
        { id: testProjectIdA, key: `proj-a-${Date.now()}`, name: "Project A", status: "ACTIVE" },
        { id: testProjectIdB, key: `proj-b-${Date.now()}`, name: "Project B", status: "ACTIVE" },
      ],
    });

    // Create a page in Project A
    const pageA = await prisma.page.create({
      data: {
        projectId: testProjectIdA,
        key: `page-a-${Date.now()}`,
        title: "Page in Proj A",
        slug: `page-a-${Date.now()}`,
        locale: "en",
        visibility: "PUBLIC",
      },
    });
    pageAId = pageA.id;

    // Create a page in Project B
    const pageB = await prisma.page.create({
      data: {
        projectId: testProjectIdB,
        key: `page-b-${Date.now()}`,
        title: "Page in Proj B",
        slug: `page-b-${Date.now()}`,
        locale: "en",
        visibility: "PUBLIC",
      },
    });
    pageBId = pageB.id;
  });

  after(async () => {
    try {
      if (prisma) {
        await prisma.navigationItem.deleteMany({
          where: { set: { projectId: { in: [testProjectIdA, testProjectIdB] } } },
        });
        await prisma.navigationSet.deleteMany({
          where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
        });
        await prisma.page.deleteMany({
          where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
        });
        await prisma.project.deleteMany({
          where: { id: { in: [testProjectIdA, testProjectIdB] } },
        });
        await prisma.$disconnect();
      }
    } catch {
      // safe cleanup
    }
  });

  it("1. creates draft navigation set with null publishedSnapshot, maintaining full backwards compatibility", async () => {
    const navSet = await prisma.navigationSet.create({
      data: {
        projectId: testProjectIdA,
        key: "header-main",
        name: "Header Main",
        context: "HEADER",
        status: "DRAFT",
        version: 1,
      },
    });
    navSetAId = navSet.id;

    assert.ok(navSet.id);
    assert.strictEqual(navSet.status, "DRAFT");
    assert.strictEqual(navSet.version, 1);
    assert.strictEqual(navSet.publishedSnapshot, null);
    assert.strictEqual(navSet.publishedVersion, null);
    assert.strictEqual(navSet.publishedAt, null);
  });

  it("2. attaches navigation items and verifies atomic transaction", async () => {
    await prisma.$transaction(async (tx: any) => {
      await tx.navigationItem.create({
        data: {
          setId: navSetAId,
          type: "PAGE",
          label: "Home Page",
          pageId: pageAId,
          visibility: true,
          order: 1,
        },
      });
      await tx.navigationSet.update({
        where: { id: navSetAId },
        data: { version: { increment: 1 } },
      });
    });

    const setAfterFirstItem = await prisma.navigationSet.findUnique({
      where: { id: navSetAId },
      include: { items: true },
    });
    assert.ok(setAfterFirstItem);
    assert.strictEqual(setAfterFirstItem.version, 2);
    assert.strictEqual(setAfterFirstItem.items.length, 1);
  });

  it("3. rejects publishing with cross-project PAGE reference", async () => {
    // Add item referencing Page B (cross-project)
    const crossItem = await prisma.navigationItem.create({
      data: {
        setId: navSetAId,
        type: "PAGE",
        label: "Cross Link",
        pageId: pageBId,
        visibility: true,
        order: 2,
      },
    });

    const fullSet = await prisma.navigationSet.findUnique({
      where: { id: navSetAId },
      include: { items: { orderBy: { order: "asc" } } },
    });
    assert.ok(fullSet);

    // Only pages from Project A are available
    const projectAPages = await prisma.page.findMany({
      where: { projectId: testProjectIdA },
      select: { id: true },
    });
    const availablePageIds = new Set<string>(projectAPages.map((p: any) => p.id as string));

    const buildRes = buildPublishedNavigationSnapshot(
      {
        key: fullSet.key,
        name: fullSet.name,
        context: fullSet.context as any,
        description: fullSet.description,
        items: fullSet.items.map((i: any) => ({
          id: i.id,
          parentId: i.parentId,
          type: i.type as any,
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

    assert.strictEqual(buildRes.success, false);
    assert.ok(buildRes.errors.some(e => e.includes("neexistující nebo cizí stránku")));

    // Clean up crossItem
    await prisma.navigationItem.delete({ where: { id: crossItem.id } });
  });

  it("4. publishes valid snapshot and verifies draft mutation does not alter persisted publishedSnapshot", async () => {
    const fullSet = await prisma.navigationSet.findUnique({
      where: { id: navSetAId },
      include: { items: { orderBy: { order: "asc" } } },
    });
    assert.ok(fullSet);

    const projectAPages = await prisma.page.findMany({
      where: { projectId: testProjectIdA },
      select: { id: true },
    });
    const availablePageIds = new Set<string>(projectAPages.map((p: any) => p.id as string));

    const buildRes = buildPublishedNavigationSnapshot(
      {
        key: fullSet.key,
        name: fullSet.name,
        context: fullSet.context as any,
        description: fullSet.description,
        items: fullSet.items.map((i: any) => ({
          id: i.id,
          parentId: i.parentId,
          type: i.type as any,
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

    assert.strictEqual(buildRes.success, true);
    assert.ok(buildRes.snapshot);

    const now = new Date();
    const published = await prisma.navigationSet.update({
      where: { id: navSetAId },
      data: {
        status: "PUBLISHED",
        publishedSnapshot: buildRes.snapshot as any,
        publishedVersion: fullSet.version,
        publishedAt: now,
      },
    });

    assert.strictEqual(published.status, "PUBLISHED");
    assert.strictEqual(published.publishedVersion, fullSet.version);

    // Now perform a draft mutation: add new draft item
    await prisma.$transaction(async (tx: any) => {
      await tx.navigationItem.create({
        data: {
          setId: navSetAId,
          type: "EXTERNAL_LINK",
          label: "Draft New Link",
          externalUrl: "https://example.com/new",
          visibility: true,
          order: 2,
        },
      });
      await tx.navigationSet.update({
        where: { id: navSetAId },
        data: { version: { increment: 1 } },
      });
    });

    // Check that publishedSnapshot in DB is still the original 1 item
    const setAfterDraftEdit = await prisma.navigationSet.findUnique({
      where: { id: navSetAId },
      include: { items: true },
    });
    assert.ok(setAfterDraftEdit);
    assert.strictEqual(setAfterDraftEdit.items.length, 2); // 2 draft items
    assert.strictEqual(setAfterDraftEdit.version, setAfterDraftEdit.publishedVersion! + 1); // unpublished changes

    const parsedSnapshot = parsePublishedNavigationSnapshot(setAfterDraftEdit.publishedSnapshot);
    assert.ok(parsedSnapshot);
    assert.strictEqual(parsedSnapshot.items.length, 1); // still only 1 item in public snapshot!
  });

  it("5. unpublish sets status to DRAFT while preserving publishedSnapshot history", async () => {
    const unpublished = await prisma.navigationSet.update({
      where: { id: navSetAId },
      data: { status: "DRAFT" },
    });

    assert.strictEqual(unpublished.status, "DRAFT");
    assert.ok(unpublished.publishedSnapshot); // history preserved
    assert.ok(unpublished.publishedVersion);
  });

  it("6. archive sets status to ARCHIVED from DRAFT", async () => {
    const archived = await prisma.navigationSet.update({
      where: { id: navSetAId },
      data: { status: "ARCHIVED" },
    });

    assert.strictEqual(archived.status, "ARCHIVED");
  });
});
