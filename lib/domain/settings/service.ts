import {
  SettingsScope,
  SettingsError,
  SettingsAuthorizationError,
  SettingsNotFoundError,
} from './contracts';
import { getScopeDefaults } from './registry';
import { validateSettingsPayload } from './validation';

export interface SettingsStore {
  systemSetting: {
    findMany(): Promise<Array<{ key: string; value: any }>>;
    upsert(args: {
      where: { key: string };
      create: { key: string; value: any };
      update: { value: any };
    }): Promise<any>;
  };
  projectSetting: {
    findMany(args: { where: { projectId: string } }): Promise<Array<{ key: string; value: any }>>;
    upsert(args: {
      where: { projectId_key: { projectId: string; key: string } };
      create: { projectId: string; key: string; value: any };
      update: { value: any };
    }): Promise<any>;
  };
  project: {
    findUnique(args: { where: { id: string } }): Promise<{ id: string; status: string } | null>;
  };
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
}

export class SettingsService {
  private store: SettingsStore | null = null;
  private checkPermissionFn?: (
    userId: string,
    permission: any,
    projectId?: string | null
  ) => Promise<boolean>;

  constructor(
    store?: SettingsStore,
    checkPermissionFn?: (userId: string, permission: any, projectId?: string | null) => Promise<boolean>
  ) {
    if (store) {
      this.store = store;
    }
    this.checkPermissionFn = checkPermissionFn;
  }

  private async getStore(): Promise<SettingsStore> {
    if (this.store) {
      return this.store;
    }
    const { prisma } = await import('@/lib/db');
    return prisma as unknown as SettingsStore;
  }

  private async checkPermission(
    userId: string,
    permission: string,
    projectId?: string | null
  ): Promise<boolean> {
    if (this.checkPermissionFn) {
      return this.checkPermissionFn(userId, permission as any, projectId);
    }
    const { hasPermission } = await import('@/lib/auth/rbac');
    return hasPermission(userId, permission as any, projectId);
  }

  /**
   * Reads SYSTEM settings. Defaults are merged with persistent records.
   */
  async getSystemSettings(userId: string): Promise<Record<string, unknown>> {
    if (!userId) {
      throw new SettingsAuthorizationError('Authentication required');
    }
    const canManage = await this.checkPermission(userId, 'system.manage', null);
    if (!canManage) {
      throw new SettingsAuthorizationError('system.manage permission required for system settings');
    }

    const defaults = getScopeDefaults('SYSTEM');
    const store = await this.getStore();
    const records = await store.systemSetting.findMany();
    const result = { ...defaults };
    for (const rec of records) {
      result[rec.key] = rec.value;
    }
    return result;
  }

  /**
   * Updates SYSTEM settings transactionally with audit log.
   */
  async updateSystemSettings(
    userId: string,
    payload: unknown
  ): Promise<Record<string, unknown>> {
    if (!userId) {
      throw new SettingsAuthorizationError('Authentication required');
    }
    const canManage = await this.checkPermission(userId, 'system.manage', null);
    if (!canManage) {
      throw new SettingsAuthorizationError('system.manage permission required to update system settings');
    }

    const { sanitizedSettings, changedKeys } = validateSettingsPayload('SYSTEM', payload);
    const store = await this.getStore();

    await store.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(sanitizedSettings)) {
        await tx.systemSetting.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        });
      }

      const { logAudit } = await import('@/lib/auth/audit');
      await logAudit({
        action: 'SYSTEM_SETTINGS_UPDATED',
        scopeType: 'SYSTEM',
        scopeId: null,
        resourceType: 'SystemSetting',
        actorId: userId,
        metadata: {
          changedKeys,
          count: changedKeys.length,
        },
        tx,
      });
    });

    return this.getSystemSettings(userId);
  }

  /**
   * Reads PROJECT settings strictly scoped to projectId.
   */
  async getProjectSettings(
    projectId: string,
    userId: string
  ): Promise<Record<string, unknown>> {
    if (!userId) {
      throw new SettingsAuthorizationError('Authentication required');
    }
    if (!projectId || typeof projectId !== 'string') {
      throw new SettingsError('INVALID_PROJECT_ID', 'Project ID is required', 400);
    }

    const store = await this.getStore();
    const project = await store.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new SettingsNotFoundError(`Project '${projectId}' not found`);
    }

    const canManage = await this.checkPermission(userId, 'projects.manage', projectId);
    if (!canManage) {
      throw new SettingsAuthorizationError('projects.manage permission required for project settings');
    }

    const defaults = getScopeDefaults('PROJECT');
    const records = await store.projectSetting.findMany({ where: { projectId } });
    const result = { ...defaults };
    for (const rec of records) {
      result[rec.key] = rec.value;
    }
    return result;
  }

  /**
   * Updates PROJECT settings transactionally with audit log and strict isolation.
   */
  async updateProjectSettings(
    projectId: string,
    userId: string,
    payload: unknown
  ): Promise<Record<string, unknown>> {
    if (!userId) {
      throw new SettingsAuthorizationError('Authentication required');
    }
    if (!projectId || typeof projectId !== 'string') {
      throw new SettingsError('INVALID_PROJECT_ID', 'Project ID is required', 400);
    }

    const store = await this.getStore();
    const project = await store.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new SettingsNotFoundError(`Project '${projectId}' not found`);
    }

    const canManage = await this.checkPermission(userId, 'projects.manage', projectId);
    if (!canManage) {
      throw new SettingsAuthorizationError('projects.manage permission required to update project settings');
    }

    const { sanitizedSettings, changedKeys } = validateSettingsPayload('PROJECT', payload);

    await store.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(sanitizedSettings)) {
        await tx.projectSetting.upsert({
          where: { projectId_key: { projectId, key } },
          create: { projectId, key, value },
          update: { value },
        });
      }

      const { logAudit } = await import('@/lib/auth/audit');
      await logAudit({
        action: 'PROJECT_SETTINGS_UPDATED',
        scopeType: 'PROJECT',
        scopeId: projectId,
        resourceType: 'ProjectSetting',
        actorId: userId,
        metadata: {
          projectId,
          changedKeys,
          count: changedKeys.length,
        },
        tx,
      });
    });

    return this.getProjectSettings(projectId, userId);
  }
}

let settingsServiceInstance: SettingsService | null = null;

export function getSettingsService(): SettingsService {
  if (!settingsServiceInstance) {
    settingsServiceInstance = new SettingsService();
  }
  return settingsServiceInstance;
}
