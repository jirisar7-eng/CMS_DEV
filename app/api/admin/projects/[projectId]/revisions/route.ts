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

    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get("pageId") || undefined;

    const service = getContentLifecycleService();
    const revisions = await service.listRevisions({ actorId, projectId, pageId });

    return jsonSuccess({ revisions }, 200);
  } catch (err: unknown) {
    return handleApiError(err);
  }
}
