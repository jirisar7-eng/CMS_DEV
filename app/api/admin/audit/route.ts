import "server-only";
import { NextRequest } from "next/server";
import {
  jsonSuccess,
  requireAuthenticatedUser,
  validateProjectId,
  ApiError,
} from "@/lib/domain/pages-api";
import { getActiveProjectContext } from "@/lib/domain/pages-client/server-context";
import {
  getAuditService,
  handleAuditApiError,
  parseStrictPositiveInt,
  validateAuditScopeType,
  validateDateRange,
} from "@/lib/domain/audit";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    const { searchParams } = new URL(request.url);

    const rawProjectId = searchParams.get("projectId");
    let validatedProjectId: string | undefined = undefined;

    if (rawProjectId && rawProjectId.trim() !== "") {
      const projId = validateProjectId(rawProjectId);
      const projectContext = await getActiveProjectContext(projId);
      if (
        projectContext.status !== "PROJECT_VALID" ||
        !projectContext.projectId ||
        projectContext.projectId !== projId
      ) {
        if (projectContext.status === "PROJECT_NOT_FOUND") {
          throw new ApiError("PROJECT_NOT_FOUND", "Project not found", 404);
        }
        if (projectContext.status === "PROJECT_INACTIVE") {
          throw new ApiError("PROJECT_INACTIVE", "Project is inactive", 403);
        }
        if (projectContext.status === "PROJECT_NOT_SELECTED") {
          throw new ApiError("PROJECT_NOT_SELECTED", "Project not selected", 400);
        }
        throw new ApiError("PROJECT_FORBIDDEN", "Forbidden project access", 403);
      }
      validatedProjectId = projectContext.projectId;
    }

    const rawScopeType = searchParams.get("scopeType");
    const scopeType = validateAuditScopeType(rawScopeType) || (validatedProjectId ? "PROJECT" : "SYSTEM");

    const page = parseStrictPositiveInt(searchParams.get("page"), 1, "page");
    const limit = parseStrictPositiveInt(searchParams.get("limit"), 20, "limit");

    const action = searchParams.get("action") || undefined;
    const resourceType = searchParams.get("resourceType") || undefined;
    const rawFrom = searchParams.get("from") || undefined;
    const rawTo = searchParams.get("to") || undefined;

    const { fromDate, toDate } = validateDateRange(rawFrom, rawTo);

    const service = getAuditService();
    const result = await service.listAuditLogs(
      {
        projectId: validatedProjectId,
        scopeType,
        action,
        resourceType,
        from: fromDate,
        to: toDate,
        page,
        limit,
      },
      user.id
    );

    return jsonSuccess(result, 200);
  } catch (err: unknown) {
    return handleAuditApiError(err);
  }
}
