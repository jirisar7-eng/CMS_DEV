import type {
  SvgSanitizeResult,
  SvgSecurityError,
  SvgSecurityNode,
  SvgSecurityReasonCode,
} from './types';
import { ALLOWED_SVG_ELEMENTS, SVG_NAMESPACE_URI } from './policy';

/**
 * Thrown when an SVG AST node violates security policy.
 */
export class SvgSecurityValidationError extends Error {
  public readonly error: SvgSecurityError;

  constructor(error: SvgSecurityError) {
    super(error.message);
    this.name = 'SvgSecurityValidationError';
    this.error = error;
  }
}

/**
 * Allowed SVG attributes mapped to their canonical casing.
 */
export const ALLOWED_ATTRIBUTES_MAP: Readonly<Record<string, string>> = Object.freeze({
  viewbox: 'viewBox',
  width: 'width',
  height: 'height',
  x: 'x',
  y: 'y',
  cx: 'cx',
  cy: 'cy',
  rx: 'rx',
  ry: 'ry',
  x1: 'x1',
  y1: 'y1',
  x2: 'x2',
  y2: 'y2',
  points: 'points',
  d: 'd',
  transform: 'transform',
  fill: 'fill',
  stroke: 'stroke',
  'stroke-width': 'stroke-width',
  opacity: 'opacity',
  'fill-opacity': 'fill-opacity',
  'stroke-opacity': 'stroke-opacity',
  'stroke-linecap': 'stroke-linecap',
  'stroke-linejoin': 'stroke-linejoin',
  xmlns: 'xmlns',
});

function abort(code: SvgSecurityReasonCode, message: string, details?: Record<string, unknown>): never {
  throw new SvgSecurityValidationError({
    code,
    message,
    details,
  });
}

const LENGTH_REGEX = /^[+-]?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+))(?:[eE][+-]?\d+)?(?:px|em|rem|%|pt|cm|mm|in)?$/i;
const NON_NEGATIVE_LENGTH_REGEX = /^[+]?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+))(?:[eE][+-]?\d+)?(?:px|em|rem|%|pt|cm|mm|in)?$/i;

function validateViewBox(val: string): boolean {
  const parts = val.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const p = parts[i];
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(p)) return false;
    const n = Number(p);
    if (isNaN(n) || !isFinite(n)) return false;
    if ((i === 2 || i === 3) && n < 0) return false;
  }
  return true;
}

function validatePoints(val: string): boolean {
  const trimmed = val.trim();
  if (!trimmed) return false;
  if (!/^[-+0-9eE.,\s]+$/.test(trimmed)) return false;
  const parts = trimmed.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return false;
  for (const part of parts) {
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(part)) return false;
    const n = Number(part);
    if (isNaN(n) || !isFinite(n)) return false;
  }
  return true;
}

function validatePathData(val: string): boolean {
  const trimmed = val.trim();
  if (!trimmed) return false;
  if (!/^[-+0-9eE.,\sMmLlHhVvCcSsQqTtAaZz]+$/.test(trimmed)) return false;
  if (!/^[Mm]/.test(trimmed)) return false;
  return true;
}

function validateTransform(val: string): boolean {
  const trimmed = val.trim();
  if (!trimmed) return false;
  if (!/^[a-zA-Z0-9eE.,\s()+-]+$/.test(trimmed)) return false;
  const parts = trimmed.match(/(?:matrix|translate|scale|rotate|skewX|skewY)\s*\([^)]*\)/gi);
  if (!parts) return false;
  const reconstructed = parts.join(' ').replace(/\s+/g, ' ').trim();
  const normalizedInput = trimmed.replace(/\s+/g, ' ').trim();
  if (reconstructed.toLowerCase() !== normalizedInput.toLowerCase()) return false;

  for (const part of parts) {
    const openIdx = part.indexOf('(');
    const closeIdx = part.lastIndexOf(')');
    const inside = part.slice(openIdx + 1, closeIdx).trim();
    if (!inside) return false;
    const args = inside.split(/[\s,]+/).filter(Boolean);
    if (args.length === 0) return false;
    for (const arg of args) {
      if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?(?:deg|rad|grad|turn)?$/i.test(arg)) return false;
      const numericPart = arg.replace(/(?:deg|rad|grad|turn)$/i, '');
      const n = Number(numericPart);
      if (isNaN(n) || !isFinite(n)) return false;
    }
  }
  return true;
}

function validateColor(val: string): boolean {
  const trimmed = val.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();

  if (lower === 'none' || lower === 'currentcolor' || lower === 'transparent') {
    return true;
  }
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)) {
    return true;
  }
  if (/^[a-zA-Z]{3,20}$/.test(trimmed)) {
    return true;
  }
  if (/^(?:rgb|rgba|hsl|hsla)\s*\(\s*[-+0-9%.,\s/]+\s*\)$/i.test(trimmed)) {
    return true;
  }
  return false;
}

