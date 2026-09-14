import { SVGASTNode, SVGElementType } from './types';

const ALLOWED_ELEMENTS = new Set<string>([
  'svg', 'g', 'rect', 'circle', 'ellipse',
  'line', 'polyline', 'polygon', 'path', 'text'
]);

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

export function parseSVG(svgString: string): SVGASTNode | null {
  if (typeof window === 'undefined' || !window.DOMParser) {
    throw new Error('DOMParser is required for SVG parsing.');
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const root = doc.documentElement;

  if (root.tagName.toLowerCase() !== 'svg') {
    return null;
  }

  return domToAST(root);
}

function domToAST(element: Element): SVGASTNode | null {
  const tagName = element.tagName.toLowerCase();
  
  // Rejection of unsupported nodes happens here silently for MVP
  if (!ALLOWED_ELEMENTS.has(tagName)) {
    return null;
  }

  const attributes: Record<string, string> = {};
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    // We should skip "id" if we want to regenerate, or keep it if safe.
    // For now, keep it, but ensure every node has an id for editor tracking.
    attributes[attr.name] = attr.value;
  }

  if (!attributes.id) {
    attributes.id = `node-${generateId()}`;
  }

  const children: SVGASTNode[] = [];
  for (let i = 0; i < element.children.length; i++) {
    const childAST = domToAST(element.children[i]);
    if (childAST) {
      children.push(childAST);
    }
  }

  // Handle <text> content
  if (tagName === 'text') {
    // Only grab text content, ignoring nested tspans for this MVP subset
    attributes['_textContent'] = element.textContent || '';
  }

  return {
    id: attributes.id,
    type: tagName as SVGElementType,
    attributes,
    children
  };
}
