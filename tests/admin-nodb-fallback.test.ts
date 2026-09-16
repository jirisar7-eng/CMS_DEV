import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const dbHelperPath = path.join(process.cwd(), 'lib/runtime/database.ts');
const sessionPath = path.join(process.cwd(), 'lib/auth/session.ts');
const actionsPath = path.join(process.cwd(), 'app/admin/login/actions.ts');
const loginPagePath = path.join(process.cwd(), 'app/admin/login/page.tsx');

const readFile = (p: string) => fs.readFileSync(p, 'utf8');

test('DATABASE CONFIGURATION HELPER is correct', async () => {
  // Use dynamic import to test the actual function with env mutations
  const { isDatabaseConfigured } = await import(path.resolve(dbHelperPath));
  
  const originalUrl = process.env.DATABASE_URL;

  try {
    delete process.env.DATABASE_URL;
    assert.strictEqual(isDatabaseConfigured(), false);

    process.env.DATABASE_URL = "";
    assert.strictEqual(isDatabaseConfigured(), false);

    process.env.DATABASE_URL = "   ";
    assert.strictEqual(isDatabaseConfigured(), false);

    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    assert.strictEqual(isDatabaseConfigured(), true);
  } finally {
    if (originalUrl !== undefined) {
      process.env.DATABASE_URL = originalUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  }
});

test('LOGIN PAGE SOURCE CONTRACT', () => {
  const content = readFile(loginPagePath);
  
  assert.ok(content.includes('isDatabaseConfigured'), 'Must use isDatabaseConfigured');
  
  const dbCheckIndex = content.indexOf('isDatabaseConfigured');
  const getSessionIndex = content.indexOf('getSession()');
  
  assert.ok(dbCheckIndex < getSessionIndex, 'Must check DB configuration before getting session');
  
  assert.ok(content.includes('Administrace není v tomto prostředí dostupná.'));
  assert.ok(content.includes('Databázové prostředí není nakonfigurováno.'));
});

test('LOGIN ACTION CONTRACT', () => {
  const content = readFile(actionsPath);
  
  assert.ok(content.includes('isDatabaseConfigured'), 'Must check DB config in actions');
  
  const dbCheckIndex = content.indexOf('isDatabaseConfigured');
  const prismaIndex = content.indexOf('prisma.user.findUnique');
  
  assert.ok(dbCheckIndex < prismaIndex, 'DB guard must occur before prisma findUnique');
  
  assert.ok(!content.includes('id: "mock"'), 'No mock user');
  assert.ok(!content.includes('fake_admin'), 'No fake admin');
});

test('SESSION CONTRACT', () => {
  const content = readFile(sessionPath);
  
  assert.ok(content.includes('isDatabaseConfigured'), 'Must use DB config helper in session');
  
  // createSession fails closed
  const createSessionMatch = content.match(/createSession[\s\S]*?isDatabaseConfigured[\s\S]*?throw new Error\('DATABASE_UNAVAILABLE'\)/);
  assert.ok(createSessionMatch, 'createSession must fail if DB not configured');
  
  // getSession returns null if no DB
  const getSessionMatch = content.match(/getSession[\s\S]*?isDatabaseConfigured[\s\S]*?return { session: null, user: null }/);
  assert.ok(getSessionMatch, 'getSession must return null if DB not configured before looking up in DB');

  // getSession shouldn't have prisma lookup before DB check
  const getSessionContent = content.substring(content.indexOf('export async function getSession()'));
  const sessionDbCheck = getSessionContent.indexOf('isDatabaseConfigured');
  const sessionPrisma = getSessionContent.indexOf('prisma.session.findUnique');
  assert.ok(sessionDbCheck < sessionPrisma, 'DB check must precede prisma lookup in getSession');
  
  // invalidateSession check
  const invalidateSessionMatch = content.match(/invalidateSession[\s\S]*?isDatabaseConfigured\(\)[\s\S]*?prisma\.session\.deleteMany/);
  assert.ok(invalidateSessionMatch, 'invalidateSession must conditionally delete from DB only if configured');
});
