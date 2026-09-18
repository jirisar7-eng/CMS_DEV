import { prisma } from '@/lib/db';
import { PageSEO } from '@/lib/domain/pages';

export interface ProjectSeoDefaults {
  defaultTitle?: string | null;
  titleTemplate?: string | null;
  defaultDescription?: string | null;
  defaultOgImage?: string | null;
}

export class SeoService {
  /**
   * Resolves the effective SEO for a given page, inheriting from Project defaults if needed.
   * Also enforces environment-level force-noindex.
   */
  static async resolveEffectiveSeo(projectId: string, pageSeo: Partial<PageSEO> | null): Promise<PageSEO> {
    const projectDefaults = await prisma.projectSeoSettings.findUnique({
      where: { projectId }
    });

    const forceNoIndex = process.env.FORCE_NOINDEX === 'true';

    let metaTitle = pageSeo?.metaTitle || projectDefaults?.defaultTitle || '';
    if (projectDefaults?.titleTemplate && metaTitle) {
      metaTitle = projectDefaults.titleTemplate.replace('%s', metaTitle);
    }

    let canonicalUrl = pageSeo?.canonicalUrl || '';
    if (canonicalUrl) {
      if (!canonicalUrl.startsWith('http://') && !canonicalUrl.startsWith('https://') && !canonicalUrl.startsWith('/')) {
        canonicalUrl = '/' + canonicalUrl; // Normalize internal paths
      }
    }

    return {
      metaTitle,
      metaDescription: pageSeo?.metaDescription || projectDefaults?.defaultDescription || '',
      canonicalUrl,
      noIndex: forceNoIndex ? true : (pageSeo?.noIndex ?? false),
      ogImage: pageSeo?.ogImage || projectDefaults?.defaultOgImage || '',
    };
  }
}
