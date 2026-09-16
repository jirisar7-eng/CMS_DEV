import 'server-only';
import { NextRequest } from 'next/server';
import { AdminPagesPersistenceError } from '@/lib/domain/pages-persistence/types';
import {
  getAdminPagesService,
  handleApiError,
  jsonSuccess,
  requireAuthenticatedUser,
  validatePageId,
  validateProjectId,
} from '@/lib/domain/pages-api';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ projectId: string; pageId: string }> }
) {
  try {
    const { projectId: rawProjectId, pageId: rawPageId } =
      await context.params;
    const projectId = validateProjectId(rawProjectId);
    const pageId = validatePageId(rawPageId);

    const user = await requireAuthenticatedUser();
    const actorId = user.id;

    const service = getAdminPagesService();
    const result = await service.getPageByIdWithLifecycle({
      actorId,
      projectId,
      pageId,
    });

    if (!result) {
      throw new AdminPagesPersistenceError('PAGE_NOT_FOUND', 'Page not found');
    }

    return jsonSuccess(result);
  } catch (err: unknown) {
    return handleApiError(err);
  }
}
