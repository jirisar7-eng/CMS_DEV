import { parseSvgSecurity } from "../parser";
import { sanitize } from "../sanitizer";
import { normalize } from "../normalizer";
import { serialize } from "../serializer";
import { escapeXmlAttribute, escapeXmlText } from "../serializer";

export interface PropertyTestResult {
  readonly name: string;
  readonly passed: boolean;
  readonly error?: string;
}

export function runPropertyTests(): PropertyTestResult[] {
  const results: PropertyTestResult[] = [];

  // 1. Sanitizer Idempotence: sanitize(sanitize(ast)) === sanitize(ast)
  try {
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="red"><rect x="10" y="20" width="30" height="40"/></g></svg>';
    const parseRes = parseSvgSecurity(rawSvg);
    if (!parseRes.success) {
      throw new Error("Initial parse failed in sanitizer idempotence test");
    }

    const clean1 = sanitize(parseRes.root);
    const clean2 = sanitize(clean1);

    const json1 = JSON.stringify(clean1);
    const json2 = JSON.stringify(clean2);

    if (json1 !== json2) {
      throw new Error("Sanitizer not idempotent: " + json1 + " !== " + json2);
    }

    results.push({ name: "sanitizer_idempotence", passed: true });
  } catch (err: unknown) {
    results.push({
      name: "sanitizer_idempotence",
      passed: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. Normalizer Idempotence: normalize(normalize(ast)) === normalize(ast)
  try {
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg" height="100px" width="200px" viewBox="0, 0,  200, 100"><rect stroke-width="2.500" fill="#FFF" y=" 10 " x="5" height="20" width="40"/></svg>';
    const parseRes = parseSvgSecurity(rawSvg);
    if (!parseRes.success) {
      throw new Error("Initial parse failed in normalizer idempotence test");
    }

    const clean = sanitize(parseRes.root);
    const norm1 = normalize(clean);
    const norm2 = normalize(norm1);

    const json1 = JSON.stringify(norm1);
    const json2 = JSON.stringify(norm2);

    if (json1 !== json2) {
      throw new Error("Normalizer not idempotent: " + json1 + " !== " + json2);
    }

    results.push({ name: "normalizer_idempotence", passed: true });
  } catch (err: unknown) {
    results.push({
      name: "normalizer_idempotence",
      passed: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 3. Deterministic Serialization: serialize(normalize(x)) is identical across repeated runs
  try {
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="10,10 20,20 30,10" fill="blue"/><text x="10" y="20">Deterministic</text></svg>';
    const parseRes = parseSvgSecurity(rawSvg);
    if (!parseRes.success) {
      throw new Error("Initial parse failed in deterministic serialization test");
    }

    const norm = normalize(sanitize(parseRes.root));
    const serializedRuns = Array.from({ length: 5 }, () => serialize(norm));

    const first = serializedRuns[0];
    const allSame = serializedRuns.every((s) => s === first);

    if (!allSame) {
      throw new Error("Serialization output is not deterministic across multiple runs");
    }

    // Verify attribute sorting in serialized output
    const sampleWithAttrs = '<svg xmlns="http://www.w3.org/2000/svg"><rect y="10" x="5" width="20" height="30" fill="red" stroke="black"/></svg>';
    const parseSample = parseSvgSecurity(sampleWithAttrs);
    if (!parseSample.success) {
      throw new Error("Parse sample failed");
    }
    const normSample = normalize(sanitize(parseSample.root));
    const sOut = serialize(normSample);

    // Attributes should appear alphabetically: fill, height, stroke, width, x, y
    const fillIdx = sOut.indexOf("fill=");
    const heightIdx = sOut.indexOf("height=");
    const strokeIdx = sOut.indexOf("stroke=");
    const widthIdx = sOut.indexOf("width=");
    const xIdx = sOut.indexOf("x=");
    const yIdx = sOut.indexOf("y=");

    if (!(fillIdx < heightIdx && heightIdx < strokeIdx && strokeIdx < widthIdx && widthIdx < xIdx && xIdx < yIdx)) {
      throw new Error("Serialized attributes are not alphabetically ordered: " + sOut);
    }

    results.push({ name: "deterministic_serialization", passed: true });
  } catch (err: unknown) {
    results.push({
      name: "deterministic_serialization",
      passed: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 4. XML Escaping: escapeXmlAttribute and escapeXmlText correctly sanitize sensitive chars
  try {
    const attrInput = "Hello & \" < > ' World";
    const escapedAttr = escapeXmlAttribute(attrInput);
    if (escapedAttr.includes("& ") || escapedAttr.includes('"') || escapedAttr.includes("<") || escapedAttr.includes(">")) {
      throw new Error("escapeXmlAttribute failed to escape special characters: " + escapedAttr);
    }
    if (!escapedAttr.includes("&amp;") || !escapedAttr.includes("&quot;") || !escapedAttr.includes("&lt;") || !escapedAttr.includes("&gt;")) {
      throw new Error("escapeXmlAttribute missing replacement entity: " + escapedAttr);
    }

    const textInput = "5 < 10 & 20 > 15 \"quote\" 'apos'";
    const escapedText = escapeXmlText(textInput);
    if (escapedText.includes("<") || escapedText.includes(">") || escapedText.includes("& ") || escapedText.includes('"') || escapedText.includes("'")) {
      throw new Error("escapeXmlText failed to escape special characters: " + escapedText);
    }
    if (!escapedText.includes("&lt;") || !escapedText.includes("&gt;") || !escapedText.includes("&amp;") || !escapedText.includes("&quot;") || !escapedText.includes("&apos;")) {
      throw new Error("escapeXmlText missing replacement entity: " + escapedText);
    }

    results.push({ name: "xml_escaping", passed: true });
  } catch (err: unknown) {
    results.push({
      name: "xml_escaping",
      passed: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return results;
}
