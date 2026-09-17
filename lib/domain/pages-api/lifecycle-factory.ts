import 'server-only';
import {
  ContentLifecycleService,
  getContentLifecycleService as getDefaultLifecycleService,
} from '@/lib/domain/content/lifecycle';

let lifecycleServiceOverrideForTesting: ContentLifecycleService | null = null;

export function getContentLifecycleService(): ContentLifecycleService {
  if (lifecycleServiceOverrideForTesting) {
    return lifecycleServiceOverrideForTesting;
  }
  return getDefaultLifecycleService();
}

export function setContentLifecycleServiceForTesting(
  service: ContentLifecycleService | null
): void {
  lifecycleServiceOverrideForTesting = service;
}
