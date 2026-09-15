'use server';

import { mediaService } from '@/lib/domain/media/service';
import { MediaFilterOptions } from '@/lib/domain/media/types';

export async function listMediaAssets(filters: MediaFilterOptions) {
  // Returns all assets from DB (including QUARANTINED, DRAFT, etc.)
  const assets = await mediaService.listAssets(filters);
  return assets;
}
