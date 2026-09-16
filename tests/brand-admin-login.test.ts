import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Admin Login Brand Integration', () => {
  const pagePath = path.join(process.cwd(), 'app/admin/login/page.tsx');
  const formPath = path.join(process.cwd(), 'components/admin/auth/LoginForm.tsx');
  const pageCode = fs.readFileSync(pagePath, 'utf8');
  const formCode = fs.readFileSync(formPath, 'utf8');

  it('Login page imports SynthesisLogo', () => {
    assert.match(pageCode, /import \{ SynthesisLogo \} from ['"]@\/components\/brand\/SynthesisLogo['"]/);
  });

  it('Approved logo renderer is used', () => {
    assert.match(pageCode, /<SynthesisLogo\s+variant="primary"\s+decorative=\{false\}\s*\/>/);
  });

  it('No inline SVG path geometry exists in login page/form', () => {
    assert.doesNotMatch(pageCode, /<path d="/);
    assert.doesNotMatch(formCode, /<path d="/);
  });

  it('Normal login heading contains Administrace', () => {
    assert.match(pageCode, />\s*Administrace\s*<\/h2>/);
  });

  it('Supporting login text remains', () => {
    assert.match(pageCode, /Přihlaste se ke správě systému/);
  });

  it('No-DB messages remain exactly/semantically present', () => {
    assert.match(pageCode, /Administrace není v tomto prostředí dostupná\./);
    assert.match(pageCode, /Databázové prostředí není nakonfigurováno\./);
  });

  it('isDatabaseConfigured check occurs BEFORE getSession()', () => {
    const isDbConfiguredIndex = pageCode.indexOf('isDatabaseConfigured()');
    const getSessionIndex = pageCode.indexOf('getSession()');
    assert.ok(isDbConfiguredIndex !== -1);
    assert.ok(getSessionIndex !== -1);
    assert.ok(isDbConfiguredIndex < getSessionIndex);
  });

  it('LoginForm is only reached after DB guard path', () => {
    assert.match(pageCode, /<LoginForm \/>/);
    const dbGuardIndex = pageCode.indexOf('if (!isDatabaseConfigured())');
    const loginFormIndex = pageCode.indexOf('<LoginForm />');
    assert.ok(loginFormIndex > dbGuardIndex);
  });

  it('Legacy variables are absent from both files', () => {
    const legacyVars = [
      '--color-canvas',
      '--color-text-primary',
      '--color-text-muted',
      '--color-surface',
      '--color-border',
      '--color-primary'
    ];
    for (const v of legacyVars) {
      assert.doesNotMatch(pageCode, new RegExp(v));
      assert.doesNotMatch(formCode, new RegExp(v));
    }
  });

  it('LoginForm preserves key form behaviors', () => {
    assert.match(formCode, /useActionState/);
    assert.match(formCode, /loginAction/);
    assert.match(formCode, /name="email"/);
    assert.match(formCode, /name="password"/);
    assert.match(formCode, /autoComplete="email"/);
    assert.match(formCode, /autoComplete="current-password"/);
    assert.match(formCode, /required/);
  });

  it('Error message contains role="alert"', () => {
    assert.match(formCode, /role="alert"/);
  });

  it('Inputs/buttons use practical >=44px interactive sizing', () => {
    assert.match(formCode, /min-h-\[44px\]/);
  });

  it('No transition-all', () => {
    assert.doesNotMatch(pageCode, /transition-all/);
    assert.doesNotMatch(formCode, /transition-all/);
  });

  it('No hardcoded Brand hex values', () => {
    assert.doesNotMatch(pageCode, /#FF7A00/i);
    assert.doesNotMatch(formCode, /#FF7A00/i);
  });

  it('No direct red-* error palette classes remain', () => {
    assert.doesNotMatch(formCode, /bg-red-/);
    assert.doesNotMatch(formCode, /text-red-/);
  });

  it('Auth/security implementation files remain unchanged', () => {
    // This just verifies the other files didn't somehow get removed, 
    // the diff check handles actual changes
    const authActions = fs.readFileSync(path.join(process.cwd(), 'app/admin/login/actions.ts'), 'utf8');
    const authSession = fs.readFileSync(path.join(process.cwd(), 'lib/auth/session.ts'), 'utf8');
    const dbRuntime = fs.readFileSync(path.join(process.cwd(), 'lib/runtime/database.ts'), 'utf8');
    assert.ok(authActions.length > 0);
    assert.ok(authSession.length > 0);
    assert.ok(dbRuntime.length > 0);
  });
});
