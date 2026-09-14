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

// Extract nodes for grouping
function extractNodes(root: SVGASTNode, idsToExtract: Set<string>, extracted: SVGASTNode[]): SVGASTNode | null {
  if (idsToExtract.has(root.id)) {
    extracted.push(cloneAST(root));
    return null;
  }
  const newChildren = root.children
    .map(c => extractNodes(c, idsToExtract, extracted))
    .filter((c): c is SVGASTNode => c !== null);
  return { ...root, children: newChildren };
}

// Ungroup nodes
function ungroupNodes(root: SVGASTNode, idsToUngroup: Set<string>): SVGASTNode {
  const newChildren: SVGASTNode[] = [];
  for (const child of root.children) {
    if (idsToUngroup.has(child.id) && child.type === 'g') {
      newChildren.push(...child.children);
    } else {
      newChildren.push(ungroupNodes(child, idsToUngroup));
    }
  }
  return { ...root, children: newChildren };
}

// Reorder nodes
function reorderNodes(root: SVGASTNode, ids: Set<string>, direction: 'forward' | 'backward'): SVGASTNode {
  let newChildren = [...root.children];
  
  if (direction === 'forward') {
    for (let i = newChildren.length - 2; i >= 0; i--) {
      if (ids.has(newChildren[i].id) && !ids.has(newChildren[i+1].id)) {
        const temp = newChildren[i];
        newChildren[i] = newChildren[i+1];
        newChildren[i+1] = temp;
      }
    }
  } else {
    for (let i = 1; i < newChildren.length; i++) {
      if (ids.has(newChildren[i].id) && !ids.has(newChildren[i-1].id)) {
        const temp = newChildren[i];
        newChildren[i] = newChildren[i-1];
        newChildren[i-1] = temp;
      }
    }
  }
  
  newChildren = newChildren.map(c => reorderNodes(c, ids, direction));
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
    
    case 'GROUP_SELECTION': {
      if (state.selection.length < 2) return state;
      const idSet = new Set(state.selection);
      if (idSet.has(state.document.id)) idSet.delete(state.document.id);
      if (idSet.size < 2) return state;

      const extracted: SVGASTNode[] = [];
      const docWithoutNodes = extractNodes(state.document, idSet, extracted);
      if (!docWithoutNodes) return state;

      const groupId = `group-${Math.random().toString(36).substring(2, 9)}`;
      const newGroup: SVGASTNode = {
        id: groupId,
        type: 'g',
        attributes: { id: groupId },
        children: extracted
      };

      const newDoc = {
        ...docWithoutNodes,
        children: [...docWithoutNodes.children, newGroup]
      };

      return {
        ...pushHistory(state, newDoc),
        selection: [groupId]
      };
    }

    case 'UNGROUP_SELECTION': {
      if (state.selection.length === 0) return state;
      const idSet = new Set(state.selection);
      if (idSet.has(state.document.id)) idSet.delete(state.document.id);
      
      const newDoc = ungroupNodes(state.document, idSet);
      return {
        ...pushHistory(state, newDoc),
        selection: []
      };
    }

    case 'BRING_FORWARD': {
      if (state.selection.length === 0) return state;
      const idSet = new Set(state.selection);
      const newDoc = reorderNodes(state.document, idSet, 'forward');
      return pushHistory(state, newDoc);
    }

    case 'SEND_BACKWARD': {
      if (state.selection.length === 0) return state;
      const idSet = new Set(state.selection);
      const newDoc = reorderNodes(state.document, idSet, 'backward');
      return pushHistory(state, newDoc);
    }

    case 'DUPLICATE_SELECTION':
      return state;

    default:
      return state;
  }
}
