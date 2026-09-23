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
  validateSchedulePublishBody,
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
    const validated = validateSchedulePublishBody(body);

    const service = getContentLifecycleService();
    const result = await service.schedulePublish({
      actorId: user.id,
      projectId,
      pageId,
      expectedLockVersion: validated.expectedLockVersion,
      publishAt: validated.publishAt,
    });

    return jsonSuccess({
      pageId: result.page.id,
      revisionId: result.revision.id,
      lockVersion: result.revision.lockVersion,
      scheduledRevisionId: result.page.scheduledRevisionId,
      scheduledPublishAt: result.page.scheduledPublishAt,
    }, 200);
  } catch (err: unknown) {
    return handleApiError(err);
  }
}
