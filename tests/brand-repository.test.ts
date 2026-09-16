// @ts-nocheck
import { test, mock, afterEach, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { SYNTHESIS_ORANGE_DEFAULT } from '../lib/domain/brand/contracts';

const mockPrisma = {
  brand: {
    findFirst: mock.fn(),
    findUnique: mock.fn()
  }
};

import Module from 'node:module';
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id) {
  if (id === '@/lib/db') return { prisma: mockPrisma };
  return originalRequire.apply(this, arguments as any);
};

const { BrandRepository } = require('../lib/domain/brand/repository');

let originalDbUrl;

beforeEach(() => {
  originalDbUrl = process.env.DATABASE_URL;
});

afterEach(() => {
  process.env.DATABASE_URL = originalDbUrl;
  mockPrisma.brand.findFirst.mock.resetCalls();
});

test('Repository - DATABASE_URL undefined', async () => {
  delete process.env.DATABASE_URL;
  const data = await BrandRepository.getActiveBrandData('SYSTEM');
  assert.deepStrictEqual(data, SYNTHESIS_ORANGE_DEFAULT);
  assert.strictEqual(mockPrisma.brand.findFirst.mock.callCount(), 0);
});

test('Repository - DATABASE_URL empty', async () => {
  process.env.DATABASE_URL = '';
  const data = await BrandRepository.getActiveBrandData('SYSTEM');
  assert.deepStrictEqual(data, SYNTHESIS_ORANGE_DEFAULT);
  assert.strictEqual(mockPrisma.brand.findFirst.mock.callCount(), 0);
});

test('Repository - Missing brand fallback', async () => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  mockPrisma.brand.findFirst.mock.mockImplementationOnce(() => Promise.resolve(null));
  const data = await BrandRepository.getActiveBrandData('SYSTEM');
  assert.deepStrictEqual(data, SYNTHESIS_ORANGE_DEFAULT);
});

test('Repository - Missing active version fallback', async () => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  mockPrisma.brand.findFirst.mock.mockImplementationOnce(() => Promise.resolve({
    id: 'b1', activeVersion: null
  }));
  const data = await BrandRepository.getActiveBrandData('SYSTEM');
  assert.deepStrictEqual(data, SYNTHESIS_ORANGE_DEFAULT);
});

test('Repository - Non-PUBLISHED active version fallback', async () => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  mockPrisma.brand.findFirst.mock.mockImplementationOnce(() => Promise.resolve({
    id: 'b1', activeVersion: { status: 'DRAFT', tokens: {} }
  }));
  const data = await BrandRepository.getActiveBrandData('SYSTEM');
  assert.deepStrictEqual(data, SYNTHESIS_ORANGE_DEFAULT);
});

test('Repository - Malformed persisted JSON fallback', async () => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  mockPrisma.brand.findFirst.mock.mockImplementationOnce(() => Promise.resolve({
    id: 'b1', activeVersion: { 
      status: 'PUBLISHED', 
      tokens: {}, // malformed, missing everything required
      typography: {}, assets: {}, themeModes: {}
    }
  }));
  const data = await BrandRepository.getActiveBrandData('SYSTEM');
  assert.deepStrictEqual(data, SYNTHESIS_ORANGE_DEFAULT);
});

test('Repository - Valid PUBLISHED version returns parsed data', async () => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  mockPrisma.brand.findFirst.mock.mockImplementationOnce(() => Promise.resolve({
    id: 'b1', activeVersion: { 
      status: 'PUBLISHED', 
      ...SYNTHESIS_ORANGE_DEFAULT
    }
  }));
  const data = await BrandRepository.getActiveBrandData('SYSTEM');
  assert.deepStrictEqual(data, SYNTHESIS_ORANGE_DEFAULT);
});
