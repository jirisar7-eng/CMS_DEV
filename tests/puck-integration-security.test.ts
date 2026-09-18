import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { puckConfig } from '../lib/composer/puck.config';
import { puckDataToCanonical, canonicalToPuckData, validateCanonicalContent } from '../lib/composer/adapter';
import { getBlockDefinition } from '../lib/composer/registry';
import { PageContent } from '../lib/domain/pages';
import { isEntitlementSatisfied, resolveProjectEntitlements } from '../lib/composer/entitlements';

describe('Puck Integration & Security', () => {
  describe('real Puck config', () => {
    test('puckConfig defines components', () => {
      assert.ok(puckConfig.components);
      assert.ok(puckConfig.components.heading);
      assert.ok(puckConfig.components.paragraph);
    });
  });

  describe('slots serialization', () => {
    test('valid columns nested slot round-trip still works', () => {
      const canonical: PageContent = {
        version: 1,
        schemaVersion: 'syn-content-v1',
        blocks: [
          {
            id: 'b-columns',
            type: 'columns',
            order: 0,
            data: { layout: '1-1' },
            children: [
              {
                id: 'b-child',
                type: 'heading',
                order: 0,
                data: { text: 'Nested heading' }
              }
            ]
          }
        ]
      };
      
      const puckData = canonicalToPuckData(canonical);
      assert.ok(puckData.content[0].zones);
      assert.ok(puckData.content[0].zones.default);
      assert.equal(puckData.content[0].zones.default[0].type, 'heading');
      
      const restored = puckDataToCanonical(puckData);
      assert.ok(restored.blocks[0].children);
      assert.equal(restored.blocks[0].children[0].type, 'heading');
      assert.equal(restored.blocks[0].children[0].data.text, 'Nested heading');
    });

    test('nested children on non-slot component => rejected', () => {
      const puckData = {
        content: [
          {
            type: 'paragraph',
            props: { id: 'p-1', text: 'Parent paragraph' },
            zones: {
              default: [
                {
                  type: 'heading',
                  props: { id: 'h-1', text: 'Illegal child' }
                }
              ]
            }
          }
        ],
        root: {}
      };

      assert.throws(
        () => puckDataToCanonical(puckData),
        (err: any) => err.message.includes('paragraph') && err.message.includes('vnořené')
      );
    });
  });

  describe('stored-XSS attempt', () => {
    test('rejects script tags in rich text', () => {
      const def = getBlockDefinition('rich_text');
      const result = def.validateData({ html: '<p>Hello</p><script>alert("xss")</script>' });
      assert.equal(result.valid, true);
      assert.ok(!result.sanitized.html.includes('<script>'));
    });
  });

  describe('javascript URL rejection', () => {
    test('rejects javascript URLs in buttons', () => {
      const def = getBlockDefinition('button');
      const result = def.validateData({ url: 'javascript:alert(1)', label: 'Click' });
      assert.equal(result.valid, true);
      assert.equal(result.sanitized.url, '#');
    });
  });

  describe('direct API entitlement bypass prevention', () => {
    test('Community cannot persist Commercial component via puckDataToCanonical', () => {
      const communityEnt = resolveProjectEntitlements('COMMUNITY', { 'labs.access': false });
      const puckData = {
        content: [
          {
            type: 'module_embed',
            props: { id: 'b-1', moduleKey: 'some_module' }
          }
        ],
        root: {}
      };
      
      assert.throws(
        () => puckDataToCanonical(puckData, 'syn-content-v1', communityEnt),
        (err: any) => err.message.includes('module_embed') || err.message.includes('oprávnění')
      );
    });

    test('direct content/API-style payload cannot bypass entitlement', () => {
      const communityEnt = resolveProjectEntitlements('COMMUNITY', { 'labs.access': false });
      const canonicalPayload: PageContent = {
        version: 1,
        schemaVersion: 'syn-content-v1',
        blocks: [
          {
            id: 'b-direct',
            type: 'rich_text',
            order: 0,
            data: { html: '<p>Commercial Rich Text</p>' }
          }
        ]
      };

      assert.throws(
        () => validateCanonicalContent(canonicalPayload, communityEnt),
        (err: any) => err.message.includes('rich_text') || err.message.includes('oprávnění')
      );
    });
  });

  describe('unknown component', () => {
    test('unknown component => rejected', () => {
      const puckData = {
        content: [
          {
            type: 'hacked_component',
            props: { id: 'b-2' }
          }
        ],
        root: {}
      };
      
      assert.throws(
        () => puckDataToCanonical(puckData),
        (err: any) => err.message.includes('hacked_component') || err.message.includes('Neznámý')
      );
    });
  });

  describe('AI gate', () => {
    test('entitlements properly gate AI functionality', () => {
      const entFalse = resolveProjectEntitlements('COMMUNITY', { 'labs.puck_ai': false });
      assert.equal(isEntitlementSatisfied('labs', entFalse).allowed, false);
      const entTrue = resolveProjectEntitlements('COMMUNITY', { 'labs.access': true, 'labs.new_components': true });
      assert.equal(isEntitlementSatisfied('labs', entTrue).allowed, true);
    });
  });
});
