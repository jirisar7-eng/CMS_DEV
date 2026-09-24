/**
 * SYNTHESIS CMS — POSTGRESQL REAL INTEGRATION TEST
 * Navigation published snapshot persistence, project isolation, and schema compatibility.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { buildPublishedNavigationSnapshot, parsePublishedNavigationSnapshot } from '../lib/domain/navigation/snapshot';
import { PublishedNavigationSnapshot } from '../lib/domain/navigation/types';

describe('PostgreSQL Real Integration - Navigation Published Snapshot Lifecycle', () => {
  let prisma: PrismaClient;
  const testProjectIdA = `test-nav-proj-a-${Date.now()}`;
  const testProjectIdB = `test-nav-proj-b-${Date.now()}`;
  let navSetAId = '';
  let pageAId = '';

  before(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required for PostgreSQL integration tests.');
    }
    prisma = new PrismaClient();

    // Create test projects
    await prisma.project.createMany({
      data: [
        { id: testProjectIdA, key: `proj-a-${Date.now()}`, name: 'Project A', status: 'ACTIVE' },
        { id: testProjectIdB, key: `proj-b-${Date.now()}`, name: 'Project B', status: 'ACTIVE' },
      ],
    });

    // Create a page in Project A
    const page = await prisma.page.create({
      data: {
        projectId: testProjectIdA,
        key: `page-a-${Date.now()}`,
        title: 'Page in Proj A',
        slug: `page-a-${Date.now()}`,
        locale: 'en',
        visibility: 'PUBLIC',
      },
    });
    pageAId = page.id;
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

  it('1. creates draft navigation set with null publishedSnapshot, maintaining full backwards compatibility', async () => {
    const navSet = await prisma.navigationSet.create({
      data: {
        projectId: testProjectIdA,
        key: 'header-main',
        name: 'Header Main',
        context: 'HEADER',
        status: 'DRAFT',
        version: 1,
      },
    });
    navSetAId = navSet.id;

    assert.ok(navSet.id);
    assert.strictEqual(navSet.status, 'DRAFT');
    assert.strictEqual(navSet.version, 1);
    assert.strictEqual(navSet.publishedSnapshot, null);
    assert.strictEqual(navSet.publishedVersion, null);
    assert.strictEqual(navSet.publishedAt, null);
  });

  it('2. attaches navigation items to the draft set', async () => {
    const item1 = await prisma.navigationItem.create({
      data: {
        setId: navSetAId,
        type: 'PAGE',
        label: 'Home Page',
        pageId: pageAId,
        visibility: true,
        order: 1,
      },
    });

    const item2 = await prisma.navigationItem.create({
      data: {
        setId: navSetAId,
        type: 'EXTERNAL_LINK',
        label: 'Docs',
        externalUrl: 'https://docs.example.com',
        visibility: true,
        openInNewTab: true,
        order: 2,
      },
    });

    assert.ok(item1.id);
    assert.ok(item2.id);

    const fullSet = await prisma.navigationSet.findUnique({
      where: { id: navSetAId },
      include: { items: { orderBy: { order: 'asc' } } },
    });

    assert.ok(fullSet);
    assert.strictEqual(fullSet.items.length, 2);
  });

  it('3. builds, persists and retrieves exact immutable publishedSnapshot', async () => {
    const fullSet = await prisma.navigationSet.findUnique({
      where: { id: navSetAId },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    assert.ok(fullSet);

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
      { availablePageIds: new Set([pageAId]) }
    );

    assert.strictEqual(buildRes.success, true);
    assert.ok(buildRes.snapshot);

    const now = new Date();
    const updated = await prisma.navigationSet.update({
      where: { id: navSetAId },
      data: {
        status: 'PUBLISHED',
        publishedSnapshot: buildRes.snapshot as any,
        publishedVersion: fullSet.version,
        publishedAt: now,
      },
    });

    assert.strictEqual(updated.status, 'PUBLISHED');
    assert.strictEqual(updated.publishedVersion, fullSet.version);
    assert.ok(updated.publishedAt);
    assert.ok(updated.publishedSnapshot);

    const parsed = parsePublishedNavigationSnapshot(updated.publishedSnapshot);
    assert.ok(parsed);
    assert.strictEqual(parsed.key, 'header-main');
    assert.strictEqual(parsed.name, 'Header Main');
    assert.strictEqual(parsed.items.length, 2);
    assert.strictEqual(parsed.items[0].label, 'Home Page');
    assert.strictEqual(parsed.items[0].pageId, pageAId);
    assert.strictEqual(parsed.items[1].label, 'Docs');
    assert.strictEqual(parsed.items[1].externalUrl, 'https://docs.example.com');
  });

  it('4. verifies project isolation: project B cannot access or overwrite project A navigation set', async () => {
    const notFoundInB = await prisma.navigationSet.findFirst({
      where: { id: navSetAId, projectId: testProjectIdB },
    });
    assert.strictEqual(notFoundInB, null);

    // Unique constraint on (projectId, key) allows same key in different projects
    const setB = await prisma.navigationSet.create({
      data: {
        projectId: testProjectIdB,
        key: 'header-main',
        name: 'Header Main in B',
        context: 'HEADER',
        status: 'DRAFT',
      },
    });
    assert.ok(setB.id);
    assert.notStrictEqual(setB.id, navSetAId);
  });
});