function validateAttribute(canonicalName: string, val: string, elementName: string, isRoot: boolean): void {
  const strVal = String(val);

  // Reject script schemes
  const normalized = strVal.replace(/[\s\u0000-\u001F\u007F-\u009F]/g, '').toLowerCase();
  if (normalized.includes('javascript:') || normalized.includes('vbscript:')) {
    abort('SVG_SCRIPT_DETECTED', `Script scheme detected in attribute "${canonicalName}"`);
  }
  if (normalized.includes('data:') || normalized.includes('blob:') || normalized.includes('file:')) {
    abort('SVG_UNSAFE_URL', `Unsafe URL scheme detected in attribute "${canonicalName}"`);
  }
  if (normalized.includes('url(')) {
    abort('SVG_CSS_POLICY_VIOLATION', `CSS url() pattern detected in attribute "${canonicalName}"`);
  }
  if (normalized.includes('http:') || normalized.includes('https:')) {
    if (!(isRoot && canonicalName === 'xmlns' && strVal.trim() === SVG_NAMESPACE_URI)) {
      abort('SVG_EXTERNAL_REFERENCE', `External reference detected in attribute "${canonicalName}"`);
    }
  }

  // Per-attribute explicit validation
  switch (canonicalName) {
    case 'viewBox':
      if (!validateViewBox(strVal)) {
        abort('SVG_FORBIDDEN_ATTRIBUTE', `Invalid viewBox format or dimensions: "${strVal}"`);
      }
      break;

    case 'width':
    case 'height':
    case 'stroke-width':
      if (!NON_NEGATIVE_LENGTH_REGEX.test(strVal.trim())) {
        abort('SVG_FORBIDDEN_ATTRIBUTE', `Invalid non-negative length for "${canonicalName}": "${strVal}"`);
      }
      break;

    case 'x':
    case 'y':
    case 'cx':
    case 'cy':
    case 'x1':
    case 'y1':
    case 'x2':
    case 'y2':
      if (!LENGTH_REGEX.test(strVal.trim())) {
        abort('SVG_FORBIDDEN_ATTRIBUTE', `Invalid coordinate length for "${canonicalName}": "${strVal}"`);
      }
      break;

    case 'rx':
    case 'ry':
      if (!NON_NEGATIVE_LENGTH_REGEX.test(strVal.trim())) {
        abort('SVG_FORBIDDEN_ATTRIBUTE', `Invalid radius for "${canonicalName}": "${strVal}"`);
      }
      break;

    case 'points':
      if (!validatePoints(strVal)) {
        abort('SVG_FORBIDDEN_ATTRIBUTE', `Invalid points sequence: "${strVal}"`);
      }
      break;

    case 'd':
      if (!validatePathData(strVal)) {
        abort('SVG_FORBIDDEN_ATTRIBUTE', `Invalid path data: "${strVal}"`);
      }
      break;

    case 'transform':
      if (!validateTransform(strVal)) {
        abort('SVG_FORBIDDEN_ATTRIBUTE', `Invalid transform function or arguments: "${strVal}"`);
      }
      break;

    case 'fill':
    case 'stroke':
      if (!validateColor(strVal)) {
        abort('SVG_FORBIDDEN_ATTRIBUTE', `Invalid color value for "${canonicalName}": "${strVal}"`);
      }
      break;

    case 'opacity':
    case 'fill-opacity':
    case 'stroke-opacity':
      if (!/^[+]?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+))(?:[eE][+-]?\d+)?(?:%)?$/i.test(strVal.trim())) {
        abort('SVG_FORBIDDEN_ATTRIBUTE', `Invalid opacity value for "${canonicalName}": "${strVal}"`);
      }
      break;

    case 'stroke-linecap': {
      const lower = strVal.trim().toLowerCase();
      if (lower !== 'butt' && lower !== 'round' && lower !== 'square' && lower !== 'inherit') {
        abort('SVG_FORBIDDEN_ATTRIBUTE', `Invalid stroke-linecap value: "${strVal}"`);
      }
      break;
    }

    case 'stroke-linejoin': {
      const lower = strVal.trim().toLowerCase();
      if (lower !== 'miter' && lower !== 'round' && lower !== 'bevel' && lower !== 'inherit') {
        abort('SVG_FORBIDDEN_ATTRIBUTE', `Invalid stroke-linejoin value: "${strVal}"`);
      }
      break;
    }

    case 'xmlns':
      if (!isRoot || elementName !== 'svg' || strVal.trim() !== SVG_NAMESPACE_URI) {
        abort('SVG_FORBIDDEN_ATTRIBUTE', `xmlns is only allowed on root <svg> with canonical URI "${SVG_NAMESPACE_URI}"`);
      }
      break;

    default:
      abort('SVG_FORBIDDEN_ATTRIBUTE', `Attribute "${canonicalName}" is forbidden by security policy`);
  }
}

