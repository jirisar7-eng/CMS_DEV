import { EditorAction, SVGEditorState, SVGASTNode } from './types';

// Helper to deep clone AST
function cloneAST(node: SVGASTNode): SVGASTNode {
  return JSON.parse(JSON.stringify(node));
}

// Helper to find a node by ID and apply a callback
function updateNodeInTree(root: SVGASTNode, targetId: string, updater: (node: SVGASTNode) => SVGASTNode): SVGASTNode {
  if (root.id === targetId) {
    return updater(cloneAST(root));
  }
  if (!root.children || root.children.length === 0) return root;

  let changed = false;
  const newChildren = root.children.map(child => {
    const updated = updateNodeInTree(child, targetId, updater);
    if (updated !== child) changed = true;
    return updated;
  });

  if (changed) {
    return { ...root, children: newChildren };
  }
  return root;
}

// Extract a translation from a transform string, add dx/dy, and return new string
// Simplistic MVP translation handling
function applyTranslation(transform: string = '', dx: number, dy: number): string {
  // If we already have a translate(x, y), update it.
  const translateRegex = /translate\(([^,]+),\s*([^)]+)\)/;
  const match = transform.match(translateRegex);
  if (match) {
    const x = parseFloat(match[1]) + dx;
    const y = parseFloat(match[2]) + dy;
    return transform.replace(translateRegex, `translate(${x}, ${y})`);
  }
  // Otherwise, prepend it
  return `translate(${dx}, ${dy}) ${transform}`.trim();
}

function pushHistory(state: SVGEditorState, newDocument: SVGASTNode): SVGEditorState {
  const newHistory = state.history.slice(0, state.historyIndex + 1);
  newHistory.push(newDocument);
  return {
    ...state,
    document: newDocument,
    history: newHistory,
    historyIndex: newHistory.length - 1
  };
}

// A simple recursive delete
function deleteNodes(root: SVGASTNode, idsToRemove: Set<string>): SVGASTNode | null {
  if (idsToRemove.has(root.id)) return null;
  const newChildren = root.children
    .map(c => deleteNodes(c, idsToRemove))
    .filter((c): c is SVGASTNode => c !== null);
  return { ...root, children: newChildren };
}

export function editorReducer(state: SVGEditorState, action: EditorAction): SVGEditorState {
  switch (action.type) {
    case 'LOAD_DOCUMENT':
      return {
        ...state,
        document: action.document,
        history: [action.document],
        historyIndex: 0,
        selection: []
      };
      
    case 'SET_SELECTION':
      return { ...state, selection: action.ids };
      
    case 'ADD_TO_SELECTION':
      return { ...state, selection: Array.from(new Set([...state.selection, ...action.ids])) };
      
    case 'UPDATE_NODE_ATTRIBUTES': {
      const newDoc = updateNodeInTree(state.document, action.id, node => {
        return { ...node, attributes: { ...node.attributes, ...action.attributes } };
      });
      if (newDoc !== state.document) {
        return pushHistory(state, newDoc);
      }
      return state;
    }
    
    case 'MOVE_SELECTION': {
      if (state.selection.length === 0) return state;
      let currentDoc = state.document;
      for (const id of state.selection) {
        currentDoc = updateNodeInTree(currentDoc, id, node => {
          const currentTransform = node.attributes.transform || '';
          const newTransform = applyTranslation(currentTransform, action.dx, action.dy);
          return { ...node, attributes: { ...node.attributes, transform: newTransform } };
        });
      }
      return pushHistory(state, currentDoc);
    }
    
    case 'DELETE_SELECTION': {
      if (state.selection.length === 0) return state;
      const idSet = new Set(state.selection);
      // Prevent deleting the root
      if (idSet.has(state.document.id)) {
        idSet.delete(state.document.id);
      }
      if (idSet.size === 0) return state;
      
      const newDoc = deleteNodes(state.document, idSet);
      if (newDoc) {
        return {
          ...pushHistory(state, newDoc),
          selection: []
        };
      }
      return state;
    }
    
    case 'UNDO': {
      if (state.historyIndex > 0) {
        return {
          ...state,
          historyIndex: state.historyIndex - 1,
          document: state.history[state.historyIndex - 1],
          selection: []
        };
      }
      return state;
    }
    
    case 'REDO': {
      if (state.historyIndex < state.history.length - 1) {
        return {
          ...state,
          historyIndex: state.historyIndex + 1,
          document: state.history[state.historyIndex + 1],
          selection: []
        };
      }
      return state;
    }
    
    case 'SET_VIEW': {
      return { ...state, pan: action.pan, zoom: action.zoom };
    }
    
    // Additional features like GROUP/UNGROUP/DUPLICATE/ORDERING can be fully mapped out 
    // but kept minimal here as a foundation proof.
    case 'GROUP_SELECTION': 
      // minimal implementation placeholder
      return state;
    case 'UNGROUP_SELECTION':
      return state;
    case 'BRING_FORWARD':
      return state;
    case 'SEND_BACKWARD':
      return state;
    case 'DUPLICATE_SELECTION':
      return state;

    default:
      return state;
  }
}
