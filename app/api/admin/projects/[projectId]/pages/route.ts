import 'server-only';
import { NextRequest } from 'next/server';
import {
  getAdminPagesService,
  getContentLifecycleService,
  handleApiError,
  jsonSuccess,
  parseJsonBody,
  parseListQueryParams,
  requireAuthenticatedUser,
  validateCreatePageBody,
  validateMutationOrigin,
  validateProjectId,
} from '@/lib/domain/pages-api';
import { resolveProjectEntitlementsServer } from '@/lib/composer/entitlements.server';
import { validateCanonicalContent } from '@/lib/composer/adapter';

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

export const POST = async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  try {
    validateMutationOrigin(request);

    const { projectId: rawProjectId } = await context.params;
    const projectId = validateProjectId(rawProjectId);

    const user = await requireAuthenticatedUser();
    const actorId = user.id;

    const body = await parseJsonBody(request);
    const validated = validateCreatePageBody(body);

    const entitlements = await resolveProjectEntitlementsServer(projectId);
    const sanitizedContent = validateCanonicalContent(validated.content, entitlements);

    const service = getContentLifecycleService();
    const result = await service.createPageDraft({
      actorId,
      projectId,
      key: validated.key,
      title: validated.title,
      slug: validated.slug,
      locale: validated.locale,
      visibility: validated.visibility,
      content: sanitizedContent,
      parentId: validated.parentId,
      description: validated.description,
    });

    return jsonSuccess(
      {
        pageId: result.page.id,
        revisionId: result.revision.id,
        revisionNumber: result.revision.revisionNumber,
        lockVersion: result.revision.lockVersion,
        status: result.revision.status,
      },
      201
    );
  } catch (err: unknown) {
    return handleApiError(err);
  }
}
