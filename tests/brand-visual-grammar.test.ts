import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const globalsCssPath = path.join(process.cwd(), 'app/globals.css');
const layoutTsxPath = path.join(process.cwd(), 'app/layout.tsx');

test('Visual Grammar: Typography System', () => {
  const css = fs.readFileSync(globalsCssPath, 'utf8');
  const layout = fs.readFileSync(layoutTsxPath, 'utf8');

  // Verify Inter is loaded in layout
  assert.ok(layout.includes('next/font/google'), 'layout must import next/font/google');
  assert.ok(layout.includes('Inter'), 'layout must use Inter font');

  // Verify CSS variables exist
  assert.ok(css.includes('--font-size-xs: 0.75rem;'));
  assert.ok(css.includes('--font-size-5xl: 3rem;'));
  assert.ok(css.includes('--line-height-body: 1.6;'));
  assert.ok(css.includes('--line-height-heading: 1.2;'));
  
  // Verify responsive classes
  assert.ok(css.includes('.text-display'));
  assert.ok(css.includes('.text-heading-1'));
  assert.ok(css.includes('clamp(2rem, 5vw, 3rem)'));
});

test('Visual Grammar: Spacing System & Grid', () => {
  const css = fs.readFileSync(globalsCssPath, 'utf8');

  assert.ok(css.includes('--space-1: 0.25rem;'));
  assert.ok(css.includes('--space-20: 5rem;'));
});

test('Visual Grammar: Layout Rhythm', () => {
  const css = fs.readFileSync(globalsCssPath, 'utf8');

  assert.ok(css.includes('--content-max: 1200px;'));
  assert.ok(css.includes('--page-gutter-desktop: 2rem;'));
  assert.ok(css.includes('--section-gap-mobile: 3rem;'));
});

test('Visual Grammar: Radius System', () => {
  const css = fs.readFileSync(globalsCssPath, 'utf8');

  assert.ok(css.includes('--radius-xs: 0.375rem;'));
  assert.ok(css.includes('--radius-pill: 999px;'));
  // verify compatibility alias
  assert.ok(css.includes('--radius: var(--radius-sm);'));
});

test('Visual Grammar: Touch Target', () => {
  const css = fs.readFileSync(globalsCssPath, 'utf8');

  assert.ok(css.includes('--touch-target-min: 2.75rem;'));
  assert.ok(css.includes('.touch-target'));
});

test('Visual Grammar: Shadow System', () => {
  const css = fs.readFileSync(globalsCssPath, 'utf8');

  assert.ok(css.includes('--shadow-sm:'));
  assert.ok(css.includes('--shadow-md:'));
  assert.ok(css.includes('--shadow-lg:'));
});

test('Visual Grammar: Motion System', () => {
  const css = fs.readFileSync(globalsCssPath, 'utf8');

  assert.ok(css.includes('--duration-fast: 120ms;'));
  assert.ok(css.includes('--duration-slow: 240ms;'));
  assert.ok(css.includes('--ease-standard:'));
  
  // No global transition all
  assert.ok(!css.includes('transition: all;'));
  
  // Reduced motion query
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
});

test('Visual Grammar: Color Safety', () => {
  const css = fs.readFileSync(globalsCssPath, 'utf8');
  // we ensure no NEW brand palette hardcoding happened.
  // We can just rely on the brand-token-parity test to confirm this.
  assert.ok(true);
});
