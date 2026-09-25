import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolvePublicProjectContext } from "@/lib/domain/navigation/public-context";
import { RoutingService } from "@/lib/domain/routing/service";
import { SeoService } from "@/lib/domain/seo/service";
import { PageSEO } from "@/lib/domain/pages";

export async function GET(req: Request) {
  try {
    const projectId = await resolvePublicProjectContext(req);
    if (!projectId) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
        {
          status: 404,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
          },
        }
      );
    }

    let requestOrigin = "";
    try {
      const parsedUrl = new URL(req.url);
      if (
        (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") &&
        !parsedUrl.username &&
        !parsedUrl.password &&
        parsedUrl.hostname
      ) {
        requestOrigin = parsedUrl.origin;
      }
    } catch {
      requestOrigin = "";
    }

    if (!requestOrigin) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
        {
          status: 400,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
          },
        }
      );
    }

    if (process.env.FORCE_NOINDEX === "true") {
      const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>`;
      return new NextResponse(emptyXml, {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      });
    }

    const resolvableRoutesMap = await RoutingService.derivePublishedRoutes(projectId);
    const publicRoutes = Array.from(resolvableRoutesMap.values()).filter(
      (r) => r.visibility === "PUBLIC"
    );

    const pageIds = publicRoutes.map((r) => r.pageId);

    const pages = await prisma.page.findMany({
      where: {
        id: { in: pageIds },
        projectId,
      },
      select: {
        id: true,
        publishedRevisionId: true,
        publishedRevision: {
          select: {
            id: true,
            seo: true,
            publishedAt: true,
          },
        },
      },
    });

    const pageMap = new Map(pages.map((p) => [p.id, p]));

    interface SitemapEntry {
      loc: string;
      lastmod?: string;
    }
    const entries: SitemapEntry[] = [];

    for (const route of publicRoutes) {
      const pageData = pageMap.get(route.pageId);
      if (!pageData || !pageData.publishedRevisionId || !pageData.publishedRevision) {
        continue;
      }

      // Pointer integrity check: publishedRevisionId === publishedRevision.id
      if (pageData.publishedRevisionId !== pageData.publishedRevision.id) {
        continue;
      }

      const rev = pageData.publishedRevision;
      const rawSeo =
        rev.seo && typeof rev.seo === "object" ? (rev.seo as Partial<PageSEO>) : null;

      if (rawSeo?.noIndex === true) {
        continue;
      }

      let canonicalUrl = "";
      if (rawSeo?.canonicalUrl) {
        try {
          canonicalUrl = SeoService.validateCanonicalUrl(rawSeo.canonicalUrl);
        } catch {
          canonicalUrl = "";
        }
      }

      let loc = "";
      if (canonicalUrl) {
        if (
          canonicalUrl.startsWith("http://") ||
          canonicalUrl.startsWith("https://")
        ) {
          loc = canonicalUrl;
        } else if (canonicalUrl.startsWith("/")) {
          loc = `${requestOrigin}${canonicalUrl}`;
        }
      }

      if (!loc) {
        const cleanPath = route.path.startsWith("/") ? route.path : `/${route.path}`;
        loc = `${requestOrigin}${cleanPath}`;
      }

      const dateVal = route.publishedAt || rev.publishedAt || null;
      let lastmod: string | undefined = undefined;
      if (dateVal) {
        const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
        if (!isNaN(d.getTime())) {
          lastmod = d.toISOString();
        }
      }

      entries.push({ loc, lastmod });
    }

    entries.sort((a, b) => a.loc.localeCompare(b.loc));

    const escapeXml = SeoService.escapeXml;
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    for (const entry of entries) {
      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(entry.loc)}</loc>\n`;
      if (entry.lastmod) {
        xml += `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>\n`;
      }
      xml += `  </url>\n`;
    }
    xml += `</urlset>`;

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
      {
        status: 500,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      }
    );
  }
}
