import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { validatePageContent, validateSlugSegment, MAX_BLOCKS, MAX_DEPTH } from '../lib/domain/content/validation';
import { pagesRepository } from '../lib/domain/pages';

describe('Content Contract', () => {
  describe('Pages Compatibility', () => {
    test('pagesRepository should be exported', () => {
      assert.ok(pagesRepository, 'pagesRepository is defined');
      assert.ok(typeof pagesRepository.getPages === 'function', 'has getPages');
    });
  });

  describe('validateSlugSegment', () => {
    test('valid Unicode slug', () => {
      assert.strictEqual(validateSlugSegment('test-slug'), true);
      assert.strictEqual(validateSlugSegment('český-slug-123'), true);
    });

    test('invalid slugs', () => {
      assert.strictEqual(validateSlugSegment(''), false);
      assert.strictEqual(validateSlugSegment('.'), false);
      assert.strictEqual(validateSlugSegment('..'), false);
      assert.strictEqual(validateSlugSegment('a/b'), false);
      assert.strictEqual(validateSlugSegment('a\\b'), false);
      assert.strictEqual(validateSlugSegment(' test '), false);
      assert.strictEqual(validateSlugSegment('http://example.com'), false);
      assert.strictEqual(validateSlugSegment('https://example.com'), false);
      assert.strictEqual(validateSlugSegment('//example.com'), false);
    });
  });

  describe('validatePageContent', () => {
    test('empty valid PageContent', () => {
      const pc = {
        version: 1,
        schemaVersion: '1.0',
        blocks: [],
      };
      const res = validatePageContent(pc);
      assert.deepStrictEqual(res, pc);
    });

    test('valid nested blocks', () => {
      const pc = {
        version: 1,
        schemaVersion: '1.0',
        blocks: [
          {
            id: 'b1',
            type: 'heading',
            order: 0,
            data: { text: 'Hello' },
            children: [
              {
                id: 'b2',
                type: 'paragraph',
                order: 0,
                data: {},
              }
            ]
          }
        ],
      };
      const res = validatePageContent(pc);
      assert.deepStrictEqual(res, pc);
    });

    test('valid module_embed', () => {
      const pc = {
        version: 1,
        schemaVersion: '1.0',
        blocks: [
          {
            id: 'b1',
            type: 'module_embed',
            order: 0,
            data: {
              moduleId: 'm1',
              schemaVersion: '1.0',
              parameters: {
                a: 'test',
                b: 1,
                c: true,
                d: null
              },
              fallbackText: 'test'
            }
          }
        ],
      };
      assert.ok(validatePageContent(pc));
    });

    test('FAIL: module_embed unknown field', () => {
      const pc = {
        version: 1,
        schemaVersion: '1.0',
        blocks: [
          {
            id: 'b1',
            type: 'module_embed',
            order: 0,
            data: {
              moduleId: 'm1',
              schemaVersion: '1.0',
              parameters: {},
              arbitraryUnknownField: true
            }
          }
        ],
      };
      assert.throws(() => validatePageContent(pc), /Unknown top-level field in module_embed: arbitraryUnknownField/);
    });

    test('FAIL: module_embed html field', () => {
      const pc = {
        version: 1,
        schemaVersion: '1.0',
        blocks: [
          {
            id: 'b1',
            type: 'module_embed',
            order: 0,
            data: {
              moduleId: 'm1',
              schemaVersion: '1.0',
              parameters: {},
              html: '<div>test</div>'
            }
          }
        ],
      };
      assert.throws(() => validatePageContent(pc), /Unknown top-level field in module_embed: html/);
    });

    test('FAIL: module_embed rawHtml field', () => {
      const pc = {
        version: 1,
        schemaVersion: '1.0',
        blocks: [
          {
            id: 'b1',
            type: 'module_embed',
            order: 0,
            data: {
              moduleId: 'm1',
              schemaVersion: '1.0',
              parameters: {},
              rawHtml: '<div>test</div>'
            }
          }
        ],
      };
      assert.throws(() => validatePageContent(pc), /Unknown top-level field in module_embed: rawHtml/);
    });
    
    test('FAIL: module_embed script field', () => {
      const pc = {
        version: 1,
        schemaVersion: '1.0',
        blocks: [
          {
            id: 'b1',
            type: 'module_embed',
            order: 0,
            data: {
              moduleId: 'm1',
              schemaVersion: '1.0',
              parameters: {},
              script: 'alert(1)'
            }
          }
        ],
      };
      assert.throws(() => validatePageContent(pc), /Unknown top-level field in module_embed: script/);
    });

    test('FAIL: module_embed source field', () => {
      const pc = {
        version: 1,
        schemaVersion: '1.0',
        blocks: [
          {
            id: 'b1',
            type: 'module_embed',
            order: 0,
            data: {
              moduleId: 'm1',
              schemaVersion: '1.0',
              parameters: {},
              source: 'test'
            }
          }
        ],
      };
      assert.throws(() => validatePageContent(pc), /Unknown top-level field in module_embed: source/);
    });

    test('FAIL: duplicate block id', () => {
      const pc = {
        version: 1,
        schemaVersion: '1.0',
        blocks: [
          {
            id: 'b1',
            type: 'heading',
            order: 0,
            data: {},
          },
          {
            id: 'b1',
            type: 'paragraph',
            order: 1,
            data: {},
          }
        ],
      };
      assert.throws(() => validatePageContent(pc), /Duplicate block id/);
    });

    test('FAIL: unknown block type', () => {
      const pc = {
        version: 1,
        schemaVersion: '1.0',
        blocks: [
          {
            id: 'b1',
            type: 'invalid_type',
            order: 0,
            data: {},
          }
        ],
      };
      assert.throws(() => validatePageContent(pc), /Unknown block type/);
    });

    test('FAIL: depth > limit', () => {
      const createNested = (depth: number, id: string): any => {
        if (depth === 0) return [];
        return [{
          id,
          type: 'heading',
          order: 0,
          data: {},
          children: createNested(depth - 1, id + '_child')
        }];
      };

      const pc = {
        version: 1,
        schemaVersion: '1.0',
        blocks: createNested(MAX_DEPTH + 2, 'root'),
      };
      assert.throws(() => validatePageContent(pc), /Max depth/);
    });

    test('FAIL: block count > limit', () => {
      const blocks = Array.from({ length: MAX_BLOCKS + 1 }).map((_, i) => ({
        id: `b${i}`,
        type: 'heading',
        order: i,
        data: {},
      }));

      const pc = {
        version: 1,
        schemaVersion: '1.0',
        blocks,
      };
      assert.throws(() => validatePageContent(pc), /Max blocks/);
    });

    test('FAIL: prototype pollution keys', () => {
      const p1 = {
        version: 1,
        schemaVersion: '1.0',
        blocks: [],
      };
      Object.setPrototypeOf(p1, { hacked: true });
      assert.throws(() => validatePageContent(p1), /Invalid object prototype|Prototype pollution/);

      const p2 = {
        version: 1,
        schemaVersion: '1.0',
        blocks: [
          {
            id: 'b1',
            type: 'heading',
            order: 0,
            data: {
              constructor: {}
            }
          }
        ]
      };
      assert.throws(() => validatePageContent(p2), /Invalid object prototype|Prototype pollution/);
    });

    test('FAIL: invalid data types', () => {
      assert.throws(() => validatePageContent({
        version: 1,
        schemaVersion: '1.0',
        blocks: [],
        fn: () => {}
      }), /Invalid value type/);

      assert.throws(() => validatePageContent({
        version: 1,
        schemaVersion: '1.0',
        blocks: [],
        sym: Symbol('x')
      }), /Invalid value type/);

      assert.throws(() => validatePageContent({
        version: 1,
        schemaVersion: '1.0',
        blocks: [],
        bn: BigInt(1)
      }), /Invalid value type/);

      assert.throws(() => validatePageContent({
        version: 1,
        schemaVersion: '1.0',
        blocks: [],
        num: Infinity
      }), /Non-finite number/);
    });

    test('FAIL: nested module parameter', () => {
      const pc = {
        version: 1,
        schemaVersion: '1.0',
        blocks: [
          {
            id: 'b1',
            type: 'module_embed',
            order: 0,
            data: {
              moduleId: 'm1',
              schemaVersion: '1.0',
              parameters: {
                nested: { a: 1 }
              }
            }
          }
        ],
      };
      assert.throws(() => validatePageContent(pc), /Invalid parameter value/);
    });
  });
});
