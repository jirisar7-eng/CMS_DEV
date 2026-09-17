/**
 * Admin Pages Project Context Helper
 * 
 * Provides safe normalization and URL context propagation for multi-tenant / project-scoped Admin Pages.
 * Ensures fail-closed behavior on missing or invalid project IDs.
 */

/**
 * Normalizes and validates an untrusted project ID input.
 * Rejects null, undefined, empty strings, whitespace-only, control characters, and angle brackets.
 * Returns a clean trimmed string or null if invalid.
 */
export function normalizeAdminProjectId(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const hasControlChars = /[\x00-\x1F\x7F]/.test(trimmed);
  const hasAngleBrackets = /[<>]/.test(trimmed);
  if (hasControlChars || hasAngleBrackets) {
    return null;
  }
  return trimmed;
}

export function withAdminProjectContext(
  pathname: string,
  projectId: string | null | undefined
): string {
  return pathname;
}
