import type { SvgSecurityLimits } from './types';

/**
 * Default conservative resource limits for SVG processing.
 */
export const DEFAULT_SVG_SECURITY_LIMITS: Readonly<SvgSecurityLimits> = Object.freeze({
  maxInputBytes: 512 * 1024, // 512 KB
  maxNodes: 1000,
  maxDepth: 32,
  maxAttributesPerNode: 30,
  maxAttributeLength: 4096,
});

/**
 * Strict whitelist of permitted SVG element names.
 * Any element outside this set will be rejected immediately.
 */
export const ALLOWED_SVG_ELEMENTS: ReadonlySet<string> = new Set([
  'svg',
  'g',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'path',
  'text',
]);

/**
 * Canonical SVG namespace.
 */
export const SVG_NAMESPACE_URI = 'http://www.w3.org/2000/svg';
