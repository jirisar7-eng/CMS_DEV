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
  validateUpdateDraftBody,
} from '@/lib/domain/pages-api';
import { resolveProjectEntitlementsServer } from '@/lib/composer/entitlements.server';
import { validateCanonicalContent } from '@/lib/composer/adapter';

export async function PATCH(
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
    const validated = validateUpdateDraftBody(body);

    if (validated.content) {
      const entitlements = await resolveProjectEntitlementsServer(projectId);
      validated.content = validateCanonicalContent(validated.content, entitlements);
    }

    const service = getContentLifecycleService();
    const result = await service.updateDraft({
      actorId,
      projectId,
      pageId,
      ...validated,
    });

    return jsonSuccess(
      {
        pageId: result.page.id,
        revisionId: result.revision.id,
        revisionNumber: result.revision.revisionNumber,
        lockVersion: result.revision.lockVersion,
        status: result.revision.status,
      },
      200
    );
  } catch (err: unknown) {
    return handleApiError(err);
  }
}
