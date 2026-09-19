'use server';

import { MediaFilterOptions, MediaAsset, MediaMetadata } from '@/lib/domain/media/types';
import { mediaService } from '@/lib/domain/media/service';
import { getActiveProjectContext } from '@/lib/domain/pages-client/server-context';
import { hasPermission } from '@/lib/auth/rbac';
import { isDatabaseConfigured } from '@/lib/runtime/database';

export interface ActionResponse<T> {
  data?: T;
  error?: string;
  code?: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'PROJECT_NOT_SELECTED' | 'NOT_FOUND' | 'INVALID_INPUT' | 'INTERNAL_ERROR';
}

/**
 * Lists media assets scoped to the active project context with RBAC media.view check.
 */
export async function listMediaAssets(filters?: MediaFilterOptions): Promise<ActionResponse<MediaAsset[]>> {
  if (!isDatabaseConfigured()) {
    return { error: 'Databáze není dostupná.', code: 'INTERNAL_ERROR' };
  }

  const context = await getActiveProjectContext();
  if (context.status === 'PROJECT_NOT_SELECTED' || !context.projectId) {
    return { error: 'Není vybrán žádný aktivní projekt.', code: 'PROJECT_NOT_SELECTED' };
  }
  if (context.status !== 'PROJECT_VALID' || !context.userId) {
    return { error: 'Nemáte přístup k tomuto projektu.', code: 'FORBIDDEN' };
  }

  const canView = await hasPermission(context.userId, 'media.view', context.projectId);
  if (!canView) {
    return { error: 'Nedostatečná oprávnění: vyžadováno media.view.', code: 'FORBIDDEN' };
  }

  try {
    const assets = await mediaService.listAssets(context.projectId, filters);
    return { data: assets };
  } catch (err: any) {
    console.error('listMediaAssets error:', err);
    return { error: err.message || 'Chyba při načítání médií.', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Gets a single media asset scoped to the active project with RBAC media.view check.
 */
export async function getMediaAsset(id: string): Promise<ActionResponse<MediaAsset>> {
  if (!isDatabaseConfigured()) {
    return { error: 'Databáze není dostupná.', code: 'INTERNAL_ERROR' };
  }

  const context = await getActiveProjectContext();
  if (context.status !== 'PROJECT_VALID' || !context.projectId || !context.userId) {
    return { error: 'Přístup odepřen nebo chybí projektový kontext.', code: 'FORBIDDEN' };
  }

  const canView = await hasPermission(context.userId, 'media.view', context.projectId);
  if (!canView) {
    return { error: 'Nedostatečná oprávnění: vyžadováno media.view.', code: 'FORBIDDEN' };
  }

  try {
    const asset = await mediaService.getAsset(id, context.projectId);
    if (!asset) {
      return { error: 'Médium nebylo nalezeno.', code: 'NOT_FOUND' };
    }
    return { data: asset };
  } catch (err: any) {
    console.error('getMediaAsset error:', err);
    return { error: err.message || 'Chyba při načítání média.', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Uploads a new media asset with FormData (real file bytes) scoped to the active project with media.create check.
 */
export async function uploadMediaAsset(formData: FormData): Promise<ActionResponse<MediaAsset>> {
  if (!isDatabaseConfigured()) {
    return { error: 'Databáze není dostupná.', code: 'INTERNAL_ERROR' };
  }

  const context = await getActiveProjectContext();
  if (context.status !== 'PROJECT_VALID' || !context.projectId || !context.userId) {
    return { error: 'Přístup odepřen nebo chybí projektový kontext.', code: 'FORBIDDEN' };
  }

  const canCreate = await hasPermission(context.userId, 'media.create', context.projectId);
  if (!canCreate) {
    return { error: 'Nedostatečná oprávnění: vyžadováno media.create.', code: 'FORBIDDEN' };
  }

  const file = formData.get('file') as File | null;
  if (!file || typeof file === 'string') {
    return { error: 'Nebyl nahrán žádný platný soubor.', code: 'INVALID_INPUT' };
  }

  const title = (formData.get('title') as string) || file.name;
  const altText = (formData.get('altText') as string) || '';
  const description = (formData.get('description') as string) || '';
  const author = (formData.get('author') as string) || '';
  const tagsRaw = (formData.get('tags') as string) || '';
  const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const metadata: MediaMetadata = {
      title,
      altText,
      description,
      author,
      tags,
    };

    const asset = await mediaService.uploadAsset(
      {
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        data: buffer,
      },
      metadata,
      context.projectId
    );

    return { data: asset };
  } catch (err: any) {
    console.error('uploadMediaAsset error:', err);
    return { error: err.message || 'Chyba při nahrávání média.', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Updates metadata of a media asset scoped to the active project with media.edit check.
 */
export async function updateMediaMetadata(
  id: string,
  metadata: Partial<MediaMetadata>
): Promise<ActionResponse<MediaAsset>> {
  if (!isDatabaseConfigured()) {
    return { error: 'Databáze není dostupná.', code: 'INTERNAL_ERROR' };
  }

  const context = await getActiveProjectContext();
  if (context.status !== 'PROJECT_VALID' || !context.projectId || !context.userId) {
    return { error: 'Přístup odepřen nebo chybí projektový kontext.', code: 'FORBIDDEN' };
  }

  const canEdit = await hasPermission(context.userId, 'media.edit', context.projectId);
  if (!canEdit) {
    return { error: 'Nedostatečná oprávnění: vyžadováno media.edit.', code: 'FORBIDDEN' };
  }

  try {
    const updated = await mediaService.updateMetadata(id, metadata, context.projectId);
    if (!updated) {
      return { error: 'Médium nebylo nalezeno.', code: 'NOT_FOUND' };
    }
    return { data: updated };
  } catch (err: any) {
    console.error('updateMediaMetadata error:', err);
    return { error: err.message || 'Chyba při ukládání metadat.', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Archives a media asset scoped to the active project with media.edit check.
 */
export async function archiveMediaAsset(id: string): Promise<ActionResponse<MediaAsset>> {
  if (!isDatabaseConfigured()) {
    return { error: 'Databáze není dostupná.', code: 'INTERNAL_ERROR' };
  }

  const context = await getActiveProjectContext();
  if (context.status !== 'PROJECT_VALID' || !context.projectId || !context.userId) {
    return { error: 'Přístup odepřen nebo chybí projektový kontext.', code: 'FORBIDDEN' };
  }

  const canEdit = await hasPermission(context.userId, 'media.edit', context.projectId);
  if (!canEdit) {
    return { error: 'Nedostatečná oprávnění: vyžadováno media.edit.', code: 'FORBIDDEN' };
  }

  try {
    const updated = await mediaService.changeStatus(id, 'ARCHIVED', context.projectId);
    if (!updated) {
      return { error: 'Médium nebylo nalezeno.', code: 'NOT_FOUND' };
    }
    return { data: updated };
  } catch (err: any) {
    console.error('archiveMediaAsset error:', err);
    return { error: err.message || 'Chyba při archivaci média.', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Restores a media asset from archive scoped to the active project with media.edit check.
 */
export async function restoreMediaAsset(id: string): Promise<ActionResponse<MediaAsset>> {
  if (!isDatabaseConfigured()) {
    return { error: 'Databáze není dostupná.', code: 'INTERNAL_ERROR' };
  }

  const context = await getActiveProjectContext();
  if (context.status !== 'PROJECT_VALID' || !context.projectId || !context.userId) {
    return { error: 'Přístup odepřen nebo chybí projektový kontext.', code: 'FORBIDDEN' };
  }

  const canEdit = await hasPermission(context.userId, 'media.edit', context.projectId);
  if (!canEdit) {
    return { error: 'Nedostatečná oprávnění: vyžadováno media.edit.', code: 'FORBIDDEN' };
  }

  try {
    const asset = await mediaService.getAsset(id, context.projectId);
    if (!asset) {
      return { error: 'Médium nebylo nalezeno.', code: 'NOT_FOUND' };
    }

    // Determine safe restore target status: SVG with pipeline evidence -> READY, otherwise QUARANTINED
    const isSvg = asset.mediaType === 'vector' || asset.mimeType === 'image/svg+xml';
    const targetStatus = isSvg && asset.security?.pipelineId ? 'READY' : 'QUARANTINED';

    const updated = await mediaService.changeStatus(id, targetStatus, context.projectId);
    return { data: updated };
  } catch (err: any) {
    console.error('restoreMediaAsset error:', err);
    return { error: err.message || 'Chyba při obnově média.', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Replaces media asset file (Disabled in this version - returns NOT_AVAILABLE without state mutation).
 */
export async function replaceMediaAsset(_formData: FormData): Promise<ActionResponse<MediaAsset>> {
  return {
    error: 'Nahrazení souboru zatím není v této verzi bezpečně dostupné.',
    code: 'INVALID_INPUT',
  };
}

/**
 * Deletes a media asset scoped to the active project with media.delete check.
 */
export async function deleteMediaAsset(id: string): Promise<ActionResponse<{ success: boolean }>> {
  if (!isDatabaseConfigured()) {
    return { error: 'Databáze není dostupná.', code: 'INTERNAL_ERROR' };
  }

  const context = await getActiveProjectContext();
  if (context.status !== 'PROJECT_VALID' || !context.projectId || !context.userId) {
    return { error: 'Přístup odepřen nebo chybí projektový kontext.', code: 'FORBIDDEN' };
  }

  const canDelete = await hasPermission(context.userId, 'media.delete', context.projectId);
  if (!canDelete) {
    return { error: 'Nedostatečná oprávnění: vyžadováno media.delete.', code: 'FORBIDDEN' };
  }

  try {
    await mediaService.deleteAsset(id, context.projectId);
    return { data: { success: true } };
  } catch (err: any) {
    console.error('deleteMediaAsset error:', err);
    return { error: err.message || 'Chyba při mazání média.', code: 'INTERNAL_ERROR' };
  }
}
