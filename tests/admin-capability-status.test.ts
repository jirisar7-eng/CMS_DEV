// @ts-nocheck
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';

class MockNextResponse {
  status: number;
  headers: Map<string, string>;
  private _body: any;

  constructor(body: any, init?: { status?: number; headers?: Record<string, string> }) {
    this._body = body;
    this.status = init?.status ?? 200;
    this.headers = new Map(Object.entries(init?.headers || {}));
  }

  static json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
    return new MockNextResponse(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  }

  async json() {
    return typeof this._body === 'string' ? JSON.parse(this._body) : this._body;
  }
}

class MockNextRequest extends Request {
  nextUrl: URL;
  constructor(input: string | URL, init?: RequestInit) {
    super(input, init);
    this.nextUrl = new URL(typeof input === 'string' ? input : input.toString());
  }
}

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === 'next/server') {
    return { NextResponse: MockNextResponse, NextRequest: MockNextRequest };
  }
  if (id === '@/lib/db') {
    return { prisma: null };
  }
  if (id === '@/lib/auth/session') {
    return { getSession: async () => ({ session: null, user: null }) };
  }
  if (id === '@/lib/auth/rbac') {
    return { hasPermission: async () => false };
  }
  if (id.startsWith('@/')) {
    const relativePath = id.slice(2);
    return originalRequire.call(this, path.resolve(__dirname, '..', relativePath));
  }
  return originalRequire.apply(this, arguments);
};

import { 
  ADMIN_NAV_GROUPS, 
  ALL_ADMIN_NAV_ITEMS, 
  getCapabilityStats, 
  getCapabilityById, 
  getCapabilityStatus 
} from '../lib/navigation/adminNav';
import { CapabilityStatus } from '../components/admin/CapabilityStatusBadge';
import { isDatabaseConfigured } from '../lib/runtime/database';

const NextRequest = MockNextRequest;

