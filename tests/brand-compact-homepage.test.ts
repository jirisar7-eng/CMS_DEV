import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const heroPath = path.join(process.cwd(), 'components/public/CompactHero.tsx');
const benefitsPath = path.join(process.cwd(), 'components/public/CompactBenefits.tsx');
const statusPath = path.join(process.cwd(), 'components/public/CompactStatus.tsx');
const finalCtaPath = path.join(process.cwd(), 'components/public/CompactFinalCta.tsx');
const pagePath = path.join(process.cwd(), 'app/page.tsx');

const readComponent = (p: string) => fs.readFileSync(p, 'utf8');

test('Compact Homepage: Mobile First & Structure', () => {
  const benefits = readComponent(benefitsPath);
  assert.ok(benefits.includes('grid-cols-2'), 'CompactBenefits must use grid-cols-2 for mobile base');
  
  assert.ok(benefits.includes('Modulární'));
  assert.ok(benefits.includes('Bezpečný'));
  assert.ok(benefits.includes('Vaše data'));
  assert.ok(benefits.includes('Mobile-first'));
});

test('Compact Homepage: No transition-all or hex colors', () => {
  [heroPath, benefitsPath, statusPath, finalCtaPath].forEach(p => {
    const content = readComponent(p);
    const fileName = path.basename(p);
    assert.ok(!content.includes('transition-all'), `${fileName} contains transition-all`);
    assert.ok(!content.match(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/), `${fileName} contains hex colors`);
  });
});

test('Compact Homepage: Status section', () => {
  const status = readComponent(statusPath);
  assert.ok(!status.includes('COMPACT STATUS'), 'CompactStatus must not contain COMPACT STATUS');
  assert.ok(status.includes('Role a oprávnění'));
  assert.ok(status.includes('Média'));
  assert.ok(status.includes('Audit a bezpečnost'));
  assert.ok(status.includes('href="/features"'));
});

test('Compact Homepage: Links', () => {
  const cta = readComponent(finalCtaPath);
  assert.ok(cta.includes('href="/features"'));

  const hero = readComponent(heroPath);
  assert.ok(hero.includes('href="/features"'));
  assert.ok(hero.includes('href="/docs"'));
});

test('Compact Homepage: Spacing & Horizontal Scroll', () => {
  [heroPath, benefitsPath, statusPath, finalCtaPath].forEach(p => {
    const content = readComponent(p);
    const fileName = path.basename(p);
    
    // 10. Mobile base spacing does not contain pt-24, pb-20, py-20, py-24.
    // Strictly looking for these as standalone words.
    assert.ok(!content.match(/\bpt-24\b/), `${fileName} has oversized pt-24`);
    assert.ok(!content.match(/\bpb-20\b/), `${fileName} has oversized pb-20`);
    assert.ok(!content.match(/\bpy-20\b/), `${fileName} has oversized py-20`);
    assert.ok(!content.match(/\bpy-24\b/), `${fileName} has oversized py-24`);
    
    // 13. No horizontal scroll
    assert.ok(!content.includes('overflow-x-auto'), `${fileName} has overflow-x-auto`);
    assert.ok(!content.includes('whitespace-nowrap'), `${fileName} has whitespace-nowrap`);
    assert.ok(!content.includes('min-w-max'), `${fileName} has min-w-max`);
    
    // 14. Button touch sizing
    // Only check for touch-target if it is an interactive element using href=
    if (content.includes('href=')) {
        assert.ok(
            content.includes('touch-target') || 
            content.includes('px-') || 
            content.includes('py-'), 
            `${fileName} needs interactive touch targets sizing`
        );
    }
  });
});

test('Compact Homepage: app/page.tsx Integration', () => {
  const page = readComponent(pagePath);
  
  assert.ok(page.includes('CompactHero'));
  assert.ok(page.includes('CompactBenefits'));
  assert.ok(page.includes('CompactStatus'));
  assert.ok(page.includes('CompactFinalCta'));

  // Ensure legacy components are not imported as homepage sections.
  // The original prompt said: "app/page.tsx does NOT import legacy: Hero, Features, Pricing, Documentation into the homepage."
  // Wait, these could be imported from "lucide-react" or not imported at all. Let's just do a basic string match for the import paths if possible, 
  // or simply check they aren't used as `<Hero`
  
  assert.ok(!page.includes('<Hero'), 'Must not use legacy <Hero>');
  assert.ok(!page.includes('<Features'), 'Must not use legacy <Features>');
  assert.ok(!page.includes('<Pricing'), 'Must not use legacy <Pricing>');
  assert.ok(!page.includes('<Documentation'), 'Must not use legacy <Documentation>');
});
