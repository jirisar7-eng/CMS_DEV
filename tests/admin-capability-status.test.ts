import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { 
  ADMIN_NAV_GROUPS, 
  ALL_ADMIN_NAV_ITEMS, 
  getCapabilityStats, 
  getCapabilityById, 
  getCapabilityStatus 
} from '../lib/navigation/adminNav';
import { GET as healthHandler } from '../app/api/admin/health/route';
import { NextRequest } from 'next/server';

describe('SYN-ADMIN-STATUS-001: Admin Capability Map & Authoritative Implementation Status', () => {
  const rootDir = process.cwd();

  describe('1. Authoritative Navigation & Capability Matrix (adminNav.ts)', () => {
    const validStatuses = ['PLÁNOVÁNO', 'POUZE UI', 'ZÁKLAD', 'FUNKČNÍ', 'DOKONČENO', 'VYPNUTO'] as const;

    it('defines exactly 8 navigation groups', () => {
      assert.strictEqual(ADMIN_NAV_GROUPS.length, 8);
    });

    it('contains exactly 31 architectural capabilities (excluding dashboard)', () => {
      const nonDashboardItems = ALL_ADMIN_NAV_ITEMS.filter((item) => item.id !== 'dashboard');
      assert.strictEqual(nonDashboardItems.length, 31);
    });

    it('every capability has an authoritative status from the 6-status model', () => {
      for (const item of ALL_ADMIN_NAV_ITEMS) {
        assert.ok(
          validStatuses.includes(item.status as (typeof validStatuses)[number]),
          `Item ${item.id} has invalid status: ${item.status}`
        );
      }
    });

    it('deprecated statuses PROTOTYP and UI PŘIPRAVENO are not present in adminNav.ts', () => {
      const navFile = fs.readFileSync(path.join(rootDir, 'lib/navigation/adminNav.ts'), 'utf8');
      assert.doesNotMatch(navFile, /'PROTOTYP'/);
      assert.doesNotMatch(navFile, /"PROTOTYP"/);
      assert.doesNotMatch(navFile, /'UI PŘIPRAVENO'/);
      assert.doesNotMatch(navFile, /"UI PŘIPRAVENO"/);
    });

    it('verified FUNKČNÍ capabilities are correctly marked', () => {
      assert.strictEqual(getCapabilityStatus('pages'), 'FUNKČNÍ');
      assert.strictEqual(getCapabilityStatus('themes'), 'FUNKČNÍ');
      assert.strictEqual(getCapabilityStatus('brands'), 'FUNKČNÍ');
    });

    it('verified ZÁKLAD capabilities are correctly marked', () => {
      assert.strictEqual(getCapabilityStatus('media'), 'ZÁKLAD');
      assert.strictEqual(getCapabilityStatus('publishing'), 'ZÁKLAD');
      assert.strictEqual(getCapabilityStatus('revisions'), 'ZÁKLAD');
      assert.strictEqual(getCapabilityStatus('svg-editor'), 'ZÁKLAD');
      assert.strictEqual(getCapabilityStatus('users'), 'ZÁKLAD');
      assert.strictEqual(getCapabilityStatus('roles'), 'ZÁKLAD');
      assert.strictEqual(getCapabilityStatus('audit'), 'ZÁKLAD');
      assert.strictEqual(getCapabilityStatus('sessions'), 'ZÁKLAD');
    });

    it('verified PLÁNOVÁNO capabilities are correctly marked', () => {
      assert.strictEqual(getCapabilityStatus('templates'), 'PLÁNOVÁNO');
      assert.strictEqual(getCapabilityStatus('queues'), 'PLÁNOVÁNO');
      assert.strictEqual(getCapabilityStatus('project-packs'), 'PLÁNOVÁNO');
    });

    it('verified POUZE UI capabilities are correctly marked', () => {
      assert.strictEqual(getCapabilityStatus('navigation'), 'POUZE UI');
      assert.strictEqual(getCapabilityStatus('seo'), 'POUZE UI');
      assert.strictEqual(getCapabilityStatus('redirects'), 'POUZE UI');
      assert.strictEqual(getCapabilityStatus('search'), 'POUZE UI');
      assert.strictEqual(getCapabilityStatus('pwa'), 'POUZE UI');
      assert.strictEqual(getCapabilityStatus('modules'), 'POUZE UI');
      assert.strictEqual(getCapabilityStatus('notifications'), 'POUZE UI');
      assert.strictEqual(getCapabilityStatus('analytics'), 'POUZE UI');
      assert.strictEqual(getCapabilityStatus('import-export'), 'POUZE UI');
      assert.strictEqual(getCapabilityStatus('security'), 'POUZE UI');
      assert.strictEqual(getCapabilityStatus('privacy'), 'POUZE UI');
      assert.strictEqual(getCapabilityStatus('settings'), 'POUZE UI');
      assert.strictEqual(getCapabilityStatus('integrations'), 'POUZE UI');
      assert.strictEqual(getCapabilityStatus('diagnostics'), 'POUZE UI');
      assert.strictEqual(getCapabilityStatus('logs'), 'POUZE UI');
      assert.strictEqual(getCapabilityStatus('projects'), 'POUZE UI');
      assert.strictEqual(getCapabilityStatus('deployment'), 'POUZE UI');
    });

    it('getCapabilityStats() sums up exactly to the 31 capabilities', () => {
      const stats = getCapabilityStats();
      const sum = 
        stats['PLÁNOVÁNO'] + 
        stats['POUZE UI'] + 
        stats['ZÁKLAD'] + 
        stats['FUNKČNÍ'] + 
        stats['DOKONČENO'] + 
        stats['VYPNUTO'];
      assert.strictEqual(sum, 31);
      assert.strictEqual(stats['FUNKČNÍ'], 3);
      assert.strictEqual(stats['ZÁKLAD'], 8);
      assert.strictEqual(stats['POUZE UI'], 17);
      assert.strictEqual(stats['PLÁNOVÁNO'], 3);
    });
  });

  describe('2. AdminDashboard Truthfulness & Dynamic Status Binding', () => {
    const dashboardPath = path.join(rootDir, 'components/admin/AdminDashboard.tsx');
    const dashboardCode = fs.readFileSync(dashboardPath, 'utf8');

    it('does not contain hardcoded prototype text', () => {
      assert.doesNotMatch(dashboardCode, /'PROTOTYP'/);
      assert.doesNotMatch(dashboardCode, /"PROTOTYP"/);
      assert.doesNotMatch(dashboardCode, /In-memory adaptér/);
      assert.doesNotMatch(dashboardCode, /4 stránky/);
      assert.doesNotMatch(dashboardCode, /Fáze návrhu rozhraní/);
      assert.doesNotMatch(dashboardCode, /"8 navigačních skupin • 31 schopností"/);
      assert.doesNotMatch(dashboardCode, /'8 navigačních skupin • 31 schopností'/);
    });

    it('uses dynamic getCapabilityStats and counts', () => {
      assert.match(dashboardCode, /getCapabilityStats/);
      assert.match(dashboardCode, /ADMIN_NAV_GROUPS/);
      assert.match(dashboardCode, /totalCapabilitiesCount/);
    });

    it('queries /api/admin/health endpoint for runtime telemetry', () => {
      assert.match(dashboardCode, /\/api\/admin\/health/);
    });

    it('safely handles missing project with fail-closed "Projekt nevybrán"', () => {
      assert.match(dashboardCode, /Projekt nevybrán/);
    });
  });

  describe('3. Runtime Health Endpoint (/api/admin/health)', () => {
    it('returns 200 with structured health telemetry and handles unselected project', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/health');
      const res = await healthHandler(req);
      assert.strictEqual(res.status, 200);

      const json = await res.json();
      assert.ok(json.database);
      assert.ok(json.storage);
      assert.ok(json.project);
      assert.ok(json.auth);

      assert.strictEqual(json.project.id, null);
      assert.strictEqual(json.project.status, 'not_selected');
    });

    it('returns normalized project id when projectId query parameter is provided', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/health?projectId=synthesis-test-proj');
      const res = await healthHandler(req);
      assert.strictEqual(res.status, 200);

      const json = await res.json();
      assert.strictEqual(json.project.id, 'synthesis-test-proj');
      assert.strictEqual(json.project.status, 'selected');
    });

    it('fails closed gracefully for database connectivity', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/health');
      const res = await healthHandler(req);
      assert.strictEqual(res.status, 200);

      const json = await res.json();
      assert.ok(['connected', 'disconnected'].includes(json.database.status));
      assert.ok(typeof json.database.message === 'string');
    });
  });

  describe('4. CapabilityStatusBadge Support', () => {
    const badgePath = path.join(rootDir, 'components/admin/CapabilityStatusBadge.tsx');
    const badgeCode = fs.readFileSync(badgePath, 'utf8');

    it('supports all 6 authoritative statuses in type union', () => {
      assert.match(badgeCode, /'PLÁNOVÁNO'/);
      assert.match(badgeCode, /'POUZE UI'/);
      assert.match(badgeCode, /'ZÁKLAD'/);
      assert.match(badgeCode, /'FUNKČNÍ'/);
      assert.match(badgeCode, /'DOKONČENO'/);
      assert.match(badgeCode, /'VYPNUTO'/);
    });
  });
});
