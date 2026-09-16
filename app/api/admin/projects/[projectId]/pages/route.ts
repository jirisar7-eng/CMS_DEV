import 'server-only';
import { NextRequest } from 'next/server';
import {
  getAdminPagesService,
  handleApiError,
  jsonSuccess,
  parseListQueryParams,
  requireAuthenticatedUser,
  validateProjectId,
} from '@/lib/domain/pages-api';

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
    const { view, criteria } = parseListQueryParams(searchParams);

    const service = getAdminPagesService();

    if (view === 'tree') {
      const tree = await service.getPageTree({
        actorId,
        projectId,
      });
      return jsonSuccess(tree);
    }

    const pages = await service.getPages({
      actorId,
      projectId,
      criteria,
    });
    return jsonSuccess(pages);
  } catch (err: unknown) {
    return handleApiError(err);
  }
}
