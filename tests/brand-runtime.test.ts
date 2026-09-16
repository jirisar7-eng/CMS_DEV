import { test } from 'node:test';
import * as assert from 'node:assert';
import { applyThemeToRoot } from '../lib/domain/brand/runtime';
import { SYNTHESIS_ORANGE_DEFAULT } from '../lib/domain/brand/contracts';

test('Runtime Theme Mapping - Correctly maps tokens to CSS variables', () => {
  const styles: Record<string, string> = {};
  
  const mockRoot = {
    style: {
      setProperty: (key: string, value: string) => {
        styles[key] = value;
      }
    }
  } as unknown as HTMLElement;
  
  applyThemeToRoot(SYNTHESIS_ORANGE_DEFAULT, 'light', mockRoot);
  
  // Verify mandatory token mappings
  assert.strictEqual(styles['--brand-primary'], '#FF7A00');
  assert.strictEqual(styles['--brand-primary-soft'], '#FFE4CC');
  
  assert.strictEqual(styles['--action-primary'], '#C25700');
  assert.strictEqual(styles['--action-primary-text'], '#FFFFFF');
  
  assert.strictEqual(styles['--surface-canvas'], '#FFFFFF');
  assert.strictEqual(styles['--surface-default'], '#FFFFFF');
  assert.strictEqual(styles['--surface-subtle'], '#F5F5F5');
  
  assert.strictEqual(styles['--text-primary'], '#1F1F1F');
  assert.strictEqual(styles['--text-secondary'], '#4D4D4D');
  assert.strictEqual(styles['--text-muted'], '#737373');
  
  assert.strictEqual(styles['--border-default'], '#E5E5E5');
  assert.strictEqual(styles['--focus-ring'], '#000000');
  
  assert.strictEqual(styles['--state-success'], '#16A34A');
  assert.strictEqual(styles['--state-warning'], '#F59E0B');
  assert.strictEqual(styles['--state-danger'], '#DC2626');
  assert.strictEqual(styles['--state-info'], '#2563EB');
  
  assert.strictEqual(styles['--font-sans'], 'Inter, sans-serif');

  // explicitly assert they are different
  assert.notStrictEqual(styles['--action-primary'], styles['--brand-primary']);
});

test('Runtime Theme Mapping - Extra Dark resolution', () => {
  const styles: Record<string, string> = {};
  const mockRoot = {
    style: {
      setProperty: (key: string, value: string) => { styles[key] = value; }
    }
  } as unknown as HTMLElement;
  
  // Should map extra-dark -> extraDark under the hood
  applyThemeToRoot(SYNTHESIS_ORANGE_DEFAULT, 'extra-dark', mockRoot);
  
  assert.strictEqual(styles['--surface-canvas'], '#000000');
  assert.strictEqual(styles['--surface-default'], '#141414');
  assert.strictEqual(styles['--surface-subtle'], '#0A0A0A');
});