describe('SYN-ADMIN-STATUS-001: Admin Capability Map, Status Truthfulness & Security', () => {
  const rootDir = path.resolve(__dirname, '..');

  describe('1. Authoritative Navigation & Capability Matrix (adminNav.ts)', () => {
    // Exactly 6 canonical statuses
    const validStatuses: readonly CapabilityStatus[] = [
      'PLÁNOVÁNO',
      'POUZE UI',
      'ZÁKLAD',
      'FUNKČNÍ',
      'DOKONČENO',
      'VYPNUTO',
    ];

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
          validStatuses.includes(item.status),
          `Item ${item.id} has invalid status: ${item.status}`
        );
      }
    });

    it('deprecated statuses PROTOTYP, UI PŘIPRAVENO, and non-canonical ROZPRACOVÁNO are not present', () => {
      const navFile = fs.readFileSync(path.join(rootDir, 'lib/navigation/adminNav.ts'), 'utf8');
      assert.doesNotMatch(navFile, /'PROTOTYP'/);
      assert.doesNotMatch(navFile, /"PROTOTYP"/);
      assert.doesNotMatch(navFile, /'UI PŘIPRAVENO'/);
      assert.doesNotMatch(navFile, /"UI PŘIPRAVENO"/);
      assert.doesNotMatch(navFile, /'ROZPRACOVÁNO'/);
      assert.doesNotMatch(navFile, /"ROZPRACOVÁNO"/);
    });

    it('verified FUNKČNÍ capabilities are correctly marked', () => {
      assert.strictEqual(getCapabilityStatus('pages'), 'FUNKČNÍ');
      assert.strictEqual(getCapabilityStatus('themes'), 'FUNKČNÍ');
      assert.strictEqual(getCapabilityStatus('brands'), 'FUNKČNÍ');
      assert.strictEqual(getCapabilityStatus('redirects'), 'FUNKČNÍ');
    });

    it('verified ZÁKLAD capabilities are correctly marked', () => {
      assert.strictEqual(getCapabilityStatus('media'), 'ZÁKLAD');
      assert.strictEqual(getCapabilityStatus('navigation'), 'ZÁKLAD');
      assert.strictEqual(getCapabilityStatus('publishing'), 'ZÁKLAD');
      assert.strictEqual(getCapabilityStatus('revisions'), 'ZÁKLAD');
      assert.strictEqual(getCapabilityStatus('search'), 'ZÁKLAD');
      assert.strictEqual(getCapabilityStatus('seo'), 'ZÁKLAD');
      assert.strictEqual(getCapabilityStatus('svg-editor'), 'ZÁKLAD');
      assert.strictEqual(getCapabilityStatus('users'), 'ZÁKLAD');
      assert.strictEqual(getCapabilityStatus('roles'), 'ZÁKLAD');
      assert.strictEqual(getCapabilityStatus('audit'), 'ZÁKLAD');
      assert.strictEqual(getCapabilityStatus('sessions'), 'ZÁKLAD');
      assert.strictEqual(getCapabilityStatus('projects'), 'ZÁKLAD');
    });

    it('verified PLÁNOVÁNO capabilities are correctly marked', () => {
      assert.strictEqual(getCapabilityStatus('templates'), 'PLÁNOVÁNO');
      assert.strictEqual(getCapabilityStatus('queues'), 'PLÁNOVÁNO');
      assert.strictEqual(getCapabilityStatus('project-packs'), 'PLÁNOVÁNO');
    });

    it('verified POUZE UI capabilities are correctly marked', () => {
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
      assert.strictEqual(getCapabilityStatus('deployment'), 'POUZE UI');
    });

    it('getCapabilityStats() sums up exactly to the 31 capabilities across the 6 canonical statuses', () => {
      const stats = getCapabilityStats();
      const sum = 
        stats['PLÁNOVÁNO'] + 
        stats['POUZE UI'] + 
        stats['ZÁKLAD'] + 
        stats['FUNKČNÍ'] + 
        stats['DOKONČENO'] + 
        stats['VYPNUTO'];
      assert.strictEqual(sum, 31);
      assert.strictEqual(stats['FUNKČNÍ'], 4);
      assert.strictEqual(stats['ZÁKLAD'], 12);
      assert.strictEqual(stats['POUZE UI'], 12);
      assert.strictEqual(stats['PLÁNOVÁNO'], 3);
      assert.strictEqual(stats['DOKONČENO'], 0);
      assert.strictEqual(stats['VYPNUTO'], 0);
    });
  });

  describe('2. AdminDashboard Truthfulness & Dynamic Status Binding', () => {
    const dashboardPath = path.join(rootDir, 'components/admin/AdminDashboard.tsx');
    const dashboardCode = fs.readFileSync(dashboardPath, 'utf8');

    it('does not contain misleading "Certifikováno v produkci" text', () => {
      assert.doesNotMatch(dashboardCode, /Certifikováno v produkci/);
    });

    it('uses correct contractual definition "Celý deklarovaný scope implementován a ověřen" for DOKONČENO', () => {
      assert.match(dashboardCode, /Celý deklarovaný scope implementován a ověřen/);
    });

    it('does not contain hardcoded prototype text or mock fixtures', () => {
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

    it('sets pagesLoading=true and resets stale pagesCount BEFORE initiating fetch', () => {
      const effectSection = dashboardCode.substring(
        dashboardCode.indexOf('// Fetch Real Content Pages Count if project is selected')
      );
      const setLoadingIdx = effectSection.indexOf('setPagesLoading(true)');
      const resetCountIdx = effectSection.indexOf('setPagesCount(null)');
      const clientCallIdx = effectSection.indexOf('createAdminPagesClient(projectId)');
      
      assert.ok(setLoadingIdx !== -1, 'setPagesLoading(true) must be called');
      assert.ok(resetCountIdx !== -1, 'setPagesCount(null) must be called');
      assert.ok(clientCallIdx !== -1, 'createAdminPagesClient must be called');
      assert.ok(setLoadingIdx < clientCallIdx, 'setPagesLoading(true) must precede client fetch');
      assert.ok(resetCountIdx < clientCallIdx, 'setPagesCount(null) must precede client fetch');
    });
  });

  describe('3. Runtime Health Endpoint Security & Storage Truthfulness (/api/admin/health)', () => {
    let healthHandler: any;

    beforeEach(async () => {
      if (!healthHandler) {
        const mod = await import('../app/api/admin/health/route');
        healthHandler = mod.GET;
      }
    });

    it('AUTH: unauthenticated request without session cookie returns 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/health');
      const res = await healthHandler(req);
      // Fail closed when no session
      if (isDatabaseConfigured()) {
        assert.strictEqual(res.status, 401);
        const json = await res.json();
        assert.strictEqual(json.error.code, 'UNAUTHENTICATED');
      } else {
        // In nodb environment, database unavailable returns 503 fail-closed
        assert.strictEqual(res.status, 503);
      }
    });

    it('AUTH: fake/random syn_admin_session cookie returns 401 (not authenticated)', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/health', {
        headers: {
          cookie: 'syn_admin_session=invalid_fake_session_random_value_12345',
        },
      });
      const res = await healthHandler(req);
      if (isDatabaseConfigured()) {
        assert.strictEqual(res.status, 401);
        const json = await res.json();
        assert.strictEqual(json.error.code, 'UNAUTHENTICATED');
      } else {
        assert.strictEqual(res.status, 503);
      }
    });

    it('SECURITY: no secret leakage in health response (no endpoints with passwords, no keys, no tokens)', async () => {
      const routeCode = fs.readFileSync(path.join(rootDir, 'app/api/admin/health/route.ts'), 'utf8');
      // Must not serialize access keys, secrets, or passwords
      assert.doesNotMatch(routeCode, /process\.env\.CMS_STORAGE_SECRET_KEY/);
      assert.doesNotMatch(routeCode, /secretAccessKey/);
      assert.doesNotMatch(routeCode, /DATABASE_URL/);
    });

    it('STORAGE: configured != available/active (no active status solely based on env config)', async () => {
      const routeCode = fs.readFileSync(path.join(rootDir, 'app/api/admin/health/route.ts'), 'utf8');
      // Must not blindly assign 'active' without runtime verification
      assert.doesNotMatch(routeCode, /storageStatus = hasS3Config \? 'active'/);
      assert.match(routeCode, /configured_unverified/);
    });

    it('AUTH: does not trust client-provided headers for identity or roles', async () => {
      const routeCode = fs.readFileSync(path.join(rootDir, 'app/api/admin/health/route.ts'), 'utf8');
      assert.doesNotMatch(routeCode, /request\.headers\.get\('x-user-id'\)/);
      assert.doesNotMatch(routeCode, /request\.headers\.get\('x-role'\)/);
      assert.doesNotMatch(routeCode, /SUPER_ADMIN/);
    });
  });

  describe('4. CapabilityStatusBadge & Type Model Truthfulness', () => {
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

    it('does not contain non-canonical ROZPRACOVÁNO status', () => {
      assert.doesNotMatch(badgeCode, /'ROZPRACOVÁNO'/);
      assert.doesNotMatch(badgeCode, /"ROZPRACOVÁNO"/);
    });
  });

  describe('5. Admin Search UI & Server-Binding Truthfulness (app/admin/search)', () => {
    const pagePath = path.join(rootDir, 'app/admin/search/page.tsx');
    const workspacePath = path.join(rootDir, 'components/admin/search/SearchWorkspace.tsx');
    const pageCode = fs.readFileSync(pagePath, 'utf8');
    const workspaceCode = fs.readFileSync(workspacePath, 'utf8');

    it('Search capability status is strictly ZÁKLAD in admin nav', () => {
      assert.strictEqual(getCapabilityStatus('search'), 'ZÁKLAD');
    });

    it('app/admin/search/page.tsx resolves projectId via authoritative server context getActiveProjectId', () => {
      assert.match(pageCode, /getActiveProjectId\(\)/);
      assert.match(pageCode, /<SearchWorkspace\s+projectId=\{projectId\}/);
    });

    it('Search UI strictly omits fake analytics, top queries, and hardcoded fixture metrics', () => {
      assert.doesNotMatch(workspaceCode, /topQueries/);
      assert.doesNotMatch(workspaceCode, /24 stránek/);
      assert.doesNotMatch(workspaceCode, /3 135/);
      assert.doesNotMatch(workspaceCode, /12 ms/);
      assert.doesNotMatch(workspaceCode, /100 % obsahu v indexu/);
      assert.doesNotMatch(workspaceCode, /CTR/i);
      assert.match(workspaceCode, /Analytika vyhledávacích dotazů zatím není součástí Search Foundation/);
    });

    it('Search UI binds to admin Search API GET and POST endpoints', () => {
      assert.match(workspaceCode, /\/api\/admin\/projects\/.*\$\{encodeURIComponent\(projectId\)\}.*\/search/);
      assert.match(workspaceCode, /method:\s*['"]GET['"]/);
      assert.match(workspaceCode, /method:\s*['"]POST['"]/);
    });

    it('Search UI fails closed when projectId is null or missing', () => {
      assert.match(workspaceCode, /Projekt není vybrán/);
    });

    it('Search UI maps error codes safely without exposing raw server internals', () => {
      assert.match(workspaceCode, /Nejste přihlášeni nebo vypršela vaše relace/);
      assert.match(workspaceCode, /Nemáte oprávnění/);
      assert.match(workspaceCode, /Služba vyhledávání je dočasně nedostupná/);
      assert.doesNotMatch(workspaceCode, /err\.stack/);
      assert.doesNotMatch(workspaceCode, /error\.stack/);
    });

    it('Search UI strictly omits fake fallback search_v1 and renders real indexVersion or dash', () => {
      assert.doesNotMatch(workspaceCode, /search_v1/);
      assert.match(workspaceCode, /indexVersion:\s*number\s*\|\s*null/);
      assert.match(workspaceCode, /statusData\?\.indexVersion\s*!==\s*null\s*&&\s*statusData\?\.indexVersion\s*!==\s*undefined\s*\?\s*statusData\.indexVersion\s*:\s*['"]—['"]/);
    });

    it('Search UI performs authoritative GET refresh after successful POST reindex', () => {
      // Must NOT construct statusData from POST response payload, but fetch fresh status via GET
      assert.match(workspaceCode, /handleReindex\s*=\s*async/);
      assert.match(workspaceCode, /fetchSearchStatus\(projectId\)/);
      assert.match(workspaceCode, /const\s+refreshResult\s*=\s*await\s+fetchSearchStatus\(projectId\)/);
    });

    it('Search UI avoids synchronous setState inside useEffect and includes unmount cleanup', () => {
      assert.doesNotMatch(workspaceCode, /useEffect\(\(\)\s*=>\s*\{\s*setIsLoading\(true\)/);
      assert.match(workspaceCode, /let\s+isMounted\s*=\s*true/);
      assert.match(workspaceCode, /controller\.abort\(\)/);
      assert.match(workspaceCode, /return\s*\(\)\s*=>\s*\{\s*isMounted\s*=\s*false;\s*controller\.abort\(\);\s*\}/);
      assert.doesNotMatch(workspaceCode, /eslint-disable/);
    });
  });
});
