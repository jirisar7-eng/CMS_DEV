import { SVGASTNode } from './types';

export function serializeSVG(node: SVGASTNode): string {
  const { type, attributes, children } = node;
  
  let attrsString = '';
  // Deterministic serialization: sort attributes
  const keys = Object.keys(attributes).filter(k => k !== '_textContent').sort();
  for (const key of keys) {
    // Basic escaping
    const val = attributes[key].replace(/"/g, '&quot;');
    attrsString += ` ${key}="${val}"`;
  }

  if (type === 'text') {
    const textContent = attributes['_textContent'] || '';
    // Escape text content
    const escaped = textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<${type}${attrsString}>${escaped}</${type}>`;
  }

  if (children && children.length > 0) {
    const childrenString = children.map(serializeSVG).join('');
    return `<${type}${attrsString}>${childrenString}</${type}>`;
  }

  // Self-closing for empty elements
  if (type !== 'svg' && type !== 'g' && true) {
    return `<${type}${attrsString} />`;
  }

  return `<${type}${attrsString}></${type}>`;
}
