// @ts-nocheck
import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import Module from 'node:module';
import path from 'node:path';

// 1. Mock classes for Next.js server runtime
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

let mockSessionUser: { id: string; status: string } | null = null;
let mockUserPermissions: Set<string> = new Set();
let mockProjectContextStatus = 'PROJECT_VALID';
let mockActiveProjectId: string | null = 'proj-123';

const mockPrisma = {
  project: {
    findFirst: mock.fn(async () => ({ id: 'proj-123', key: 'proj-123', status: 'ACTIVE' })),
    findUnique: mock.fn(async () => ({ id: 'proj-123', key: 'proj-123', status: 'ACTIVE' })),
  },
  permission: {
    findUnique: mock.fn(async ({ where }: any) => ({ id: `perm-${where.key}`, key: where.key })),
  },
  userPermissionOverride: {
    findMany: mock.fn(async () => []),
  },
  userRole: {
    findMany: mock.fn(async () => []),
  },
  mediaAsset: {
    findMany: mock.fn(async () => []),
    findFirst: mock.fn(async () => null),
    create: mock.fn(async () => ({ id: 'new-id' })),
    update: mock.fn(async () => ({ id: 'upd-id' })),
  },
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === 'next/server') {
    return { NextResponse: MockNextResponse, NextRequest: MockNextRequest };
  }
  if (id === 'next/headers') {
    return {
      cookies: async () => ({
        get: () => ({ value: mockActiveProjectId }),
      }),
    };
  }
  if (id === '@/lib/db') {
    return { prisma: mockPrisma };
  }
  if (id === '@/lib/runtime/database') {
    return { isDatabaseConfigured: () => true };
  }
  if (id === '@/lib/auth/session') {
    return {
      getSession: async () => ({
        session: mockSessionUser ? { id: 'sess-1', userId: mockSessionUser.id } : null,
        user: mockSessionUser,
      }),
    };
  }
  if (id === '@/lib/auth/rbac') {
    return {
      hasPermission: async (userId: string, key: string, projectId?: string | null) => {
        if (!mockSessionUser || mockSessionUser.id !== userId) return false;
        return mockUserPermissions.has(`${key}:${projectId || '*'}`) || mockUserPermissions.has(key);
      },
      requirePermission: async (key: string, projectId?: string | null) => {
        if (!mockSessionUser || mockSessionUser.status !== 'ACTIVE') throw new Error('UNAUTHENTICATED');
        const has = mockUserPermissions.has(`${key}:${projectId || '*'}`) || mockUserPermissions.has(key);
        if (!has) throw new Error('UNAUTHORIZED');
      },
    };
  }
  if (id === '@/lib/domain/pages-client/server-context') {
    return {
      getActiveProjectContext: async () => {
        if (mockProjectContextStatus === 'PROJECT_NOT_SELECTED') {
          return { status: 'PROJECT_NOT_SELECTED', projectId: null };
        }
        if (mockProjectContextStatus === 'PROJECT_FORBIDDEN') {
          return { status: 'PROJECT_FORBIDDEN', projectId: null };
        }
        return {
          status: 'PROJECT_VALID',
          projectId: mockActiveProjectId,
          userId: mockSessionUser?.id,
        };
      },
      getActiveProjectId: async () => mockActiveProjectId,
    };
  }
  if (id.startsWith('@/')) {
    const rel = path.resolve(__dirname, '..', id.replace('@/', ''));
    return originalRequire.call(this, rel);
  }
  return originalRequire.apply(this, arguments as any);
};

const {
  listMediaAssets,
  uploadMediaAsset,
  updateMediaMetadata,
  deleteMediaAsset,
} = require('../app/admin/media/actions');

describe('SYN-MEDIA-001B: Media RBAC Authorization & Server Actions', () => {
  beforeEach(() => {
    mockSessionUser = null;
    mockUserPermissions.clear();
    mockProjectContextStatus = 'PROJECT_VALID';
    mockActiveProjectId = 'proj-123';
  });

  it('listMediaAssets fails closed with PROJECT_NOT_SELECTED when no active project', async () => {
    mockProjectContextStatus = 'PROJECT_NOT_SELECTED';
    mockActiveProjectId = null;
    mockSessionUser = { id: 'u1', status: 'ACTIVE' };
    mockUserPermissions.add('media.view:proj-123');

    const result = await listMediaAssets();

    assert.strictEqual(result.code, 'PROJECT_NOT_SELECTED');
    assert.strictEqual(result.data, undefined);
  });

  it('listMediaAssets fails closed when user lacks media.view permission', async () => {
    mockSessionUser = { id: 'u1', status: 'ACTIVE' };
    // No media.view permission granted

    const result = await listMediaAssets();

    assert.strictEqual(result.code, 'FORBIDDEN');
    assert.match(result.error || '', /media\.view/);
  });

  it('uploadMediaAsset fails closed when user lacks media.create permission', async () => {
    mockSessionUser = { id: 'u1', status: 'ACTIVE' };
    mockUserPermissions.add('media.view:proj-123'); // only view, not create

    const formData = new FormData();
    formData.append('file', new File(['hello'], 'test.txt', { type: 'text/plain' }));

    const result = await uploadMediaAsset(formData);

    assert.strictEqual(result.code, 'FORBIDDEN');
    assert.match(result.error || '', /media\.create/);
  });

  it('updateMediaMetadata fails closed when user lacks media.edit permission', async () => {
    mockSessionUser = { id: 'u1', status: 'ACTIVE' };
    mockUserPermissions.add('media.view:proj-123'); // only view

    const result = await updateMediaMetadata('asset-1', { title: 'New Title' });

    assert.strictEqual(result.code, 'FORBIDDEN');
    assert.match(result.error || '', /media\.edit/);
  });

  it('deleteMediaAsset fails closed when user lacks media.delete permission', async () => {
    mockSessionUser = { id: 'u1', status: 'ACTIVE' };
    mockUserPermissions.add('media.view:proj-123');
    mockUserPermissions.add('media.edit:proj-123'); // has view and edit, lacks delete

    const result = await deleteMediaAsset('asset-1');

    assert.strictEqual(result.code, 'FORBIDDEN');
    assert.match(result.error || '', /media\.delete/);
  });
});
