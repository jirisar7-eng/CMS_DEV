import { test, expect } from "@playwright/test";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  READER_EMAIL,
  READER_PASSWORD,
  DISABLED_EMAIL,
  DISABLED_PASSWORD,
} from "./global-setup";

test.describe("SYN-QA-SEC-001: Browser Smoke Test Suite", () => {
  test.describe("1. Login Smoke", () => {
    test("renders login form elements", async ({ page }) => {
      await page.goto("/admin/login");
      await expect(page.locator("#email")).toBeVisible();
      await expect(page.locator("#password")).toBeVisible();
      await expect(page.locator("button[type=\"submit\"]")).toBeVisible();
    });

    test("rejects invalid credentials with error message & sets no session cookie", async ({ page }) => {
      await page.goto("/admin/login");
      await page.fill("#email", ADMIN_EMAIL);
      await page.fill("#password", "WrongPassword999!");
      await page.click("button[type=\"submit\"]");

      const errorMsg = page.locator("text=Neplatné přihlašovací údaje.");
      await expect(errorMsg).toBeVisible();

      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find((c) => c.name === "syn_admin_session");
      expect(sessionCookie).toBeUndefined();
    });

    test("authenticates valid admin and redirects to /admin with session cookie", async ({ page }) => {
      await page.goto("/admin/login");
      await page.fill("#email", ADMIN_EMAIL);
      await page.fill("#password", ADMIN_PASSWORD);
      await page.click("button[type=\"submit\"]");

      await page.waitForURL(/\/admin/);
      expect(page.url()).not.toContain("/admin/login");

      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find((c) => c.name === "syn_admin_session");
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.value).toBeTruthy();
    });
  });

  test.describe("2. /admin Authorization Boundary", () => {
    test("denies unauthenticated access to /admin and redirects to login", async ({ page }) => {
      await page.context().clearCookies();
      await page.goto("/admin");
      await page.waitForURL(/\/admin\/login/);
      expect(page.url()).toContain("/admin/login");
    });

    test("denies unauthenticated access to sub-admin routes (/admin/projects, /admin/pages)", async ({ page }) => {
      await page.context().clearCookies();
      await page.goto("/admin/projects");
      await page.waitForURL(/\/admin\/login/);
      expect(page.url()).toContain("/admin/login");

      await page.goto("/admin/pages");
      await page.waitForURL(/\/admin\/login/);
      expect(page.url()).toContain("/admin/login");
    });
  });

  test.describe("3. Unauthorized Admin Access Denial", () => {
    test("denies admin access to non-admin user (without admin.access)", async ({ page }) => {
      await page.goto("/admin/login");
      await page.fill("#email", READER_EMAIL);
      await page.fill("#password", READER_PASSWORD);
      await page.click("button[type=\"submit\"]");

      await page.goto("/admin");
      await page.waitForURL(/\/admin\/login/);
      expect(page.url()).toContain("/admin/login");
    });

    test("denies login and access to disabled user", async ({ page }) => {
      await page.goto("/admin/login");
      await page.fill("#email", DISABLED_EMAIL);
      await page.fill("#password", DISABLED_PASSWORD);
      await page.click("button[type=\"submit\"]");

      const errorMsg = page.locator("[role=\"alert\"]");
      await expect(errorMsg).toBeVisible();

      await page.goto("/admin");
      await page.waitForURL(/\/admin\/login/);
      expect(page.url()).toContain("/admin/login");
    });
  });

  test.describe("4. Project Context & Isolation", () => {
    test("isolates project content and API data between projects", async ({ page, request }) => {
      await page.goto("/admin/login");
      await page.fill("#email", ADMIN_EMAIL);
      await page.fill("#password", ADMIN_PASSWORD);
      await page.click("button[type=\"submit\"]");
      await page.waitForURL(/\/admin/);

      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find((c) => c.name === "syn_admin_session");
      expect(sessionCookie).toBeDefined();

      const headers = {
        Cookie: `syn_admin_session=${sessionCookie?.value}`,
        "x-requested-with": "XMLHttpRequest",
      };

      const projectsRes = await request.get("/api/admin/projects", { headers });
      expect(projectsRes.status()).toBe(200);
      const projects = await projectsRes.json();
      expect(Array.isArray(projects)).toBe(true);

      const alphaProject = projects.find((p: any) => p.key === "alpha-smoke");
      const betaProject = projects.find((p: any) => p.key === "beta-smoke");
      expect(alphaProject).toBeDefined();
      expect(betaProject).toBeDefined();

      const alphaPagesRes = await request.get(`/api/admin/projects/${alphaProject.id}/pages`, { headers });
      expect(alphaPagesRes.status()).toBe(200);
      const alphaPages = await alphaPagesRes.json();

      const betaPagesRes = await request.get(`/api/admin/projects/${betaProject.id}/pages`, { headers });
      expect(betaPagesRes.status()).toBe(200);
      const betaPages = await betaPagesRes.json();

      const alphaPageIds = new Set(alphaPages.map((p: any) => p.id));
      for (const bp of betaPages) {
        expect(alphaPageIds.has(bp.id)).toBe(false);
      }
    });
  });

  test.describe("5. Main Content Lifecycle Smoke", () => {
    test("executes draft -> review -> approve -> publish -> public route resolution", async ({ page, request }) => {
      await page.goto("/admin/login");
      await page.fill("#email", ADMIN_EMAIL);
      await page.fill("#password", ADMIN_PASSWORD);
      await page.click("button[type=\"submit\"]");
      await page.waitForURL(/\/admin/);

      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find((c) => c.name === "syn_admin_session");
      const headers = {
        Cookie: `syn_admin_session=${sessionCookie?.value}`,
        "Content-Type": "application/json",
        "x-requested-with": "XMLHttpRequest",
        origin: "http://127.0.0.1:3000",
      };

      const projectsRes = await request.get("/api/admin/projects", { headers });
      expect(projectsRes.status()).toBe(200);
      const projects = await projectsRes.json();
      const alphaProject = projects.find((p: any) => p.key === "alpha-smoke");
      expect(alphaProject).toBeDefined();

      const pageKey = `smoke-key-${Date.now()}`;
      const pageSlug = `smoke-slug-${Date.now()}`;
      const pageTitle = `Smoke Lifecycle Page ${Date.now()}`;

      const createRes = await request.post(`/api/admin/projects/${alphaProject.id}/pages`, {
        headers,
        data: {
          key: pageKey,
          title: pageTitle,
          slug: pageSlug,
          locale: "cs",
          visibility: "PUBLIC",
          content: {
            version: 1,
            schemaVersion: "1.0.0",
            blocks: [
              {
                id: "b1",
                type: "heading",
                order: 0,
                data: { text: pageTitle, level: 1 },
              },
            ],
          },
        },
      });
      expect(createRes.status()).toBe(201);
      const createData = await createRes.json();
      const pageId = createData.pageId;
      let lockVersion = createData.lockVersion;
      expect(pageId).toBeTruthy();

      const submitRes = await request.post(`/api/admin/projects/${alphaProject.id}/pages/${pageId}/actions/submit-review`, {
        headers,
        data: { expectedLockVersion: lockVersion },
      });
      expect(submitRes.status()).toBe(200);
      const submitData = await submitRes.json();
      expect(submitData.status).toBe("IN_REVIEW");
      lockVersion = submitData.lockVersion;

      const approveRes = await request.post(`/api/admin/projects/${alphaProject.id}/pages/${pageId}/actions/approve`, {
        headers,
        data: { expectedLockVersion: lockVersion },
      });
      expect(approveRes.status()).toBe(200);
      const approveData = await approveRes.json();
      expect(approveData.status).toBe("APPROVED");
      lockVersion = approveData.lockVersion;

      const publishRes = await request.post(`/api/admin/projects/${alphaProject.id}/pages/${pageId}/actions/publish`, {
        headers,
        data: { expectedLockVersion: lockVersion },
      });
      expect(publishRes.status()).toBe(200);
      const publishData = await publishRes.json();
      expect(publishData.status).toBe("PUBLISHED");

      const publicRouteRes = await request.get(`/api/public/route?p=/${pageSlug}&projectId=${alphaProject.id}`);
      expect(publicRouteRes.status()).toBe(200);
      const routeData = await publicRouteRes.json();
      expect(routeData.title).toBe(pageTitle);
      expect(routeData.pageId).toBe(pageId);
    });
  });
});
