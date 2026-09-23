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
    const body = await parseJsonBody(request);
    const validated = validatePublishedRevisionActionBody(body);

    const service = getContentLifecycleService();
    const result = await service.unpublish({
      actorId: user.id,
      projectId,
      pageId,
      expectedPublishedRevisionId: validated.expectedPublishedRevisionId,
    });

    return jsonSuccess({
      pageId: result.page.id,
      unpublishedRevisionId: result.unpublishedRevision.id,
      draftRevisionId: result.draftRevision.id,
      createdDraft: result.createdDraft,
      publishedRevisionId: result.page.publishedRevisionId,
    }, 200);
  } catch (err: unknown) {
    return handleApiError(err);
  }
}
