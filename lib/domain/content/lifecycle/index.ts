import { hasPermission as rbacHasPermission } from '@/lib/auth/rbac';
import { PrismaContentLifecycleStore } from './prisma-store';
import {
  ContentLifecycleService,
  ContentLifecycleServiceDependencies,
} from './service';

export * from './types';
export * from './store';
export * from './prisma-store';
export * from './service';

export function createContentLifecycleService(
  dependencies?: Partial<ContentLifecycleServiceDependencies>
): ContentLifecycleService {
  return new ContentLifecycleService({
    store: dependencies?.store ?? new PrismaContentLifecycleStore(),
    hasPermission: dependencies?.hasPermission ?? rbacHasPermission,
  });
}

let defaultService: ContentLifecycleService | null = null;

export function getContentLifecycleService(): ContentLifecycleService {
  if (!defaultService) {
    defaultService = createContentLifecycleService();
  }
  return defaultService;
}
