import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { COMPONENT_REGISTRY, getBlockDefinition, getAvailableComponentTypes } from '../lib/composer/registry';
import { resolveProjectEntitlements, isEntitlementSatisfied } from '../lib/composer/entitlements';
import { resolveProjectEntitlementsServer } from '../lib/composer/entitlements.server';
import { canonicalToPuckData, puckDataToCanonical } from '../lib/composer/adapter';
import { PageContent } from '../lib/domain/pages';

describe('SYN-EDITOR-001: Visual Page Editor Foundation', () => {
  describe('Component Registry', () => {
    test('declares all required first slice components', () => {
      const requiredTypes = [
        'heading',
        'paragraph',
        'rich_text',
        'image',
        'columns',
        'callout',
        'quote',
        'button',
        'divider',
        'module_embed',
      ];

      for (const type of requiredTypes) {
        const def = getBlockDefinition(type);
        assert.ok(def, `Block definition for ${type} should exist`);
        assert.equal(def.type, type);
        assert.ok(def.schemaVersion);
        assert.ok(def.maturity);
        assert.ok(def.requiredEntitlement);
        assert.equal(typeof def.createDefaultData, 'function');
        assert.equal(typeof def.validateData, 'function');
      }
    });

    test('sanitizes text and removes dangerous scripts', () => {
      const headingDef = getBlockDefinition('heading');
      const result = headingDef.validateData({
        text: "<script>alert('xss')</script>Bezpečný nadpis",
        level: '1',
        align: 'center',
      });

      assert.equal(result.valid, true);
      assert.equal(result.sanitized.text, 'Bezpečný nadpis');
      assert.equal(result.sanitized.level, 1);
      assert.equal(result.sanitized.align, 'center');
    });

    test('sanitizes dangerous javascript: URLs in buttons', () => {
      const buttonDef = getBlockDefinition('button');
      const result = buttonDef.validateData({
        label: 'Klikni',
        url: 'javascript:evil()',
        variant: 'primary',
      });

      assert.equal(result.valid, true);
      assert.equal(result.sanitized.url, '#');
    });
  });

  describe('Entitlements & Gates', () => {
    test('resolves development entitlements safely', () => {
      const entitlements = resolveProjectEntitlements();
      assert.equal(entitlements.edition, 'COMMUNITY');
      assert.ok(entitlements.labs);
    });

    test('allows community components in community edition', () => {
      const entitlements = resolveProjectEntitlements('COMMUNITY');
      const check = isEntitlementSatisfied('community', entitlements);
      assert.equal(check.allowed, true);
    });

    test('blocks commercial components in community edition', () => {
      const entitlements = resolveProjectEntitlements('COMMUNITY');
      const check = isEntitlementSatisfied('commercial', entitlements);
      assert.equal(check.allowed, false);
      assert.equal(check.reason, 'Tato komponenta vyžaduje komerční licenci (Synthesis Commercial).');
    });

    test('allows commercial components in commercial edition', () => {
      const entitlements = resolveProjectEntitlements('COMMERCIAL');
      const check = isEntitlementSatisfied('commercial', entitlements);
      assert.equal(check.allowed, true);
    });

    test('respects labs feature flags', () => {
      const entitlementsNoLabs = resolveProjectEntitlements('COMMUNITY', { 'labs.access': false });
      assert.equal(isEntitlementSatisfied('labs', entitlementsNoLabs).allowed, false);

      const entitlementsWithLabs = resolveProjectEntitlements('COMMUNITY', { 'labs.access': true, 'labs.new_components': true });
      assert.equal(isEntitlementSatisfied('labs', entitlementsWithLabs).allowed, true);
    });

    test('resolveProjectEntitlementsServer fails closed on missing/invalid project', async () => {
      const entNull = await resolveProjectEntitlementsServer(null);
      assert.equal(entNull.edition, 'COMMUNITY');
      assert.equal(entNull.labs['labs.access'], false);

      const entNonExistent = await resolveProjectEntitlementsServer('non-existent-project-id');
      assert.equal(entNonExistent.edition, 'COMMUNITY');
      assert.equal(entNonExistent.labs['labs.access'], false);
    });
  });

  describe('Adapter: Canonical <-> Puck Transformation', () => {
    const canonicalContent: PageContent = {
      version: 1,
      schemaVersion: 'syn-content-v1',
      blocks: [
        {
          id: 'b-1',
          type: 'heading',
          order: 0,
          data: {
            text: 'Hlavní nadpis',
            level: 1,
            align: 'left',
          },
        },
        {
          id: 'b-2',
          type: 'paragraph',
          order: 1,
          data: {
            text: 'Odstavec textu.',
            size: 'base',
            align: 'left',
          },
        },
      ],
    };

    test('converts canonical content to Puck format', () => {
      const puckData = canonicalToPuckData(canonicalContent);
      assert.equal(puckData.content.length, 2);
      assert.equal(puckData.content[0].type, 'heading');
      assert.equal(puckData.content[0].props.id, 'b-1');
      assert.equal(puckData.content[0].props.text, 'Hlavní nadpis');
    });

    test('converts Puck format back to canonical content with sanitized data', () => {
      const puckData = canonicalToPuckData(canonicalContent);
      const entitlements = resolveProjectEntitlements('COMMUNITY');
      const restored = puckDataToCanonical(puckData, 'syn-content-v1', entitlements);

      assert.equal(restored.blocks.length, 2);
      assert.equal(restored.blocks[0].id, 'b-1');
      assert.equal(restored.blocks[0].type, 'heading');
      assert.equal(restored.blocks[0].data.text, 'Hlavní nadpis');
      assert.equal(restored.blocks[1].id, 'b-2');
      assert.equal(restored.blocks[1].type, 'paragraph');
    });
  });
});
