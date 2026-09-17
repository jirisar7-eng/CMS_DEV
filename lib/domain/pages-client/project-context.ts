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

  // Reject strings with control characters (ASCII 0-31, 127)
  // or HTML/XML delimiters (< >)
  const hasControlChars = /[\x00-\x1F\x7F]/.test(trimmed);
  const hasAngleBrackets = /[<>]/.test(trimmed);

  if (hasControlChars || hasAngleBrackets) {
    return null;
  }

  return trimmed;
}

/**
 * Appends or updates the ?projectId=<id> search parameter on a target pathname/URL.
 * If projectId is null, undefined, or invalid, removes or omits the projectId parameter.
 * Preserves all other existing search parameters and fragments.
 */
export function withAdminProjectContext(
  pathname: string,
  projectId: string | null | undefined
): string {
  const normalizedId = normalizeAdminProjectId(projectId);

  // Parse path, query, and hash
  const hashIndex = pathname.indexOf('#');
  let hash = '';
  let pathAndQuery = pathname;

  if (hashIndex !== -1) {
    hash = pathname.slice(hashIndex);
    pathAndQuery = pathname.slice(0, hashIndex);
  }

  const queryIndex = pathAndQuery.indexOf('?');
  let path = pathAndQuery;
  let queryString = '';

  if (queryIndex !== -1) {
    path = pathAndQuery.slice(0, queryIndex);
    queryString = pathAndQuery.slice(queryIndex + 1);
  }

  const params = new URLSearchParams(queryString);

  if (normalizedId) {
    params.set('projectId', normalizedId);
  } else {
    params.delete('projectId');
  }

  const newQuery = params.toString();
  const queryPart = newQuery ? `?${newQuery}` : '';

  return `${path}${queryPart}${hash}`;
}
