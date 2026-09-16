import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { SYNTHESIS_ORANGE_DEFAULT } from '../lib/domain/brand/contracts';
import { getContrastRatio, validateAllThemesAccessibility } from '../lib/domain/brand/accessibility';

describe('Brand Book and Accessibility Matrix Verification', () => {
  const brandBookPath = path.join(process.cwd(), 'docs/brand/SYNTHESIS-CMS-BRAND-BOOK.md');
  const boundaryDocPath = path.join(process.cwd(), 'docs/architecture/SYN-BRAND-003-SYSTEM-PROJECT-BOUNDARY.md');

  it('Brand Book exists', () => {
    assert.ok(fs.existsSync(brandBookPath));
  });

  it('SYSTEM/PROJECT boundary doc exists', () => {
    assert.ok(fs.existsSync(boundaryDocPath));
  });

  it('Brand Book contains required key values', () => {
    const brandBook = fs.readFileSync(brandBookPath, 'utf8');
    assert.match(brandBook, /Synthesis CMS/);
    assert.match(brandBook, /SYSTEM/);
    assert.match(brandBook, /#FF7A00/i);
    assert.match(brandBook, /#C25700/i);
    assert.match(brandBook, /#FF9E40/i);
    assert.match(brandBook, /Inter/);
    assert.match(brandBook, /LIGHT/);
    assert.match(brandBook, /DARK/);
    assert.match(brandBook, /EXTRA DARK/);
  });

  it('Brand Book names all eight current static asset files', () => {
    const brandBook = fs.readFileSync(brandBookPath, 'utf8');
    assert.match(brandBook, /synthesis-symbol\.svg/);
    assert.match(brandBook, /synthesis-symbol-monochrome\.svg/);
    assert.match(brandBook, /synthesis-logo\.svg/);
    assert.match(brandBook, /synthesis-logo-dark\.svg/);
    assert.match(brandBook, /synthesis-logo-white\.svg/);
    assert.match(brandBook, /favicon\.svg/);
    assert.match(brandBook, /app-icon\.svg/);
    assert.match(brandBook, /maskable-icon\.svg/);
  });

  it('Brand Book explicitly states color roles', () => {
    const brandBook = fs.readFileSync(brandBookPath, 'utf8');
    assert.match(brandBook, /identity color/i); // #FF7A00 is the identity color
    assert.match(brandBook, /#C25700/i); // light action uses #C25700
  });

  it('Production validateAllThemesAccessibility returns []', () => {
    const errors = validateAllThemesAccessibility(SYNTHESIS_ORANGE_DEFAULT);
    assert.strictEqual(errors.length, 0);
  });

  it('Evaluates all 21 enforced pairs using production getContrastRatio', () => {
    const pairs = [
      { name: 'text.primary / canvas', fg: 'text.primary', bg: 'canvas', min: 4.5 },
      { name: 'text.primary / surface', fg: 'text.primary', bg: 'surface', min: 4.5 },
      { name: 'text.muted / canvas', fg: 'text.muted', bg: 'canvas', min: 4.5 },
      { name: 'action.primaryText / action.primary', fg: 'action.primaryText', bg: 'action.primary', min: 4.5 },
      { name: 'link / canvas', fg: 'link', bg: 'canvas', min: 4.5 },
      { name: 'focus / canvas', fg: 'focus', bg: 'canvas', min: 3.0 },
      { name: 'focus / surface', fg: 'focus', bg: 'surface', min: 3.0 }
    ];

    const resolve = (tokens: any, pathStr: string) => {
      const parts = pathStr.split('.');
      let obj = tokens;
      for (const part of parts) {
        if (!obj || obj[part] === undefined) return null;
        obj = obj[part];
      }
      return obj;
    };

    const modes = ['light', 'dark', 'extraDark'];

    let count = 0;
    for (const mode of modes) {
      const tokens = (SYNTHESIS_ORANGE_DEFAULT.themeModes as any)[mode];
      for (const pair of pairs) {
        const fgVal = resolve(tokens, pair.fg);
        const bgVal = resolve(tokens, pair.bg);
        const ratio = getContrastRatio(fgVal, bgVal);
        assert.ok(ratio >= pair.min, `Failed ${mode} ${pair.name}: ${ratio} < ${pair.min}`);
        count++;
      }
    }
    assert.strictEqual(count, 21);
  });

  it('Brand Book contains all 21 corresponding matrix rows or stable mode/pair markers', () => {
    const brandBook = fs.readFileSync(brandBookPath, 'utf8');
    const matches = brandBook.match(/\| (light|dark|extraDark) \|/g);
    assert.ok(matches && matches.length >= 21);
  });

  it('Ratios written in Brand Book match production getContrastRatio rounded to 2 decimals', () => {
    const brandBook = fs.readFileSync(brandBookPath, 'utf8');
    // Sanity check a couple of known values
    const tokens = SYNTHESIS_ORANGE_DEFAULT.themeModes.light;
    const fg = tokens.text.primary;
    const bg = tokens.canvas;
    const ratio = getContrastRatio(fg, bg).toFixed(2);
    assert.ok(brandBook.includes(ratio));
  });

  it('Documentation explicitly contains an accessibility limitation statement', () => {
    const brandBook = fs.readFileSync(brandBookPath, 'utf8');
    assert.match(brandBook, /does not currently certify every possible foreground\/background combination/i);
  });

  it('Boundary doc states scope invariants for SYSTEM and PROJECT', () => {
    const boundaryDoc = fs.readFileSync(boundaryDocPath, 'utf8');
    assert.match(boundaryDoc, /forbidden.*SYSTEM/i);
    assert.match(boundaryDoc, /required.*PROJECT/i);
  });

  it('Boundary doc states no fake MediaAsset IDs', () => {
    const boundaryDoc = fs.readFileSync(boundaryDocPath, 'utf8');
    assert.match(boundaryDoc, /no fake MediaAsset IDs/i);
  });

  it('Boundary doc keeps Táta má právo as PROJECT example only', () => {
    const boundaryDoc = fs.readFileSync(boundaryDocPath, 'utf8');
    assert.match(boundaryDoc, /PROJECT.*Táta má právo/i);
    assert.doesNotMatch(boundaryDoc, /SYSTEM.*Táta má právo/i);
  });

  it('Documentation contains no secret/token credentials', () => {
    const brandBook = fs.readFileSync(brandBookPath, 'utf8');
    const boundaryDoc = fs.readFileSync(boundaryDocPath, 'utf8');
    assert.doesNotMatch(brandBook, /secret|token|password/i);
    assert.doesNotMatch(boundaryDoc, /secret|token|password/i);
  });

  it('Documentation does not claim Apple Touch PNG exists', () => {
    const brandBook = fs.readFileSync(brandBookPath, 'utf8');
    assert.match(brandBook, /Apple Touch PNG.*NOT YET PROVIDED/i);
  });

  it('Documentation does not contain duplicated canonical SVG path data', () => {
    const brandBook = fs.readFileSync(brandBookPath, 'utf8');
    assert.doesNotMatch(brandBook, /<path d="/);
  });

  it('Brand Book and globals.css have motion parity', () => {
    const globals = fs.readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');
    const brandBook = fs.readFileSync(brandBookPath, 'utf8');
    
    const extractCssVariable = (name: string) => {
      const regex = new RegExp(`${name}:\\s*([^;]+);`);
      const match = globals.match(regex);
      return match ? match[1].trim() : null;
    };

    const vars = [
      '--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-8', '--space-10', '--space-12', '--space-16', '--space-20',
      '--content-max', '--content-wide',
      '--page-gutter-mobile', '--page-gutter-tablet', '--page-gutter-desktop',
      '--section-gap-mobile', '--section-gap-desktop',
      '--touch-target-min',
      '--radius-xs', '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-pill',
      '--shadow-sm', '--shadow-md', '--shadow-lg',
      '--duration-fast', '--duration-normal', '--duration-slow',
      '--ease-standard', '--ease-emphasized'
    ];

    for (const v of vars) {
      const val = extractCssVariable(v);
      assert.ok(val, `Variable ${v} not found in globals.css`);
      assert.match(brandBook, new RegExp(v), `Variable ${v} missing in Brand Book`);
      assert.ok(brandBook.includes(val.replace(/\s+/g, ' ')), `Value ${val} for ${v} missing in Brand Book`);
    }
  });

  it('Brand Book no longer claims stale values', () => {
    const brandBook = fs.readFileSync(brandBookPath, 'utf8');
    const sectionMatch = brandBook.match(/## 8\. Spacing \/ Radius \/ Motion[\s\S]*?## 9\. Theme Behavior/);
    assert.ok(sectionMatch);
    const section = sectionMatch[0];
    
    assert.doesNotMatch(section, /150ms/);
    assert.doesNotMatch(section, /250ms/);
    assert.doesNotMatch(section, /350ms/);
    assert.doesNotMatch(section, /1024px/);
    assert.doesNotMatch(section, /1280px/);
    assert.doesNotMatch(section, /--max-w-content/);
    assert.doesNotMatch(section, /--max-w-wide/);
    assert.doesNotMatch(section, /--gutter-mobile/);
    assert.doesNotMatch(section, /--gutter-desktop/);
  });

  it('globals.css and Brand Book support reduced motion', () => {
    const globals = fs.readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');
    const brandBook = fs.readFileSync(brandBookPath, 'utf8');
    
    assert.match(globals, /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
    assert.match(brandBook, /prefers-reduced-motion:\s*reduce/);
  });

});
