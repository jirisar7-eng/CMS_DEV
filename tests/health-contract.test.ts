// @ts-nocheck
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';

class MockNextResponse {
  status: number;
  headers: Headers;
  private body: unknown;

  constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
    this.body = body;
    this.status = init?.status ?? 200;
    this.headers = new Headers(init?.headers);
  }

  static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
    return new MockNextResponse(body, init);
  }

  async json() {
    return this.body;
  }

  async text() {
    return JSON.stringify(this.body);
  }
}

let databaseConfigured = true;
let databaseMode: 'ok' | 'error' | 'hang' = 'ok';
let queryCount = 0;

const mockPrisma = {
  $queryRaw: async () => {
    queryCount += 1;

    if (databaseMode === 'error') {
      throw new Error(
        'postgresql://secret-user:secret-password@internal-db.example:5432/private'
      );
    }

    if (databaseMode === 'hang') {
      return new Promise(() => {});
    }

    return [{ '?column?': 1 }];
  },
};

const originalRequire = Module.prototype.require;

Module.prototype.require = function (id: string) {
  if (id === 'next/server') {
    return { NextResponse: MockNextResponse };
  }

  if (id === '@/lib/db') {
    return { prisma: mockPrisma };
  }

  if (id === '@/lib/runtime/database') {
    return { isDatabaseConfigured: () => databaseConfigured };
  }

  return originalRequire.apply(this, arguments as any);
};

const { GET: liveGET } = require('../app/api/health/live/route');
const { GET: readyGET } = require('../app/api/health/ready/route');

after(() => {
  Module.prototype.require = originalRequire;
});

test('liveness is public, minimal and independent of database readiness', async () => {
  databaseConfigured = false;
  databaseMode = 'error';
  queryCount = 0;

  const response = await liveGET();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  assert.equal(response.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate');
  assert.equal(queryCount, 0);
});

test('readiness returns only a minimal ready response when database probe succeeds', async () => {
  databaseConfigured = true;
  databaseMode = 'ok';
  queryCount = 0;

  const response = await readyGET();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ready' });
  assert.equal(response.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate');
  assert.equal(queryCount, 1);
});

test('readiness fails closed without probing when database is unconfigured', async () => {
  databaseConfigured = false;
  databaseMode = 'ok';
  queryCount = 0;

  const response = await readyGET();

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'not_ready' });
  assert.equal(queryCount, 0);
});

test('readiness redacts internal database failure details', async () => {
  databaseConfigured = true;
  databaseMode = 'error';
  queryCount = 0;

  const response = await readyGET();
  const text = await response.text();

  assert.equal(response.status, 503);
  assert.equal(text, JSON.stringify({ status: 'not_ready' }));
  assert.equal(text.includes('secret-user'), false);
  assert.equal(text.includes('secret-password'), false);
  assert.equal(text.includes('internal-db.example'), false);
  assert.equal(text.includes('5432'), false);
});

test('readiness times out fail-closed when database probe hangs', async () => {
  databaseConfigured = true;
  databaseMode = 'hang';
  queryCount = 0;

  const started = Date.now();
  const response = await readyGET();
  const elapsed = Date.now() - started;

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'not_ready' });
  assert.equal(queryCount, 1);
  assert.ok(elapsed < 3500, `readiness timeout took too long: ${elapsed}ms`);
});

test('Docker cms healthcheck targets public readiness endpoint, not admin UI', () => {
  const compose = fs.readFileSync('deploy/cms-dev/compose.yml', 'utf8');

  assert.match(compose, /http:\/\/127\.0\.0\.1:3000\/api\/health\/ready/);
  assert.doesNotMatch(compose, /http:\/\/127\.0\.0\.1:3000\/admin\/svg-editor/);
});
