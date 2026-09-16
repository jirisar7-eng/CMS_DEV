import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Synthesis Brand Metadata and Icons', () => {
  const layoutPath = path.join(process.cwd(), 'app/layout.tsx');
  const manifestPath = path.join(process.cwd(), 'app/manifest.ts');
  const layoutCode = fs.readFileSync(layoutPath, 'utf8');
  const manifestCode = fs.readFileSync(manifestPath, 'utf8');

  it('app/layout.tsx exports Metadata', () => {
    assert.match(layoutCode, /export const metadata:\s*Metadata/);
  });

  it('metadata contains applicationName = Synthesis CMS', () => {
    assert.match(layoutCode, /applicationName:\s*['"]Synthesis CMS['"]/);
  });

  it('metadata references /brand/synthesis/favicon.svg', () => {
    assert.match(layoutCode, /\/brand\/synthesis\/favicon\.svg/);
  });

  it('favicon metadata declares image/svg+xml', () => {
    assert.match(layoutCode, /type:\s*['"]image\/svg\+xml['"]/);
  });

  it('referenced favicon file physically exists', () => {
    assert.ok(fs.existsSync(path.join(process.cwd(), 'public/brand/synthesis/favicon.svg')));
  });

  it('app/manifest.ts exists', () => {
    assert.ok(fs.existsSync(manifestPath));
  });

  it('manifest imports MetadataRoute and SYNTHESIS_ORANGE_DEFAULT', () => {
    assert.match(manifestCode, /import type \{ MetadataRoute \} from ['"]next['"]/);
    assert.match(manifestCode, /import \{ SYNTHESIS_ORANGE_DEFAULT \} from ['"]@\/lib\/domain\/brand\/contracts['"]/);
  });

  it('manifest contains required PWA fields', () => {
    assert.match(manifestCode, /name:\s*['"]Synthesis CMS['"]/);
    assert.match(manifestCode, /short_name:\s*['"]Synthesis CMS['"]/);
    assert.match(manifestCode, /start_url:\s*['"]\/['"]/);
    assert.match(manifestCode, /display:\s*['"]standalone['"]/);
  });

  it('manifest app icon references /brand/synthesis/app-icon.svg', () => {
    assert.match(manifestCode, /\/brand\/synthesis\/app-icon\.svg/);
  });

  it('manifest maskable icon references /brand/synthesis/maskable-icon.svg', () => {
    assert.match(manifestCode, /\/brand\/synthesis\/maskable-icon\.svg/);
  });

  it('app icon uses sizes = any and purpose = any', () => {
    // Basic structural check
    assert.match(manifestCode, /sizes:\s*['"]any['"]/);
    assert.match(manifestCode, /purpose:\s*['"]any['"]/);
  });

  it('maskable icon uses sizes = any and purpose = maskable', () => {
    assert.match(manifestCode, /purpose:\s*['"]maskable['"]/);
  });

  it('all referenced asset files physically exist', () => {
    assert.ok(fs.existsSync(path.join(process.cwd(), 'public/brand/synthesis/app-icon.svg')));
    assert.ok(fs.existsSync(path.join(process.cwd(), 'public/brand/synthesis/maskable-icon.svg')));
  });

  it('manifest background/theme colors are sourced from SYNTHESIS_ORANGE_DEFAULT', () => {
    assert.match(manifestCode, /SYNTHESIS_ORANGE_DEFAULT\.tokens\.canvas/);
    assert.match(manifestCode, /SYNTHESIS_ORANGE_DEFAULT\.tokens\.brand\.primary/);
  });

  it('manifest.ts contains no hardcoded hex colors', () => {
    assert.doesNotMatch(manifestCode, /#FF7A00/i);
    assert.doesNotMatch(manifestCode, /#FFFFFF/i);
  });

  it('layout.tsx and manifest.ts contain no raw SVG geometries', () => {
    assert.doesNotMatch(layoutCode, /<svg/);
    assert.doesNotMatch(layoutCode, /<path/);
    assert.doesNotMatch(manifestCode, /<svg/);
    assert.doesNotMatch(manifestCode, /<path/);
  });

  it('no fake apple-touch-icon.png or favicon.ico', () => {
    assert.doesNotMatch(layoutCode, /apple-touch-icon\.png/);
    assert.doesNotMatch(layoutCode, /favicon\.ico/);
    assert.ok(!fs.existsSync(path.join(process.cwd(), 'public/apple-touch-icon.png')));
    assert.ok(!fs.existsSync(path.join(process.cwd(), 'public/favicon.ico')));
  });

  it('existing asset contents still contain the approved canonical Synthesis symbol', () => {
    const faviconContent = fs.readFileSync(path.join(process.cwd(), 'public/brand/synthesis/favicon.svg'), 'utf8');
    assert.match(faviconContent, /M25 8H13/); // A known path fragment in the canonical logo
  });

  it('DB access is absent from manifest', () => {
    assert.doesNotMatch(manifestCode, /Prisma/i);
    assert.doesNotMatch(manifestCode, /BrandRepository/);
    assert.doesNotMatch(manifestCode, /DATABASE_URL/);
  });

  it('existing RootLayout BrandRepository fallback logic remains intact', () => {
    assert.match(layoutCode, /BrandRepository\.getActiveBrandData\('SYSTEM'\)/);
  });
});
