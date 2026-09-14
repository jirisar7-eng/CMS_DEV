import type { SvgSecurityNode } from './types';

/**
 * Escapes characters for safe inclusion in XML attribute values.
 */
export function escapeXmlAttribute(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Escapes characters for safe inclusion in XML text nodes.
 */
export function escapeXmlText(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function serializeNode(node: SvgSecurityNode): string {
  const tagName = node.name.toLowerCase();

  // Validate tag name
  if (!/^[a-z][a-z0-9]*$/.test(tagName)) {
    throw new Error(`Invalid tag name: "${node.name}"`);
  }

  // Deterministically sort attributes
  const sortedKeys = Object.keys(node.attributes).sort();
  const attrParts: string[] = [];
  for (const key of sortedKeys) {
    if (!/^[a-z][a-z0-9-]*$/i.test(key)) {
      throw new Error(`Invalid attribute name: "${key}"`);
    }
    const val = node.attributes[key];
    attrParts.push(` ${key}="${escapeXmlAttribute(val)}"`);
  }
  const attrString = attrParts.join('');

  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const hasText = node.text !== undefined && node.text !== null && node.text.length > 0;

  if (hasChildren) {
    const childrenStr = node.children.map(serializeNode).join('');
    return `<${tagName}${attrString}>${childrenStr}</${tagName}>`;
  }

  if (hasText) {
    return `<${tagName}${attrString}>${escapeXmlText(node.text!)}</${tagName}>`;
  }

  // Standard root <svg> is closed explicitly, child graphic elements are self-closing
  if (tagName === 'svg') {
    return `<${tagName}${attrString}></${tagName}>`;
  }

  return `<${tagName}${attrString} />`;
}

/**
 * Deterministically serializes an SvgSecurityNode AST tree to a safe SVG XML string.
 * Attributes are sorted alphabetically, text and attributes are strictly XML-escaped,
 * and no raw string injection is permitted.
 *
 * @param root SvgSecurityNode root to serialize
 * @returns Deterministic SVG XML string
 */
export function serialize(root: SvgSecurityNode): string {
  return serializeNode(root);
}

export const serializeSvg = serialize;
