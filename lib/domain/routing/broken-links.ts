import { prisma } from '@/lib/db';
import { RoutingService, PageWithPublishedRevision } from './service';
import { RedirectService } from '@/lib/domain/redirects/service';

export type BrokenLinkReason =
  | 'TARGET_NOT_FOUND'
  | 'RESERVED_ROUTE'
  | 'DUPLICATE_ROUTE'
  | 'REDIRECT_CYCLE'
  | 'INVALID_REDIRECT'
  | 'NON_PUBLIC_ROUTE'
  | 'INVALID_PATH';

export interface BrokenLinkFinding {
  pageId: string;
  revisionId: string;
  sourcePath: string;
  href: string;
  reason: BrokenLinkReason;
  details?: Record<string, unknown>;
}

/**
 * Safely extracts links/hrefs from canonical PageContent without executing content or arbitrary scripts.
 */
export function extractLinksFromContent(content: unknown): string[] {
  const links = new Set<string>();

  if (!content || typeof content !== 'object') {
    return [];
  }

  const root = content as { blocks?: unknown[] };
  if (!Array.isArray(root.blocks)) {
    return [];
  }

  function scanString(str: string) {
    const trimmed = str.trim();
    if (!trimmed) return;

    // Scan for HTML anchor tags: <a ... href="..." ...>
    const aTagRegex = /<a\b[^>]*?\bhref=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    let matchedTag = false;
    while ((match = aTagRegex.exec(trimmed)) !== null) {
      if (match[1]) {
        links.add(match[1].trim());
        matchedTag = true;
      }
    }

    // Scan for markdown links: [label](url)
    const mdLinkRegex = /\[[^\]]*\]\(([^)]+)\)/g;
    while ((match = mdLinkRegex.exec(trimmed)) !== null) {
      if (match[1]) {
        links.add(match[1].trim());
        matchedTag = true;
      }
    }

    // If no markup pattern matched, check if the string itself is a direct path or URL
    if (!matchedTag) {
      if (
        trimmed.startsWith('/') ||
        trimmed.startsWith('./') ||
        trimmed.startsWith('../') ||
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('mailto:') ||
        trimmed.startsWith('tel:')
      ) {
        links.add(trimmed);
      }
    }
  }

  function scanValue(val: unknown) {
    if (typeof val === 'string') {
      scanString(val);
      return;
    }

    if (Array.isArray(val)) {
      for (const item of val) {
        scanValue(item);
      }
      return;
    }

    if (val && typeof val === 'object') {
      const obj = val as Record<string, unknown>;

      // Explicit URL / link fields on blocks (e.g. button, custom link components)
      if (typeof obj.url === 'string' && obj.url.trim()) {
        links.add(obj.url.trim());
      }
      if (typeof obj.href === 'string' && obj.href.trim()) {
        links.add(obj.href.trim());
      }
      if (typeof obj.link === 'string' && obj.link.trim()) {
        links.add(obj.link.trim());
      }
      if (typeof obj.targetPath === 'string' && obj.targetPath.trim()) {
        links.add(obj.targetPath.trim());
      }

      for (const [k, v] of Object.entries(obj)) {
        if (k !== 'url' && k !== 'href' && k !== 'link' && k !== 'targetPath') {
          scanValue(v);
        }
      }
    }
  }

  function scanBlocks(blocks: unknown[]) {
    for (const b of blocks) {
      if (!b || typeof b !== 'object') continue;
      const block = b as { data?: unknown; children?: unknown[] };
      if (block.data) {
        scanValue(block.data);
      }
      if (Array.isArray(block.children)) {
        scanBlocks(block.children);
      }
    }
  }

  scanBlocks(root.blocks);

  return Array.from(links);
}

export class BrokenLinkValidator {
  /**
   * Validates internal links across published pages in a project.
   */
  static async validatePages(
    projectId: string,
    pages: PageWithPublishedRevision[]
  ): Promise<BrokenLinkFinding[]> {
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      throw new Error('Project ID is required');
    }

    // Only inspect pages that have a published revision
    const publishedPages = pages.filter(p => p.publishedRevisionId && p.publishedRevision);
    if (publishedPages.length === 0) {
      return [];
    }

    // Derive published routes for the project
    const derivation = RoutingService.derivePublishedRoutesFromPages(projectId, pages);

    // Map each pageId to its derived path
    const pageIdToPath = new Map<string, string>();
    for (const [path, route] of derivation.resolvableRoutes.entries()) {
      pageIdToPath.set(route.pageId, path);
    }
    for (const [path, routes] of derivation.allDerivedRoutes.entries()) {
      for (const r of routes) {
        if (!pageIdToPath.has(r.pageId)) {
          pageIdToPath.set(r.pageId, path);
        }
      }
    }

    const findings: BrokenLinkFinding[] = [];

