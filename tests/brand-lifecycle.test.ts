// @ts-nocheck
import { test, mock, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { SYNTHESIS_ORANGE_DEFAULT } from '../lib/domain/brand/contracts';

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

const { 
  createBrandDraft, 
  updateBrandDraft, 
  publishBrandDraft,
  discardBrandDraft,
  rollbackBrand
} = require('../app/admin/brands/actions');

afterEach(() => {
  mockPrisma.brandVersion.create.mock.resetCalls();
  mockPrisma.brandVersion.update.mock.resetCalls();
  mockPrisma.brand.update.mock.resetCalls();
  logAuditMock.mock.resetCalls();
});

test('Lifecycle - Create Draft emits audit and creates DRAFT version', async () => {
  mockPrisma.brand.findUnique.mock.mockImplementationOnce(() => Promise.resolve({ 
    id: 'b1', scope: 'SYSTEM', projectId: null, versions: [{ id: 'v1', version: 1, tokens: {} }] 
  }));
  mockPrisma.brandVersion.create.mock.mockImplementationOnce((args) => Promise.resolve({ id: 'd1', ...args.data }));
  
  const draft = await createBrandDraft('b1');
  
  assert.strictEqual(draft.status, 'DRAFT');
  assert.strictEqual(draft.version, 2);
  assert.strictEqual(draft.derivedFromVersionId, 'v1');
  
  assert.strictEqual(logAuditMock.mock.calls.length, 1);
  assert.strictEqual(logAuditMock.mock.calls[0].arguments[0].action, 'BRAND_DRAFT_CREATED');
});

test('Lifecycle - Publish Draft atomic transaction', async () => {
  const validData = SYNTHESIS_ORANGE_DEFAULT;
  mockPrisma.brandVersion.findUnique.mock.mockImplementationOnce(() => Promise.resolve({ 
    id: 'd1', brandId: 'b1', status: 'DRAFT', version: 2,
    brand: { id: 'b1', scope: 'SYSTEM', projectId: null },
    ...validData
  }));
  
  await publishBrandDraft('d1');
  
  // 1 validation audit, 1 publish audit
  assert.strictEqual(logAuditMock.mock.calls.length, 2);
  assert.strictEqual(logAuditMock.mock.calls[0].arguments[0].action, 'BRAND_VALIDATED');
  assert.strictEqual(logAuditMock.mock.calls[1].arguments[0].action, 'BRAND_PUBLISHED');
  
  // Transaction calls
  assert.strictEqual(mockPrisma.brandVersion.update.mock.calls.length, 1);
  assert.strictEqual(mockPrisma.brandVersion.update.mock.calls[0].arguments[0].data.status, 'PUBLISHED');
  assert.strictEqual(mockPrisma.brand.update.mock.calls.length, 1);
  assert.strictEqual(mockPrisma.brand.update.mock.calls[0].arguments[0].data.activeVersionId, 'd1');
});

test('Lifecycle - Rollback creates new snapshot version', async () => {
  const validData = SYNTHESIS_ORANGE_DEFAULT;
  mockPrisma.brand.findUnique.mock.mockImplementationOnce(() => Promise.resolve({ 
    id: 'b1', scope: 'SYSTEM', projectId: null, versions: [{ version: 2 }] 
  }));
  mockPrisma.brandVersion.findUnique.mock.mockImplementationOnce(() => Promise.resolve({ 
    id: 'v1', brandId: 'b1', status: 'PUBLISHED', ...validData
  }));
  mockPrisma.brandVersion.create.mock.mockImplementationOnce((args) => Promise.resolve({ id: 'v3', ...args.data }));
  
  await rollbackBrand('b1', 'v1');
  
  assert.strictEqual(mockPrisma.brandVersion.create.mock.calls.length, 1);
  const created = mockPrisma.brandVersion.create.mock.calls[0].arguments[0].data;
  assert.strictEqual(created.status, 'PUBLISHED');
  assert.strictEqual(created.version, 3);
  assert.strictEqual(created.derivedFromVersionId, 'v1');
  
  assert.strictEqual(mockPrisma.brand.update.mock.calls.length, 1);
  assert.strictEqual(mockPrisma.brand.update.mock.calls[0].arguments[0].data.activeVersionId, 'v3');
  
  assert.strictEqual(logAuditMock.mock.calls.length, 1);
  assert.strictEqual(logAuditMock.mock.calls[0].arguments[0].action, 'BRAND_ROLLED_BACK');
});

test('Lifecycle - Immutability: Cannot update a PUBLISHED version', async () => {
  mockPrisma.brandVersion.findUnique.mock.mockImplementationOnce(() => Promise.resolve({ 
    id: 'v1', brandId: 'b1', status: 'PUBLISHED', brand: { scope: 'SYSTEM', projectId: null }
  }));
  
  try {
    await updateBrandDraft('v1', {});
    assert.fail("Should have thrown error");
  } catch (e: any) {
    assert.ok(e.message.includes('Draft not found or not in DRAFT status'));
  }
});

// ADDITIONAL LIFECYCLE TESTS

test('Lifecycle - Discard DRAFT succeeds', async () => {
  mockPrisma.brandVersion.findUnique.mock.mockImplementationOnce(() => Promise.resolve({
    id: 'd1', brandId: 'b1', status: 'DRAFT', brand: { scope: 'PROJECT', projectId: 'pA' }
  }));
  mockPrisma.brandVersion.delete.mock.resetCalls();

  await discardBrandDraft('d1');

  assert.strictEqual(mockPrisma.brandVersion.delete.mock.calls.length, 1);
  assert.strictEqual(mockPrisma.brandVersion.delete.mock.calls[0].arguments[0].where.id, 'd1');
});

test('Lifecycle - Discard PUBLISHED fails', async () => {
  mockPrisma.brandVersion.findUnique.mock.mockImplementationOnce(() => Promise.resolve({
    id: 'p1', brandId: 'b1', status: 'PUBLISHED', brand: { scope: 'PROJECT', projectId: 'pA' }
  }));
  mockPrisma.brandVersion.delete.mock.resetCalls();

  try {
    await discardBrandDraft('p1');
    assert.fail("Should have thrown");
  } catch(e: any) {
    assert.ok(e.message.includes('Only drafts can be discarded'));
  }
  
  assert.strictEqual(mockPrisma.brandVersion.delete.mock.calls.length, 0);
});

test('Lifecycle - Malformed draft cannot publish', async () => {
  mockPrisma.brandVersion.findUnique.mock.mockImplementationOnce(() => Promise.resolve({
    id: 'd1', brandId: 'b1', status: 'DRAFT', version: 2,
    brand: { id: 'b1', scope: 'SYSTEM', projectId: null },
    tokens: {}, // missing everything
    typography: {},
    assets: {},
    themeModes: {}
  }));
  mockPrisma.brandVersion.update.mock.resetCalls();
  mockPrisma.brand.update.mock.resetCalls();

  try {
    await publishBrandDraft('d1');
    assert.fail("Should have thrown");
  } catch(e: any) {
    assert.ok(e.message.includes('Invalid brand data structure'));
  }

  assert.strictEqual(mockPrisma.brandVersion.update.mock.calls.length, 0);
  assert.strictEqual(mockPrisma.brand.update.mock.calls.length, 0);
});

test('Lifecycle - Invalid rollback target fails', async () => {
  mockPrisma.brand.findUnique.mock.mockImplementationOnce(() => Promise.resolve({
    id: 'b1', scope: 'SYSTEM', projectId: null, versions: [{ version: 2 }]
  }));
  // Target version is a DRAFT, not PUBLISHED
  mockPrisma.brandVersion.findUnique.mock.mockImplementationOnce(() => Promise.resolve({
    id: 'v1', brandId: 'b1', status: 'DRAFT', ...SYNTHESIS_ORANGE_DEFAULT
  }));
  mockPrisma.brandVersion.create.mock.resetCalls();
  mockPrisma.brand.update.mock.resetCalls();

  try {
    await rollbackBrand('b1', 'v1');
    assert.fail("Should have thrown");
  } catch (e: any) {
    assert.ok(e.message.includes('Invalid target version for rollback'));
  }

  assert.strictEqual(mockPrisma.brandVersion.create.mock.calls.length, 0);
  assert.strictEqual(mockPrisma.brand.update.mock.calls.length, 0);
});