function sanitizeNode(node: SvgSecurityNode, isRoot: boolean): SvgSecurityNode {
  if (!node || typeof node !== 'object' || typeof node.name !== 'string') {
    abort('SVG_PARSE_FAILED', 'Malformed AST node passed to sanitizer');
  }

  const rawName = node.name.trim();
  const lowerName = rawName.toLowerCase();

  if (lowerName === 'script' || lowerName.endsWith(':script')) {
    abort('SVG_SCRIPT_DETECTED', '<script> elements are strictly forbidden');
  }
  if (lowerName === 'foreignobject' || lowerName.endsWith(':foreignobject')) {
    abort('SVG_FOREIGN_OBJECT', '<foreignObject> elements are strictly forbidden');
  }
  if (rawName.includes(':')) {
    abort('SVG_FORBIDDEN_ELEMENT', `Namespaced elements (<${rawName}>) are forbidden`);
  }

  if (isRoot) {
    if (lowerName !== 'svg') {
      abort('SVG_FORBIDDEN_ELEMENT', `Root element must be <svg>, found <${rawName}>`);
    }
  } else {
    if (lowerName === 'svg') {
      abort('SVG_FORBIDDEN_ELEMENT', 'Nested <svg> elements are forbidden');
    }
  }

  if (!ALLOWED_SVG_ELEMENTS.has(lowerName)) {
    abort('SVG_FORBIDDEN_ELEMENT', `Element <${rawName}> is forbidden by security policy`);
  }

  // Sanitize attributes
  const cleanAttributes: Record<string, string> = {};
  const attrs = node.attributes || {};

  for (const [attrName, attrValue] of Object.entries(attrs)) {
    const rawAttrName = attrName.trim();
    const lowerAttrName = rawAttrName.toLowerCase();

    // Check specific forbidden patterns for structured reason codes
    if (lowerAttrName.startsWith('on')) {
      abort('SVG_EVENT_HANDLER_DETECTED', `Event handler attribute "${attrName}" is forbidden`);
    }
    if (lowerAttrName === 'style' || lowerAttrName === 'class') {
      abort('SVG_CSS_POLICY_VIOLATION', `CSS attribute "${attrName}" is forbidden`);
    }
    if (lowerAttrName === 'href' || lowerAttrName === 'xlink:href' || lowerAttrName.endsWith(':href')) {
      abort('SVG_EXTERNAL_REFERENCE', `Reference attribute "${attrName}" is forbidden`);
    }
    if (lowerAttrName === 'id') {
      abort('SVG_FORBIDDEN_ATTRIBUTE', `Attribute "id" is forbidden by security policy`);
    }
    if (lowerAttrName.startsWith('xmlns:')) {
      abort('SVG_FORBIDDEN_ATTRIBUTE', `Custom namespace declaration "${attrName}" is forbidden`);
    }
    if (rawAttrName.includes(':') && lowerAttrName !== 'xmlns') {
      abort('SVG_FORBIDDEN_ATTRIBUTE', `Namespaced attribute "${attrName}" is forbidden`);
    }

    const canonical = ALLOWED_ATTRIBUTES_MAP[lowerAttrName];
    if (!canonical) {
      abort('SVG_FORBIDDEN_ATTRIBUTE', `Attribute "${attrName}" is not in the allowed attribute policy`);
    }

    validateAttribute(canonical, attrValue, lowerName, isRoot);
    cleanAttributes[canonical] = String(attrValue);
  }

  // XML text validation: text is only permitted on <text> elements
  let cleanText: string | undefined;
  if (lowerName === 'text') {
    if (node.text !== undefined && node.text !== null) {
      const textVal = String(node.text);
      if (/<script/i.test(textVal) || /javascript:/i.test(textVal)) {
        abort('SVG_SCRIPT_DETECTED', 'Script pattern detected in SVG text content');
      }
      cleanText = textVal;
    }
  } else {
    if (node.text !== undefined && node.text !== null && String(node.text).trim().length > 0) {
      abort('SVG_FORBIDDEN_ELEMENT', `Text content is not permitted in <${rawName}>`);
    }
  }

  // Recursively sanitize children
  const cleanChildren: SvgSecurityNode[] = [];
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      cleanChildren.push(sanitizeNode(child, false));
    }
  }

  const result: SvgSecurityNode = {
    name: lowerName,
    attributes: cleanAttributes,
    children: cleanChildren,
  };
  if (cleanText !== undefined) {
    result.text = cleanText;
  }

  return result;
}

/**
 * Validates and sanitizes a parsed SVG AST tree.
 * Fails closed by throwing SvgSecurityValidationError on any security violation.
 *
 * @param root Parsed SvgSecurityNode root
 * @returns Clean, validated SvgSecurityNode tree
 */
export function sanitize(root: SvgSecurityNode): SvgSecurityNode {
  return sanitizeNode(root, true);
}

export const sanitizeSvg = sanitize;

/**
 * Non-throwing safe wrapper for SVG sanitization.
 */
export function safeSanitize(root: SvgSecurityNode): SvgSanitizeResult {
  try {
    const cleanRoot = sanitize(root);
    return { success: true, root: cleanRoot };
  } catch (err) {
    if (err instanceof SvgSecurityValidationError) {
      return { success: false, error: err.error };
    }
    return {
      success: false,
      error: {
        code: 'SVG_PARSE_FAILED',
        message: err instanceof Error ? err.message : 'Sanitization failure',
      },
    };
  }
}

export const safeSanitizeSvg = safeSanitize;
