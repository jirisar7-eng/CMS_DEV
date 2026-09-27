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

function noContent() {
  return new NextResponse(null, {
    status: 204,
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

function parseProjectId(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  return validateId(raw, "Project ID");
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

function readProjectQuery(request: NextRequest): string | undefined {
  const { searchParams } = new URL(request.url);
  for (const key of searchParams.keys()) {
    if (key !== "projectId") throw new ApiInputError(`Unexpected query parameter: ${key}`);
  }
  if (!searchParams.has("projectId")) return undefined;
  return validateId(searchParams.get("projectId"), "Project ID");
}

type Context = { params: Promise<{ userId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const actor = await requireAuthenticatedUser();
    const { userId: rawUserId } = await context.params;
    const userId = validateId(rawUserId, "User ID");
    const projectId = readProjectQuery(request);

    const overrides = await getRoleService().listUserOverrides(
      userId,
      projectId,
      actor.id
    );
    return json(overrides, 200);
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: NextRequest, context: Context) {
  try {
    validateMutationOrigin(request);
    const actor = await requireAuthenticatedUser();
    const { userId: rawUserId } = await context.params;
    const userId = validateId(rawUserId, "User ID");

    const body = await readBody(request);
    assertAllowedKeys(body, ["permissionKey", "isGranted", "projectId"]);

    if (typeof body.permissionKey !== "string") {
      throw new ApiInputError("permissionKey is required and must be a string");
    }
    if (typeof body.isGranted !== "boolean") {
      throw new ApiInputError("isGranted is required and must be a boolean");
    }

    const projectId = parseProjectId(body.projectId);

    const override = await getRoleService().setUserOverride(
      userId,
      body.permissionKey,
      body.isGranted,
      projectId,
      actor.id
    );
    return json(override, 200);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    validateMutationOrigin(request);
    const actor = await requireAuthenticatedUser();
    const { userId: rawUserId } = await context.params;
    const userId = validateId(rawUserId, "User ID");

    const body = await readBody(request);
    assertAllowedKeys(body, ["permissionKey", "projectId"]);

    if (typeof body.permissionKey !== "string") {
      throw new ApiInputError("permissionKey is required and must be a string");
    }

    const projectId = parseProjectId(body.projectId);

    await getRoleService().removeUserOverride(
      userId,
      body.permissionKey,
      projectId,
      actor.id
    );
    return noContent();
  } catch (error) {
    return handleError(error);
  }
}
