import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { GET as getSessionsRoute } from "@/app/api/admin/sessions/route";
import { DELETE as deleteSessionRoute } from "@/app/api/admin/sessions/[sessionId]/route";
import { POST as revokeOthersRoute } from "@/app/api/admin/sessions/revoke-others/route";
import { setSessionServiceForTesting, SessionService } from "@/lib/domain/sessions/service";
import { SafeSessionProjection } from "@/lib/domain/sessions/contracts";

test("Sessions API and Admin UI Deterministic Contract Tests", async (t) => {
  t.afterEach(() => {
    setSessionServiceForTesting(null);
  });

  // 1. GET /api/admin/sessions Route Tests
  await t.test("GET route invokes getSessionService().listSessions and returns SafeSessionProjection[]", async () => {
    let listCalledWith: any = null;
    const mockProjections: SafeSessionProjection[] = [
      {
        id: "sess-1",
        userId: "user-1",
        deviceLabel: "Chrome · Windows",
        createdAt: "2026-09-28T10:00:00.000Z",
        lastSeenAt: "2026-09-28T10:30:00.000Z",
        expiresAt: "2026-09-28T22:00:00.000Z",
        isCurrent: true,
      },
    ];

    const mockService = {
      listSessions: async (options: any) => {
        listCalledWith = options;
        return mockProjections;
      },
    } as unknown as SessionService;

    setSessionServiceForTesting(mockService);

    const req = new NextRequest("http://localhost:3000/api/admin/sessions");
    const res = await getSessionsRoute(req);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("cache-control"), "no-store");
    assert.strictEqual(res.headers.get("content-type"), "application/json");

    const json = await res.json();
    assert.deepStrictEqual(json, mockProjections);
    assert.strictEqual(listCalledWith, undefined);
  });

  await t.test("GET route passes targetUserId query parameter", async () => {
    let listCalledWith: any = null;
    const mockService = {
      listSessions: async (options: any) => {
        listCalledWith = options;
        return [];
      },
    } as unknown as SessionService;

    setSessionServiceForTesting(mockService);

    const req = new NextRequest("http://localhost:3000/api/admin/sessions?targetUserId=user-42");
    const res = await getSessionsRoute(req);

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(listCalledWith, { targetUserId: "user-42" });
  });

  await t.test("GET route rejects unknown query parameters", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/sessions?foo=bar");
    const res = await getSessionsRoute(req);

    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.strictEqual(json.error.code, "INVALID_INPUT");
  });

  // 2. DELETE /api/admin/sessions/[sessionId] Route Tests
  await t.test("DELETE route validates mutation origin and invokes revokeSessionById", async () => {
    let revokeCalledWith: string | null = null;
    const mockService = {
      revokeSessionById: async (id: string) => {
        revokeCalledWith = id;
        return { success: true, sessionId: id, revokedCount: 1 };
      },
    } as unknown as SessionService;

    setSessionServiceForTesting(mockService);

    const req = new NextRequest("http://localhost:3000/api/admin/sessions/sess-target-123", {
      method: "DELETE",
      headers: {
        origin: "http://localhost:3000",
      },
    });

    const res = await deleteSessionRoute(req, {
      params: Promise.resolve({ sessionId: "sess-target-123" }),
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("cache-control"), "no-store");
    assert.strictEqual(revokeCalledWith, "sess-target-123");

    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.sessionId, "sess-target-123");
  });

  await t.test("DELETE route returns 403 CSRF_REJECTED on cross-origin mutation", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/sessions/sess-1", {
      method: "DELETE",
      headers: {
        origin: "http://evil-attacker.com",
      },
    });

    const res = await deleteSessionRoute(req, {
      params: Promise.resolve({ sessionId: "sess-1" }),
    });

    assert.strictEqual(res.status, 403);
    const json = await res.json();
    assert.strictEqual(json.error.code, "CSRF_REJECTED");
  });

  // 3. POST /api/admin/sessions/revoke-others Route Tests
  await t.test("POST revoke-others route validates mutation origin and invokes revokeOtherSessions", async () => {
    let revokeOthersCalled = false;
    const mockService = {
      revokeOtherSessions: async () => {
        revokeOthersCalled = true;
        return { success: true, revokedCount: 3 };
      },
    } as unknown as SessionService;

    setSessionServiceForTesting(mockService);

    const req = new NextRequest("http://localhost:3000/api/admin/sessions/revoke-others", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
      },
    });

    const res = await revokeOthersRoute(req);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(revokeOthersCalled, true);

    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.revokedCount, 3);
  });

  await t.test("POST revoke-others returns 403 CSRF_REJECTED on cross-origin mutation", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/sessions/revoke-others", {
      method: "POST",
      headers: {
        origin: "http://evil-attacker.com",
      },
    });

    const res = await revokeOthersRoute(req);

    assert.strictEqual(res.status, 403);
    const json = await res.json();
    assert.strictEqual(json.error.code, "CSRF_REJECTED");
  });

  // 4. Source & UI Static Invariants
  await t.test("UI and API source contracts: no demo data, no fake IPs, no body actor spoofing", () => {
    const uiPath = path.join(process.cwd(), "app/admin/sessions/page.tsx");
    const uiSource = fs.readFileSync(uiPath, "utf8");

    // Demo data removal checks
    assert.ok(!uiSource.includes("MacBook Pro"), "MacBook Pro demo string must be removed");
    assert.ok(!uiSource.includes("iPhone 15 Pro"), "iPhone 15 Pro demo string must be removed");
    assert.ok(!uiSource.includes("Dell XPS 15"), "Dell XPS 15 demo string must be removed");
    assert.ok(!uiSource.includes("192.168.1.42"), "Demo IP 192.168.1.42 must be removed");
    assert.ok(!uiSource.includes("Praha, CZ"), "Demo location Praha, CZ must be removed");
    assert.ok(!uiSource.includes("handleUnfinishedAction"), "handleUnfinishedAction placeholder must be removed");

    // Live endpoint wiring checks
    assert.ok(uiSource.includes('fetch("/api/admin/sessions"'), "UI must fetch /api/admin/sessions");
    assert.ok(uiSource.includes("fetch(`/api/admin/sessions/${encodeURIComponent(sessionId)}`"), "UI must call DELETE endpoint");
    assert.ok(uiSource.includes('fetch("/api/admin/sessions/revoke-others"'), "UI must call revoke-others endpoint");

    // Safe UI projections
    assert.ok(uiSource.includes("deviceLabel"), "UI must render deviceLabel");
    assert.ok(uiSource.includes("Tato relace"), "UI must render current session indicator");
    assert.ok(uiSource.includes("Odhlásit ostatní zařízení"), "UI must render revoke others action");
    assert.ok(uiSource.includes("!s.isCurrent"), "Current session must not have revoke button");

    // No raw secrets in UI
    assert.ok(!uiSource.includes("tokenHash"), "tokenHash must not be in UI");
    assert.ok(!uiSource.includes("rawToken"), "rawToken must not be in UI");

    // Route source safety checks
    const getRoutePath = path.join(process.cwd(), "app/api/admin/sessions/route.ts");
    const getRouteSource = fs.readFileSync(getRoutePath, "utf8");
    assert.ok(
      getRouteSource.includes("getSessionService()"),
      "GET route must obtain session domain service"
    );
    assert.ok(
      getRouteSource.includes(".listSessions("),
      "GET route must call listSessions"
    );

    const deleteRoutePath = path.join(process.cwd(), "app/api/admin/sessions/[sessionId]/route.ts");
    const deleteRouteSource = fs.readFileSync(deleteRoutePath, "utf8");
    assert.ok(deleteRouteSource.includes("validateMutationOrigin"), "DELETE route must validate mutation origin");
    assert.ok(deleteRouteSource.includes("revokeSessionById"), "DELETE route must call revokeSessionById");
    assert.ok(!deleteRouteSource.includes("request.json()"), "DELETE route must not read identity from request body");

    const revokeOthersPath = path.join(process.cwd(), "app/api/admin/sessions/revoke-others/route.ts");
    const revokeOthersSource = fs.readFileSync(revokeOthersPath, "utf8");
    assert.ok(revokeOthersSource.includes("validateMutationOrigin"), "revoke-others route must validate mutation origin");
    assert.ok(revokeOthersSource.includes("revokeOtherSessions"), "revoke-others route must call revokeOtherSessions");
  });
});
