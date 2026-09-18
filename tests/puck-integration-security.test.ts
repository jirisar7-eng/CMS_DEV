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
      const commEnt = resolveProjectEntitlements('COMMUNITY');
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
      
      const restored = puckDataToCanonical(puckData, 'syn-content-v1', commEnt);
      assert.ok(restored.blocks[0].children);
      assert.equal(restored.blocks[0].children[0].type, 'heading');
      assert.equal(restored.blocks[0].children[0].data.text, 'Nested heading');
    });

    test('nested children on non-slot component => rejected', () => {
      const commEnt = resolveProjectEntitlements('COMMUNITY');
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
        () => puckDataToCanonical(puckData, 'syn-content-v1', commEnt),
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
    test('puckDataToCanonical throws if entitlements argument is missing', () => {
      const puckData = { content: [{ type: 'heading', props: { id: 'h-1', text: 'Test' } }], root: {} };
      assert.throws(
        () => (puckDataToCanonical as any)(puckData),
        (err: any) => err.message.includes('Oprávnění') || err.message.includes('vyžadována')
      );
    });

    test('Community cannot persist Commercial component via puckDataToCanonical', () => {
      const communityEnt = resolveProjectEntitlements('COMMUNITY', { 'labs.access': false });
      const puckData = {
        content: [
          {
            type: 'module_embed',
            props: { id: 'b-1', moduleId: 'contact_form', schemaVersion: 'v1', parameters: {} }
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

  describe('malformed canonical content and module_embed hardening', () => {
    test('validateCanonicalContent rejects content with missing block ID', () => {
      const commEnt = resolveProjectEntitlements('COMMUNITY');
      const malformed = {
        version: 1,
        schemaVersion: 'syn-content-v1',
        blocks: [
          { id: '', type: 'heading', order: 0, data: { text: 'No ID' } }
        ]
      };
      assert.throws(
        () => validateCanonicalContent(malformed, commEnt),
        (err: any) => err.message.includes('id') || err.message.includes('ID') || err.message.includes('Invalid')
      );
    });

    test('validateCanonicalContent rejects content with missing version or schemaVersion', () => {
      const commEnt = resolveProjectEntitlements('COMMUNITY');
      const missingVersion = {
        schemaVersion: 'syn-content-v1',
        blocks: [{ id: 'b-1', type: 'heading', order: 0, data: { text: 'Heading' } }]
      };
      assert.throws(
        () => validateCanonicalContent(missingVersion, commEnt),
        (err: any) => err.message.includes('version') || err.message.includes('Invalid')
      );
    });

    test('validateCanonicalContent rejects content with duplicate block IDs', () => {
      const commEnt = resolveProjectEntitlements('COMMUNITY');
      const duplicateIds = {
        version: 1,
        schemaVersion: 'syn-content-v1',
        blocks: [
          { id: 'dup-1', type: 'heading', order: 0, data: { text: 'Heading 1' } },
          { id: 'dup-1', type: 'paragraph', order: 1, data: { text: 'Paragraph 1' } }
        ]
      };
      assert.throws(
        () => validateCanonicalContent(duplicateIds, commEnt),
        (err: any) => err.message.includes('Duplicate') || err.message.includes('dup-1')
      );
    });

    test('module_embed rejects unknown moduleId and invalid parameters types', () => {
      const commercialEnt = resolveProjectEntitlements('COMMERCIAL');

      // Unknown moduleId
      const unknownModule = {
        version: 1,
        schemaVersion: 'syn-content-v1',
        blocks: [
          {
            id: 'm-1',
            type: 'module_embed',
            order: 0,
            data: { moduleId: 'unknown_module', schemaVersion: 'v1', parameters: {} }
          }
        ]
      };
      assert.throws(
        () => validateCanonicalContent(unknownModule, commercialEnt),
        (err: any) => err.message.includes('Neznámé') || err.message.includes('moduleId')
      );

      // Invalid parameter value type
      const invalidParam = {
        version: 1,
        schemaVersion: 'syn-content-v1',
        blocks: [
          {
            id: 'm-2',
            type: 'module_embed',
            order: 0,
            data: { moduleId: 'contact_form', schemaVersion: 'v1', parameters: { nested: { object: true } } }
          }
        ]
      };
      assert.throws(
        () => validateCanonicalContent(invalidParam, commercialEnt),
        (err: any) => err.message.includes('parametru') || err.message.includes('Invalid')
      );
    });
  });

  describe('unknown component', () => {
    test('unknown component => rejected', () => {
      const commEnt = resolveProjectEntitlements('COMMUNITY');
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
        () => puckDataToCanonical(puckData, 'syn-content-v1', commEnt),
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

test('R3-C rich-text sanitizer blocks stored XSS', () => {
  const def = getBlockDefinition('rich_text');
  const r = def.validateData({
    html: '<p onclick="x()">Safe <strong>bold</strong></p><script>bad()</script><img src=x onerror=x()><a href="javascript:alert(1)" target="_blank" rel="evil">Link</a>'
  });
  const html = String(r.sanitized.html);
  assert.ok(html.includes('<strong>bold</strong>'));
  assert.ok(!html.includes('onclick'));
  assert.ok(!html.includes('onerror'));
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('bad()'));
  assert.ok(html.includes('href="#"'));
  assert.ok(html.includes('target="_blank"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
});

test('R3-C URL sanitizer rejects dangerous schemes', () => {
  const def = getBlockDefinition('button');
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,evil',
    'vbscript:evil',
    'java\nscript:alert(1)',
    '//evil.example'
  ]) {
    assert.equal(def.validateData({ url, label: 'X' }).sanitized.url, '#');
  }
});

test('R3-C canonical gate sanitizes rich text', () => {
  const ent = resolveProjectEntitlements('COMMERCIAL');
  const result = validateCanonicalContent({
    version: 1,
    schemaVersion: 'syn-content-v1',
    blocks: [{
      id: 'xss-1',
      type: 'rich_text',
      order: 0,
      data: { html: '<p onclick="x()">OK</p><script>x()</script><a href="data:text/html,x">L</a>' }
    }]
  }, ent);

  const html = String(result.blocks[0].data.html);
  assert.ok(!html.includes('onclick'));
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('data:'));
});
