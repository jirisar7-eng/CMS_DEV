import 'server-only';
import { NextRequest } from 'next/server';
import {
  getContentLifecycleService,
  handleApiError,
  jsonSuccess,
  parseJsonBody,
  requireAuthenticatedUser,
  validateCancelScheduleBody,
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
    const body = await parseJsonBody(request);
    const validated = validateCancelScheduleBody(body);

    const service = getContentLifecycleService();
    const result = await service.cancelScheduledPublish({
      actorId: user.id,
      projectId,
      pageId,
      expectedScheduledRevisionId: validated.expectedScheduledRevisionId,
      expectedScheduledPublishAt: validated.expectedScheduledPublishAt,
    });

    return jsonSuccess({
      pageId: result.page.id,
      scheduledRevisionId: result.page.scheduledRevisionId ?? null,
      scheduledPublishAt: result.page.scheduledPublishAt ?? null,
    }, 200);
  } catch (err: unknown) {
    return handleApiError(err);
  }
}
