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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertAllowedKeys(body: Record<string, unknown>, allowed: readonly string[]) {
  const set = new Set(allowed);
  for (const key of Object.keys(body)) {
    if (!set.has(key)) throw new ApiInputError(`Unexpected body field: ${key}`);
  }
}

async function readBody(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiInputError("Request body must be valid JSON");
  }
  if (!isRecord(body)) throw new ApiInputError("Request body must be a JSON object");
  return body;
}

export async function GET() {
  try {
    const actor = await requireAuthenticatedUser();
    const roles = await getRoleService().listRoles(actor.id);
    return json(roles, 200);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    validateMutationOrigin(request);
    const actor = await requireAuthenticatedUser();
    const body = await readBody(request);
    assertAllowedKeys(body, ["name", "description"]);

    if (typeof body.name !== "string") {
      throw new ApiInputError("name is required and must be a string");
    }
    if (
      body.description !== undefined &&
      body.description !== null &&
      typeof body.description !== "string"
    ) {
      throw new ApiInputError("description must be a string or null");
    }

    const role = await getRoleService().createRole(
      { name: body.name, description: body.description as string | null | undefined },
      actor.id
    );
    return json(role, 201);
  } catch (error) {
    return handleError(error);
  }
}
