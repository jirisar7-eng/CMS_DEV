import assert from 'assert';
import { editorReducer } from './reducer.js';
import { serializeSVG } from './serializer.js';

// Extremely basic DOMParser mock for Node.js to test parseSVG behavior
class MockDOMParser {
  parseFromString(str, type) {
    const doc = { documentElement: this._createElement('svg') };
    // very rudimentary parsing to satisfy basic AST build
    const tags = str.match(/<[^>]+>/g) || [];
    let current = doc.documentElement;
    let stack = [current];
    
    // Skip the root if it's the first tag to avoid double root
    let first = true;
    for (const tag of tags) {
      if (tag.startsWith('</')) {
        if (!first) stack.pop();
        current = stack[stack.length - 1];
      } else if (tag.startsWith('<?') || tag.startsWith('<!')) {
        continue; // ignore XML declarations / DTDs
      } else {
        const isSelfClosing = tag.endsWith('/>');
        const tagNameMatch = tag.match(/<\/?([^\s>]+)/);
        if (!tagNameMatch) continue;
        
        const tagName = tagNameMatch[1];
        
        if (first && tagName === 'svg') {
          first = false;
          this._extractAttrs(tag, current);
          continue;
        }
        
        const el = this._createElement(tagName);
        this._extractAttrs(tag, el);
        current.children.push(el);
        
        if (!isSelfClosing) {
          stack.push(el);
          current = el;
        }
      }
    }
    return doc;
  }
  
  _createElement(tagName) {
    return {
      tagName: tagName.toUpperCase(),
      attributes: [],
      children: [],
      textContent: '',
      setAttribute(k, v) {
        const existing = this.attributes.find(a => a.name === k);
        if (existing) existing.value = v;
        else this.attributes.push({ name: k, value: v });
      }
    };
  }
  
  _extractAttrs(tagStr, el) {
    const attrRegex = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
    let m;
    while ((m = attrRegex.exec(tagStr)) !== null) {
      el.setAttribute(m[1], m[2]);
    }
  }
}

global.DOMParser = MockDOMParser;
global.window = { DOMParser: MockDOMParser };

import { parseSVG } from './parser.js';

async function runTests() {
  console.log("Running SVG Editor Core Tests...");
  
  // Test 1: Unsupported Node Rejection
  const rawSVG = `<svg id="root"><g id="group"><script>alert(1)</script><rect id="r1" width="10" height="10"/></g></svg>`;
  const ast = parseSVG(rawSVG);
  assert.strictEqual(ast.type, 'svg', 'Root should be SVG');
  assert.strictEqual(ast.children[0].type, 'g');
  assert.strictEqual(ast.children[0].children.length, 1, 'Script tag should be rejected');
  assert.strictEqual(ast.children[0].children[0].type, 'rect', 'Rect should be preserved');
  console.log("PASS: Unsupported node rejection");

  // Test 2: Serialization Determinism & Roundtrip
  const serialized = serializeSVG(ast);
  assert.ok(serialized.includes('<rect'), 'Should serialize rect');
  assert.ok(!serialized.includes('<script'), 'Should not serialize script');
  const ast2 = parseSVG(serialized);
  const serialized2 = serializeSVG(ast2);
  assert.strictEqual(serialized, serialized2, 'Serialization should be deterministic and stable on roundtrip');
  console.log("PASS: Serialization determinism & subset roundtrip");

  // Test 3: Reducer - Move Selection (Transforms)
  let state = {
    document: ast,
    selection: ['r1'],
    history: [ast],
    historyIndex: 0,
    viewBox: {x:0, y:0, w:100, h:100},
    zoom: 1,
    pan: {x:0, y:0}
  };

  state = editorReducer(state, { type: 'MOVE_SELECTION', dx: 10, dy: 20 });
  const movedRect = state.document.children[0].children[0];
  assert.ok(movedRect.attributes.transform.includes('translate(10, 20)'), 'Should apply translation');
  console.log("PASS: Reducer - Move selection");

  // Test 4: Reducer - Undo / Redo
  state = editorReducer(state, { type: 'UNDO' });
  const undoneRect = state.document.children[0].children[0];
  assert.ok(!undoneRect.attributes.transform, 'Transform should be undone');
  
  state = editorReducer(state, { type: 'REDO' });
  const redoneRect = state.document.children[0].children[0];
  assert.ok(redoneRect.attributes.transform.includes('translate(10, 20)'), 'Transform should be redone');
  console.log("PASS: Reducer - Undo/Redo");

  // Test 5: Reducer - Delete
  state = editorReducer(state, { type: 'DELETE_SELECTION' });
  assert.strictEqual(state.document.children[0].children.length, 0, 'Rect should be deleted');
  console.log("PASS: Reducer - Delete selection");

  console.log("ALL CORE TESTS PASSED");
}

// NextJS expects TS compilation. Since we are running raw Node script, 
// we will compile the ts files temporarily for testing or use a tool.
// Let's use node with a simple build step.
