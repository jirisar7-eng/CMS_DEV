// @ts-nocheck
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';

// Setup Mock HTTP primitives for Next.js API route testing
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

// Intercept modules for clean isolation
let currentMockSession = { user: null };
let mockPrismaData = {
  permissions: [],
  roles: [],
  rolePermissions: [],
  userRoles: [],
  userPermissionOverrides: [],
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === 'next/server') {
    return { NextResponse: MockNextResponse, NextRequest: MockNextRequest };
  }
  if (id === 'next/headers') {
    return {
      cookies: async () => ({
        get: () => ({ value: 'test-cookie' }),
      }),
    };
  }
  if (id === '@/lib/auth/session') {
    return {
      getSession: async () => currentMockSession,
    };
  }
  if (id === '@/lib/db') {
    return {
      prisma: {
        permission: {
          findUnique: async ({ where }: any) => {
            return mockPrismaData.permissions.find((p: any) => p.key === where.key || p.id === where.id) || null;
          },
        },
        userPermissionOverride: {
          findMany: async ({ where }: any) => {
            return mockPrismaData.userPermissionOverrides.filter((o: any) => {
              if (o.userId !== where.userId) return false;
              if (where.permissionId && o.permissionId !== where.permissionId) return false;
              return true;
            });
          },
        },
        userRole: {
          findMany: async ({ where, include }: any) => {
            const matchedRoles = mockPrismaData.userRoles.filter((ur: any) => ur.userId === where.userId);
            const wherePermId = include?.role?.include?.permissions?.where?.permissionId;
            return matchedRoles.map((ur: any) => {
              const roleObj = mockPrismaData.roles.find((r: any) => r.id === ur.roleId) || { id: ur.roleId };
              const rolePerms = mockPrismaData.rolePermissions.filter((rp: any) => {
                if (rp.roleId !== ur.roleId) return false;
                if (wherePermId && rp.permissionId !== wherePermId) return false;
                return true;
              });
              return {
                ...ur,
                role: {
                  ...roleObj,
                  permissions: rolePerms,
                },
              };
            });
          },
        },
      },
    };
  }
  if (id.startsWith('@/')) {
    const relativePath = id.slice(2);
    return originalRequire.call(this, path.resolve(__dirname, '..', relativePath));
  }
  return originalRequire.apply(this, arguments as any);
};

// Domain imports loaded after mock registration
const {
  resolveBasicSystemMap,
  resolveInternalSystemMap,
  resolveSystemMap,
  redactToBasicCapability,
  loadCapabilitiesRegistry,
  loadTasksRegistry,
  SystemMapRegistryError,
} = require('../lib/domain/system-map');

const { hasPermission } = require('../lib/auth/rbac');
const { GET: systemMapApiHandler } = require('../app/api/admin/system-map/route');

