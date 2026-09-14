import React, { useReducer, useEffect, useRef } from 'react';
import { editorReducer } from './reducer';
import { SVGASTNode, SVGEditorState } from './types';
import { parseSVG } from './parser';
import { serializeSVG } from './serializer';

interface SvgEditorProps {
  initialSvgString: string;
  onChange?: (svgString: string) => void;
}

const defaultState: SVGEditorState = {
  document: { id: 'root', type: 'svg', attributes: {}, children: [] },
  selection: [],
  history: [],
  historyIndex: 0,
  viewBox: { x: 0, y: 0, w: 800, h: 600 },
  zoom: 1,
  pan: { x: 0, y: 0 }
};

export function SvgEditor({ initialSvgString, onChange }: SvgEditorProps) {
  const [state, dispatch] = useReducer(editorReducer, defaultState);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const ast = parseSVG(initialSvgString);
      if (ast) {
        dispatch({ type: 'LOAD_DOCUMENT', document: ast });
      }
    } catch (e) {
      console.warn("Failed to parse initial SVG", e);
    }
  }, [initialSvgString]);

  useEffect(() => {
    if (onChange && state.document.children.length > 0) {
      onChange(serializeSVG(state.document));
    }
  }, [state.document, onChange]);

  // Pointer interaction state
  const isDragging = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    if (!state.selection.includes(id)) {
      dispatch({ type: 'SET_SELECTION', ids: [id] });
    }
    isDragging.current = true;
    lastPoint.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = (e.clientX - lastPoint.current.x) / state.zoom;
    const dy = (e.clientY - lastPoint.current.y) / state.zoom;
    
    dispatch({ type: 'MOVE_SELECTION', dx, dy });
    lastPoint.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDragging.current = false;
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  const handleBackgroundClick = () => {
    dispatch({ type: 'SET_SELECTION', ids: [] });
  };

  const renderNode = (node: SVGASTNode) => {
    const { id, type, attributes, children } = node;
    const isSelected = state.selection.includes(id);

    // Pass down the raw text content if this is a text node
    let content = undefined;
    if (type === 'text' && attributes['_textContent']) {
      content = attributes['_textContent'];
    }

    // Clean attributes for React rendering
    const reactAttrs: Record<string, any> = {};
    for (const [k, v] of Object.entries(attributes)) {
      if (k === '_textContent') continue;
      // Convert standard SVG hyphen attributes to camelCase for React if necessary,
      // but standard SVG tags in React 19 handle strings pretty well.
      // E.g. 'stroke-width' -> strokeWidth
      const camelK = k.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
      // Handle class -> className
      reactAttrs[camelK === 'class' ? 'className' : camelK] = v;
    }

    if (isSelected) {
      reactAttrs.stroke = '#0066ff';
      reactAttrs.strokeWidth = reactAttrs.strokeWidth ? parseInt(reactAttrs.strokeWidth) + 2 : 2;
    }

    if (type === 'svg') {
      return (
        <svg
          key={id}
          {...reactAttrs}
          style={{ width: '100%', height: '100%', background: '#fff' }}
          onPointerDown={handleBackgroundClick}
        >
          <g transform={`translate(${state.pan.x}, ${state.pan.y}) scale(${state.zoom})`}>
             {children.map(renderNode)}
          </g>
        </svg>
      );
    }

    const ElementType = type as keyof JSX.IntrinsicElements;

    return (
      <ElementType
        key={id}
        {...reactAttrs}
        onPointerDown={(e: React.PointerEvent) => handlePointerDown(e, id)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {content || children.map(renderNode)}
      </ElementType>
    );
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-100" ref={containerRef}>
      <div className="flex p-2 bg-slate-200 gap-2 border-b">
        <button onClick={() => dispatch({ type: 'UNDO' })} disabled={state.historyIndex <= 0} className="px-3 py-1 bg-white border rounded shadow-sm disabled:opacity-50">Undo</button>
        <button onClick={() => dispatch({ type: 'REDO' })} disabled={state.historyIndex >= state.history.length - 1} className="px-3 py-1 bg-white border rounded shadow-sm disabled:opacity-50">Redo</button>
        <button onClick={() => dispatch({ type: 'DELETE_SELECTION' })} disabled={state.selection.length === 0} className="px-3 py-1 bg-white border rounded shadow-sm disabled:opacity-50 text-red-600">Delete</button>
      </div>
      <div className="flex-1 overflow-hidden relative touch-none select-none">
        {renderNode(state.document)}
      </div>
    </div>
  );
}
