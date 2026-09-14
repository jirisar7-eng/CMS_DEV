import type { SvgSecurityNode } from './types';
import { ALLOWED_ATTRIBUTES_MAP } from './sanitizer';
import { SVG_NAMESPACE_URI } from './policy';

function normalizeLength(val: string): string {
  const trimmed = val.trim();
  const match = trimmed.match(/^([+-]?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+))(?:[eE][+-]?\d+)?)(.*)$/);
  if (!match) {
    return trimmed;
  }
  const num = Number(match[1]);
  const unit = match[2].trim().toLowerCase();
  return isNaN(num) ? trimmed : `${num}${unit}`;
}

function normalizeOpacity(val: string): string {
  const trimmed = val.trim();
  if (trimmed.endsWith('%')) {
    const num = Number(trimmed.slice(0, -1).trim());
    return isNaN(num) ? trimmed : `${num}%`;
  }
  const num = Number(trimmed);
  return isNaN(num) ? trimmed : `${num}`;
}

function normalizeViewBox(val: string): string {
  const parts = val.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length === 4) {
    const nums = parts.map(p => Number(p));
    if (nums.every(n => !isNaN(n) && isFinite(n))) {
      return nums.join(' ');
    }
  }
  return val.trim().replace(/[\s,]+/g, ' ');
}

function normalizePoints(val: string): string {
  const parts = val.trim().split(/[\s,]+/).filter(Boolean);
  const nums = parts.map(p => Number(p));
  if (nums.every(n => !isNaN(n) && isFinite(n))) {
    return nums.join(' ');
  }
  return val.trim().replace(/[\s,]+/g, ' ');
}

function normalizePathData(val: string): string {
  return val
    .trim()
    .replace(/([A-Za-z])/g, ' $1 ')
    .replace(/[\s,]+/g, ' ')
    .trim();
}

function normalizeTransform(val: string): string {
  return val
    .trim()
    .replace(/\s*([(),])\s*/g, '$1')
    .replace(/,/g, ', ')
    .replace(/\)\s*/g, ') ')
    .trim();
}

function normalizeAttributeValue(canonicalName: string, val: string): string {
  const strVal = String(val).trim();

  switch (canonicalName) {
    case 'viewBox':
      return normalizeViewBox(strVal);

    case 'width':
    case 'height':
    case 'x':
    case 'y':
    case 'cx':
    case 'cy':
    case 'rx':
    case 'ry':
    case 'x1':
    case 'y1':
    case 'x2':
    case 'y2':
    case 'stroke-width':
      return normalizeLength(strVal);

    case 'opacity':
    case 'fill-opacity':
    case 'stroke-opacity':
      return normalizeOpacity(strVal);

    case 'points':
      return normalizePoints(strVal);

    case 'd':
      return normalizePathData(strVal);

    case 'transform':
      return normalizeTransform(strVal);

    case 'fill':
    case 'stroke':
      return strVal.toLowerCase();

    case 'stroke-linecap':
    case 'stroke-linejoin':
      return strVal.toLowerCase();

    case 'xmlns':
      return SVG_NAMESPACE_URI;

    default:
      return strVal;
  }
}

function normalizeNode(node: SvgSecurityNode, isRoot: boolean): SvgSecurityNode {
  const canonicalElementName = node.name.trim().toLowerCase();

  // Canonicalize and normalize attributes
  const normalizedAttrs: Record<string, string> = {};
  const attrs = node.attributes || {};

  for (const [rawKey, rawVal] of Object.entries(attrs)) {
    const lowerKey = rawKey.trim().toLowerCase();
    const canonicalKey = ALLOWED_ATTRIBUTES_MAP[lowerKey] || lowerKey;
    normalizedAttrs[canonicalKey] = normalizeAttributeValue(canonicalKey, rawVal);
  }

  // Ensure root <svg> has canonical xmlns declaration
  if (isRoot && canonicalElementName === 'svg') {
    normalizedAttrs['xmlns'] = SVG_NAMESPACE_URI;
  }

  // Deterministic attribute ordering: sort keys alphabetically
  const sortedKeys = Object.keys(normalizedAttrs).sort();
  const sortedAttributes: Record<string, string> = {};
  for (const key of sortedKeys) {
    sortedAttributes[key] = normalizedAttrs[key];
  }

  // Preserve semantic child order
  const normalizedChildren: SvgSecurityNode[] = [];
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      normalizedChildren.push(normalizeNode(child, false));
    }
  }

  const result: SvgSecurityNode = {
    name: canonicalElementName,
    attributes: sortedAttributes,
    children: normalizedChildren,
  };

  if (node.text !== undefined && node.text !== null) {
    result.text = String(node.text).trim();
  }

  return result;
}

/**
 * Applies deterministic normalization to an SvgSecurityNode AST tree:
 * - Canonical element and attribute naming
 * - Alphabetical attribute ordering
 * - Deterministic numeric and whitespace formatting
 * - Preservation of semantic child order
 *
 * Guaranteed to be idempotent: normalize(normalize(x)) is identical to normalize(x).
 *
 * @param root SvgSecurityNode tree to normalize
 * @returns Deterministically normalized SvgSecurityNode
 */
export function normalize(root: SvgSecurityNode): SvgSecurityNode {
  return normalizeNode(root, true);
}

export const normalizeSvg = normalize;