describe('SYN-SYSTEM-MAP-001: Secure System Map Resolver & Access Control', () => {
  const rootDir = path.resolve(__dirname, '..');

  beforeEach(() => {
    currentMockSession = { user: null };
    mockPrismaData = {
      permissions: [
        { id: 'p-basic', key: 'system_map.read_basic', description: 'Read basic map' },
        { id: 'p-internal', key: 'system_map.read_internal', description: 'Read internal map' },
      ],
      roles: [
        { id: 'r-superadmin', name: 'SUPER_ADMIN', isSystem: true },
        { id: 'r-viewer', name: 'VIEWER', isSystem: false },
      ],
      rolePermissions: [
        // SUPER_ADMIN has system_map.read_basic, but explicitly NOT system_map.read_internal
        { roleId: 'r-superadmin', permissionId: 'p-basic' },
      ],
      userRoles: [],
      userPermissionOverrides: [],
    };
  });

  describe('1. Lineage File Registry Integrity & Loading', () => {
    it('successfully loads authoritative capabilities registry', () => {
      const caps = loadCapabilitiesRegistry(rootDir);
      assert.strictEqual(typeof caps.registry_version, 'string');
      assert.ok(Array.isArray(caps.capabilities));
      assert.strictEqual(caps.capabilities.length, 13);
    });

    it('successfully loads authoritative tasks registry', () => {
      const tasks = loadTasksRegistry(rootDir);
      assert.strictEqual(typeof tasks.registry_version, 'string');
      assert.strictEqual(typeof tasks.total_tasks, 'number');
      assert.strictEqual(tasks.total_tasks, 34);
      assert.strictEqual(tasks.tasks.length, 34);
    });

    it('fails closed with SystemMapRegistryError when capabilities registry is missing', () => {
      assert.throws(
        () => loadCapabilitiesRegistry('/non/existent/path'),
        (err: any) => {
          assert.ok(err instanceof SystemMapRegistryError);
          return true;
        }
      );
    });

    it('fails closed with SystemMapRegistryError when tasks registry is missing', () => {
      assert.throws(
        () => loadTasksRegistry('/non/existent/path'),
        (err: any) => {
          assert.ok(err instanceof SystemMapRegistryError);
          return true;
        }
      );
    });
  });

  describe('2. Basic View Security & Complete Internal Redaction', () => {
    it('produces basic view containing only safe public metadata', () => {
      const basicMap = resolveBasicSystemMap(rootDir);

      assert.strictEqual(basicMap.view, 'basic');
      assert.strictEqual(basicMap.total_capabilities, 13);
      assert.strictEqual(basicMap.capabilities.length, 13);
      assert.strictEqual((basicMap as any).tasks, undefined, 'Tasks must be completely omitted from basic view');

      for (const cap of basicMap.capabilities) {
        // Allowed keys
        assert.ok(typeof cap.capability_id === 'string');
        assert.ok(['OWNER_INTERNAL', 'SAFE_PUBLIC_METADATA'].includes(cap.visibility));
        assert.ok(typeof cap.project_scoped === 'boolean');
        assert.ok(Array.isArray(cap.depends_on_capabilities));
        assert.ok(typeof cap.ssot_role === 'string');

        // Forbidden sensitive keys MUST NOT exist
        assert.strictEqual((cap as any).canonical_owner_paths, undefined, 'Paths must be stripped');
        assert.strictEqual((cap as any).data_models, undefined, 'Data models must be stripped');
        assert.strictEqual((cap as any).api_boundaries, undefined, 'API boundaries must be stripped');
        assert.strictEqual((cap as any).security_boundary, undefined, 'Security boundaries must be stripped');
        assert.strictEqual((cap as any).source_tasks, undefined, 'Source tasks must be stripped');
        assert.strictEqual((cap as any).last_merge_sha, undefined, 'Git merge SHA must be stripped');
      }
    });

    it('redaction removes all internal filesystem paths, DB models, API routes, and Git hashes from serialized JSON', () => {
      const basicMap = resolveBasicSystemMap(rootDir);
      const serialized = JSON.stringify(basicMap);

      // Verify no sensitive internal path signatures leak
      assert.doesNotMatch(serialized, /lib\/auth/);
      assert.doesNotMatch(serialized, /app\/\(auth\)\/admin/);
      assert.doesNotMatch(serialized, /\.synthesis\//);
      assert.doesNotMatch(serialized, /scripts\/ci/);

      // Verify no DB models leak
      assert.doesNotMatch(serialized, /"UserPermissionOverride"/);
      assert.doesNotMatch(serialized, /"RolePermission"/);
      assert.doesNotMatch(serialized, /"AuditLog"/);

      // Verify no security boundaries leak
      assert.doesNotMatch(serialized, /AUTH_SESSION_COOKIE_RBAC/);
      assert.doesNotMatch(serialized, /SYSTEM_GOVERNANCE/);

      // Verify no task capsule IDs leak
      assert.doesNotMatch(serialized, /SYN-SEC-001/);
      assert.doesNotMatch(serialized, /SYN-GOV-LINEAGE-001/);

      // Verify no 40-character SHA-1 hashes leak
      assert.doesNotMatch(serialized, /[0-9a-f]{40}/);
    });
  });

  describe('3. Internal View Lineage & Full Fidelity', () => {
    it('returns full internal lineage data with all capabilities and tasks', () => {
      const internalMap = resolveInternalSystemMap(rootDir);

      assert.strictEqual(internalMap.view, 'internal');
      assert.strictEqual(internalMap.total_capabilities, 13);
      assert.strictEqual(internalMap.capabilities.length, 13);
      assert.strictEqual(internalMap.total_tasks, 34);
      assert.strictEqual(internalMap.tasks.length, 34);

      const identityCap = internalMap.capabilities.find((c) => c.capability_id === 'identity_rbac');
      assert.ok(identityCap);
      assert.ok(identityCap.canonical_owner_paths.includes('lib/auth/**'));
      assert.ok(identityCap.data_models.includes('User'));
      assert.strictEqual(identityCap.security_boundary, 'AUTH_SESSION_COOKIE_RBAC');
      assert.ok(identityCap.source_tasks.includes('SYN-SEC-001-IDENTITY-ACCESS-FOUNDATION'));

      const pr1 = internalMap.tasks.find((t) => t.pr_number === 1);
      assert.ok(pr1);
      assert.strictEqual(pr1.capsule_present, false);
      assert.strictEqual(pr1.derived_status, 'MERGED');

      const pr34 = internalMap.tasks.find((t) => t.pr_number === 34);
      assert.ok(pr34);
      assert.strictEqual(pr34.task_id, 'SYN-WEB-003-SEO-REDIRECTS-ADMIN-CUTOVER');
    });

    it('unified resolver correctly dispatches between basic and internal', () => {
      const basic = resolveSystemMap({ accessLevel: 'basic', customRoot: rootDir });
      assert.strictEqual(basic.view, 'basic');
      assert.strictEqual((basic as any).tasks, undefined);

      const internal = resolveSystemMap({ accessLevel: 'internal', customRoot: rootDir });
      assert.strictEqual(internal.view, 'internal');
      assert.strictEqual((internal as any).tasks.length, 34);
    });
  });

  describe('4. RBAC Permission Boundaries', () => {
    it('SUPER_ADMIN role alone grants system_map.read_basic', async () => {
      mockPrismaData.userRoles.push({
        userId: 'admin-1',
        roleId: 'r-superadmin',
        projectId: null,
      });

      const hasBasic = await hasPermission('admin-1', 'system_map.read_basic');
      assert.strictEqual(hasBasic, true);
    });

    it('SUPER_ADMIN role alone DOES NOT grant system_map.read_internal', async () => {
      mockPrismaData.userRoles.push({
        userId: 'admin-1',
        roleId: 'r-superadmin',
        projectId: null,
      });

      const hasInternal = await hasPermission('admin-1', 'system_map.read_internal');
      assert.strictEqual(hasInternal, false, 'SUPER_ADMIN role must NOT automatically grant system_map.read_internal');
    });

    it('individual global ALLOW override grants system_map.read_internal to bootstrap owner', async () => {
      mockPrismaData.userRoles.push({
        userId: 'owner-1',
        roleId: 'r-superadmin',
        projectId: null,
      });

      mockPrismaData.userPermissionOverrides.push({
        userId: 'owner-1',
        permissionId: 'p-internal',
        projectId: null,
        isGranted: true,
      });

      const hasInternal = await hasPermission('owner-1', 'system_map.read_internal');
      assert.strictEqual(hasInternal, true);
    });

    it('explicit DENY override supersedes any role grant', async () => {
      mockPrismaData.userRoles.push({
        userId: 'user-deny',
        roleId: 'r-superadmin',
        projectId: null,
      });

      mockPrismaData.userPermissionOverrides.push({
        userId: 'user-deny',
        permissionId: 'p-basic',
        projectId: null,
        isGranted: false, // Explicit DENY
      });

      const hasBasic = await hasPermission('user-deny', 'system_map.read_basic');
      assert.strictEqual(hasBasic, false);
    });

    it('unassigned user without roles or overrides is denied access', async () => {
      const hasBasic = await hasPermission('stranger', 'system_map.read_basic');
      const hasInternal = await hasPermission('stranger', 'system_map.read_internal');
      assert.strictEqual(hasBasic, false);
      assert.strictEqual(hasInternal, false);
    });
  });

  describe('5. HTTP API Endpoint Security & Headers (/api/admin/system-map)', () => {
    it('returns 401 UNAUTHENTICATED when no active session is present', async () => {
      currentMockSession = { user: null };
      const req = new MockNextRequest('http://localhost:3000/api/admin/system-map');
      const res = await systemMapApiHandler(req as any);

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error, 'UNAUTHENTICATED');
      assert.strictEqual(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, proxy-revalidate');
      assert.strictEqual(res.headers.get('Pragma'), 'no-cache');
      assert.strictEqual(res.headers.get('Expires'), '0');
    });

    it('returns 401 UNAUTHENTICATED when user status is not ACTIVE', async () => {
      currentMockSession = { user: { id: 'suspended-user', status: 'SUSPENDED' } };
      const req = new MockNextRequest('http://localhost:3000/api/admin/system-map');
      const res = await systemMapApiHandler(req as any);

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, proxy-revalidate');
    });

    it('returns 403 when authenticated user lacks system_map.read_basic', async () => {
      currentMockSession = { user: { id: 'regular-user', status: 'ACTIVE' } };
      const req = new MockNextRequest('http://localhost:3000/api/admin/system-map');
      const res = await systemMapApiHandler(req as any);

      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.error, 'UNAUTHORIZED_BASIC_VIEW');
      assert.strictEqual(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, proxy-revalidate');
    });

    it('returns 200 with redacted basic map for user with system_map.read_basic', async () => {
      currentMockSession = { user: { id: 'admin-user', status: 'ACTIVE' } };
      mockPrismaData.userRoles.push({
        userId: 'admin-user',
        roleId: 'r-superadmin',
        projectId: null,
      });

      const req = new MockNextRequest('http://localhost:3000/api/admin/system-map');
      const res = await systemMapApiHandler(req as any);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, proxy-revalidate');
      const data = await res.json();
      assert.strictEqual(data.view, 'basic');
      assert.strictEqual(data.total_capabilities, 13);
      assert.strictEqual(data.tasks, undefined);
    });

    it('returns 403 when user with only system_map.read_basic requests ?view=internal', async () => {
      currentMockSession = { user: { id: 'admin-user', status: 'ACTIVE' } };
      mockPrismaData.userRoles.push({
        userId: 'admin-user',
        roleId: 'r-superadmin',
        projectId: null,
      });

      const req = new MockNextRequest('http://localhost:3000/api/admin/system-map?view=internal');
      const res = await systemMapApiHandler(req as any);

      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.error, 'UNAUTHORIZED_INTERNAL_VIEW');
      assert.strictEqual(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, proxy-revalidate');
    });

    it('returns 200 with full internal map for user with system_map.read_internal override', async () => {
      currentMockSession = { user: { id: 'bootstrap-owner', status: 'ACTIVE' } };
      mockPrismaData.userRoles.push({
        userId: 'bootstrap-owner',
        roleId: 'r-superadmin',
        projectId: null,
      });
      mockPrismaData.userPermissionOverrides.push({
        userId: 'bootstrap-owner',
        permissionId: 'p-internal',
        projectId: null,
        isGranted: true,
      });

      const req = new MockNextRequest('http://localhost:3000/api/admin/system-map?view=internal');
      const res = await systemMapApiHandler(req as any);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, proxy-revalidate');
      const data = await res.json();
      assert.strictEqual(data.view, 'internal');
      assert.strictEqual(data.total_capabilities, 13);
      assert.strictEqual(data.total_tasks, 34);
      assert.strictEqual(data.tasks.length, 34);
    });

    it('returns 400 when invalid view parameter is passed', async () => {
      currentMockSession = { user: { id: 'admin-user', status: 'ACTIVE' } };
      mockPrismaData.userRoles.push({
        userId: 'admin-user',
        roleId: 'r-superadmin',
        projectId: null,
      });

      const req = new MockNextRequest('http://localhost:3000/api/admin/system-map?view=arbitrary_view');
      const res = await systemMapApiHandler(req as any);

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error, 'INVALID_VIEW_PARAMETER');
      assert.strictEqual(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, proxy-revalidate');
    });
  });
});
