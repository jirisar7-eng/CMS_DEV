export type SVGElementType =
  | 'svg' | 'g' | 'rect' | 'circle' | 'ellipse'
  | 'line' | 'polyline' | 'polygon' | 'path' | 'text';

export interface SVGASTNode {
  id: string;
  type: SVGElementType;
  attributes: Record<string, string>;
  children: SVGASTNode[];
}

export interface SVGEditorState {
  document: SVGASTNode;
  selection: string[];
  history: SVGASTNode[];
  historyIndex: number;
  viewBox: { x: number; y: number; w: number; h: number };
  zoom: number;
  pan: { x: number; y: number };
}

export type EditorAction =
  | { type: 'LOAD_DOCUMENT'; document: SVGASTNode }
  | { type: 'SET_SELECTION'; ids: string[] }
  | { type: 'ADD_TO_SELECTION'; ids: string[] }
  | { type: 'UPDATE_NODE_ATTRIBUTES'; id: string; attributes: Record<string, string> }
  | { type: 'MOVE_SELECTION'; dx: number; dy: number }
  | { type: 'DELETE_SELECTION' }
  | { type: 'DUPLICATE_SELECTION' }
  | { type: 'GROUP_SELECTION' }
  | { type: 'UNGROUP_SELECTION' }
  | { type: 'BRING_FORWARD' }
  | { type: 'SEND_BACKWARD' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SET_VIEW'; pan: { x: number; y: number }; zoom: number };
