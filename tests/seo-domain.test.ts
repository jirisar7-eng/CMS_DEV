import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import { SeoService } from '../lib/domain/seo/service';
import { prisma } from '../lib/db';

// Mutate prisma singleton for tests
(prisma as any).projectSeoSettings = {
  findUnique: mock.fn(),
};

describe('SEO Domain Service', () => {
  const projectId = 'test-seo-project-1';

  beforeEach(() => {
    (prisma.projectSeoSettings.findUnique as any).mock.mockImplementation(async (args: any) => {
      if (args.where.projectId === projectId) {
        return {
          projectId,
          defaultTitle: 'Default Title',
          titleTemplate: '%s | My Site',
          defaultDescription: 'Default Desc',
          defaultOgImage: '/default.jpg'
        };
      }
      return null;
    });
  });

  afterEach(() => {
    (prisma.projectSeoSettings.findUnique as any).mock.resetCalls();
    delete process.env.FORCE_NOINDEX;
  });

  it('should inherit defaults when page SEO is empty', async () => {
    const seo = await SeoService.resolveEffectiveSeo(projectId, null);
    assert.strictEqual(seo.metaTitle, 'Default Title | My Site');
    assert.strictEqual(seo.metaDescription, 'Default Desc');
    assert.strictEqual(seo.ogImage, '/default.jpg');
    assert.strictEqual(seo.noIndex, false);
  });

  it('should prefer page SEO over defaults', async () => {
    const seo = await SeoService.resolveEffectiveSeo(projectId, {
      metaTitle: 'Page Title',
      metaDescription: 'Page Desc',
      ogImage: '/page.jpg',
      noIndex: true
    });
    assert.strictEqual(seo.metaTitle, 'Page Title | My Site');
    assert.strictEqual(seo.metaDescription, 'Page Desc');
    assert.strictEqual(seo.ogImage, '/page.jpg');
    assert.strictEqual(seo.noIndex, true);
  });

  it('should force noindex via environment variable', async () => {
    process.env.FORCE_NOINDEX = 'true';
    const seo = await SeoService.resolveEffectiveSeo(projectId, {
      noIndex: false
    });
    assert.strictEqual(seo.noIndex, true);
  });

  it('should normalize canonical URLs', async () => {
    const seo = await SeoService.resolveEffectiveSeo(projectId, {
      canonicalUrl: 'about-us'
    });
    assert.strictEqual(seo.canonicalUrl, '/about-us');

    const seo2 = await SeoService.resolveEffectiveSeo(projectId, {
      canonicalUrl: 'https://example.com/about-us'
    });
    assert.strictEqual(seo2.canonicalUrl, 'https://example.com/about-us');
  });
});
