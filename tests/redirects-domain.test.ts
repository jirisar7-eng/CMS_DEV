import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import { RedirectService } from '../lib/domain/redirects/service';
import { prisma } from '../lib/db';
import { RedirectType } from '@prisma/client';

// Mutate prisma singleton for tests
(prisma as any).redirectRule = {
  create: mock.fn(),
  findFirst: mock.fn(),
};

describe('Redirects Domain Service', () => {
  const projectId = 'test-redir-project-1';

  beforeEach(() => {
    (prisma.redirectRule.create as any).mock.mockImplementation(async (args: any) => {
      return args.data;
    });
  });

  afterEach(() => {
    (prisma.redirectRule.create as any).mock.resetCalls();
    (prisma.redirectRule.findFirst as any).mock.resetCalls();
  });

  it('should create and resolve a valid redirect', async () => {
    (prisma.redirectRule.findFirst as any).mock.mockImplementation(async (args: any) => {
      if (args.where.sourcePath === '/old-page') return { targetPath: '/new-page', type: "MOVED_PERMANENTLY" as RedirectType };
      return null;
    });

    const res = await RedirectService.resolveRedirect(projectId, '/old-page');
    assert.strictEqual(res.targetPath, '/new-page');
    assert.strictEqual(res.type, "MOVED_PERMANENTLY" as RedirectType);
  });

  it('should reject reserved routes', async () => {
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/admin/foo', '/new', "MOVED_PERMANENTLY" as RedirectType, 1),
      { message: 'RESERVED_ROUTE' }
    );
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/foo', '/api/bar', "MOVED_PERMANENTLY" as RedirectType, 1),
      { message: 'RESERVED_ROUTE' }
    );
  });

  it('should reject external targets', async () => {
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/foo', 'https://google.com', "MOVED_PERMANENTLY" as RedirectType, 1),
      { message: 'EXTERNAL_TARGET_NOT_ALLOWED' }
    );
  });

  it('should reject self redirects', async () => {
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/foo', '/foo', "MOVED_PERMANENTLY" as RedirectType, 1),
      { message: 'SELF_REDIRECT' }
    );
  });

  it('should resolve chains up to max hops', async () => {
    (prisma.redirectRule.findFirst as any).mock.mockImplementation(async (args: any) => {
      if (args.where.sourcePath === '/a') return { targetPath: '/b', type: "MOVED_PERMANENTLY" as RedirectType };
      if (args.where.sourcePath === '/b') return { targetPath: '/c', type: "FOUND" as RedirectType };
      return null;
    });

    const res = await RedirectService.resolveRedirect(projectId, '/a');
    assert.strictEqual(res.targetPath, '/c');
    assert.strictEqual(res.type, "FOUND" as RedirectType);
  });

  it('should detect cycles and return null', async () => {
    (prisma.redirectRule.findFirst as any).mock.mockImplementation(async (args: any) => {
      if (args.where.sourcePath === '/loop1') return { targetPath: '/loop2', type: "MOVED_PERMANENTLY" as RedirectType };
      if (args.where.sourcePath === '/loop2') return { targetPath: '/loop1', type: "MOVED_PERMANENTLY" as RedirectType };
      return null;
    });

    const res = await RedirectService.resolveRedirect(projectId, '/loop1');
    assert.strictEqual(res.targetPath, null);
  });
});
