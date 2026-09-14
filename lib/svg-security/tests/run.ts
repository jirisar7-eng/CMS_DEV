import { parseSvgSecurity } from "../parser";
import { safeSanitize } from "../sanitizer";
import { SECURITY_VECTORS, type SecurityVector } from "./vectors";
import { runPropertyTests, type PropertyTestResult } from "./properties";

export interface SuiteRunSummary {
  readonly totalVectors: number;
  readonly vectorsPassed: number;
  readonly vectorsFailed: number;
  readonly failures: readonly { id: string; description: string; error: string }[];
  readonly propertyResults: readonly PropertyTestResult[];
}

export function runSecuritySuite(): SuiteRunSummary {
  let passed = 0;
  let failed = 0;
  const failures: { id: string; description: string; error: string }[] = [];

  for (const vec of SECURITY_VECTORS) {
    try {
      const parseRes = parseSvgSecurity(vec.input);
      let overallSuccess: boolean;
      let actualCode: string | undefined = undefined;

      if (!parseRes.success) {
        overallSuccess = false;
        actualCode = (parseRes as { success: false; error: { code: string } }).error.code;
      } else {
        const sanitizeRes = safeSanitize(parseRes.root);
        if (!sanitizeRes.success) {
          overallSuccess = false;
          actualCode = (sanitizeRes as { success: false; error: { code: string } }).error.code;
        } else {
          overallSuccess = true;
        }
      }

      if (vec.expectedPass) {
        if (!overallSuccess) {
          failed++;
          failures.push({
            id: vec.id,
            description: vec.description,
            error: "Expected PASS but failed with code: " + (actualCode || "UNKNOWN"),
          });
        } else {
          passed++;
        }
      } else {
        // Expected reject
        if (overallSuccess) {
          failed++;
          failures.push({
            id: vec.id,
            description: vec.description,
            error: "Expected REJECT but vector passed security validation",
          });
        } else {
          if (vec.expectedReasonCode && actualCode !== vec.expectedReasonCode) {
            // Note: If both are security rejections, check if matched
            failed++;
            failures.push({
              id: vec.id,
              description: vec.description,
              error: "Expected reason code " + vec.expectedReasonCode + " but got " + actualCode,
            });
          } else {
            passed++;
          }
        }
      }
    } catch (err: unknown) {
      if (vec.expectedPass) {
        failed++;
        failures.push({
          id: vec.id,
          description: vec.description,
          error: "Unexpected throw on safe vector: " + (err instanceof Error ? err.message : String(err)),
        });
      } else {
        // Uncaught error on malicious vector is still a reject, but fail-closed structured error is preferred
        passed++;
      }
    }
  }

  const propResults = runPropertyTests();

  return {
    totalVectors: SECURITY_VECTORS.length,
    vectorsPassed: passed,
    vectorsFailed: failed,
    failures,
    propertyResults: propResults,
  };
}

// If executed directly
if (typeof require !== "undefined" && require.main === module) {
  console.log("Running SVG Security Regression Suite...");
  const summary = runSecuritySuite();
  console.log("Total Vectors: " + summary.totalVectors);
  console.log("Vectors Passed: " + summary.vectorsPassed);
  console.log("Vectors Failed: " + summary.vectorsFailed);

  if (summary.failures.length > 0) {
    console.error("FAILURES:");
    for (const f of summary.failures) {
      console.error("  [" + f.id + "] " + f.description + " -> " + f.error);
    }
  }

  console.log("Property Tests:");
  for (const p of summary.propertyResults) {
    console.log("  " + p.name + ": " + (p.passed ? "PASS" : "FAIL (" + p.error + ")"));
  }

  const allPropsPassed = summary.propertyResults.every((p) => p.passed);
  if (summary.vectorsFailed > 0 || !allPropsPassed) {
    process.exit(1);
  }
}
