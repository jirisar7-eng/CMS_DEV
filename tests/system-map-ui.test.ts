// @ts-nocheck
import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveBasicSystemMap,
  resolveInternalSystemMap,
} from '../lib/domain/system-map/resolver';

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

  describe('4. Server Page Authorization & Sanitization', () => {
    it('app/admin/system-map/page.tsx enforces dynamic server-side evaluation', () => {
      assert.match(pageCode, /export const dynamic = ['"]force-dynamic['"]/);
      assert.match(pageCode, /export const revalidate = 0/);
    });

    it('page.tsx selects internal or basic dataset server-side', () => {
      assert.match(pageCode, /canReadInternal\s*=\s*await\s+hasPermission/);
      assert.match(pageCode, /canReadBasic\s*=\s*canReadInternal\s*\|\|/);
      assert.match(pageCode, /resolveInternalSystemMap\(\)/);
      assert.match(pageCode, /resolveBasicSystemMap\(\)/);
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
