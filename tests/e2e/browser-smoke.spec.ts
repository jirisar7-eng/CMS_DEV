import { test, expect, Page } from "@playwright/test";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  READER_EMAIL,
  READER_PASSWORD,
  DISABLED_EMAIL,
  DISABLED_PASSWORD,
} from "./global-setup";

async function loginAsAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.fill("#email", ADMIN_EMAIL);
  await page.fill("#password", ADMIN_PASSWORD);
  await page.click("button[type=\"submit\"]");
  await page.waitForURL((url) => url.pathname === "/admin", { timeout: 30000 });
}

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

      const alert = page.locator("[role=\"alert\"]").first();
      await expect(alert).toBeVisible();
      await expect(alert).toContainText("Neplatné přihlašovací údaje.");

      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find((c) => c.name === "syn_admin_session");
      expect(sessionCookie).toBeUndefined();
    });

    test("authenticates valid admin and redirects to /admin with session cookie", async ({ page }) => {
      await page.goto("/admin/login");
      await page.fill("#email", ADMIN_EMAIL);
      await page.fill("#password", ADMIN_PASSWORD);
      await page.click("button[type=\"submit\"]");

      await page.waitForURL((url) => url.pathname === "/admin", { timeout: 30000 });
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
      await page.waitForURL((url) => url.pathname.includes("/admin/login"), { timeout: 30000 });
      expect(page.url()).toContain("/admin/login");
    });

    test("denies unauthenticated access to sub-admin routes (/admin/projects, /admin/pages)", async ({ page }) => {
      await page.context().clearCookies();
      await page.goto("/admin/projects");
      await page.waitForURL((url) => url.pathname.includes("/admin/login"), { timeout: 30000 });
      expect(page.url()).toContain("/admin/login");

      await page.goto("/admin/pages");
      await page.waitForURL((url) => url.pathname.includes("/admin/login"), { timeout: 30000 });
      expect(page.url()).toContain("/admin/login");
    });
  });

  test.describe("3. Unauthorized Admin Access Denial", () => {
    test("denies admin access to non-admin user (without admin.access)", async ({ page }) => {
      await page.goto("/admin/login");
      await page.fill("#email", READER_EMAIL);
      await page.fill("#password", READER_PASSWORD);
      await page.click("button[type=\"submit\"]");

      // Reader is bounced to /admin/login by AdminLayout authorization check
      await page.waitForURL((url) => url.pathname.includes("/admin/login"), { timeout: 30000 });
      expect(page.url()).toContain("/admin/login");

      await page.goto("/admin");
      await page.waitForURL((url) => url.pathname.includes("/admin/login"), { timeout: 30000 });
      expect(page.url()).toContain("/admin/login");
    });

    test("denies login and access to disabled user", async ({ page }) => {
      await page.goto("/admin/login");
      await page.fill("#email", DISABLED_EMAIL);
      await page.fill("#password", DISABLED_PASSWORD);
      await page.click("button[type=\"submit\"]");

      const alert = page.locator("[role=\"alert\"]").first();
      await expect(alert).toBeVisible();
      await expect(alert).toContainText("Neplatné přihlašovací údaje.");

      await page.goto("/admin");
      await page.waitForURL((url) => url.pathname.includes("/admin/login"), { timeout: 30000 });
      expect(page.url()).toContain("/admin/login");
    });
  });

  test.describe("4. Project Context & Isolation", () => {
    test("isolates project content and API data between projects", async ({ page }) => {
      await loginAsAdmin(page);

      const projectsRes = await page.evaluate(async () => {
        const res = await fetch("/api/admin/projects");
        return { status: res.status, json: await res.json() };
      });
      expect(projectsRes.status).toBe(200);
      const projects = projectsRes.json.data || projectsRes.json;
      expect(Array.isArray(projects)).toBe(true);

      const alphaProject = projects.find((p: any) => p.key === "alpha-smoke");
      const betaProject = projects.find((p: any) => p.key === "beta-smoke");
      expect(alphaProject).toBeDefined();
      expect(betaProject).toBeDefined();

      const alphaPagesRes = await page.evaluate(async (projectId) => {
        const res = await fetch(`/api/admin/projects/${projectId}/pages`);
        return { status: res.status, json: await res.json() };
      }, alphaProject.id);
      expect(alphaPagesRes.status).toBe(200);
      const alphaPages = alphaPagesRes.json.data || alphaPagesRes.json;
      expect(Array.isArray(alphaPages)).toBe(true);

      const betaPagesRes = await page.evaluate(async (projectId) => {
        const res = await fetch(`/api/admin/projects/${projectId}/pages`);
        return { status: res.status, json: await res.json() };
      }, betaProject.id);
      expect(betaPagesRes.status).toBe(200);
      const betaPages = betaPagesRes.json.data || betaPagesRes.json;
      expect(Array.isArray(betaPages)).toBe(true);

      const alphaPageIds = new Set(alphaPages.map((p: any) => p.id));
      for (const bp of betaPages) {
        expect(alphaPageIds.has(bp.id)).toBe(false);
      }
    });
  });

  test.describe("5. Main Content Lifecycle Smoke", () => {
    test("executes draft -> review -> approve -> publish -> public route resolution", async ({ page }) => {
      await loginAsAdmin(page);

      const projectsRes = await page.evaluate(async () => {
        const res = await fetch("/api/admin/projects");
        return { status: res.status, json: await res.json() };
      });
      expect(projectsRes.status).toBe(200);
      const projects = projectsRes.json.data || projectsRes.json;
      const alphaProject = projects.find((p: any) => p.key === "alpha-smoke");
      expect(alphaProject).toBeDefined();

      const pageKey = `smoke-key-${Date.now()}`;
      const pageSlug = `smoke-slug-${Date.now()}`;
      const pageTitle = `Smoke Lifecycle Page ${Date.now()}`;

      const createRes = await page.evaluate(async ({ projectId, data }) => {
        const res = await fetch(`/api/admin/projects/${projectId}/pages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        return { status: res.status, json: await res.json() };
      }, {
        projectId: alphaProject.id,
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
      expect(createRes.status, `Create page failed: status=${createRes.status}, body=${JSON.stringify(createRes.json)}`).toBe(201);
      const pageId = createRes.json.data?.pageId || createRes.json.pageId;
      let lockVersion = createRes.json.data?.lockVersion || createRes.json.lockVersion;
      expect(pageId).toBeTruthy();

      const submitRes = await page.evaluate(async ({ projectId, pageId, lockVersion }) => {
        const res = await fetch(`/api/admin/projects/${projectId}/pages/${pageId}/actions/submit-review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedLockVersion: lockVersion }),
        });
        return { status: res.status, json: await res.json() };
      }, { projectId: alphaProject.id, pageId, lockVersion });
      expect(submitRes.status, `Submit review failed: status=${submitRes.status}, body=${JSON.stringify(submitRes.json)}`).toBe(200);
      const submitData = submitRes.json.data || submitRes.json;
      expect(submitData.status).toBe("IN_REVIEW");
      lockVersion = submitData.lockVersion;

      const approveRes = await page.evaluate(async ({ projectId, pageId, lockVersion }) => {
        const res = await fetch(`/api/admin/projects/${projectId}/pages/${pageId}/actions/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedLockVersion: lockVersion }),
        });
        return { status: res.status, json: await res.json() };
      }, { projectId: alphaProject.id, pageId, lockVersion });
      expect(approveRes.status, `Approve failed: status=${approveRes.status}, body=${JSON.stringify(approveRes.json)}`).toBe(200);
      const approveData = approveRes.json.data || approveRes.json;
      expect(approveData.status).toBe("APPROVED");
      lockVersion = approveData.lockVersion;

      const publishRes = await page.evaluate(async ({ projectId, pageId, lockVersion }) => {
        const res = await fetch(`/api/admin/projects/${projectId}/pages/${pageId}/actions/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedLockVersion: lockVersion }),
        });
        return { status: res.status, json: await res.json() };
      }, { projectId: alphaProject.id, pageId, lockVersion });
      expect(publishRes.status, `Publish failed: status=${publishRes.status}, body=${JSON.stringify(publishRes.json)}`).toBe(200);
      const publishData = publishRes.json.data || publishRes.json;
      expect(publishData.status).toBe("PUBLISHED");

      const publicRes = await page.evaluate(async ({ slug, projectId }) => {
        const res = await fetch(`/api/public/route?p=/${slug}&projectId=${projectId}`);
        return { status: res.status, json: await res.json() };
      }, { slug: pageSlug, projectId: alphaProject.id });
      expect(publicRes.status).toBe(200);
      expect(publicRes.json.title).toBe(pageTitle);
      expect(publicRes.json.pageId).toBe(pageId);
    });
  });
});
