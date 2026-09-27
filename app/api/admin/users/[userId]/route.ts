import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { validateMutationOrigin } from "@/lib/domain/pages-api/origin";
import {
  getUserById,
  updateUser,
  UserDomainError,
} from "@/lib/domain/users/service";
import { validatePatchUserInput } from "@/lib/domain/users/validation";

function formatErrorResponse(code: string, message: string, status: number): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    }
  );
}

function validateUserIdParam(raw: unknown): { valid: true; userId: string } | { valid: false; error: string } {
  if (typeof raw !== "string") {
    return { valid: false, error: "User ID must be a string" };
  }
  if (raw.length === 0) {
    return { valid: false, error: "User ID is required" };
  }
  if (raw !== raw.trim() || /\s/.test(raw)) {
    return { valid: false, error: "User ID must not contain whitespace" };
  }
  if (/[\x00-\x1F\x7F]/.test(raw)) {
    return { valid: false, error: "User ID contains invalid control characters" };
  }
  if (raw.length > 128) {
    return { valid: false, error: "User ID exceeds maximum allowed length" };
  }
  return { valid: true, userId: raw };
}

function handleUsersApiError(err: unknown): NextResponse {
  if (err instanceof UserDomainError) {
    let status = err.status;
    if (
      err.code === "CANNOT_DEACTIVATE_SELF" ||
      err.code === "INVALID_USER_STATE" ||
      err.code === "EMAIL_EXISTS"
    ) {
      status = 409;
    } else if (err.code === "NOT_FOUND") {
      status = 404;
    } else if (err.code === "UNAUTHENTICATED") {
      status = 401;
    } else if (err.code === "FORBIDDEN") {
      status = 403;
    } else if (err.code === "INVALID_INPUT") {
      status = 400;
    }
    return formatErrorResponse(err.code, err.message, status);
  }

  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "CSRF_REJECTED"
  ) {
    const msg =
      "message" in err && typeof (err as { message: unknown }).message === "string"
        ? (err as { message: string }).message
        : "Cross-origin request rejected";
    return formatErrorResponse("CSRF_REJECTED", msg, 403);
  }

  if (err instanceof Error) {
    if (err.message === "UNAUTHENTICATED") {
      return formatErrorResponse("UNAUTHENTICATED", "Authentication required", 401);
    }
    if (err.message === "FORBIDDEN" || err.message === "UNAUTHORIZED") {
      return formatErrorResponse("FORBIDDEN", "Forbidden: insufficient permissions", 403);
    }
    if (err.message === "CSRF_REJECTED") {
      return formatErrorResponse("CSRF_REJECTED", "Cross-origin request rejected", 403);
    }
  }

  console.error("[UsersDetailApi] Unexpected error:", err);
  return formatErrorResponse("DATABASE_ERROR", "An unexpected error occurred", 500);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> | { userId: string } }
) {
  try {
    const user = await requireAuthenticatedUser();

    const resolvedParams = await Promise.resolve(context?.params);
    const userIdValidation = validateUserIdParam(resolvedParams?.userId);
    if (!userIdValidation.valid) {
      return formatErrorResponse("INVALID_INPUT", userIdValidation.error, 400);
    }

    const result = await getUserById(userIdValidation.userId, user.id);

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    return handleUsersApiError(err);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> | { userId: string } }
) {
  try {
    validateMutationOrigin(request);

    const user = await requireAuthenticatedUser();

    const resolvedParams = await Promise.resolve(context?.params);
    const userIdValidation = validateUserIdParam(resolvedParams?.userId);
    if (!userIdValidation.valid) {
      return formatErrorResponse("INVALID_INPUT", userIdValidation.error, 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return formatErrorResponse("INVALID_INPUT", "Request body must be valid JSON", 400);
    }

    const validation = validatePatchUserInput(body);
    if (!validation.valid || !validation.data) {
      const firstError = validation.errors
        ? Object.values(validation.errors)[0]
        : "Invalid patch input";
      return formatErrorResponse("INVALID_INPUT", firstError, 400);
    }

    const updatedUser = await updateUser(userIdValidation.userId, validation.data, user.id);

    return NextResponse.json(updatedUser, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    return handleUsersApiError(err);
  }
}
