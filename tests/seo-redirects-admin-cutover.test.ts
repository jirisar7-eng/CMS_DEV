// @ts-nocheck
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';

class MockNextResponse {
  status: number;
  headers: Map<string, string>;
  private _body: any;

  constructor(body: any, init?: { status?: number; headers?: Record<string, string> }) {
    this._body = body;
    this.status = init?.status ?? 200;
    this.headers = new Map(Object.entries(init?.headers || {}));
  }

  static json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
    return new MockNextResponse(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  }

  async json() {
    return typeof this._body === 'string' ? JSON.parse(this._body) : this._body;
  }
}

class MockNextRequest extends Request {
  nextUrl: URL;
  constructor(input: string | URL, init?: RequestInit) {
    super(input, init);
    this.nextUrl = new URL(typeof input === 'string' ? input : input.toString());
  }
}

// In-memory mock database
const mockDb = {
  projectSeoSettings: new Map(),
  redirectRules: new Map(),
  projects: new Map([
    ['proj-1', { id: 'proj-1', name: 'Project 1' }],
    ['proj-2', { id: 'proj-2', name: 'Project 2' }],
  ]),
};

const mockPrisma = {
  projectSeoSettings: {
    findUnique: async ({ where }: any) => {
      return mockDb.projectSeoSettings.get(where.projectId) || null;
    },
    upsert: async ({ where, update, create }: any) => {
      const existing = mockDb.projectSeoSettings.get(where.projectId);
      if (existing) {
        const updated = { ...existing, ...update, updatedAt: new Date() };
        mockDb.projectSeoSettings.set(where.projectId, updated);
        return updated;
      }
      const created = { id: `seo-${Date.now()}`, ...create, createdAt: new Date(), updatedAt: new Date() };
      mockDb.projectSeoSettings.set(where.projectId, created);
      return created;
    },
  },
  redirectRule: {
    findMany: async ({ where }: any) => {
      const rules = Array.from(mockDb.redirectRules.values());
      return rules.filter(r => {
        if (where?.projectId && r.projectId !== where.projectId) return false;
        return true;
      });
    },
    findFirst: async ({ where }: any) => {
      const rules = Array.from(mockDb.redirectRules.values());
      return rules.find(r => {
        if (where?.projectId && r.projectId !== where.projectId) return false;
        if (where?.sourcePath && r.sourcePath !== where.sourcePath) return false;
        if (where?.targetPath && r.targetPath !== where.targetPath) return false;
        if (where?.id?.not && r.id === where.id.not) return false;
        return true;
      }) || null;
    },
    findUnique: async ({ where }: any) => {
      return mockDb.redirectRules.get(where.id) || null;
    },
    create: async ({ data }: any) => {
      const id = `rule-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const rule = {
        id,
        projectId: data.projectId,
        sourcePath: data.sourcePath,
        targetPath: data.targetPath,
        type: data.type,
        active: data.active ?? true,
        priority: data.priority ?? 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDb.redirectRules.set(id, rule);
      return rule;
    },
    update: async ({ where, data }: any) => {
      const existing = mockDb.redirectRules.get(where.id);
      if (!existing) throw new Error('NOT_FOUND');
      const updated = { ...existing, ...data, updatedAt: new Date() };
      mockDb.redirectRules.set(where.id, updated);
      return updated;
    },
    delete: async ({ where }: any) => {
      const existing = mockDb.redirectRules.get(where.id);
      if (!existing) throw new Error('NOT_FOUND');
      mockDb.redirectRules.delete(where.id);
      return existing;
    },
  },
  project: {
    findUnique: async ({ where }: any) => {
      return mockDb.projects.get(where.id) || null;
    },
  },
};

let currentUserId = 'user-admin';
let userPermissions: string[] = [
  'seo.read',
  'seo.manage_defaults',
  'redirects.read',
  'redirects.create',
  'redirects.update',
  'redirects.delete'
];

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === 'next/server') {
    return { NextResponse: MockNextResponse, NextRequest: MockNextRequest };
  }
  if (id === '@/lib/db') {
    return { prisma: mockPrisma };
  }
  if (id === '@/lib/auth/session') {
    return { getSession: async () => ({ session: { userId: currentUserId }, user: { id: currentUserId } }) };
  }
  if (id === '@/lib/auth/rbac') {
    return {
      requirePermission: async (perm: string) => {
        if (!currentUserId) throw new Error('UNAUTHENTICATED');
        if (!userPermissions.includes(perm)) throw new Error('UNAUTHORIZED');
        return true;
      },
    };
  }
  if (id === '@/lib/domain/pages-client/server-context') {
    return {
      getActiveProjectContext: async (projectId: string) => {
        if (!projectId || !mockDb.projects.has(projectId)) {
          return { status: 'PROJECT_NOT_FOUND', projectId: null };
        }
        return { status: 'PROJECT_VALID', projectId };
      },
      getActiveProjectId: async () => 'proj-1',
    };
  }
  if (id.startsWith('@/')) {
    const relativePath = id.slice(2);
    return originalRequire.call(this, path.resolve(__dirname, '..', relativePath));
  }
  return originalRequire.apply(this, arguments);
};

const rootDir = path.resolve(__dirname, '..');

describe('SYN-WEB-003: SEO & Redirects Admin Cutover Test Suite', () => {
  beforeEach(() => {
    mockDb.projectSeoSettings.clear();
    mockDb.redirectRules.clear();
    currentUserId = 'user-admin';
    userPermissions = [
      'seo.read',
      'seo.manage_defaults',
      'redirects.read',
      'redirects.create',
      'redirects.update',
      'redirects.delete'
    ];
  });

  describe('1. SEO Settings API & Persistence (/api/admin/projects/[projectId]/seo)', () => {
    it('GET returns empty settings when none are configured', async () => {
      const seoRoute = await import('../app/api/admin/projects/[projectId]/seo/route');
      const req = new MockNextRequest('http://localhost:3000/api/admin/projects/proj-1/seo');
      const res = await seoRoute.GET(req, { params: Promise.resolve({ projectId: 'proj-1' }) });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.deepStrictEqual(data, {});
    });

    it('GET fails when project does not exist (404)', async () => {
      const seoRoute = await import('../app/api/admin/projects/[projectId]/seo/route');
      const req = new MockNextRequest('http://localhost:3000/api/admin/projects/proj-unknown/seo');
      const res = await seoRoute.GET(req, { params: Promise.resolve({ projectId: 'proj-unknown' }) });
      assert.strictEqual(res.status, 404);
    });

    it('GET enforces seo.read permission', async () => {
      userPermissions = [];
      const seoRoute = await import('../app/api/admin/projects/[projectId]/seo/route');
      const req = new MockNextRequest('http://localhost:3000/api/admin/projects/proj-1/seo');
      const res = await seoRoute.GET(req, { params: Promise.resolve({ projectId: 'proj-1' }) });
      assert.strictEqual(res.status, 403);
    });

    it('PUT upserts valid SEO settings and respects project isolation', async () => {
      const seoRoute = await import('../app/api/admin/projects/[projectId]/seo/route');
      const req = new MockNextRequest('http://localhost:3000/api/admin/projects/proj-1/seo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultTitle: 'Moje Stránka',
          titleTemplate: '%s | Můj Web',
          defaultDescription: 'Popis mého webu',
          defaultOgImage: 'https://example.com/og.jpg',
          robotsTxt: 'User-agent: *\nDisallow: /admin',
        }),
      });

      const res = await seoRoute.PUT(req, { params: Promise.resolve({ projectId: 'proj-1' }) });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.defaultTitle, 'Moje Stránka');
      assert.strictEqual(data.titleTemplate, '%s | Můj Web');
      assert.strictEqual(data.robotsTxt, 'User-agent: *\nDisallow: /admin');

      // Check isolation: proj-2 has no settings
      const req2 = new MockNextRequest('http://localhost:3000/api/admin/projects/proj-2/seo');
      const res2 = await seoRoute.GET(req2, { params: Promise.resolve({ projectId: 'proj-2' }) });
      const data2 = await res2.json();
      assert.deepStrictEqual(data2, {});
    });

    it('PUT rejects invalid input formats', async () => {
      const seoRoute = await import('../app/api/admin/projects/[projectId]/seo/route');
      const req = new MockNextRequest('http://localhost:3000/api/admin/projects/proj-1/seo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultTitle: 12345, // Invalid: number instead of string
        }),
      });

      const res = await seoRoute.PUT(req, { params: Promise.resolve({ projectId: 'proj-1' }) });
      assert.strictEqual(res.status, 400);
    });

    it('PUT enforces seo.manage_defaults permission', async () => {
      userPermissions = ['seo.read']; // Missing seo.manage_defaults
      const seoRoute = await import('../app/api/admin/projects/[projectId]/seo/route');
      const req = new MockNextRequest('http://localhost:3000/api/admin/projects/proj-1/seo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultTitle: 'Test' }),
      });

      const res = await seoRoute.PUT(req, { params: Promise.resolve({ projectId: 'proj-1' }) });
      assert.strictEqual(res.status, 403);
    });
  });

  describe('2. Redirects API & CRUD Operations', () => {
    it('POST creates redirect rule with validation', async () => {
      const redirectsRoute = await import('../app/api/admin/projects/[projectId]/redirects/route');
      const req = new MockNextRequest('http://localhost:3000/api/admin/projects/proj-1/redirects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePath: '/old-about',
          targetPath: '/about',
          type: 'MOVED_PERMANENTLY',
          priority: 5,
        }),
      });

      const res = await redirectsRoute.POST(req, { params: Promise.resolve({ projectId: 'proj-1' }) });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.sourcePath, '/old-about');
      assert.strictEqual(data.targetPath, '/about');
      assert.strictEqual(data.type, 'MOVED_PERMANENTLY');
      assert.strictEqual(data.priority, 5);
      assert.strictEqual(data.active, true);
    });

    it('POST rejects reserved route in source or target', async () => {
      const redirectsRoute = await import('../app/api/admin/projects/[projectId]/redirects/route');
      const req = new MockNextRequest('http://localhost:3000/api/admin/projects/proj-1/redirects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePath: '/admin/settings',
          targetPath: '/somewhere',
          type: 'MOVED_PERMANENTLY',
        }),
      });

      const res = await redirectsRoute.POST(req, { params: Promise.resolve({ projectId: 'proj-1' }) });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.error, 'RESERVED_ROUTE');
    });

    it('POST rejects self-redirect (loop)', async () => {
      const redirectsRoute = await import('../app/api/admin/projects/[projectId]/redirects/route');
      const req = new MockNextRequest('http://localhost:3000/api/admin/projects/proj-1/redirects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePath: '/loop',
          targetPath: '/loop',
          type: 'MOVED_PERMANENTLY',
        }),
      });

      const res = await redirectsRoute.POST(req, { params: Promise.resolve({ projectId: 'proj-1' }) });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.error, 'SELF_REDIRECT');
    });

    it('POST detects cycle chain (/a -> /b, then /b -> /a)', async () => {
      const redirectsRoute = await import('../app/api/admin/projects/[projectId]/redirects/route');

      // First rule: /page-a -> /page-b
      await redirectsRoute.POST(new MockNextRequest('http://localhost:3000/api/admin/projects/proj-1/redirects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath: '/page-a', targetPath: '/page-b', type: 'MOVED_PERMANENTLY' }),
      }), { params: Promise.resolve({ projectId: 'proj-1' }) });

      // Second rule creates cycle: /page-b -> /page-a
      const res = await redirectsRoute.POST(new MockNextRequest('http://localhost:3000/api/admin/projects/proj-1/redirects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath: '/page-b', targetPath: '/page-a', type: 'MOVED_PERMANENTLY' }),
      }), { params: Promise.resolve({ projectId: 'proj-1' }) });

      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.error, 'CYCLE_DETECTED');
    });

    it('PATCH updates existing redirect rule with cycle check excluding self', async () => {
      const redirectsRoute = await import('../app/api/admin/projects/[projectId]/redirects/route');
      const ruleRoute = await import('../app/api/admin/projects/[projectId]/redirects/[ruleId]/route');

      // Create rule
      const createRes = await redirectsRoute.POST(new MockNextRequest('http://localhost:3000/api/admin/projects/proj-1/redirects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath: '/old-link', targetPath: '/target-1', type: 'MOVED_PERMANENTLY' }),
      }), { params: Promise.resolve({ projectId: 'proj-1' }) });

      const created = await createRes.json();
      assert.ok(created.id);

      // Update target and active
      const patchReq = new MockNextRequest(`http://localhost:3000/api/admin/projects/proj-1/redirects/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPath: '/target-2',
          active: false,
          priority: 10,
        }),
      });

      const patchRes = await ruleRoute.PATCH(patchReq, { params: Promise.resolve({ projectId: 'proj-1', ruleId: created.id }) });
      assert.strictEqual(patchRes.status, 200);
      const updated = await patchRes.json();
      assert.strictEqual(updated.targetPath, '/target-2');
      assert.strictEqual(updated.active, false);
      assert.strictEqual(updated.priority, 10);
    });

    it('PATCH enforces project isolation', async () => {
      const redirectsRoute = await import('../app/api/admin/projects/[projectId]/redirects/route');
      const ruleRoute = await import('../app/api/admin/projects/[projectId]/redirects/[ruleId]/route');

      // Create rule in proj-1
      const createRes = await redirectsRoute.POST(new MockNextRequest('http://localhost:3000/api/admin/projects/proj-1/redirects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath: '/secret', targetPath: '/public', type: 'MOVED_PERMANENTLY' }),
      }), { params: Promise.resolve({ projectId: 'proj-1' }) });
      const created = await createRes.json();

      // Try updating from proj-2 context -> must return 404
      const patchReq = new MockNextRequest(`http://localhost:3000/api/admin/projects/proj-2/redirects/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPath: '/hacked' }),
      });
      const patchRes = await ruleRoute.PATCH(patchReq, { params: Promise.resolve({ projectId: 'proj-2', ruleId: created.id }) });
      assert.strictEqual(patchRes.status, 404);
    });

    it('DELETE removes rule and enforces project isolation', async () => {
      const redirectsRoute = await import('../app/api/admin/projects/[projectId]/redirects/route');
      const ruleRoute = await import('../app/api/admin/projects/[projectId]/redirects/[ruleId]/route');

      // Create rule in proj-1
      const createRes = await redirectsRoute.POST(new MockNextRequest('http://localhost:3000/api/admin/projects/proj-1/redirects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath: '/to-delete', targetPath: '/somewhere', type: 'MOVED_PERMANENTLY' }),
      }), { params: Promise.resolve({ projectId: 'proj-1' }) });
      const created = await createRes.json();

      // Try deleting from proj-2 -> 404
      const delReqWrong = new MockNextRequest(`http://localhost:3000/api/admin/projects/proj-2/redirects/${created.id}`, {
        method: 'DELETE',
      });
      const delResWrong = await ruleRoute.DELETE(delReqWrong, { params: Promise.resolve({ projectId: 'proj-2', ruleId: created.id }) });
      assert.strictEqual(delResWrong.status, 404);

      // Delete from proj-1 -> 200
      const delReqRight = new MockNextRequest(`http://localhost:3000/api/admin/projects/proj-1/redirects/${created.id}`, {
        method: 'DELETE',
      });
      const delResRight = await ruleRoute.DELETE(delReqRight, { params: Promise.resolve({ projectId: 'proj-1', ruleId: created.id }) });
      assert.strictEqual(delResRight.status, 200);

      // Verify deletion in GET
      const getRes = await redirectsRoute.GET(new MockNextRequest('http://localhost:3000/api/admin/projects/proj-1/redirects'), {
        params: Promise.resolve({ projectId: 'proj-1' }),
      });
      const list = await getRes.json();
      assert.strictEqual(list.length, 0);
    });
  });

  describe('3. UI Contract Truthfulness & Mock Data Removal', () => {
    it('app/admin/seo/page.tsx resolves active project server-side and mounts SeoWorkspace', () => {
      const pageCode = fs.readFileSync(path.join(rootDir, 'app/admin/seo/page.tsx'), 'utf8');
      assert.match(pageCode, /getActiveProjectId/);
      assert.match(pageCode, /<SeoWorkspace\s+projectId=\{projectId\}/);
      assert.doesNotMatch(pageCode, /"use client"/);
    });

    it('components/admin/seo/SeoWorkspace.tsx contains no hardcoded mock data and uses %s template', () => {
      const wsCode = fs.readFileSync(path.join(rootDir, 'components/admin/seo/SeoWorkspace.tsx'), 'utf8');
      assert.doesNotMatch(wsCode, /%page_title%/);
      assert.match(wsCode, /%s/);
      assert.doesNotMatch(wsCode, /24 publikovaných stránek/);
      assert.match(wsCode, /Plánovaný runtime/);
      assert.match(wsCode, /\/api\/admin\/projects\/.*\/seo/);
      assert.match(wsCode, /method:\s*['"]PUT['"]/);
      assert.match(wsCode, /method:\s*['"]GET['"]/);
    });

    it('app/admin/redirects/page.tsx resolves active project server-side and mounts RedirectsWorkspace', () => {
      const pageCode = fs.readFileSync(path.join(rootDir, 'app/admin/redirects/page.tsx'), 'utf8');
      assert.match(pageCode, /getActiveProjectId/);
      assert.match(pageCode, /<RedirectsWorkspace\s+projectId=\{projectId\}/);
      assert.doesNotMatch(pageCode, /"use client"/);
    });

    it('components/admin/redirects/RedirectsWorkspace.tsx has no fake hits or static redirect rows', () => {
      const wsCode = fs.readFileSync(path.join(rootDir, 'components/admin/redirects/RedirectsWorkspace.tsx'), 'utf8');
      assert.doesNotMatch(wsCode, /\/stary-cenik/);
      assert.doesNotMatch(wsCode, /\/kontakt-podpora/);
      assert.doesNotMatch(wsCode, /hits:\s*342/);
      assert.match(wsCode, /\/api\/admin\/projects\/.*\/redirects/);
      assert.match(wsCode, /method:\s*['"]POST['"]/);
      assert.match(wsCode, /method:\s*['"]PATCH['"]/);
      assert.match(wsCode, /method:\s*['"]DELETE['"]/);
    });

    it('adminNav.ts reflects truthfulness: SEO is ZÁKLAD and Redirects is FUNKČNÍ', () => {
      const navCode = fs.readFileSync(path.join(rootDir, 'lib/navigation/adminNav.ts'), 'utf8');
      assert.match(navCode, /id:\s*'seo'[\s\S]*?status:\s*'ZÁKLAD'/);
      assert.match(navCode, /id:\s*'redirects'[\s\S]*?status:\s*'FUNKČNÍ'/);
    });
  });
});
