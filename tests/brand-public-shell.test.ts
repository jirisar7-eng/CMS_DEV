import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const headerPath = path.join(process.cwd(), 'components/public/PublicHeader.tsx');
const footerPath = path.join(process.cwd(), 'components/public/CompactFooter.tsx');

test('Public Shell: Header Integration', () => {
  const headerContent = fs.readFileSync(headerPath, 'utf8');

  // 1. PublicHeader imports/uses SynthesisLogo
  assert.ok(headerContent.includes('SynthesisLogo'), 'Header must import and use SynthesisLogo');

  // 2. PublicHeader contains real routes
  assert.ok(headerContent.includes("href: '/features'"));
  assert.ok(headerContent.includes("href: '/docs'"));
  assert.ok(headerContent.includes("href: '/pricing'"));
  assert.ok(headerContent.includes("href: '/requirements'"));
  assert.ok(headerContent.includes("href: '/security'"));
  assert.ok(headerContent.includes('href="/admin"'));

  // 3. PublicHeader contains NO obsolete href beginning with "#"
  assert.ok(!headerContent.match(/href:?['"]#[a-z]+['"]/i), 'Header must not contain # hash links');

  // 4. Mobile menu button contains accessibility attributes
  assert.ok(headerContent.includes('type="button"'), 'Mobile menu button must have type="button"');
  assert.ok(headerContent.includes('aria-expanded'), 'Mobile menu button must have aria-expanded');
  assert.ok(headerContent.includes('aria-controls="public-navigation-mobile"'), 'Mobile menu button must have aria-controls');
  assert.ok(headerContent.includes('aria-label'), 'Mobile menu button must have aria-label');

  // 5. Mobile menu has matching id
  assert.ok(headerContent.includes('id="public-navigation-mobile"'), 'Mobile menu container must have matching id');

  // 6. Header contains no transition-all
  assert.ok(!headerContent.includes('transition-all'), 'Header must not use transition-all');

  // 11. No hardcoded hex colors
  assert.ok(!headerContent.match(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/), 'Header must not contain hardcoded hex colors');
});

test('Public Shell: Footer Integration', () => {
  const footerContent = fs.readFileSync(footerPath, 'utf8');

  // 7. Footer contains valid existing routes
  assert.ok(footerContent.includes('href="/docs"'));
  assert.ok(footerContent.includes('href="/pricing"'));
  assert.ok(footerContent.includes('href="/security"'));
  assert.ok(footerContent.includes('href="/requirements"'));

  // 8. Footer contains NO /licence, /privacy
  assert.ok(!footerContent.includes('href="/licence"'), 'Footer must not contain dead /licence link');
  assert.ok(!footerContent.includes('href="/privacy"'), 'Footer must not contain dead /privacy link');

  // 10. Footer remains compact
  assert.ok(!footerContent.includes('py-16'), 'Footer spacing too large');
  assert.ok(!footerContent.includes('py-20'), 'Footer spacing too large');
  assert.ok(!footerContent.includes('py-24'), 'Footer spacing too large');
  assert.ok(footerContent.includes('py-5') || footerContent.includes('py-6'), 'Footer should use compact padding');

  // 11. No hardcoded hex colors
  assert.ok(!footerContent.match(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/), 'Footer must not contain hardcoded hex colors');
});

test('Public Shell: Route Existence', () => {
  // 9. Verify route files actually exist
  const routes = [
    'app/features/page.tsx',
    'app/docs/page.tsx',
    'app/pricing/page.tsx',
    'app/requirements/page.tsx',
    'app/security/page.tsx'
  ];

  for (const route of routes) {
    const routePath = path.join(process.cwd(), route);
    assert.ok(fs.existsSync(routePath), `Route file must exist: ${route}`);
  }
});
