import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { validateMutationOrigin } from "@/lib/domain/pages-api/origin";
import {
  listUsers,
  createUser,
  UserDomainError,
} from "@/lib/domain/users/service";
import {
  validateCreateUserInput,
  validateUserStatus,
} from "@/lib/domain/users/validation";
import type { UserStatus } from "@/lib/domain/users/types";

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

function handleUsersApiError(err: unknown): NextResponse {
  if (err instanceof UserDomainError) {
    return formatErrorResponse(err.code, err.message, err.status);
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

  console.error("[UsersApi] Unexpected error:", err);
  return formatErrorResponse("DATABASE_ERROR", "An unexpected error occurred", 500);
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();

    const { searchParams } = new URL(request.url);

    const ALLOWED_PARAMS = new Set(["page", "limit", "query", "status"]);
    for (const key of searchParams.keys()) {
      if (!ALLOWED_PARAMS.has(key)) {
        return formatErrorResponse("INVALID_INPUT", `Unexpected query parameter: ${key}`, 400);
      }
    }

    let page: number | undefined = undefined;
    if (searchParams.has("page")) {
      const rawPage = searchParams.get("page")!.trim();
      if (!/^[1-9]\d*$/.test(rawPage)) {
        return formatErrorResponse("INVALID_INPUT", "Invalid page: must be a positive integer", 400);
      }
      const parsedPage = parseInt(rawPage, 10);
      if (!Number.isSafeInteger(parsedPage) || parsedPage < 1) {
        return formatErrorResponse("INVALID_INPUT", "Invalid page: must be a positive integer", 400);
      }
      page = parsedPage;
    }

    let limit: number | undefined = undefined;
    if (searchParams.has("limit")) {
      const rawLimit = searchParams.get("limit")!.trim();
      if (!/^[1-9]\d*$/.test(rawLimit)) {
        return formatErrorResponse("INVALID_INPUT", "Invalid limit: must be a positive integer", 400);
      }
      const parsedLimit = parseInt(rawLimit, 10);
      if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1) {
        return formatErrorResponse("INVALID_INPUT", "Invalid limit: must be a positive integer", 400);
      }
      limit = parsedLimit;
    }

    let status: UserStatus | undefined = undefined;
    if (searchParams.has("status")) {
      const rawStatus = searchParams.get("status")!.trim();
      const statusRes = validateUserStatus(rawStatus);
      if (!statusRes.valid || !statusRes.status) {
        return formatErrorResponse("INVALID_INPUT", statusRes.error || "Invalid status filter", 400);
      }
      status = statusRes.status;
    }

    let query: string | undefined = undefined;
    if (searchParams.has("query")) {
      const rawQuery = searchParams.get("query")!;
      if (rawQuery.length > 255) {
        return formatErrorResponse("INVALID_INPUT", "Query exceeds maximum allowed length", 400);
      }
      query = rawQuery;
    }

    const result = await listUsers(
      {
        page,
        limit,
        status,
        query,
      },
      user.id
    );

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

export async function POST(request: NextRequest) {
  try {
    validateMutationOrigin(request);

    const user = await requireAuthenticatedUser();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return formatErrorResponse("INVALID_INPUT", "Request body must be valid JSON", 400);
    }

    const validation = validateCreateUserInput(body);
    if (!validation.valid || !validation.data) {
      const firstError = validation.errors
        ? Object.values(validation.errors)[0]
        : "Invalid user input";
      return formatErrorResponse("INVALID_INPUT", firstError, 400);
    }

    const createdUser = await createUser(validation.data, user.id);

    return NextResponse.json(createdUser, {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    return handleUsersApiError(err);
  }
}
