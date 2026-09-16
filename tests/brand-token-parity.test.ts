import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { BrandVersionSchema, SYNTHESIS_ORANGE_DEFAULT } from '../lib/domain/brand/contracts';

const globalsCssPath = path.join(process.cwd(), 'app/globals.css');
const runtimeTsPath = path.join(process.cwd(), 'lib/domain/brand/runtime.ts');

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [0, 0, 0];
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ];
}

function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map(c => {
    if (c <= 0.03928) return c / 12.92;
    return Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  const l1 = getLuminance(rgb1[0], rgb1[1], rgb1[2]);
  const l2 = getLuminance(rgb2[0], rgb2[1], rgb2[2]);
  
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  
  return (lighter + 0.05) / (darker + 0.05);
}

test('SYNTHESIS_ORANGE_DEFAULT validates through BrandVersionSchema', () => {
  const result = BrandVersionSchema.safeParse(SYNTHESIS_ORANGE_DEFAULT);
  assert.strictEqual(result.success, true, 'SYNTHESIS_ORANGE_DEFAULT must be valid');
});

test('SYNTHESIS_ORANGE_DEFAULT is completely accessible', () => {
  // Test Light mode contrast
  const light = SYNTHESIS_ORANGE_DEFAULT.themeModes.light;
  
  // text.muted on canvas
  const mutedContrast = getContrastRatio(light.text.muted, light.canvas);
  assert.ok(mutedContrast >= 4.5, `Light text.muted contrast too low: ${mutedContrast}`);
  
  // action.primary on canvas (for links/standalone buttons without text)
  const actionContrast = getContrastRatio(light.action.primary, light.canvas);
  assert.ok(actionContrast >= 4.5, `Light action.primary contrast too low: ${actionContrast}`);

  // action.primaryText on action.primary
  const buttonContrast = getContrastRatio(light.action.primaryText, light.action.primary);
  assert.ok(buttonContrast >= 4.5, `Light action button contrast too low: ${buttonContrast}`);

  // Test Dark mode contrast
  const dark = SYNTHESIS_ORANGE_DEFAULT.themeModes.dark!;
  const darkMutedContrast = getContrastRatio(dark.text.muted, dark.canvas);
  assert.ok(darkMutedContrast >= 4.5, `Dark text.muted contrast too low: ${darkMutedContrast}`);
  
  const darkActionContrast = getContrastRatio(dark.action.primary, dark.canvas);
  assert.ok(darkActionContrast >= 4.5, `Dark action.primary contrast too low: ${darkActionContrast}`);
  
  const darkButtonContrast = getContrastRatio(dark.action.primaryText, dark.action.primary);
  assert.ok(darkButtonContrast >= 4.5, `Dark action button contrast too low: ${darkButtonContrast}`);

  // Test Extra Dark mode contrast
  const extraDark = SYNTHESIS_ORANGE_DEFAULT.themeModes.extraDark!;
  const extraDarkMutedContrast = getContrastRatio(extraDark.text.muted, extraDark.canvas);
  assert.ok(extraDarkMutedContrast >= 4.5, `Extra Dark text.muted contrast too low: ${extraDarkMutedContrast}`);
  
  const extraDarkActionContrast = getContrastRatio(extraDark.action.primary, extraDark.canvas);
  assert.ok(extraDarkActionContrast >= 4.5, `Extra Dark action.primary contrast too low: ${extraDarkActionContrast}`);
  
  const extraDarkButtonContrast = getContrastRatio(extraDark.action.primaryText, extraDark.action.primary);
  assert.ok(extraDarkButtonContrast >= 4.5, `Extra Dark action button contrast too low: ${extraDarkButtonContrast}`);
});

test('Static CSS matches authoritative default brand tokens', () => {
  const css = fs.readFileSync(globalsCssPath, 'utf8');

  // Verify derived tokens exist and are not hardcoded separate values per mode
  const derivedCount = (css.match(/color-mix/g) || []).length;
  assert.ok(derivedCount >= 9, 'Missing color-mix derivations for hover/active/border in CSS');

  // Helper to extract a variable value from a specific block
  const extractVar = (block: string, varName: string) => {
    const regex = new RegExp(`--${varName}:\\s*([^;]+);`);
    const match = block.match(regex);
    return match ? match[1].trim().toUpperCase() : null;
  };

  // Extract blocks
  const rootBlockMatch = css.match(/:root,\s*\.light\s*{([^}]+)}/);
  const rootBlock = rootBlockMatch ? rootBlockMatch[1] : '';

  const darkBlockMatch = css.match(/\.dark\s*{([^}]+)}/);
  const darkBlock = darkBlockMatch ? darkBlockMatch[1] : '';

  const extraDarkBlockMatch = css.match(/\.extra-dark\s*{([^}]+)}/);
  const extraDarkBlock = extraDarkBlockMatch ? extraDarkBlockMatch[1] : '';
  
  const themeMatch = css.match(/@theme\s*{([^}]+)}/);
  const themeBlock = themeMatch ? themeMatch[1] : '';

  assert.ok(rootBlock, 'Light block missing');
  assert.ok(darkBlock, 'Dark block missing');
  assert.ok(extraDarkBlock, 'Extra dark block missing');
  
  // Explicitly assert key values as requested
  assert.strictEqual(extractVar(rootBlock, 'brand-primary'), '#FF7A00', 'Light brand.primary must be #FF7A00');
  assert.strictEqual(extractVar(rootBlock, 'action-primary'), '#C25700', 'Light action.primary must be #C25700');
  assert.notStrictEqual(extractVar(rootBlock, 'brand-primary'), extractVar(rootBlock, 'action-primary'), 'Light brand.primary must not equal action.primary');
  assert.strictEqual(extractVar(extraDarkBlock, 'text-muted'), '#888888', 'Extra Dark text.muted must be #888888');

  // Verify focus ring accessibility
  assert.strictEqual(extractVar(rootBlock, 'focus-ring'), '#000000', 'Light focus must be #000000');
  assert.strictEqual(extractVar(darkBlock, 'focus-ring'), '#FFFFFF', 'Dark focus must be #FFFFFF');
  assert.strictEqual(extractVar(extraDarkBlock, 'focus-ring'), '#FFFFFF', 'Extra Dark focus must be #FFFFFF');
  
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
