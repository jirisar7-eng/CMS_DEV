import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { BrandVersionSchema, SYNTHESIS_ORANGE_DEFAULT } from '../lib/domain/brand/contracts';
import { validateAllThemesAccessibility } from '../lib/domain/brand/accessibility';

const globalsCssPath = path.join(process.cwd(), 'app/globals.css');
const runtimeTsPath = path.join(process.cwd(), 'lib/domain/brand/runtime.ts');

test('SYNTHESIS_ORANGE_DEFAULT validates through BrandVersionSchema', () => {
  const result = BrandVersionSchema.safeParse(SYNTHESIS_ORANGE_DEFAULT);
  assert.strictEqual(result.success, true, 'SYNTHESIS_ORANGE_DEFAULT must be valid');
});

test('SYNTHESIS_ORANGE_DEFAULT is completely accessible', () => {
  const failures = validateAllThemesAccessibility(SYNTHESIS_ORANGE_DEFAULT);
  assert.deepStrictEqual(failures, []);
});

test('Static CSS matches authoritative default brand tokens', () => {
  const css = fs.readFileSync(globalsCssPath, 'utf8');

  // Verify derived tokens exist exactly ONCE in a shared block for all modes
  const derivedCount = (css.match(/--action-primary-hover:\s*color-mix/g) || []).length;
  assert.strictEqual(derivedCount, 1, 'Missing single color-mix derivation for --action-primary-hover in CSS');
  
  const derivedActiveCount = (css.match(/--action-primary-active:\s*color-mix/g) || []).length;
  assert.strictEqual(derivedActiveCount, 1, 'Missing single color-mix derivation for --action-primary-active in CSS');
  
  const derivedBorderCount = (css.match(/--border-strong:\s*color-mix/g) || []).length;
  assert.strictEqual(derivedBorderCount, 1, 'Missing single color-mix derivation for --border-strong in CSS');

  // Helper to extract a variable value from a specific block
  const extractVar = (block: string, varName: string) => {
    const regex = new RegExp(`--${varName}:\\s*([^;]+);`);
    const match = block.match(regex);
    return match ? match[1].trim().toUpperCase() : null;
  };

  // Extract blocks (excluding the shared derived block)
  const rootBlockMatch = css.match(/:root,\s*\.light\s*{\s*--brand-primary:([^}]+)}/);
  const rootBlock = rootBlockMatch ? `--brand-primary:${rootBlockMatch[1]}` : '';

  const darkBlockMatch = css.match(/\.dark\s*{\s*--brand-primary:([^}]+)}/);
  const darkBlock = darkBlockMatch ? `--brand-primary:${darkBlockMatch[1]}` : '';

  const extraDarkBlockMatch = css.match(/\.extra-dark\s*{\s*--brand-primary:([^}]+)}/);
  const extraDarkBlock = extraDarkBlockMatch ? `--brand-primary:${extraDarkBlockMatch[1]}` : '';
  
  const themeMatch = css.match(/@theme\s*{([^}]+)}/);
  const themeBlock = themeMatch ? themeMatch[1] : '';

  assert.ok(rootBlock, 'Light block missing');
  assert.ok(darkBlock, 'Dark block missing');
  assert.ok(extraDarkBlock, 'Extra dark block missing');
  
  const checkParity = (modeName: string, block: string, tokens: any) => {
    assert.strictEqual(extractVar(block, 'brand-primary'), tokens.brand.primary.toUpperCase(), `${modeName} brand.primary`);
    assert.strictEqual(extractVar(block, 'brand-primary-soft'), tokens.brand.soft.toUpperCase(), `${modeName} brand.soft`);
    assert.strictEqual(extractVar(block, 'action-primary'), tokens.action.primary.toUpperCase(), `${modeName} action.primary`);
    assert.strictEqual(extractVar(block, 'action-primary-text'), tokens.action.primaryText.toUpperCase(), `${modeName} action.primaryText`);
    assert.strictEqual(extractVar(block, 'text-primary'), tokens.text.primary.toUpperCase(), `${modeName} text.primary`);
    assert.strictEqual(extractVar(block, 'text-secondary'), tokens.text.secondary.toUpperCase(), `${modeName} text.secondary`);
    assert.strictEqual(extractVar(block, 'text-muted'), tokens.text.muted.toUpperCase(), `${modeName} text.muted`);
    assert.strictEqual(extractVar(block, 'surface-canvas'), tokens.canvas.toUpperCase(), `${modeName} canvas`);
    assert.strictEqual(extractVar(block, 'surface-default'), tokens.surfaceElevated.toUpperCase(), `${modeName} surfaceElevated`);
    assert.strictEqual(extractVar(block, 'surface-subtle'), tokens.surface.toUpperCase(), `${modeName} surface`);
    assert.strictEqual(extractVar(block, 'border-default'), tokens.border.toUpperCase(), `${modeName} border`);
    assert.strictEqual(extractVar(block, 'link-color'), tokens.link.toUpperCase(), `${modeName} link`);
    assert.strictEqual(extractVar(block, 'focus-ring'), tokens.focus.toUpperCase(), `${modeName} focus`);
    assert.strictEqual(extractVar(block, 'state-success'), tokens.state.success.toUpperCase(), `${modeName} state.success`);
    assert.strictEqual(extractVar(block, 'state-warning'), tokens.state.warning.toUpperCase(), `${modeName} state.warning`);
    assert.strictEqual(extractVar(block, 'state-danger'), tokens.state.error.toUpperCase(), `${modeName} state.error`);
    assert.strictEqual(extractVar(block, 'state-info'), tokens.state.info.toUpperCase(), `${modeName} state.info`);
  };

  checkParity('Light', rootBlock, SYNTHESIS_ORANGE_DEFAULT.themeModes.light);
  checkParity('Dark', darkBlock, SYNTHESIS_ORANGE_DEFAULT.themeModes.dark);
  checkParity('Extra Dark', extraDarkBlock, SYNTHESIS_ORANGE_DEFAULT.themeModes.extraDark);

  // Verify @theme mapping exposes --color-link
  assert.ok(themeBlock.includes('--color-link: var(--link-color);'), 'theme must expose --color-link');
});

test('Runtime maps all CSS variables', () => {
  const runtime = fs.readFileSync(runtimeTsPath, 'utf8');
  const vars = [
    '--brand-primary',
    '--brand-primary-soft',
    '--action-primary',
    '--action-primary-text',
    '--surface-canvas',
    '--surface-default',
    '--surface-subtle',
    '--text-primary',
    '--text-secondary',
    '--text-muted',
    '--border-default',
    '--link-color',
    '--focus-ring',
    '--state-success',
    '--state-warning',
    '--state-danger',
    '--state-info'
  ];
  
  for (const v of vars) {
    assert.ok(runtime.includes(v), `Runtime is missing mapping for ${v}`);
  }
});
