import { prisma } from "@/lib/db";
import { PageSEO } from "@/lib/domain/pages";
import path from "path";

export interface ProjectSeoDefaults {
  defaultTitle?: string | null;
  titleTemplate?: string | null;
  defaultDescription?: string | null;
  defaultOgImage?: string | null;
}

export class SeoService {
  static validateCanonicalUrl(rawUrl: string): string {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      return "";
    }
    const trimmed = rawUrl.trim();
    // Reject control characters
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
      throw new Error("INVALID_CANONICAL_URL");
    }
    // Reject backslashes
    if (trimmed.includes("\\")) {
      throw new Error("INVALID_CANONICAL_URL");
    }
    // Reject protocol-relative
    if (trimmed.startsWith("//")) {
      throw new Error("INVALID_CANONICAL_URL");
    }
    // Check for URI schemes
    const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
    if (schemeMatch) {
      const scheme = schemeMatch[1].toLowerCase();
      if (scheme !== "http" && scheme !== "https") {
        throw new Error("INVALID_CANONICAL_URL");
      }
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          throw new Error("INVALID_CANONICAL_URL");
        }
        return parsed.toString();
      } catch {
        throw new Error("INVALID_CANONICAL_URL");
      }
    }
    // Internal path
    let p = trimmed;
    if (!p.startsWith("/")) {
      p = "/" + p;
    }
    const queryIndex = p.search(/[?#]/);
    const pathname = queryIndex !== -1 ? p.slice(0, queryIndex) : p;
    const suffix = queryIndex !== -1 ? p.slice(queryIndex) : "";
    let normalized = path.posix.normalize(pathname);
    if (!normalized.startsWith("/")) {
      normalized = "/" + normalized;
    }
    if (normalized.length > 1 && normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized + suffix;
  }

  static validateOgImageUrl(rawUrl: string): string {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      return "";
    }
    const trimmed = rawUrl.trim();
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
      return "";
    }
    if (trimmed.includes("\\")) {
      return "";
    }
    if (trimmed.startsWith("//")) {
      return "";
    }
    const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
    if (schemeMatch) {
      const scheme = schemeMatch[1].toLowerCase();
      if (scheme !== "http" && scheme !== "https") {
        return "";
      }
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return "";
        }
        return parsed.toString();
      } catch {
        return "";
      }
    }
    let p = trimmed;
    if (!p.startsWith("/")) {
      p = "/" + p;
    }
    const queryIndex = p.search(/[?#]/);
    const pathname = queryIndex !== -1 ? p.slice(0, queryIndex) : p;
    const suffix = queryIndex !== -1 ? p.slice(queryIndex) : "";
    let normalized = path.posix.normalize(pathname);
    if (!normalized.startsWith("/")) {
      normalized = "/" + normalized;
    }
    if (normalized.length > 1 && normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized + suffix;
  }

  static resolveRobotsText(rawContent: string | null | undefined): string {
    const safeDefault = "User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/";
    if (typeof rawContent !== "string" || !rawContent.trim()) {
      return safeDefault;
    }

    let normalized = rawContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    normalized = normalized.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "");

    if (!normalized.trim() || Buffer.byteLength(normalized, "utf8") > 32768) {
      return safeDefault;
    }

    return normalized;
  }

  static escapeXml(str: string): string {
    if (typeof str !== "string") return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/\x27/g, "&apos;");
  }

  /**
   * Resolves the effective SEO for a given page, inheriting from Project defaults if needed.
   * Also enforces environment-level force-noindex.
   */
  static async resolveEffectiveSeo(projectId: string, pageSeo: Partial<PageSEO> | null): Promise<PageSEO> {
    const projectDefaults = await prisma.projectSeoSettings.findUnique({
      where: { projectId }
    });
    const forceNoIndex = process.env.FORCE_NOINDEX === "true";
    let metaTitle = pageSeo?.metaTitle || projectDefaults?.defaultTitle || "";
    if (projectDefaults?.titleTemplate && metaTitle) {
      metaTitle = projectDefaults.titleTemplate.replace("%s", metaTitle);
    }
    let canonicalUrl = "";
    if (pageSeo?.canonicalUrl) {
      try {
        canonicalUrl = this.validateCanonicalUrl(pageSeo.canonicalUrl);
      } catch {
        canonicalUrl = "";
      }
    }
    const rawOg = pageSeo?.ogImage || projectDefaults?.defaultOgImage || "";
    const ogImage = this.validateOgImageUrl(rawOg);

    return {
      metaTitle,
      metaDescription: pageSeo?.metaDescription || projectDefaults?.defaultDescription || "",
      canonicalUrl,
      noIndex: forceNoIndex ? true : (pageSeo?.noIndex ?? false),
      ogImage,
    };
  }
}
