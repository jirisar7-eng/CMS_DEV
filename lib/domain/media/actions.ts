'use server';

import { mediaService } from './service';
import { MediaMetadata, MediaStatus, MediaFilterOptions } from './types';

export async function uploadAssetAction(formData: FormData) {
  const file = formData.get('file') as File;
  const projectId = formData.get('projectId') as string || 'default-project';
  const title = formData.get('title') as string || file.name;
  const altText = formData.get('altText') as string || '';
  const description = formData.get('description') as string || '';
  const tagsStr = formData.get('tags') as string || '';
  
  if (!file) {
    throw new Error('No file provided');
  }

  const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
  const metadata: MediaMetadata = {
    title,
    altText,
    description,
    tags
  };

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const asset = await mediaService.uploadAsset(
    { name: file.name, type: file.type, size: file.size, data: buffer },
    metadata,
    projectId
  );

  return asset;
}

export async function listAssetsAction(filters?: MediaFilterOptions) {
  return mediaService.listAssets(filters);
}

export async function getAssetAction(id: string) {
  return mediaService.getAsset(id);
}

export async function updateMetadataAction(id: string, metadata: Partial<MediaMetadata>) {
  return mediaService.updateMetadata(id, metadata);
}

export async function changeStatusAction(id: string, status: MediaStatus) {
  return mediaService.changeStatus(id, status);
}

export async function deleteAssetAction(id: string) {
  return mediaService.deleteAsset(id);
}
