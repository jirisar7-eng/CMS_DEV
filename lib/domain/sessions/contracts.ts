/**
 * Domain contracts, safe session projections, and controlled error definitions for Session Management.
 */

export type SessionErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "CURRENT_SESSION_PROTECTED"
  | "DATABASE_ERROR";

export class SessionServiceError extends Error {
  constructor(
    public readonly code: SessionErrorCode,
    message: string,
    public readonly status: number = 500,
  ) {
    super(message);
    this.name = "SessionServiceError";
  }
}

/**
 * Safe public/domain projection of an active session.
 * STRICTLY excludes tokenHash, raw tokens, raw User-Agent, IP address, and location data.
 */
export interface SafeSessionProjection {
  id: string;
  userId: string;
  deviceLabel: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface ListSessionsOptions {
  targetUserId?: string;
}

export interface RevokeSessionResult {
  success: boolean;
  sessionId: string;
  revokedCount: number;
}

export interface RevokeOtherSessionsResult {
  success: boolean;
  revokedCount: number;
}

export interface SessionApiErrorResponse {
  error: {
    code: SessionErrorCode | "INTERNAL_ERROR";
    message: string;
    status: number;
  };
}

export function mapSessionErrorToResponse(err: unknown): {
  status: number;
  body: SessionApiErrorResponse;
} {
  if (err instanceof SessionServiceError) {
    return {
      status: err.status,
      body: {
        error: {
          code: err.code,
          message: err.message,
          status: err.status,
        },
      },
    };
  }

  if (err instanceof Error) {
    if (err.message === "UNAUTHENTICATED") {
      return {
        status: 401,
        body: { error: { code: "UNAUTHENTICATED", message: "Authentication required", status: 401 } },
      };
    }
    if (err.message === "FORBIDDEN") {
      return {
        status: 403,
        body: { error: { code: "FORBIDDEN", message: "Forbidden: insufficient permissions", status: 403 } },
      };
    }
    if (err.message === "NOT_FOUND") {
      return {
        status: 404,
        body: { error: { code: "NOT_FOUND", message: "Session not found", status: 404 } },
      };
    }
    if (err.message === "CURRENT_SESSION_PROTECTED") {
      return {
        status: 400,
        body: { error: { code: "CURRENT_SESSION_PROTECTED", message: "Cannot revoke current active session", status: 400 } },
      };
    }
    if (err.message === "DATABASE_ERROR") {
      return {
        status: 500,
        body: { error: { code: "DATABASE_ERROR", message: "Database service error", status: 500 } },
      };
    }
  }

  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        status: 500,
      },
    },
  };
}

export function handleSessionApiError(err: unknown): Response {
  const mapped = mapSessionErrorToResponse(err);
  return Response.json(mapped.body, {
    status: mapped.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
