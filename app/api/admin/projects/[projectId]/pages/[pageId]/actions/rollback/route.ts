import 'server-only';
import { NextRequest } from 'next/server';
import {
  getContentLifecycleService,
  handleApiError,
  jsonSuccess,
  parseJsonBody,
  requireAuthenticatedUser,
  validateMutationOrigin,
  validatePageId,
  validateProjectId,
  validatePublishedRevisionActionBody,
} from '@/lib/domain/pages-api';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; pageId: string }> }
) {
  try {
    validateMutationOrigin(request);

    const { projectId: rawProjectId, pageId: rawPageId } = await context.params;
    const projectId = validateProjectId(rawProjectId);
    const pageId = validatePageId(rawPageId);

    const user = await requireAuthenticatedUser();
    const actorId = user.id;

    const body = await parseJsonBody(request);
    const validated = validatePublishedRevisionActionBody(body);

    const service = getContentLifecycleService();
    const result = await service.rollbackPublished({
      actorId,
      projectId,
      pageId,
      expectedPublishedRevisionId: validated.expectedPublishedRevisionId,
    });

    return jsonSuccess(
      {
        pageId: result.page.id,
        fromRevisionId: result.fromRevision.id,
        restoredRevisionId: result.restoredRevision.id,
        restoredRevisionNumber: result.restoredRevision.revisionNumber,
        status: 'PUBLISHED',
        rollbackReleaseId: result.rollbackRelease.id,
      },
      200
    );
  } catch (err: unknown) {
    return handleApiError(err);
  }
}
