'use server';

import { MediaFilterOptions, MediaAsset } from '@/lib/domain/media/types';

export async function listMediaAssets(filters: MediaFilterOptions): Promise<{ data: MediaAsset[], error?: string }> {
  // FAIL-CLOSED SECURITY BOUNDARY:
  // Admin auth boundary is missing. Unauthenticated users cannot read private media.
  // Returning empty array and an explicit error.
  return { 
    data: [], 
    error: 'Přístup k neveřejným médiím vyžaduje přihlášení správce.'
  };
}
