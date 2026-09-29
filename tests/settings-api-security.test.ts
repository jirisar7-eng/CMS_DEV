import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SettingsService,
  SettingsAuthorizationError,
  SettingsNotFoundError,
  SettingsValidationError,
  SettingsStore,
} from '../lib/domain/settings';

function createMockStore(initialData?: {
  system?: Array<{ key: string; value: any }>;
  project?: Array<{ projectId: string; key: string; value: any }>;
  projects?: Array<{ id: string; status: string }>;
}): { store: SettingsStore; auditLogs: any[] } {
  const systemMap = new Map<string, any>(
    initialData?.system?.map((s) => [s.key, s.value]) || []
  );
  const projectMap = new Map<string, any>(
    initialData?.project?.map((p) => [`${p.projectId}:${p.key}`, p.value]) || []
  );
  const projectsList = initialData?.projects || [
    { id: 'proj-1', status: 'ACTIVE' },
    { id: 'proj-2', status: 'ACTIVE' },
  ];
  const auditLogs: any[] = [];

  const store: SettingsStore = {
    systemSetting: {
      async findMany() {
        return Array.from(systemMap.entries()).map(([key, value]) => ({ key, value }));
      },
      async upsert({ where, create, update }) {
        const val = update.value ?? create.value;
        systemMap.set(where.key, val);
        return { key: where.key, value: val };
      },
    },
    projectSetting: {
      async findMany({ where }) {
        const res: any[] = [];
        for (const [k, v] of projectMap.entries()) {
          if (k.startsWith(`${where.projectId}:`)) {
            const key = k.split(':')[1];
            res.push({ key, value: v });
          }
        }
        return res;
      },
      async upsert({ where, create, update }) {
        const { projectId, key } = where.projectId_key;
        const val = update.value ?? create.value;
        projectMap.set(`${projectId}:${key}`, val);
        return { projectId, key, value: val };
      },
    },
    project: {
      async findUnique({ where }) {
        return projectsList.find((p) => p.id === where.id) || null;
      },
    },
    async $transaction(fn) {
      return fn({
        systemSetting: store.systemSetting,
        projectSetting: store.projectSetting,
      });
    },
  };

  return { store, auditLogs };
}

test('Settings Authorization: SYSTEM settings require authentication and system.manage', async () => {
  const { store } = createMockStore();

  // 1. Unauthenticated
  const serviceUnauth = new SettingsService(store, async () => false);
  await assert.rejects(
    async () => serviceUnauth.getSystemSettings(''),
    (err: any) => err instanceof SettingsAuthorizationError
  );

  // 2. Authenticated user without system.manage
  const serviceNoPerm = new SettingsService(store, async (_u, perm) => perm !== 'system.manage');
  await assert.rejects(
    async () => serviceNoPerm.getSystemSettings('user-1'),
    (err: any) => err instanceof SettingsAuthorizationError
  );

  // 3. User with system.manage
  const serviceAllowed = new SettingsService(store, async (_u, perm) => perm === 'system.manage');
  const settings = await serviceAllowed.getSystemSettings('user-admin');
  assert.equal(settings['system.instance_name'], 'Synthesis CMS');
});

test('Settings Authorization: PROJECT settings require projects.manage scoped to exact projectId', async () => {
  const { store } = createMockStore();

  // User has projects.manage for proj-1 only
  const service = new SettingsService(store, async (_u, perm, projId) => {
    return perm === 'projects.manage' && projId === 'proj-1';
  });

  // Access to proj-1 succeeds
  const proj1Settings = await service.getProjectSettings('proj-1', 'user-editor');
  assert.equal(proj1Settings['project.default_locale'], 'cs');

  // IDOR / Access to proj-2 is forbidden
  await assert.rejects(
    async () => service.getProjectSettings('proj-2', 'user-editor'),
    (err: any) => err instanceof SettingsAuthorizationError
  );
});

test('Settings Service: non-existent project returns SettingsNotFoundError', async () => {
  const { store } = createMockStore();
  const service = new SettingsService(store, async () => true);

  await assert.rejects(
    async () => service.getProjectSettings('non-existent-proj', 'user-admin'),
    (err: any) => err instanceof SettingsNotFoundError
  );
});

test('Settings Service: update rejects invalid payloads with SettingsValidationError', async () => {
  const { store } = createMockStore();
  const service = new SettingsService(store, async () => true);

  await assert.rejects(
    async () => service.updateSystemSettings('user-admin', { 'system.default_locale': 'invalid' }),
    (err: any) => err instanceof SettingsValidationError
  );
});
