import 'server-only';
import { PrismaAdminPagesReadStore } from '../pages-persistence/prisma-store';
import { AdminPagesService } from '../pages-persistence/service';

let adminPagesServiceInstance: AdminPagesService | null = null;

export function getAdminPagesService(): AdminPagesService {
  if (!adminPagesServiceInstance) {
    const store = new PrismaAdminPagesReadStore();
    adminPagesServiceInstance = new AdminPagesService(store);
  }
  return adminPagesServiceInstance;
}

export function setAdminPagesServiceForTesting(
  service: AdminPagesService | null
): void {
  adminPagesServiceInstance = service;
}

