// @ts-nocheck
import { test, mock, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { getDerivedPermissionScope } from '../lib/domain/brand/contracts';

// Mock dependencies for the actions
const requirePermissionMock = mock.fn(() => Promise.resolve());
const getSessionMock = mock.fn(() => Promise.resolve({ user: { id: 'u1', status: 'ACTIVE' } }));
const logAuditMock = mock.fn(() => Promise.resolve());
const revalidatePathMock = mock.fn(() => {});

const mockPrisma = {
  brand: {
    findUnique: mock.fn(),
    findFirst: mock.fn(),
    create: mock.fn(),
    update: mock.fn(),
  },
  brandVersion: {
    findUnique: mock.fn(),
    create: mock.fn(),
    update: mock.fn(),
    delete: mock.fn(),
  },
  $transaction: mock.fn(async (cb) => {
    return cb(mockPrisma);
  }),
};

// We intercept requires to inject our mocks
import Module from 'node:module';
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id) {
  if (id === '@/lib/db') return { prisma: mockPrisma };
  if (id === '@/lib/auth/rbac') return { requirePermission: requirePermissionMock };
  if (id === '@/lib/auth/session') return { getSession: getSessionMock };
  if (id === '@/lib/auth/audit') return { logAudit: logAuditMock };
  if (id === 'next/cache') return { revalidatePath: revalidatePathMock };
  return originalRequire.apply(this, arguments as any);
};

// Now import the actions
const { 
  getOrCreateBrand, 
  createBrandDraft, 
  updateBrandDraft, 
  publishBrandDraft,
  discardBrandDraft,
  rollbackBrand
} = require('../app/admin/brands/actions');

afterEach(() => {
  requirePermissionMock.mock.resetCalls();
  mockPrisma.brand.findUnique.mock.resetCalls();
  mockPrisma.brand.findFirst.mock.resetCalls();
  mockPrisma.brandVersion.findUnique.mock.resetCalls();
  logAuditMock.mock.resetCalls();
});

test('Authorization - SYSTEM Brand uses null scope', async () => {
  mockPrisma.brand.findFirst.mock.mockImplementationOnce(() => Promise.resolve({ id: 'b1', scope: 'SYSTEM', projectId: null, versions: [] }));
  await getOrCreateBrand('SYSTEM');
  
  assert.strictEqual(requirePermissionMock.mock.calls.length, 1);
  const call = requirePermissionMock.mock.calls[0];
  assert.strictEqual(call.arguments[0], 'brand.view');
  assert.strictEqual(call.arguments[1], null); // Null means system-wide
});

test('Authorization - PROJECT Brand uses projectId scope', async () => {
  mockPrisma.brand.findFirst.mock.mockImplementationOnce(() => Promise.resolve({ id: 'b1', scope: 'PROJECT', projectId: 'proj-123', versions: [] }));
  await getOrCreateBrand('PROJECT', 'proj-123');
  
  assert.strictEqual(requirePermissionMock.mock.calls.length, 1);
  const call = requirePermissionMock.mock.calls[0];
  assert.strictEqual(call.arguments[0], 'brand.view');
  assert.strictEqual(call.arguments[1], 'proj-123'); // Bound to project
});

test('Authorization - createBrandDraft requires brand.edit on derived scope', async () => {
  mockPrisma.brand.findUnique.mock.mockImplementationOnce(() => Promise.resolve({ 
    id: 'b1', scope: 'PROJECT', projectId: 'pA', versions: [{ version: 1 }] 
  }));
  
  await createBrandDraft('b1');
  
  assert.strictEqual(requirePermissionMock.mock.calls.length, 1);
  const call = requirePermissionMock.mock.calls[0];
  assert.strictEqual(call.arguments[0], 'brand.edit');
  assert.strictEqual(call.arguments[1], 'pA');
});

test('Authorization - publishBrandDraft requires brand.publish', async () => {
  mockPrisma.brandVersion.findUnique.mock.mockImplementationOnce(() => Promise.resolve({ 
    id: 'v1', brandId: 'b1', status: 'DRAFT', brand: { scope: 'PROJECT', projectId: 'pA' },
    tokens: { canvas: '#ffffff', text: { primary: '#000000' } }, typography: {}, assets: {}, themeModes: {} 
  }));
  
  try {
    await publishBrandDraft('v1');
  } catch (e) {
    // Will fail structure validation because mock doesn't have full object, but auth runs first
  }
  
  assert.strictEqual(requirePermissionMock.mock.calls.length, 1);
  const call = requirePermissionMock.mock.calls[0];
  assert.strictEqual(call.arguments[0], 'brand.publish');
  assert.strictEqual(call.arguments[1], 'pA');
});

test('Authorization - rollbackBrand requires brand.rollback', async () => {
  mockPrisma.brand.findUnique.mock.mockImplementationOnce(() => Promise.resolve({ 
    id: 'b1', scope: 'PROJECT', projectId: 'pA', versions: [] 
  }));
  mockPrisma.brandVersion.findUnique.mock.mockImplementationOnce(() => Promise.resolve({ 
    id: 'v1', brandId: 'b1', status: 'PUBLISHED' 
  }));
  
  try {
    await rollbackBrand('b1', 'v1');
  } catch (e) {}
  
  assert.strictEqual(requirePermissionMock.mock.calls.length, 1);
  const call = requirePermissionMock.mock.calls[0];
  assert.strictEqual(call.arguments[0], 'brand.rollback');
  assert.strictEqual(call.arguments[1], 'pA');
});
