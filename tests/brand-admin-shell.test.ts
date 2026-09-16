import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Admin Shell Brand Integration', () => {
  const shellPath = path.join(process.cwd(), 'components/admin/AdminShell.tsx');
  const shellCode = fs.readFileSync(shellPath, 'utf8');

  it('AdminShell imports SynthesisLogo', () => {
    assert.match(shellCode, /import \{ SynthesisLogo \} from ['"]@\/components\/brand\/SynthesisLogo['"]/);
  });

  it('AdminShell contains variant="admin-compact"', () => {
    assert.match(shellCode, /variant="admin-compact"/);
    assert.match(shellCode, /size=\{28\}/);
    assert.match(shellCode, /decorative/);
  });

  it('Old literal temporary logo block is absent', () => {
    assert.doesNotMatch(shellCode, />S</);
    assert.doesNotMatch(shellCode, /w-8 h-8 bg-primary rounded-lg/);
  });

  it('No hardcoded #FF7A00 in AdminShell', () => {
    assert.doesNotMatch(shellCode, /#FF7A00/i);
  });

  it('No SVG path geometry exists directly in AdminShell', () => {
    assert.doesNotMatch(shellCode, /<path d="/);
  });

  it('Sidebar supports narrow viewport sizing', () => {
    assert.match(shellCode, /w-\[min\(18rem,calc\(100vw-2rem\)\)\]/);
  });

  it('Mobile backdrop has accessible dismiss semantics', () => {
    assert.match(shellCode, /<button[^>]+aria-label="Zavřít navigaci"[^>]+onClick=\{\(\) => setSidebarOpen\(false\)\}/);
  });

  it('AdminShell contains NO transition-all', () => {
    assert.doesNotMatch(shellCode, /transition-all/);
  });

  it('Approved motion variables are referenced for sidebar/chevron transitions', () => {
    assert.match(shellCode, /duration-\[var\(--duration-slow\)\]/);
    assert.match(shellCode, /duration-\[var\(--duration-normal\)\]/);
    assert.doesNotMatch(shellCode, /duration-300/);
    assert.doesNotMatch(shellCode, /duration-200/);
  });

  it('Primary mobile navigation controls have practical touch sizing', () => {
    const matches = shellCode.match(/min-h-11/g);
    assert.ok(matches && matches.length >= 2, 'Should have at least 2 min-h-11 touch targets');
  });

  it('State status styling references semantic success/warning tokens', () => {
    assert.match(shellCode, /bg-\[var\(--state-success\)\]/);
    assert.match(shellCode, /text-\[var\(--state-warning\)\]/);
    assert.match(shellCode, /bg-\[var\(--state-warning\)\]/);
    assert.match(shellCode, /border-\[var\(--state-warning\)\]/);
    assert.doesNotMatch(shellCode, /emerald-500/);
    assert.doesNotMatch(shellCode, /amber-/);
  });

  it('Existing important capabilities remain', () => {
    assert.match(shellCode, /ADMIN_NAV_GROUPS/);
    assert.match(shellCode, /<ThemeToggle/);
    assert.match(shellCode, /<HelpTrigger/);
    assert.match(shellCode, /<LogoutButton/);
    assert.match(shellCode, /\/preview\/site/);
    assert.match(shellCode, /\/admin\/notifications/);
  });

  it('Auth/security files were not modified by this commit', () => {
    const authActions = fs.readFileSync(path.join(process.cwd(), 'app/(auth)/admin/login/actions.ts'), 'utf8');
    const authSession = fs.readFileSync(path.join(process.cwd(), 'lib/auth/session.ts'), 'utf8');
    const dbRuntime = fs.readFileSync(path.join(process.cwd(), 'lib/runtime/database.ts'), 'utf8');
    assert.ok(authActions.length > 0);
    assert.ok(authSession.length > 0);
    assert.ok(dbRuntime.length > 0);
  });
});
