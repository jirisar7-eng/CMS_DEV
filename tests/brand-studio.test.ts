import { test } from 'node:test';
import * as assert from 'node:assert';
import { getContrastRatio, validateAllThemesAccessibility, validateTokensAccessibility } from '../lib/domain/brand/accessibility';
import { SemanticTokensSchema, SYNTHESIS_ORANGE_DEFAULT, validateScopeInvariant, getDerivedPermissionScope } from '../lib/domain/brand/contracts';
import { resolveBrandTokens } from '../lib/domain/brand/resolver';

test('Strict Color Validation (Zod)', () => {
  const validToken = {
    brand: { primary: '#FF7A00', soft: '#FFE4CC' },
    action: { primary: '#C25700', primaryText: '#FFFFFF' },
    text: { primary: '#1F1F1F', secondary: '#4D4D4D', muted: '#737373' },
    canvas: '#FFFFFF',
    surface: '#F5F5F5',
    surfaceElevated: '#FFFFFF',
    border: '#E5E5E5',
    link: '#C25700',
    focus: '#000000',
    state: { success: '#16A34A', warning: '#F59E0B', error: '#DC2626', info: '#2563EB' }
  };
  
  const parsed = SemanticTokensSchema.safeParse(validToken);
  assert.ok(parsed.success);

  const invalidToken = {
    ...validToken,
    canvas: 'red' // Invalid format
  };
  assert.ok(!SemanticTokensSchema.safeParse(invalidToken).success);

  const invalidToken2 = {
    ...validToken,
    canvas: '#ffff' // Invalid hex length
  };
  assert.ok(!SemanticTokensSchema.safeParse(invalidToken2).success);
});

test('Scope Invariants', () => {
  // Valid
  assert.doesNotThrow(() => validateScopeInvariant('SYSTEM', null));
  assert.doesNotThrow(() => validateScopeInvariant('PROJECT', 'proj-123'));
  
  // Invalid
  assert.throws(() => validateScopeInvariant('SYSTEM', 'proj-123'));
  assert.throws(() => validateScopeInvariant('PROJECT', null));
  assert.throws(() => validateScopeInvariant('UNKNOWN', null));
  
  // Derived Permission
  assert.strictEqual(getDerivedPermissionScope('SYSTEM', null), null);
  assert.strictEqual(getDerivedPermissionScope('PROJECT', 'proj-123'), 'proj-123');
});

test('Contrast calculation logic', () => {
  const white = '#ffffff';
  const black = '#000000';
  
  const ratio = getContrastRatio(white, black);
  assert.ok(ratio > 20); // 21:1 expected
  
  const ratio2 = getContrastRatio('#C25700', '#FFFFFF');
  assert.ok(ratio2 > 4.5); // Action contrast
});

test('Accessibility Validation - Default Preset', () => {
  const failures = validateAllThemesAccessibility(SYNTHESIS_ORANGE_DEFAULT);
  if (failures.length > 0) {
    console.error(failures);
  }
  assert.strictEqual(failures.length, 0, 'Default preset must pass all accessibility checks');
});

test('Accessibility Validation - Bad Contrast', () => {
  const badTokens = {
    brand: { primary: '#FF7A00', soft: '#FFE4CC' },
    action: { primary: '#E66E00', primaryText: '#E66E00' }, // BAD: orange text on orange bg
    text: { primary: '#FFFFFF', secondary: '#4D4D4D', muted: '#737373' }, // BAD: white text on white canvas
    canvas: '#FFFFFF',
    surface: '#F5F5F5',
    surfaceElevated: '#FFFFFF',
    border: '#E5E5E5',
    link: '#FF7A00', // Warning: contrast against white is < 4.5
    focus: '#FF9E40', // Bad focus contrast
    state: { success: '#16A34A', warning: '#F59E0B', error: '#DC2626', info: '#2563EB' }
  };
  
  const failures = validateTokensAccessibility(badTokens, 'light');
  assert.ok(failures.length > 0);
  assert.ok(failures.some(f => f.pair === 'action.primaryText / action.primary'));
});

test('Shared Theme Resolver', () => {
  // Should default to Light if extraDark doesn't exist
  const dataWithoutExtraDark = {
    ...SYNTHESIS_ORANGE_DEFAULT,
    themeModes: {
      ...SYNTHESIS_ORANGE_DEFAULT.themeModes,
      extraDark: null
    }
  };
  
  const resolvedExtraDark = resolveBrandTokens(dataWithoutExtraDark as any, 'extraDark');
  // It should fall back to dark, and dark exists
  assert.strictEqual(resolvedExtraDark.canvas, SYNTHESIS_ORANGE_DEFAULT.themeModes.dark!.canvas);

  // Missing everything
  const resolvedLight = resolveBrandTokens(null, 'light');
  assert.strictEqual(resolvedLight.canvas, '#FFFFFF');
});

test('Accessibility Validation - Explicit Failure Modes', () => {
  const { validateAllThemesAccessibility } = require('../lib/domain/brand/accessibility');
  const { SYNTHESIS_ORANGE_DEFAULT } = require('../lib/domain/brand/contracts');

  const badData = {
    ...SYNTHESIS_ORANGE_DEFAULT,
    themeModes: {
      ...SYNTHESIS_ORANGE_DEFAULT.themeModes,
      dark: {
        ...SYNTHESIS_ORANGE_DEFAULT.themeModes.dark,
        text: { primary: '#121212', secondary: '#121212', muted: '#121212' }, // Dark text on dark canvas
        action: { primary: '#121212', primaryText: '#121212' }, // bad action contrast
        link: '#121212', // bad link contrast
        focus: '#121212' // bad focus contrast
      }
    }
  };

  const failures = validateAllThemesAccessibility(badData as any);
  
  const hasDarkFailure = failures.some((f: any) => f.mode === 'dark');
  const hasTextContrastFailure = failures.some((f: any) => f.pair === 'text.primary / canvas');
  const hasActionContrastFailure = failures.some((f: any) => f.pair === 'action.primaryText / action.primary');
  const hasLinkContrastFailure = failures.some((f: any) => f.pair === 'link / canvas');
  const hasFocusContrastFailure = failures.some((f: any) => f.pair === 'focus / canvas');

  assert.ok(hasDarkFailure, 'Must detect failures in DARK mode');
  assert.ok(hasTextContrastFailure, 'Must detect text contrast failure');
  assert.ok(hasActionContrastFailure, 'Must detect action contrast failure');
  assert.ok(hasLinkContrastFailure, 'Must detect link contrast failure');
  assert.ok(hasFocusContrastFailure, 'Must detect focus contrast failure');
});