    for (const page of publishedPages) {
      const revision = page.publishedRevision!;
      const sourcePath = pageIdToPath.get(page.id) || `/${revision.slug || ''}`;
      const extractedLinks = extractLinksFromContent(revision.content);

      for (const rawHref of extractedLinks) {
        const trimmed = rawHref.trim();

        // 1. External http:// and https:// URLs are OUT OF SCOPE: do not crawl or fetch them.
        // Also skip anchors and non-HTTP URI schemes like mailto: and tel:
        if (
          trimmed.startsWith('http://') ||
          trimmed.startsWith('https://') ||
          trimmed.startsWith('mailto:') ||
          trimmed.startsWith('tel:') ||
          trimmed.startsWith('#') ||
          trimmed === ''
        ) {
          continue;
        }

        // 2. Safe path normalization
        let normalizedPath: string;
        try {
          normalizedPath = RoutingService.normalizePath(trimmed);
        } catch {
          findings.push({
            pageId: page.id,
            revisionId: revision.id,
            sourcePath,
            href: trimmed,
            reason: 'INVALID_PATH',
          });
          continue;
        }

        const pathnameOnly = normalizedPath.split(/[?#]/)[0];

        // 3. Reserved route check
        if (RoutingService.isReserved(pathnameOnly)) {
          findings.push({
            pageId: page.id,
            revisionId: revision.id,
            sourcePath,
            href: trimmed,
            reason: 'RESERVED_ROUTE',
          });
          continue;
        }

        // 4. Duplicate/conflicted route check
        if (derivation.duplicatePaths.has(pathnameOnly)) {
          findings.push({
            pageId: page.id,
            revisionId: revision.id,
            sourcePath,
            href: trimmed,
            reason: 'DUPLICATE_ROUTE',
          });
          continue;
        }

        // 5. Valid direct published public route
        if (derivation.resolvableRoutes.has(pathnameOnly)) {
          continue;
        }

        // 6. Non-public route check (INTERNAL, PASSWORD_PROTECTED, or non-public ancestor)
        const derivedNonPublic = derivation.allDerivedRoutes.get(pathnameOnly);
        if (derivedNonPublic && derivedNonPublic.length > 0) {
          findings.push({
            pageId: page.id,
            revisionId: revision.id,
            sourcePath,
            href: trimmed,
            reason: 'NON_PUBLIC_ROUTE',
          });
          continue;
        }

        // 7. Redirect check: A redirect is valid only if its final internal target resolves to a valid published public route.
        const redirectRule = await prisma.redirectRule.findFirst({
          where: {
            projectId,
            sourcePath: pathnameOnly,
            active: true,
          },
          select: { id: true, targetPath: true, type: true },
        });

        if (redirectRule) {
          const resolvedRedirect = await RedirectService.resolveRedirect(projectId, pathnameOnly);

          if (!resolvedRedirect.targetPath || !resolvedRedirect.type) {
            findings.push({
              pageId: page.id,
              revisionId: revision.id,
              sourcePath,
              href: trimmed,
              reason: 'REDIRECT_CYCLE',
              details: { initialTarget: redirectRule.targetPath },
            });
            continue;
          }

          const finalTarget = resolvedRedirect.targetPath.split(/[?#]/)[0];

          if (RoutingService.isReserved(finalTarget)) {
            findings.push({
              pageId: page.id,
              revisionId: revision.id,
              sourcePath,
              href: trimmed,
              reason: 'RESERVED_ROUTE',
              details: { redirectTarget: resolvedRedirect.targetPath },
            });
            continue;
          }

          if (derivation.duplicatePaths.has(finalTarget)) {
            findings.push({
              pageId: page.id,
              revisionId: revision.id,
              sourcePath,
              href: trimmed,
              reason: 'DUPLICATE_ROUTE',
              details: { redirectTarget: resolvedRedirect.targetPath },
            });
            continue;
          }

          if (derivation.resolvableRoutes.has(finalTarget)) {
            // Valid redirect resolving to a valid published public route
            continue;
          }

          const targetDerived = derivation.allDerivedRoutes.get(finalTarget);
          if (targetDerived && targetDerived.length > 0) {
            findings.push({
              pageId: page.id,
              revisionId: revision.id,
              sourcePath,
              href: trimmed,
              reason: 'NON_PUBLIC_ROUTE',
              details: { redirectTarget: resolvedRedirect.targetPath },
            });
            continue;
          }

          // Target of redirect does not resolve
          findings.push({
            pageId: page.id,
            revisionId: revision.id,
            sourcePath,
            href: trimmed,
            reason: 'TARGET_NOT_FOUND',
            details: { redirectTarget: resolvedRedirect.targetPath },
          });
          continue;
        }

        // 8. No published page and no redirect -> TARGET_NOT_FOUND
        findings.push({
          pageId: page.id,
          revisionId: revision.id,
          sourcePath,
          href: trimmed,
          reason: 'TARGET_NOT_FOUND',
        });
      }
    }

    return findings;
  }

  /**
   * Project-scoped broken link validation querying published pages from database.
   */
  static async validateProject(projectId: string): Promise<BrokenLinkFinding[]> {
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      throw new Error('Project ID is required');
    }

    const pages = await prisma.page.findMany({
      where: { projectId },
      include: {
        publishedRevision: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    return this.validatePages(projectId, pages as unknown as PageWithPublishedRevision[]);
  }
}
