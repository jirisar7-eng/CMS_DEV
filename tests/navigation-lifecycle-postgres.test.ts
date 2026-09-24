import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { PrismaClient } from "@prisma/client";
import {
  buildPublishedNavigationSnapshot,
  parsePublishedNavigationSnapshot,
} from "../lib/domain/navigation/snapshot";

describe("SYN-NAV-002: PostgreSQL Navigation Lifecycle & Concurrency Hardening", () => {
  let prisma: PrismaClient;
  const testProjectIdA = `proj-nav-a-${Date.now()}`;
  const testProjectIdB = `proj-nav-b-${Date.now()}`;
  let navSetAId: string;
  let pageAId: string;
  let pageBId: string;

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

    // Create a page in Project A (using real Page schema: id, projectId, key)
    const pageA = await prisma.page.create({
      data: {
        projectId: testProjectIdA,
        key: `page-a-${Date.now()}`,
      },
    });
    pageAId = pageA.id;

    // Create a page in Project B
    const pageB = await prisma.page.create({
      data: {
        projectId: testProjectIdB,
        key: `page-b-${Date.now()}`,
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
    const projectAPages: Array<{ id: string }> = await prisma.page.findMany({
      where: { projectId: testProjectIdA },
      select: { id: true },
    });
    const availablePageIds = new Set<string>(projectAPages.map((p) => p.id));

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

    const projectAPages: Array<{ id: string }> = await prisma.page.findMany({
      where: { projectId: testProjectIdA },
      select: { id: true },
    });
    const availablePageIds = new Set<string>(projectAPages.map((p) => p.id));

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

  // Concurrency and Lifecycle Hardening Tests (A, B, C, D)

  it("7. [Concurrency A] stale publication guard: conditional update fails when expectedVersion is stale", async () => {
    // Create new DRAFT navigation set at version 1
    const testSet = await prisma.navigationSet.create({
      data: {
        projectId: testProjectIdA,
        key: `concurrency-a-${Date.now()}`,
        name: "Concurrency Test A",
        context: "HEADER",
        status: "DRAFT",
        version: 1,
      },
    });

    const expectedVersion = testSet.version; // version 1

    // Concurrent mutation occurs: version increments to 2
    await prisma.navigationSet.update({
      where: { id: testSet.id },
      data: { version: { increment: 1 } },
    });

    // Stale client attempts conditional publish expecting version 1
    const fakeSnapshot = {
      key: testSet.key,
      name: testSet.name,
      context: testSet.context,
      items: [],
    };

    const stalePublishResult = await prisma.navigationSet.updateMany({
      where: {
        id: testSet.id,
        projectId: testProjectIdA,
        version: expectedVersion, // stale expected version 1 (actual DB version is 2)
        status: { not: "ARCHIVED" },
      },
      data: {
        status: "PUBLISHED",
        publishedSnapshot: fakeSnapshot as any,
        publishedVersion: expectedVersion,
        publishedAt: new Date(),
      },
    });

    // Write count must be 0 (fail-closed, optimistic concurrency rejection)
    assert.strictEqual(stalePublishResult.count, 0);

    // Verify DB record remained intact (still DRAFT, version 2, no publishedSnapshot)
    const currentRecord = await prisma.navigationSet.findUnique({
      where: { id: testSet.id },
    });
    assert.ok(currentRecord);
    assert.strictEqual(currentRecord.status, "DRAFT");
    assert.strictEqual(currentRecord.version, 2);
    assert.strictEqual(currentRecord.publishedSnapshot, null);
    assert.strictEqual(currentRecord.publishedVersion, null);
  });

  it("8. [Concurrency B] archived mutation rollback: transactional update rolls back when set is ARCHIVED", async () => {
    // Create DRAFT at version 1
    const testSet = await prisma.navigationSet.create({
      data: {
        projectId: testProjectIdA,
        key: `concurrency-b-${Date.now()}`,
        name: "Concurrency Test B",
        context: "FOOTER",
        status: "DRAFT",
        version: 1,
      },
    });

    // Transition set to ARCHIVED
    await prisma.navigationSet.update({
      where: { id: testSet.id },
      data: { status: "ARCHIVED" },
    });

    // Inside transaction: attempt item creation followed by conditional update requiring status != ARCHIVED
    let transactionFailed = false;
    try {
      await prisma.$transaction(async (tx: any) => {
        // Create an item
        await tx.navigationItem.create({
          data: {
            setId: testSet.id,
            type: "EXTERNAL_LINK",
            label: "Should Roll Back",
            externalUrl: "https://example.com/fail",
            visibility: true,
            order: 1,
          },
        });

        // Conditional version update requires status != ARCHIVED
        const vRes = await tx.navigationSet.updateMany({
          where: {
            id: testSet.id,
            projectId: testProjectIdA,
            version: testSet.version,
            status: { not: "ARCHIVED" },
          },
          data: { version: { increment: 1 } },
        });

        if (vRes.count !== 1) {
          throw new Error("CONFLICT_CONCURRENT_MUTATION");
        }
      });
    } catch (err: any) {
      if (err.message === "CONFLICT_CONCURRENT_MUTATION") {
        transactionFailed = true;
      }
    }

    assert.strictEqual(transactionFailed, true, "Transaction must fail and throw CONFLICT_CONCURRENT_MUTATION");

    // Verify item was rolled back and does not exist in DB
    const itemsInDb = await prisma.navigationItem.findMany({
      where: { setId: testSet.id },
    });
    assert.strictEqual(itemsInDb.length, 0, "Item creation must have rolled back");

    // Verify set is still ARCHIVED at version 1
    const currentSet = await prisma.navigationSet.findUnique({
      where: { id: testSet.id },
    });
    assert.ok(currentSet);
    assert.strictEqual(currentSet.status, "ARCHIVED");
    assert.strictEqual(currentSet.version, 1);
  });

  it("9. [Concurrency C] published delete protection: conditional deletion fails when status is PUBLISHED", async () => {
    // Create and PUBLISH navigation set
    const testSet = await prisma.navigationSet.create({
      data: {
        projectId: testProjectIdA,
        key: `concurrency-c-${Date.now()}`,
        name: "Concurrency Test C",
        context: "HEADER",
        status: "PUBLISHED",
        version: 1,
        publishedVersion: 1,
        publishedAt: new Date(),
      },
    });

    // Attempt conditional delete using the API contract (status IN ['DRAFT', 'ARCHIVED'])
    const delResult = await prisma.navigationSet.deleteMany({
      where: {
        id: testSet.id,
        projectId: testProjectIdA,
        status: { in: ["DRAFT", "ARCHIVED"] },
      },
    });

    // Delete count must be 0
    assert.strictEqual(delResult.count, 0, "Must not delete PUBLISHED navigation set");

    // Verify set still exists in DB
    const existingSet = await prisma.navigationSet.findUnique({
      where: { id: testSet.id },
    });
    assert.ok(existingSet);
    assert.strictEqual(existingSet.status, "PUBLISHED");
  });

  it("10. [Concurrency D] valid exact-version publication: builds and persists snapshot when expectedVersion matches", async () => {
    // Create DRAFT set with an item
    const testSet = await prisma.navigationSet.create({
      data: {
        projectId: testProjectIdA,
        key: `concurrency-d-${Date.now()}`,
        name: "Concurrency Test D",
        context: "HEADER",
        status: "DRAFT",
        version: 1,
        items: {
          create: [
            {
              type: "PAGE",
              label: "Page Item",
              pageId: pageAId,
              visibility: true,
              order: 1,
            },
          ],
        },
      },
      include: { items: true },
    });

    const projectAPages: Array<{ id: string }> = await prisma.page.findMany({
      where: { projectId: testProjectIdA },
      select: { id: true },
    });
    const availablePageIds = new Set<string>(projectAPages.map((p) => p.id));

    // Build snapshot from authoritative version N
    const snapshotRes = buildPublishedNavigationSnapshot(
      {
        key: testSet.key,
        name: testSet.name,
        context: testSet.context as any,
        description: testSet.description,
        items: testSet.items.map((i: any) => ({
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

    assert.strictEqual(snapshotRes.success, true);
    assert.ok(snapshotRes.snapshot);

    // Persist using conditional expected version N
    const publishRes = await prisma.navigationSet.updateMany({
      where: {
        id: testSet.id,
        projectId: testProjectIdA,
        version: testSet.version,
        status: { not: "ARCHIVED" },
      },
      data: {
        status: "PUBLISHED",
        publishedSnapshot: snapshotRes.snapshot as any,
        publishedVersion: testSet.version,
        publishedAt: new Date(),
      },
    });

    assert.strictEqual(publishRes.count, 1);

    const persisted = await prisma.navigationSet.findUnique({
      where: { id: testSet.id },
    });
    assert.ok(persisted);
    assert.strictEqual(persisted.status, "PUBLISHED");
    assert.strictEqual(persisted.publishedVersion, testSet.version);

    // Parse persisted snapshot and assert structure matches
    const parsed = parsePublishedNavigationSnapshot(persisted.publishedSnapshot);
    assert.ok(parsed);
    assert.strictEqual(parsed.key, testSet.key);
    assert.strictEqual(parsed.items.length, 1);
    assert.strictEqual(parsed.items[0].label, "Page Item");
    assert.strictEqual(parsed.items[0].pageId, pageAId);
  });
});
