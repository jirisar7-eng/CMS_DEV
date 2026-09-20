import "server-only";
import { NextRequest } from "next/server";
import {
  ApiError,
  handleApiError,
  jsonSuccess,
  requireAuthenticatedUser,
  validateProjectId,
} from "@/lib/domain/pages-api";
import { getActiveProjectContext } from "@/lib/domain/pages-client/server-context";
import { getAuditService } from "@/lib/domain/audit";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId: rawProjectId } = await context.params;
    const projectId = validateProjectId(rawProjectId);
    const user = await requireAuthenticatedUser();
    const projectContext = await getActiveProjectContext(projectId);

    if (
      projectContext.status !== "PROJECT_VALID" ||
      !projectContext.projectId ||
      projectContext.projectId !== projectId
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

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || undefined;
    const resourceType = searchParams.get("resourceType") || undefined;
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;
    const page = searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : 1;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 20;

    const service = getAuditService();
    const result = await service.listAuditLogs(
      {
        projectId: projectContext.projectId,
        action,
        resourceType,
        from,
        to,
        page,
        limit,
      },
      user.id
    );

    return jsonSuccess(result, 200);
  } catch (err: unknown) {
    return handleApiError(err);
  }
}
