import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { validateMutationOrigin } from "@/lib/domain/pages-api/origin";
import { getRoleService, RoleServiceError } from "@/lib/domain/roles";

class ApiInputError extends Error {}

function json(data: unknown, status: number) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function handleError(error: unknown) {
  if (error instanceof ApiInputError) {
    return json({ error: { code: "INVALID_INPUT", message: error.message } }, 400);
  }
  if (error instanceof RoleServiceError) {
    return json({ error: { code: error.code, message: error.message } }, error.statusCode);
  }
  if (error instanceof Error) {
    if (error.message === "UNAUTHENTICATED") {
      return json({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } }, 401);
    }
    if (error.message === "FORBIDDEN" || error.message === "UNAUTHORIZED") {
      return json({ error: { code: "FORBIDDEN", message: "Forbidden" } }, 403);
    }
    if (error.message === "CSRF_REJECTED") {
      return json({ error: { code: "CSRF_REJECTED", message: "Cross-origin request rejected" } }, 403);
    }
  }
  return json({ error: { code: "DATABASE_ERROR", message: "An unexpected error occurred" } }, 500);
}

function validateId(raw: unknown, label: string): string {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new ApiInputError(`${label} is required`);
  }
  if (raw !== raw.trim() || /\s/.test(raw)) {
    throw new ApiInputError(`${label} must not contain whitespace`);
  }
  if (/[\x00-\x1F\x7F]/.test(raw)) {
    throw new ApiInputError(`${label} contains invalid control characters`);
  }
  if (raw.length > 128) {
    throw new ApiInputError(`${label} exceeds maximum allowed length`);
  }
  return raw;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type Context = { params: Promise<{ roleId: string }> };

export async function PUT(request: NextRequest, context: Context) {
  try {
    validateMutationOrigin(request);
    const actor = await requireAuthenticatedUser();
    const { roleId: rawRoleId } = await context.params;
    const roleId = validateId(rawRoleId, "Role ID");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiInputError("Request body must be valid JSON");
    }

    if (!isRecord(body)) throw new ApiInputError("Request body must be a JSON object");

    const keys = Object.keys(body);
    if (keys.length !== 1 || keys[0] !== "permissions") {
      throw new ApiInputError("Body must contain exactly the permissions field");
    }
    if (!Array.isArray(body.permissions)) {
      throw new ApiInputError("permissions must be an array");
    }

    const role = await getRoleService().updateRolePermissions(
      roleId,
      body.permissions,
      actor.id
    );
    return json(role, 200);
  } catch (error) {
    return handleError(error);
  }
}
