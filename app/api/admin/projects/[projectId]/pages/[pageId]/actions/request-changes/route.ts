import 'server-only';
import { NextRequest } from 'next/server';
import {
  getContentLifecycleService,
  handleApiError,
  jsonSuccess,
  parseJsonBody,
  requireAuthenticatedUser,
  validateActionBody,
  validateMutationOrigin,
  validatePageId,
  validateProjectId,
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
    const validated = validateActionBody(body);

    const service = getContentLifecycleService();
    const result = await service.requestChanges({
      actorId,
      projectId,
      pageId,
      expectedLockVersion: validated.expectedLockVersion,
    });

    return jsonSuccess(
      {
        pageId: result.page.id,
        reviewRevisionId: result.reviewRevision.id,
        draft: {
          revisionId: result.newDraftRevision.id,
          revisionNumber: result.newDraftRevision.revisionNumber,
          lockVersion: result.newDraftRevision.lockVersion,
          status: result.newDraftRevision.status,
          derivedFromRevisionId: result.newDraftRevision.derivedFromRevisionId,
        },
      },
      200
    );
  } catch (err: unknown) {
    return handleApiError(err);
  }
}
