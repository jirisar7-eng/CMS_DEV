/**
 * SYN-SEC-SVG-001: Structured reason codes for fail-closed SVG security validation.
 */
export type SvgSecurityReasonCode =
  | 'SVG_PARSE_FAILED'
  | 'SVG_INPUT_TOO_LARGE'
  | 'SVG_TOO_MANY_NODES'
  | 'SVG_MAX_DEPTH_EXCEEDED'
  | 'SVG_FORBIDDEN_ELEMENT'
  | 'SVG_FORBIDDEN_ATTRIBUTE'
  | 'SVG_EVENT_HANDLER_DETECTED'
  | 'SVG_SCRIPT_DETECTED'
  | 'SVG_EXTERNAL_REFERENCE'
  | 'SVG_UNSAFE_URL'
  | 'SVG_FOREIGN_OBJECT'
  | 'SVG_CSS_POLICY_VIOLATION'
  | 'SVG_DTD_NOT_ALLOWED'
  | 'SVG_PROCESSING_INSTRUCTION_NOT_ALLOWED';

/**
 * Resource and complexity limits for fail-closed SVG parsing.
 */
export interface SvgSecurityLimits {
  readonly maxInputBytes: number;
  readonly maxNodes: number;
  readonly maxDepth: number;
  readonly maxAttributesPerNode: number;
  readonly maxAttributeLength: number;
}

/**
 * Parsed AST node representing a safe SVG element.
 */
export interface SvgSecurityNode {
  readonly name: string;
  readonly attributes: Record<string, string>;
  readonly children: SvgSecurityNode[];
  text?: string;
}

/**
 * Structured error details returned on security or parse failure.
 */
export interface SvgSecurityError {
  readonly code: SvgSecurityReasonCode;
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
  readonly details?: Record<string, unknown>;
}

/**
 * Successful result of SVG security parsing.
 */
export interface SvgSecurityParseSuccess {
  readonly success: true;
  readonly root: SvgSecurityNode;
  readonly nodeCount: number;
  readonly maxDepth: number;
}

/**
 * Failed result of SVG security parsing.
 */
export interface SvgSecurityParseFailure {
  readonly success: false;
  readonly error: SvgSecurityError;
}

/**
 * Union result type for parseSvgSecurity.
 */
export type SvgSecurityParseResult = SvgSecurityParseSuccess | SvgSecurityParseFailure;
