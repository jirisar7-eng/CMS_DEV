import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

test('Admin login route is isolated in (auth)', () => {
  const root = process.cwd();
  
  // New paths must exist
  assert.ok(fs.existsSync(path.join(root, 'app/(auth)/admin/login/page.tsx')), 'app/(auth)/admin/login/page.tsx must exist');
  assert.ok(fs.existsSync(path.join(root, 'app/(auth)/admin/login/actions.ts')), 'app/(auth)/admin/login/actions.ts must exist');
  
  // Old paths must NOT exist
  assert.ok(!fs.existsSync(path.join(root, 'app/admin/login/page.tsx')), 'app/admin/login/page.tsx must NOT exist');
  assert.ok(!fs.existsSync(path.join(root, 'app/admin/login/actions.ts')), 'app/admin/login/actions.ts must NOT exist');
});
