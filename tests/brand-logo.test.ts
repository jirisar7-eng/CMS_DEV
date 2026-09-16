import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const BRAND_DIR = path.join(process.cwd(), 'public/brand/synthesis');

const REQUIRED_FILES = [
  'synthesis-symbol.svg',
  'synthesis-symbol-monochrome.svg',
  'favicon.svg',
  'app-icon.svg',
  'maskable-icon.svg',
  'synthesis-logo.svg',
  'synthesis-logo-dark.svg',
  'synthesis-logo-white.svg',
];

const MASTER_PATH_1 = 'd="M25 8H13C9.68629 8 7 10.6863 7 14C7 17.3137 9.68629 20 13 20H19"';
const MASTER_PATH_2 = 'd="M7 24H19C22.3137 24 25 21.3137 25 18C25 14.6863 22.3137 12 19 12H13"';

test('Brand assets exist', () => {
  for (const file of REQUIRED_FILES) {
    assert.ok(fs.existsSync(path.join(BRAND_DIR, file)), `${file} is missing`);
  }
});

test('SVGs have correct structure and security', () => {
  for (const file of REQUIRED_FILES) {
    const content = fs.readFileSync(path.join(BRAND_DIR, file), 'utf8');
    
    // Structure
    assert.match(content, /viewBox="/, `${file} missing viewBox`);
    
    // Security
    assert.doesNotMatch(content, /<script/i, `${file} contains script`);
    assert.doesNotMatch(content, /foreignObject/i, `${file} contains foreignObject`);
    assert.doesNotMatch(content, /javascript:/i, `${file} contains javascript`);
    assert.doesNotMatch(content, /onload=/i, `${file} contains onload`);
    assert.doesNotMatch(content, /onclick=/i, `${file} contains onclick`);
    assert.doesNotMatch(content, /onerror=/i, `${file} contains onerror`);
    // allow xmlns
    const contentWithoutXmlns = content.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '');
    assert.doesNotMatch(contentWithoutXmlns, /http:\/\//i, `${file} contains http://`);
    assert.doesNotMatch(contentWithoutXmlns, /https:\/\//i, `${file} contains https://`);
    assert.doesNotMatch(content, /href=/i, `${file} contains href`);
    assert.doesNotMatch(content, /data:/i, `${file} contains data:`);
    assert.doesNotMatch(content, /<style/i, `${file} contains <style>`);
    
    // Design rules
    assert.doesNotMatch(content, /opacity/i, `${file} contains opacity`);
    assert.doesNotMatch(content, /url\(/i, `${file} contains url() gradient reference`);
    
    // Canonical geometry parity
    assert.ok(content.includes(MASTER_PATH_1), `${file} missing master path 1`);
    assert.ok(content.includes(MASTER_PATH_2), `${file} missing master path 2`);
  }
});

test('Specific asset requirements', () => {
  const symbol = fs.readFileSync(path.join(BRAND_DIR, 'synthesis-symbol.svg'), 'utf8');
  assert.ok(symbol.includes('#FF7A00'), 'synthesis-symbol missing primary color');

  const monochrome = fs.readFileSync(path.join(BRAND_DIR, 'synthesis-symbol-monochrome.svg'), 'utf8');
  assert.ok(monochrome.includes('currentColor') || monochrome.includes('#1F1F1F'), 'monochrome missing valid color');

  const wordmarks = ['synthesis-logo.svg', 'synthesis-logo-dark.svg', 'synthesis-logo-white.svg'];
  for (const file of wordmarks) {
    const content = fs.readFileSync(path.join(BRAND_DIR, file), 'utf8');
    assert.ok(content.includes('Synthesis CMS'), `${file} missing wordmark text`);
  }
});
