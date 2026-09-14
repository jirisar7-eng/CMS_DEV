import { SaxesParser } from 'saxes';
import type {
  SvgSecurityError,
  SvgSecurityLimits,
  SvgSecurityNode,
  SvgSecurityParseResult,
  SvgSecurityReasonCode,
} from './types';
import {
  ALLOWED_SVG_ELEMENTS,
  DEFAULT_SVG_SECURITY_LIMITS,
  SVG_NAMESPACE_URI,
} from './policy';

class SecurityAbortError extends Error {
  public readonly error: SvgSecurityError;

  constructor(error: SvgSecurityError) {
    super(error.message);
    this.name = 'SecurityAbortError';
    this.error = error;
  }
}

/**
 * Server-side fail-closed SVG parser using saxes.
 * Enforces strict element/attribute policies and resource limits.
 *
 * @param input SVG XML content string
 * @param customLimits Optional custom limit overrides
 */
export function parseSvgSecurity(
  input: string,
  customLimits?: Partial<SvgSecurityLimits>
): SvgSecurityParseResult {
  if (typeof input !== 'string') {
    return {
      success: false,
      error: {
        code: 'SVG_PARSE_FAILED',
        message: 'SVG input must be a string',
      },
    };
  }

  const limits: SvgSecurityLimits = {
    ...DEFAULT_SVG_SECURITY_LIMITS,
    ...customLimits,
  };

  const inputBytes = Buffer.byteLength(input, 'utf8');
  if (inputBytes > limits.maxInputBytes) {
    return {
      success: false,
      error: {
        code: 'SVG_INPUT_TOO_LARGE',
        message: `SVG input size (${inputBytes} bytes) exceeds limit of ${limits.maxInputBytes} bytes`,
        details: { inputBytes, maxInputBytes: limits.maxInputBytes },
      },
    };
  }

  const parser = new SaxesParser();

  let nodeCount = 0;
  let currentDepth = 0;
  let peakDepth = 0;
  let rootSeen = false;
  let rootClosed = false;
  let rootNode: SvgSecurityNode | null = null;
  const stack: SvgSecurityNode[] = [];

  const abort = (
    code: SvgSecurityReasonCode,
    message: string,
    details?: Record<string, unknown>
  ): never => {
    throw new SecurityAbortError({
      code,
      message,
      line: parser.line,
      column: parser.column,
      details,
    });
  };

  // 1. Reject DTD / DOCTYPE
  parser.on('doctype', (doctype) => {
    abort('SVG_PARSE_FAILED', 'DTD and DOCTYPE declarations are strictly forbidden in SVG', {
      doctype,
    });
  });

  // 2. Reject Processing Instructions (e.g. <?xml-stylesheet ...?>)
  parser.on('processinginstruction', (pi) => {
    abort('SVG_PARSE_FAILED', `Processing instruction <?${pi.target}?> is forbidden in SVG`, {
      target: pi.target,
    });
  });

  // 3. Reject dangerous CDATA or collect safe CDATA into text element
  parser.on('cdata', (cdata) => {
    const normalizedCdata = cdata.replace(/[\s\u0000-\u001F\u007F-\u009F]/g, '').toLowerCase();
    if (normalizedCdata.includes('javascript:') || normalizedCdata.includes('vbscript:')) {
      abort('SVG_SCRIPT_DETECTED', 'Executable script scheme detected in CDATA');
    }
    if (normalizedCdata.includes('url(')) {
      abort('SVG_CSS_POLICY_VIOLATION', 'CSS url(...) pattern detected in CDATA');
    }
    if (normalizedCdata.includes('http:') || normalizedCdata.includes('https:')) {
      abort('SVG_EXTERNAL_REFERENCE', 'External reference detected in CDATA');
    }
    if (stack.length > 0 && stack[stack.length - 1].name === 'text') {
      const top = stack[stack.length - 1];
      top.text = (top.text || '') + cdata;
    }
  });

  // 4. Element open tag processing
  parser.on('opentag', (tag) => {
    const rawName = tag.name;
    const lowerName = rawName.toLowerCase();

    // Check dangerous elements first for precise SYN-SEC-SVG-001 reason codes
    if (lowerName === 'script' || lowerName.endsWith(':script')) {
      abort('SVG_SCRIPT_DETECTED', '<script> elements are strictly forbidden');
    }

    if (lowerName === 'foreignobject' || lowerName.endsWith(':foreignobject')) {
      abort('SVG_FOREIGN_OBJECT', '<foreignObject> elements are strictly forbidden');
    }

    if (
      lowerName === 'iframe' ||
      lowerName === 'object' ||
      lowerName === 'embed' ||
      lowerName === 'image' ||
      lowerName.endsWith(':iframe') ||
      lowerName.endsWith(':object') ||
      lowerName.endsWith(':embed') ||
      lowerName.endsWith(':image')
    ) {
      abort('SVG_FORBIDDEN_ELEMENT', `<${rawName}> elements are forbidden`);
    }

    // Root verification & nested svg checks
    if (!rootSeen) {
      if (lowerName !== 'svg') {
        abort('SVG_FORBIDDEN_ELEMENT', `Root element must be <svg>, found <${rawName}>`);
      }
      rootSeen = true;
    } else {
      if (rootClosed) {
        abort('SVG_PARSE_FAILED', `Multiple root elements are forbidden; found trailing <${rawName}>`);
      }
      if (lowerName === 'svg') {
        abort('SVG_FORBIDDEN_ELEMENT', 'Nested <svg> elements are forbidden');
      }
    }

    // Reject namespace prefix tricks on elements
    if (rawName.includes(':')) {
      abort('SVG_FORBIDDEN_ELEMENT', `Namespaced elements (<${rawName}>) are forbidden`);
    }

    // Whitelist verification
    if (!ALLOWED_SVG_ELEMENTS.has(lowerName)) {
      abort('SVG_FORBIDDEN_ELEMENT', `Element <${rawName}> is not in the allowed SVG element policy`);
    }

    // Node count check
    nodeCount++;
    if (nodeCount > limits.maxNodes) {
      abort(
        'SVG_TOO_MANY_NODES',
        `Node count (${nodeCount}) exceeds maximum allowed nodes (${limits.maxNodes})`
      );
    }

    // Depth check
    currentDepth++;
    if (currentDepth > peakDepth) {
      peakDepth = currentDepth;
    }
    if (currentDepth > limits.maxDepth) {
      abort(
        'SVG_MAX_DEPTH_EXCEEDED',
        `Document depth (${currentDepth}) exceeds maximum allowed depth (${limits.maxDepth})`
      );
    }

    // Attributes inspection
    const rawAttrs = tag.attributes as Record<string, string>;
    const attrEntries = Object.entries(rawAttrs);

    if (attrEntries.length > limits.maxAttributesPerNode) {
      abort(
        'SVG_FORBIDDEN_ATTRIBUTE',
        `Node <${rawName}> attribute count (${attrEntries.length}) exceeds limit of ${limits.maxAttributesPerNode}`
      );
    }

    const cleanAttributes: Record<string, string> = {};

    for (const [attrName, attrValue] of attrEntries) {
      const lowerAttr = attrName.toLowerCase();
      const strVal = String(attrValue);

      if (strVal.length > limits.maxAttributeLength) {
        abort(
          'SVG_FORBIDDEN_ATTRIBUTE',
          `Attribute "${attrName}" length (${strVal.length}) exceeds limit of ${limits.maxAttributeLength}`
        );
      }

      // Reject all event handlers: on*
      if (lowerAttr.startsWith('on')) {
        abort('SVG_EVENT_HANDLER_DETECTED', `Event handler attribute "${attrName}" is forbidden`);
      }

      // Reject CSS attributes: style, class
      if (lowerAttr === 'style' || lowerAttr === 'class') {
        abort('SVG_CSS_POLICY_VIOLATION', `CSS attribute "${attrName}" is forbidden by security policy`);
      }

      // Reject href and xlink:href
      if (lowerAttr === 'href' || lowerAttr === 'xlink:href' || lowerAttr.endsWith(':href')) {
        abort('SVG_EXTERNAL_REFERENCE', `Hyperlink reference attribute "${attrName}" is forbidden`);
      }

      // Reject custom namespace definitions
      if (lowerAttr.startsWith('xmlns:')) {
        abort('SVG_FORBIDDEN_ATTRIBUTE', `Custom XML namespace declaration "${attrName}" is forbidden`);
      }

      // Standard xmlns validation: only allowed on root <svg> with canonical SVG namespace
      if (lowerAttr === 'xmlns') {
        if (lowerName !== 'svg' || strVal.trim() !== SVG_NAMESPACE_URI) {
          abort(
            'SVG_FORBIDDEN_ATTRIBUTE',
            `Invalid or untrusted xmlns declaration "${strVal}" on <${rawName}>`
          );
        }
      }

      // Reject other namespaced attributes
      if (attrName.includes(':') && lowerAttr !== 'xml:space') {
        abort('SVG_FORBIDDEN_ATTRIBUTE', `Namespaced attribute "${attrName}" is forbidden`);
      }

      // Inspect attribute value for dangerous schemes and patterns
      const normalizedVal = strVal
        .replace(/[\s\u0000-\u001F\u007F-\u009F]/g, '')
        .toLowerCase();

      if (normalizedVal.includes('javascript:') || normalizedVal.includes('vbscript:')) {
        abort('SVG_SCRIPT_DETECTED', `Executable script scheme detected in attribute "${attrName}"`);
      }

      if (
        normalizedVal.includes('data:') ||
        normalizedVal.includes('blob:') ||
        normalizedVal.includes('file:')
      ) {
        abort('SVG_UNSAFE_URL', `Unsafe URL scheme detected in attribute "${attrName}"`);
      }

      if (normalizedVal.includes('url(')) {
        abort('SVG_CSS_POLICY_VIOLATION', `CSS url(...) pattern detected in attribute "${attrName}"`);
      }

      if (normalizedVal.includes('http:') || normalizedVal.includes('https:')) {
        if (!(lowerName === 'svg' && lowerAttr === 'xmlns' && strVal.trim() === SVG_NAMESPACE_URI)) {
          abort('SVG_EXTERNAL_REFERENCE', `External resource reference detected in attribute "${attrName}"`);
        }
      }

      cleanAttributes[attrName] = strVal;
    }

    const newNode: SvgSecurityNode = {
      name: lowerName,
      attributes: cleanAttributes,
      children: [],
    };

    if (!rootNode) {
      rootNode = newNode;
    } else if (stack.length > 0) {
      stack[stack.length - 1].children.push(newNode);
    }

    stack.push(newNode);
  });

  // 5. Element text handling
  parser.on('text', (text) => {
    if (stack.length > 0 && stack[stack.length - 1].name === 'text') {
      const top = stack[stack.length - 1];
      top.text = (top.text || '') + text;
    }
  });

  // 6. Element close tag processing
  parser.on('closetag', (tag) => {
    const lowerName = tag.name.toLowerCase();
    if (stack.length > 0 && stack[stack.length - 1].name === lowerName) {
      stack.pop();
    }
    currentDepth--;
    if (lowerName === 'svg' && stack.length === 0) {
      rootClosed = true;
    }
  });

  // 7. XML parsing errors from saxes (malformed tags, entities, unclosed tags, etc.)
  parser.on('error', (err) => {
    abort('SVG_PARSE_FAILED', err.message);
  });

  try {
    parser.write(input).close();
  } catch (err) {
    if (err instanceof SecurityAbortError) {
      return {
        success: false,
        error: err.error,
      };
    }
    return {
      success: false,
      error: {
        code: 'SVG_PARSE_FAILED',
        message: err instanceof Error ? err.message : 'XML parse error',
        line: parser.line,
        column: parser.column,
      },
    };
  }

  if (!rootNode || !rootSeen) {
    return {
      success: false,
      error: {
        code: 'SVG_PARSE_FAILED',
        message: 'No <svg> root element found in document',
      },
    };
  }

  if (!rootClosed || stack.length !== 0) {
    return {
      success: false,
      error: {
        code: 'SVG_PARSE_FAILED',
        message: 'Unclosed or unbalanced tags detected in SVG',
      },
    };
  }

  return {
    success: true,
    root: rootNode,
    nodeCount,
    maxDepth: peakDepth,
  };
}
