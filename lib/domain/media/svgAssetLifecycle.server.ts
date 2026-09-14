/**
 * SYNTHESIS CMS — SECURE SERVER SVG ASSET LIFECYCLE BRIDGE
 *
 * Server authority for preparing and validating SVG assets.
 * Enforces the verified fail-closed SVG security pipeline:
 * raw SVG -> parseSvgSecurity -> safeSanitize -> normalize -> serialize -> canonical SVG -> SHA-256
 */

import crypto from 'crypto';
import {
  parseSvgSecurity,
  safeSanitize,
  normalize,
  serialize,
  type SvgSecurityNode,
} from '../../svg-security';

export const SVG_SECURITY_PIPELINE_ID = 'SYN-SEC-SVG-001' as const;

export type SvgAssetLifecycleStage = 'parse' | 'sanitize' | 'normalize' | 'serialize';

export interface SvgAssetDraftSuccess {
  readonly success: true;
  readonly canonicalSvg: string;
  readonly sourceChecksumSha256: string;
  readonly canonicalChecksumSha256: string;
  readonly sizeBytes: number;
  readonly nodeCount: number;
  readonly maxDepth: number;
  readonly pipelineId: typeof SVG_SECURITY_PIPELINE_ID;
}

export interface SvgAssetDraftFailure {
  readonly success: false;
  readonly stage: SvgAssetLifecycleStage;
  readonly reasonCode: string;
  readonly message: string;
}

export type SvgAssetDraftResult = SvgAssetDraftSuccess | SvgAssetDraftFailure;

/**
 * Pure server-side function to validate, sanitize, normalize, and serialize raw SVG input.
 *
 * Rules:
 * - Fail-closed: returns structured failure if any security rule or limit is violated.
 * - Never returns unsafe raw SVG.
 * - Deterministic output: equivalent safe SVGs produce identical canonical XML and checksums.
 * - Source checksum is calculated for provenance but raw input is never persisted.
 *
 * @param rawSvg Raw SVG XML string
 * @returns SvgAssetDraftResult
 */
export function prepareSvgAssetDraft(rawSvg: string): SvgAssetDraftResult {
  if (typeof rawSvg !== 'string') {
    return {
      success: false,
      stage: 'parse',
      reasonCode: 'SVG_PARSE_FAILED',
      message: 'SVG input must be a non-null string',
    };
  }

  // 1. Parse via strict fail-closed saxes parser
  const parseResult = parseSvgSecurity(rawSvg);
  if (!parseResult.success) {
    return {
      success: false,
      stage: 'parse',
      reasonCode: parseResult.error.code,
      message: parseResult.error.message,
    };
  }

  // 2. Safe sanitize via security policy
  const sanitizeResult = safeSanitize(parseResult.root);
  if (!sanitizeResult.success) {
    return {
      success: false,
      stage: 'sanitize',
      reasonCode: sanitizeResult.error.code,
      message: sanitizeResult.error.message,
    };
  }

  // 3. Deterministic normalization
  let normalizedRoot: SvgSecurityNode;
  try {
    normalizedRoot = normalize(sanitizeResult.root);
  } catch (err) {
    return {
      success: false,
      stage: 'normalize',
      reasonCode: 'SVG_NORMALIZATION_FAILED',
      message: err instanceof Error ? err.message : 'SVG normalization failure',
    };
  }

  // 4. Deterministic serialization
  let canonicalSvg: string;
  try {
    canonicalSvg = serialize(normalizedRoot);
  } catch (err) {
    return {
      success: false,
      stage: 'serialize',
      reasonCode: 'SVG_SERIALIZATION_FAILED',
      message: err instanceof Error ? err.message : 'SVG serialization failure',
    };
  }

  // 5. Checksums and metrics
  const sourceChecksumSha256 = crypto
    .createHash('sha256')
    .update(rawSvg, 'utf8')
    .digest('hex');

  const canonicalChecksumSha256 = crypto
    .createHash('sha256')
    .update(canonicalSvg, 'utf8')
    .digest('hex');

  const sizeBytes = Buffer.byteLength(canonicalSvg, 'utf8');

  return {
    success: true,
    canonicalSvg,
    sourceChecksumSha256,
    canonicalChecksumSha256,
    sizeBytes,
    nodeCount: parseResult.nodeCount,
    maxDepth: parseResult.maxDepth,
    pipelineId: SVG_SECURITY_PIPELINE_ID,
  };
}
