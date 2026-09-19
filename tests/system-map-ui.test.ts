// @ts-nocheck
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import {
  resolveBasicSystemMap,
  resolveInternalSystemMap,
} from '../lib/domain/system-map/resolver';

let mockSessionUser: { id: string; email: string; displayName: string | null; status: string } | null = null;
let mockPermissions: Record<string, boolean> = {};

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === 'next/headers') {
    return {
      cookies: async () => ({
        get: () => undefined,
        set: () => {},
        delete: () => {},
      }),
    };
  }
  if (id.includes('lib/auth/session')) {
    return {
      getSession: async () => ({
        session: mockSessionUser ? { id: 'sess-123', userId: mockSessionUser.id, expiresAt: new Date(Date.now() + 86400000) } : null,
        user: mockSessionUser,
      }),
    };
  }
  if (id.includes('lib/auth/rbac')) {
    return {
      hasPermission: async (userId: string, permissionKey: string) => !!mockPermissions[permissionKey],
    };
  }
  if (id.startsWith('@/')) {
    const relativePath = id.slice(2);
    return originalRequire.call(this, path.resolve(__dirname, '..', relativePath));
  }
  return originalRequire.apply(this, arguments as any);
};

const SystemMapPage = require('../app/admin/system-map/page').default;

describe('SYN-SYSTEM-MAP-002: System Map UI & Security Boundary Coverage', () => {
  const rootDir = path.resolve(__dirname, '..');

  const basicViewCode = fs.readFileSync(
    path.join(rootDir, 'components/admin/system-map/BasicSystemMapView.tsx'),
    'utf8'
  );
  const internalViewCode = fs.readFileSync(
    path.join(rootDir, 'components/admin/system-map/InternalSystemMapView.tsx'),
    'utf8'
  );
  const workspaceCode = fs.readFileSync(
    path.join(rootDir, 'components/admin/system-map/SystemMapWorkspace.tsx'),
    'utf8'
  );
  const lineageCode = fs.readFileSync(
    path.join(rootDir, 'components/admin/system-map/LineageHistoryTab.tsx'),
    'utf8'
  );
  const pageCode = fs.readFileSync(
    path.join(rootDir, 'app/admin/system-map/page.tsx'),
    'utf8'
  );

  beforeEach(() => {
    mockSessionUser = null;
    mockPermissions = {};
  });

  describe('1. Basic View Structural Isolation & Redaction', () => {
    it('resolveBasicSystemMap returns only safe BasicSystemMap schema', () => {
      const basicData = resolveBasicSystemMap();
      assert.strictEqual(basicData.view, 'basic');
      assert.ok(Array.isArray(basicData.capabilities));
      assert.strictEqual(typeof basicData.total_capabilities, 'number');

      for (const cap of basicData.capabilities) {
        assert.strictEqual(cap.canonical_owner_paths, undefined);
        assert.strictEqual(cap.data_models, undefined);
        assert.strictEqual(cap.api_boundaries, undefined);
        assert.strictEqual(cap.security_boundary, undefined);
        assert.strictEqual(cap.source_tasks, undefined);
        assert.strictEqual(cap.last_merge_sha, undefined);
      }
      assert.strictEqual(basicData.tasks, undefined);
    });

    it('BasicSystemMapView code strictly avoids referencing internal sensitive fields', () => {
      assert.doesNotMatch(basicViewCode, /canonical_owner_paths/);
      assert.doesNotMatch(basicViewCode, /data_models/);
      assert.doesNotMatch(basicViewCode, /api_boundaries/);
      assert.doesNotMatch(basicViewCode, /security_boundary/);
      assert.doesNotMatch(basicViewCode, /source_tasks/);
      assert.doesNotMatch(basicViewCode, /last_merge_sha/);
      assert.doesNotMatch(basicViewCode, /tasks/);
    });
  });

  describe('2. Internal View Capabilities & Fidelity', () => {
    it('resolveInternalSystemMap returns full InternalSystemMap schema', () => {
      const internalData = resolveInternalSystemMap();
      assert.strictEqual(internalData.view, 'internal');
      assert.ok(Array.isArray(internalData.capabilities));
      assert.ok(Array.isArray(internalData.tasks));
      assert.strictEqual(typeof internalData.total_capabilities, 'number');
      assert.strictEqual(typeof internalData.total_tasks, 'number');

      for (const cap of internalData.capabilities) {
        assert.ok(Array.isArray(cap.canonical_owner_paths));
        assert.ok(Array.isArray(cap.data_models));
        assert.ok(Array.isArray(cap.api_boundaries));
        assert.strictEqual(typeof cap.security_boundary, 'string');
      }
    });

    it('InternalSystemMapView references canonical owner paths, data models, and API boundaries', () => {
      assert.match(internalViewCode, /canonical_owner_paths/);
      assert.match(internalViewCode, /data_models/);
      assert.match(internalViewCode, /api_boundaries/);
      assert.match(internalViewCode, /security_boundary/);
    });
  });

  describe('3. Workspace Component Pure Prop Execution (No Client Fetch)', () => {
    it('SystemMapWorkspace does not perform client-side fetching', () => {
      assert.doesNotMatch(workspaceCode, /\bfetch\s*\(/);
      assert.doesNotMatch(workspaceCode, /axios/);
      assert.doesNotMatch(workspaceCode, /useSWR/);
      assert.doesNotMatch(workspaceCode, /useQuery/);
    });
  });

  describe('4. Server Page Authorization & Security Boundary (Behavioral Test)', () => {
    it('app/admin/system-map/page.tsx enforces dynamic server-side evaluation', () => {
      assert.match(pageCode, /export const dynamic = ['"]force-dynamic['"]/);
      assert.match(pageCode, /export const revalidate = 0/);
    });

    it('denied user (unauthenticated, inactive, or lacking permissions) → denied output', async () => {
      // 1. Unauthenticated user
      mockSessionUser = null;
      mockPermissions = {};
      const unauthResult = await SystemMapPage();
      assert.strictEqual(unauthResult.type, 'div');

      // 2. Inactive user
      mockSessionUser = { id: 'usr-1', email: 'test@example.com', displayName: 'Test', status: 'INACTIVE' };
      const inactiveResult = await SystemMapPage();
      assert.strictEqual(inactiveResult.type, 'div');

      // 3. Active user lacking system_map permissions
      mockSessionUser = { id: 'usr-1', email: 'test@example.com', displayName: 'Test', status: 'ACTIVE' };
      mockPermissions = { 'system_map.read_basic': false, 'system_map.read_internal': false };
      const noPermResult = await SystemMapPage();
      assert.strictEqual(noPermResult.type, 'div');
    });

    it('basic permission user → pouze basic dataset', async () => {
      mockSessionUser = { id: 'usr-2', email: 'basic@example.com', displayName: 'Basic User', status: 'ACTIVE' };
      mockPermissions = { 'system_map.read_basic': true, 'system_map.read_internal': false };

      const pageResult = await SystemMapPage();
      assert.strictEqual(pageResult.props.accessLevel, 'basic');

      const data = pageResult.props.data;
      assert.strictEqual(data.view, 'basic');
      assert.strictEqual(data.tasks, undefined);
      assert.ok(Array.isArray(data.capabilities));

      for (const cap of data.capabilities) {
        assert.strictEqual(cap.canonical_owner_paths, undefined);
        assert.strictEqual(cap.data_models, undefined);
        assert.strictEqual(cap.api_boundaries, undefined);
        assert.strictEqual(cap.security_boundary, undefined);
        assert.strictEqual(cap.source_tasks, undefined);
        assert.strictEqual(cap.last_merge_sha, undefined);
      }
    });

    it('internal permission user → internal dataset', async () => {
      mockSessionUser = { id: 'usr-3', email: 'internal@example.com', displayName: 'Internal Admin', status: 'ACTIVE' };
      mockPermissions = { 'system_map.read_internal': true, 'system_map.read_basic': true };

      const pageResult = await SystemMapPage();
      assert.strictEqual(pageResult.props.accessLevel, 'internal');

      const data = pageResult.props.data;
      assert.strictEqual(data.view, 'internal');
      assert.ok(Array.isArray(data.tasks));
      assert.ok(typeof data.total_tasks === 'number');
      assert.ok(Array.isArray(data.capabilities));

      for (const cap of data.capabilities) {
        assert.ok(Array.isArray(cap.canonical_owner_paths));
        assert.ok(Array.isArray(cap.data_models));
        assert.ok(Array.isArray(cap.api_boundaries));
        assert.strictEqual(typeof cap.security_boundary, 'string');
      }
    });

    it('denial text in page.tsx does not leak internal permission keys', () => {
      const pTags = pageCode.match(/<p className=[^>]*>([\s\S]*?)<\/p>/g) || [];
      const combinedPText = pTags.join(' ');
      assert.doesNotMatch(combinedPText, /system_map\.read_basic/);
      assert.doesNotMatch(combinedPText, /system_map\.read_internal/);
      assert.match(combinedPText, /Nemáte oprávnění k této části administrace/);
    });
  });

  describe('5. Lineage UI Truthfulness', () => {
    it('LineageHistoryTab uses real MERGED derived status and omits fake VERIFIED status', () => {
      assert.match(lineageCode, /MERGED/);
      assert.doesNotMatch(lineageCode, /VERIFIED/);
    });

    it('LineageHistoryTab labels capsule tasks truthfully as historical tasks with capsule', () => {
      assert.match(lineageCode, /Historické úlohy s kapslí/);
      assert.doesNotMatch(lineageCode, /Aktivní kapsle/);
    });
  });
});
