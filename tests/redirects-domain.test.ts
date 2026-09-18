import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { RedirectService } from '../lib/domain/redirects/service';
import { prisma } from '../lib/db';
import { RedirectType } from '@prisma/client';

// Mutate prisma singleton for tests
(prisma as any).redirectRule = {
  create: mock.fn(),
  findFirst: mock.fn(),
  findMany: mock.fn(),
};

describe('Redirects Domain Service', () => {
  const projectId = 'test-redir-project-1';

  beforeEach(() => {
    (prisma.redirectRule.create as any).mock.mockImplementation(async (args: any) => {
      return args.data;
    });
    (prisma.redirectRule.findFirst as any).mock.mockImplementation(async () => null);
  });

  afterEach(() => {
    (prisma.redirectRule.create as any).mock.resetCalls();
    (prisma.redirectRule.findFirst as any).mock.resetCalls();
    (prisma.redirectRule.findMany as any).mock.resetCalls();
  });

  it('should create and resolve a valid redirect', async () => {
    (prisma.redirectRule.findFirst as any).mock.mockImplementation(async (args: any) => {
      if (args.where.projectId === projectId && args.where.sourcePath === '/old-page') {
        return { targetPath: '/new-page', type: "MOVED_PERMANENTLY" as RedirectType };
      }
      return null;
    });

    const res = await RedirectService.resolveRedirect(projectId, '/old-page');
    assert.strictEqual(res.targetPath, '/new-page');
    assert.strictEqual(res.type, "MOVED_PERMANENTLY" as RedirectType);
  });

  it('should reject reserved routes directly', async () => {
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/admin/foo', '/new', "MOVED_PERMANENTLY" as RedirectType, 1),
      { message: 'RESERVED_ROUTE' }
    );
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/foo', '/api/bar', "MOVED_PERMANENTLY" as RedirectType, 1),
      { message: 'RESERVED_ROUTE' }
    );
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/foo', '/_next/static', "MOVED_PERMANENTLY" as RedirectType, 1),
      { message: 'RESERVED_ROUTE' }
    );
  });

  it('should reject dot-segment reserved-route bypass after normalization', async () => {
    // /test/../admin => /admin (reserved)
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/test/../admin', '/new', "MOVED_PERMANENTLY" as RedirectType),
      { message: 'RESERVED_ROUTE' }
    );
    // /something/../api/data => /api/data (reserved)
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/valid', '/something/../api/data', "MOVED_PERMANENTLY" as RedirectType),
      { message: 'RESERVED_ROUTE' }
    );
    // /app/..//_next => /_next (reserved)
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/valid', '/app/../_next', "MOVED_PERMANENTLY" as RedirectType),
      { message: 'RESERVED_ROUTE' }
    );
  });

  it('should reject protocol-relative redirects (//host)', async () => {
    await assert.rejects(
      RedirectService.createRedirect(projectId, '//evil.com/path', '/safe', "MOVED_PERMANENTLY" as RedirectType),
      { message: 'EXTERNAL_TARGET_NOT_ALLOWED' }
    );
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/safe', '//attacker.com', "MOVED_PERMANENTLY" as RedirectType),
      { message: 'EXTERNAL_TARGET_NOT_ALLOWED' }
    );
  });

  it('should reject backslashes and control characters', async () => {
    await assert.rejects(
      RedirectService.createRedirect(projectId, '\\evil.com', '/safe', "MOVED_PERMANENTLY" as RedirectType),
      { message: 'INVALID_PATH' }
    );
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/safe', '/evil\\path', "MOVED_PERMANENTLY" as RedirectType),
      { message: 'INVALID_PATH' }
    );
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/safe\x00null', '/target', "MOVED_PERMANENTLY" as RedirectType),
      { message: 'INVALID_PATH' }
    );
  });

  it('should reject external targets and unsafe URI schemes', async () => {
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/foo', 'https://google.com', "MOVED_PERMANENTLY" as RedirectType),
      { message: 'EXTERNAL_TARGET_NOT_ALLOWED' }
    );
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/foo', 'javascript:alert(1)', "MOVED_PERMANENTLY" as RedirectType),
      { message: 'EXTERNAL_TARGET_NOT_ALLOWED' }
    );
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/foo', 'data:text/html,evil', "MOVED_PERMANENTLY" as RedirectType),
      { message: 'EXTERNAL_TARGET_NOT_ALLOWED' }
    );
  });

  it('should reject self redirects at create-time', async () => {
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/foo', '/foo', "MOVED_PERMANENTLY" as RedirectType),
      { message: 'SELF_REDIRECT' }
    );
    // After normalization /foo/bar/.. is /foo
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/foo', '/foo/bar/..', "MOVED_PERMANENTLY" as RedirectType),
      { message: 'SELF_REDIRECT' }
    );
  });

  it('should reject create-time chain cycles', async () => {
    // Existing rule in DB: /b -> /c
    (prisma.redirectRule.findFirst as any).mock.mockImplementation(async (args: any) => {
      if (args.where.projectId === projectId && args.where.sourcePath === '/b') {
        return { targetPath: '/c', active: true };
      }
      return null;
    });

    // Attempting to create /c -> /b creates a cycle (/c -> /b -> /c)
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/c', '/b', "MOVED_PERMANENTLY" as RedirectType),
      { message: 'CYCLE_DETECTED' }
    );
  });

  it('should enforce MAX_HOPS safely in resolveRedirect', async () => {
    // Simulate chain exceeding MAX_HOPS (5 hops)
    // /hop0 -> /hop1 -> /hop2 -> /hop3 -> /hop4 -> /hop5 -> /hop6
    const rules: Record<string, string> = {
      '/hop0': '/hop1',
      '/hop1': '/hop2',
      '/hop2': '/hop3',
      '/hop3': '/hop4',
      '/hop4': '/hop5',
      '/hop5': '/hop6',
    };

    (prisma.redirectRule.findFirst as any).mock.mockImplementation(async (args: any) => {
      const tgt = rules[args.where.sourcePath];
      if (tgt) {
        return { targetPath: tgt, type: "MOVED_PERMANENTLY" as RedirectType, active: true };
      }
      return null;
    });

    const res = await RedirectService.resolveRedirect(projectId, '/hop0');
    // Exceeds MAX_HOPS => safely aborts and returns null
    assert.strictEqual(res.targetPath, null);
    assert.strictEqual(res.type, null);
  });

  it('should validate RedirectType strictly (301 MOVED_PERMANENTLY or 302 FOUND)', async () => {
    // Valid types
    const r1 = await RedirectService.createRedirect(projectId, '/page-1', '/target-1', "MOVED_PERMANENTLY" as RedirectType);
    assert.strictEqual(r1.type, "MOVED_PERMANENTLY");

    const r2 = await RedirectService.createRedirect(projectId, '/page-2', '/target-2', "FOUND" as RedirectType);
    assert.strictEqual(r2.type, "FOUND");

    // Invalid type
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/page-3', '/target-3', "TEMPORARY_REDIRECT" as any),
      { message: 'INVALID_REDIRECT_TYPE' }
    );
  });

  it('should validate priority type (integer only)', async () => {
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/p1', '/p2', "MOVED_PERMANENTLY" as RedirectType, 1.5 as any),
      { message: 'INVALID_PRIORITY' }
    );
    await assert.rejects(
      RedirectService.createRedirect(projectId, '/p1', '/p2', "MOVED_PERMANENTLY" as RedirectType, '10' as any),
      { message: 'INVALID_PRIORITY' }
    );
  });

  it('should enforce strict project isolation', async () => {
    (prisma.redirectRule.findFirst as any).mock.mockImplementation(async (args: any) => {
      if (args.where.projectId === 'project-A' && args.where.sourcePath === '/isolated') {
        return { targetPath: '/target-A', type: "MOVED_PERMANENTLY" as RedirectType };
      }
      return null;
    });

    const resA = await RedirectService.resolveRedirect('project-A', '/isolated');
    assert.strictEqual(resA.targetPath, '/target-A');

    const resB = await RedirectService.resolveRedirect('project-B', '/isolated');
    assert.strictEqual(resB.targetPath, null);
  });
});
