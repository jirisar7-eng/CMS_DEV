import "server-only";
import { NextRequest } from "next/server";
import {
  getContentLifecycleService,
  handleApiError,
  jsonSuccess,
  requireAuthenticatedUser,
  validateProjectId,
} from "@/lib/domain/pages-api";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId: rawProjectId } = await context.params;
    const projectId = validateProjectId(rawProjectId);
    const user = await requireAuthenticatedUser();
    const actorId = user.id;

    const service = getContentLifecycleService();
    const releases = await service.listReleases({ actorId, projectId });

    return jsonSuccess({ releases }, 200);
  } catch (err: unknown) {
    return handleApiError(err);
  }
}
