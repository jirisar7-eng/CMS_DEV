import "server-only";
import { NextRequest } from "next/server";
import {
  ApiError,
  getContentLifecycleService,
  handleApiError,
  jsonSuccess,
  requireAuthenticatedUser,
  validateProjectId,
} from "@/lib/domain/pages-api";
import { getActiveProjectContext } from "@/lib/domain/pages-client/server-context";

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

    const service = getContentLifecycleService();
    const releases = await service.listReleases({ actorId: user.id, projectId: projectContext.projectId });

    return jsonSuccess({ releases }, 200);
  } catch (err: unknown) {
    return handleApiError(err);
  }
}
