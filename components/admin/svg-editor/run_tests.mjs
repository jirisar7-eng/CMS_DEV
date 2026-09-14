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
  state = editorReducer(state, { type: 'SET_SELECTION', ids: ['r1'] });
  state = editorReducer(state, { type: 'DELETE_SELECTION' });
  assert.strictEqual(state.document.children[0].children.length, 0, 'Rect should be deleted');
  console.log("PASS: Reducer - Delete selection");

    // Test 6: Reducer - Group Selection
  const rawSVG2 = `<svg id="root"><rect id="r1" width="10" height="10"/><circle id="c1" r="5"/></svg>`;
  const ast3 = parseSVG(rawSVG2);
  let state2 = {
    document: ast3,
    selection: ["r1", "c1"],
    history: [ast3],
    historyIndex: 0,
    viewBox: {x:0, y:0, w:100, h:100},
    zoom: 1,
    pan: {x:0, y:0}
  };
  state2 = editorReducer(state2, { type: "GROUP_SELECTION" });
  const rootChildren = state2.document.children;
  assert.strictEqual(rootChildren.length, 1, "Group should replace individual nodes at root");
  assert.strictEqual(rootChildren[0].type, "g", "Node should be a group");
  assert.strictEqual(rootChildren[0].children.length, 2, "Group should contain both original nodes");
  assert.strictEqual(state2.selection.length, 1, "Selection should now be the new group");
  assert.ok(state2.selection[0].startsWith("group-"), "Group ID should have prefix group-");
  console.log("PASS: Reducer - Group selection");

  // Test 7: Reducer - Ungroup Selection
  state2 = editorReducer(state2, { type: "UNGROUP_SELECTION" });
  assert.strictEqual(state2.document.children.length, 2, "Ungroup should restore nodes to root");
  assert.strictEqual(state2.document.children[0].type, "rect", "First node should be rect");
  assert.strictEqual(state2.document.children[1].type, "circle", "Second node should be circle");
  console.log("PASS: Reducer - Ungroup selection");

  // Test 8: Reducer - Reorder Nodes
  state2 = editorReducer(state2, { type: "SET_SELECTION", ids: ["r1"] });
  state2 = editorReducer(state2, { type: "BRING_FORWARD" });
  assert.strictEqual(state2.document.children[1].id, "r1", "r1 should move to index 1");
  state2 = editorReducer(state2, { type: "SEND_BACKWARD" });
  assert.strictEqual(state2.document.children[0].id, "r1", "r1 should move to index 0");
  console.log("PASS: Reducer - Reorder layers");

  console.log("ALL CORE TESTS PASSED");
}

// NextJS expects TS compilation. Since we are running raw Node script, 
// we will compile the ts files temporarily for testing or use a tool.
// Let's use node with a simple build step.
runTests().catch(console.error);
