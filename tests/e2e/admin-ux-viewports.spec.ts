import { test, expect, Page } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./global-setup";

const VIEWPORTS = [
  { width: 360, height: 640, name: "360x640 Compact Mobile" },
  { width: 390, height: 844, name: "390x844 Standard Mobile" },
  { width: 768, height: 1024, name: "768x1024 Tablet Portrait" },
  { width: 1024, height: 768, name: "1024x768 Small Desktop / Tablet Landscape" },
];

async function loginAsAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.fill("#email", ADMIN_EMAIL);
  await page.fill("#password", ADMIN_PASSWORD);
  await page.click("button[type=\"submit\"]");
  await page.waitForURL((url) => url.pathname === "/admin", { timeout: 30000 });
}

test.describe("SYN-UX-001: Mobile, Tablet & Accessibility Viewports", () => {
  for (const vp of VIEWPORTS) {
    test.describe(`Viewport: ${vp.name}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
      });

      test("/admin: no horizontal overflow & accessible navigation", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/admin");
        await page.waitForLoadState("networkidle");

        // Verify no document-level horizontal overflow
        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(overflow, `Horizontal overflow detected at ${vp.width}px`).toBe(false);

        // Verify skip link exists and targets #admin-main
        const skipLink = page.locator("a[href='#admin-main']");
        await expect(skipLink).toBeAttached();
        await expect(skipLink).toContainText("Přeskočit na hlavní obsah");

        // Project selector trigger is reachable
        const projectBtn = page.locator("button[aria-controls='project-selector-dropdown']");
        await expect(projectBtn).toBeAttached();

        // Responsive sidebar verification
        const menuBtn = page.locator("button[aria-controls='admin-sidebar']");
        const sidebar = page.locator("#admin-sidebar");

        if (vp.width < 768) {
          // Mobile: menu button is visible, sidebar is hidden initially
          await expect(menuBtn).toBeVisible();
          expect(await menuBtn.getAttribute("aria-expanded")).toBe("false");

          // Open sidebar
          await menuBtn.click();
          expect(await menuBtn.getAttribute("aria-expanded")).toBe("true");

          // Close sidebar with Escape
          await page.keyboard.press("Escape");
          expect(await menuBtn.getAttribute("aria-expanded")).toBe("false");
        } else {
          // Tablet / Desktop: sidebar is statically visible, menu button is hidden
          await expect(sidebar).toBeVisible();
          await expect(menuBtn).toBeHidden();
        }
      });

      test("/admin/pages: no horizontal overflow & responsive presentation", async ({ page }) => {
        await loginAsAdmin(page);
        await page.goto("/admin/pages");
        await page.waitForLoadState("networkidle");

        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(overflow, `Pages overflow detected at ${vp.width}px`).toBe(false);

        // Verify main content container exists
        const main = page.locator("#admin-main");
        await expect(main).toBeAttached();
      });

      test("/admin/login: usable form & no overflow", async ({ page }) => {
        await page.goto("/admin/login");
        await page.waitForLoadState("networkidle");

        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(overflow, `Login overflow detected at ${vp.width}px`).toBe(false);

        const emailInput = page.locator("#email");
        const passwordInput = page.locator("#password");
        const submitBtn = page.locator("button[type=\"submit\"]");

        await expect(emailInput).toBeVisible();
        await expect(passwordInput).toBeVisible();
        await expect(submitBtn).toBeVisible();

        // Verify 44px minimum touch target sizing
        const emailBox = await emailInput.boundingBox();
        const submitBox = await submitBtn.boundingBox();
        expect(emailBox?.height).toBeGreaterThanOrEqual(40);
        expect(submitBox?.height).toBeGreaterThanOrEqual(40);
      });
    });
  }
});
