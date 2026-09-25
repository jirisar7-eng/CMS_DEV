import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { prisma } from "../lib/db";
import { GET as robotsHandler } from "../app/robots.txt/route";
import { GET as sitemapHandler } from "../app/sitemap.xml/route";

// Mutate prisma singleton for mocks
(prisma as any).project = {
  findFirst: mock.fn(),
};
(prisma as any).projectSeoSettings = {
  findUnique: mock.fn(),
};
(prisma as any).page = {
  findMany: mock.fn(),
};

describe("SEO Runtime Endpoints (Robots & Sitemap)", () => {
  const projA = "proj-seo-runtime-a";
  const projB = "proj-seo-runtime-b";

  beforeEach(() => {
    (prisma.project.findFirst as any).mock.mockImplementation(async (args: any) => {
      const id = args?.where?.OR?.[0]?.id || args?.where?.OR?.[0]?.key;
      if (id === projA || id === projB) {
        return { id };
      }
      return null;
    });

    (prisma.projectSeoSettings.findUnique as any).mock.mockImplementation(async (args: any) => {
      if (args.where.projectId === projA) {
        return {
          projectId: projA,
          robotsTxt: "User-agent: *\nAllow: /public\nDisallow: /secret",
        };
      }
      if (args.where.projectId === projB) {
        return {
          projectId: projB,
          robotsTxt: "User-agent: *\nDisallow: /proj-b-private",
        };
      }
      return null;
    });
  });

  afterEach(() => {
    (prisma.project.findFirst as any).mock.resetCalls();
    (prisma.projectSeoSettings.findUnique as any).mock.resetCalls();
    (prisma.page.findMany as any).mock.resetCalls();
    delete process.env.FORCE_NOINDEX;
  });

  describe("Robots Runtime Endpoint (/robots.txt)", () => {
    it("returns 404 when project is missing or invalid", async () => {
      const req = new Request("http://localhost:3000/robots.txt?projectId=invalid-proj");
      const res = await robotsHandler(req);
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.headers.get("content-type"), "text/plain; charset=utf-8");
      assert.strictEqual(res.headers.get("x-content-type-options"), "nosniff");
      assert.strictEqual(res.headers.get("cache-control"), "private, no-store");
      const text = await res.text();
      assert.strictEqual(text, "Not Found");
      assert.doesNotMatch(text, /proj-seo-runtime/);
    });

    it("returns project-scoped persisted robots content", async () => {
      const reqA = new Request("http://localhost:3000/robots.txt?projectId=" + projA);
      const resA = await robotsHandler(reqA);
      assert.strictEqual(resA.status, 200);
      const textA = await resA.text();
      assert.match(textA, /Disallow: \/secret/);

      const reqB = new Request("http://localhost:3000/robots.txt?projectId=" + projB);
      const resB = await robotsHandler(reqB);
      assert.strictEqual(resB.status, 200);
      const textB = await resB.text();
      assert.match(textB, /Disallow: \/proj-b-private/);
    });

    it("returns safe default when persisted robots content is null/empty", async () => {
      (prisma.projectSeoSettings.findUnique as any).mock.mockImplementation(async () => null);
      const req = new Request("http://localhost:3000/robots.txt?projectId=" + projA);
      const res = await robotsHandler(req);
      assert.strictEqual(res.status, 200);
      const text = await res.text();
      assert.match(text, /User-agent: \*/);
      assert.match(text, /Allow: \//);
      assert.match(text, /Disallow: \/admin\//);
      assert.match(text, /Disallow: \/api\//);
    });

    it("normalizes CRLF/CR to LF", async () => {
      (prisma.projectSeoSettings.findUnique as any).mock.mockImplementation(async () => ({
        robotsTxt: "User-agent: *\r\nDisallow: /crlf\rDisallow: /cr"
      }));
      const req = new Request("http://localhost:3000/robots.txt?projectId=" + projA);
      const res = await robotsHandler(req);
      assert.strictEqual(res.status, 200);
      const text = await res.text();
      assert.doesNotMatch(text, /\r/);
      assert.match(text, /Disallow: \/crlf/);
      assert.match(text, /Disallow: \/cr/);
    });

    it("falls back to safe default if forbidden control characters remain", async () => {
      (prisma.projectSeoSettings.findUnique as any).mock.mockImplementation(async () => ({
        robotsTxt: "User-agent: *\nDisallow: /path\x00null"
      }));
      const req = new Request("http://localhost:3000/robots.txt?projectId=" + projA);
      const res = await robotsHandler(req);
      assert.strictEqual(res.status, 200);
      const text = await res.text();
      assert.match(text, /Disallow: \/admin\//);
      assert.doesNotMatch(text, /null/);
    });

    it("falls back to safe default if content exceeds 32768 bytes", async () => {
      (prisma.projectSeoSettings.findUnique as any).mock.mockImplementation(async () => ({
        robotsTxt: "A".repeat(33000)
      }));
      const req = new Request("http://localhost:3000/robots.txt?projectId=" + projA);
      const res = await robotsHandler(req);
      assert.strictEqual(res.status, 200);
      const text = await res.text();
      assert.match(text, /Disallow: \/admin\//);
    });

    it("FORCE_NOINDEX=true overrides persisted robots content with Disallow: /", async () => {
      process.env.FORCE_NOINDEX = "true";
      const req = new Request("http://localhost:3000/robots.txt?projectId=" + projA);
      const res = await robotsHandler(req);
      assert.strictEqual(res.status, 200);
      const text = await res.text();
      assert.strictEqual(text, "User-agent: *\nDisallow: /");
    });
  });

  describe("Sitemap Runtime Endpoint (/sitemap.xml)", () => {
    it("returns 404 XML when project is missing or invalid", async () => {
      const req = new Request("http://localhost:3000/sitemap.xml?projectId=invalid");
      const res = await sitemapHandler(req);
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.headers.get("content-type"), "application/xml; charset=utf-8");
      assert.strictEqual(res.headers.get("x-content-type-options"), "nosniff");
      assert.strictEqual(res.headers.get("cache-control"), "private, no-store");
    });

    it("FORCE_NOINDEX=true produces a valid empty sitemap urlset", async () => {
      process.env.FORCE_NOINDEX = "true";
      const req = new Request("http://localhost:3000/sitemap.xml?projectId=" + projA);
      const res = await sitemapHandler(req);
      assert.strictEqual(res.status, 200);
      const xml = await res.text();
      assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">\s*<\/urlset>/);
    });

    it("includes PUBLIC published routes and excludes UNLISTED, INTERNAL, PASSWORD_PROTECTED, noIndex, and pointer mismatches", async () => {
      const now = new Date("2026-09-24T12:00:00Z");

      (prisma.page.findMany as any).mock.mockImplementation(async (args: any) => {
        assert.strictEqual(args.where.projectId, projA);

        return [
          {
            id: "page-home",
            publishedRevisionId: "rev-home",
            publishedRevision: {
              id: "rev-home",
              seo: { metaTitle: "Home" },
              publishedAt: now,
            },
          },
          {
            id: "page-unlisted",
            publishedRevisionId: "rev-unlisted",
            publishedRevision: {
              id: "rev-unlisted",
              seo: {},
              publishedAt: now,
            },
          },
          {
            id: "page-internal",
            publishedRevisionId: "rev-internal",
            publishedRevision: {
              id: "rev-internal",
              seo: {},
              publishedAt: now,
            },
          },
          {
            id: "page-secret",
            publishedRevisionId: "rev-secret",
            publishedRevision: {
              id: "rev-secret",
              seo: {},
              publishedAt: now,
            },
          },
          {
            id: "page-noindex",
            publishedRevisionId: "rev-noindex",
            publishedRevision: {
              id: "rev-noindex",
              seo: { noIndex: true },
              publishedAt: now,
            },
          },
          {
            id: "page-pointer-mismatch",
            publishedRevisionId: "rev-mismatch-1",
            publishedRevision: {
              id: "rev-mismatch-2",
              seo: {},
              publishedAt: now,
            },
          },
        ];
      });

      const req = new Request("http://localhost:3000/sitemap.xml?projectId=" + projA);
      const res = await sitemapHandler(req);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get("content-type"), "application/xml; charset=utf-8");
      assert.strictEqual(res.headers.get("x-content-type-options"), "nosniff");
      assert.strictEqual(res.headers.get("cache-control"), "private, no-store");

      const xml = await res.text();
      assert.match(xml, /<loc>http:\/\/localhost:3000\/home<\/loc>/);
      assert.match(xml, /<lastmod>2026-09-24T12:00:00\.000Z<\/lastmod>/);

      assert.doesNotMatch(xml, /unlisted/);
      assert.doesNotMatch(xml, /internal/);
      assert.doesNotMatch(xml, /secret/);
      assert.doesNotMatch(xml, /noindex/);
      assert.doesNotMatch(xml, /pointer-mismatch/);

      assert.doesNotMatch(xml, /proj-seo-runtime/);
      assert.doesNotMatch(xml, /page-home/);
      assert.doesNotMatch(xml, /rev-home/);
    });

    it("handles valid internal, valid absolute http/https, and invalid canonical fallback", async () => {
      const now = new Date("2026-09-24T12:00:00Z");

      (prisma.page.findMany as any).mock.mockImplementation(async () => {
        return [
          {
            id: "page-1",
            publishedRevisionId: "rev-1",
            publishedRevision: {
              id: "rev-1",
              seo: { canonicalUrl: "/custom-internal-path" },
              publishedAt: now,
            },
          },
          {
            id: "page-2",
            publishedRevisionId: "rev-2",
            publishedRevision: {
              id: "rev-2",
              seo: { canonicalUrl: "https://external.example.com/canonical-page" },
              publishedAt: now,
            },
          },
          {
            id: "page-3",
            publishedRevisionId: "rev-3",
            publishedRevision: {
              id: "rev-3",
              seo: { canonicalUrl: "javascript:alert(1)" },
              publishedAt: now,
            },
          },
        ];
      });

      const req = new Request("http://localhost:3000/sitemap.xml?projectId=" + projA);
      const res = await sitemapHandler(req);
      assert.strictEqual(res.status, 200);

      const xml = await res.text();

      assert.match(xml, /<loc>http:\/\/localhost:3000\/custom-internal-path<\/loc>/);
      assert.match(xml, /<loc>https:\/\/external\.example\.com\/canonical-page<\/loc>/);
      assert.match(xml, /<loc>http:\/\/localhost:3000\/page-3<\/loc>/);
      assert.doesNotMatch(xml, /javascript:/);
    });

    it("orders entries deterministically (lexicographically) and escapes XML characters", async () => {
      const now = new Date("2026-09-24T12:00:00Z");

      (prisma.page.findMany as any).mock.mockImplementation(async () => {
        return [
          {
            id: "page-z",
            publishedRevisionId: "rev-z",
            publishedRevision: {
              id: "rev-z",
              seo: { canonicalUrl: "/z-page?param=1&special=<val>" },
              publishedAt: now,
            },
          },
          {
            id: "page-a",
            publishedRevisionId: "rev-a",
            publishedRevision: {
              id: "rev-a",
              seo: { canonicalUrl: "/a-page" },
              publishedAt: now,
            },
          },
        ];
      });

      const req = new Request("http://localhost:3000/sitemap.xml?projectId=" + projA);
      const res = await sitemapHandler(req);
      assert.strictEqual(res.status, 200);

      const xml = await res.text();

      const idxA = xml.indexOf("/a-page");
      const idxZ = xml.indexOf("/z-page");
      assert.ok(idxA !== -1 && idxZ !== -1);
      assert.ok(idxA < idxZ, "a-page must appear before z-page");

      assert.match(xml, /<loc>http:\/\/localhost:3000\/z-page\?param=1&amp;special=&lt;val&gt;<\/loc>/);
    });
  });
});
