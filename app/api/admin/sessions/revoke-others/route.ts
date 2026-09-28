import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { validateMutationOrigin } from "@/lib/domain/pages-api/origin";
import { getSessionService } from "@/lib/domain/sessions/service";
import { mapSessionErrorToResponse } from "@/lib/domain/sessions/contracts";

function formatErrorResponse(code: string, message: string, status: number): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        status,
      },
    },
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}

function handleRouteError(err: unknown): NextResponse {
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
  if (err instanceof Error && err.message === "CSRF_REJECTED") {
    return formatErrorResponse("CSRF_REJECTED", "Cross-origin request rejected", 403);
  }
  const mapped = mapSessionErrorToResponse(err);
  return NextResponse.json(mapped.body, {
    status: mapped.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    validateMutationOrigin(request);

    const sessionService = getSessionService();
    const result = await sessionService.revokeOtherSessions();

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    return handleRouteError(err);
  }
}
