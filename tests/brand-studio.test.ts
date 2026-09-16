import { test } from 'node:test';
import * as assert from 'node:assert';
import { getContrastRatio, validateThemeAccessibility } from '../lib/domain/brand/accessibility';
import { SemanticTokensSchema } from '../lib/domain/brand/contracts';

test('Contrast calculation logic', () => {
  const white = '#ffffff';
  const black = '#000000';
  
  const ratio = getContrastRatio(white, black);
  assert.ok(ratio > 20); // 21:1 expected
  
  const orange = '#FF7A00';
  const ratio2 = getContrastRatio(white, orange);
  assert.ok(ratio2 > 1); // just a basic sanity check
});

test('Theme Accessibility Validation', () => {
  const badTokens = {
    brand: { primary: '#FF7A00', soft: '#FFE4CC' },
    action: { primary: '#E66E00', primaryText: '#E66E00' }, // BAD: orange text on orange bg
    text: { primary: '#FFFFFF', secondary: '#4D4D4D', muted: '#737373' }, // BAD: white text on white canvas
    canvas: '#FFFFFF',
    surface: '#F5F5F5',
    surfaceElevated: '#FFFFFF',
    border: '#E5E5E5',
    link: '#FF7A00',
    focus: '#FF9E40',
    state: { success: '#16A34A', warning: '#F59E0B', error: '#DC2626', info: '#2563EB' }
  };
  
  const failures = validateThemeAccessibility(badTokens, 'light');
  assert.ok(failures.length > 0);
  assert.ok(failures.some(f => f.pair === 'action.primaryText / action.primary'));
});
