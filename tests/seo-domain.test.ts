import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { SeoService } from '../lib/domain/seo/service';
import { prisma } from '../lib/db';
import { hasPermission } from '../lib/auth/rbac';

// Mutate prisma singleton for tests
(prisma as any).projectSeoSettings = {
  findUnique: mock.fn(),
  upsert: mock.fn(),
};

(prisma as any).permission = {
  findUnique: mock.fn(),
};

(prisma as any).userPermissionOverride = {
  findMany: mock.fn(),
};

(prisma as any).userRole = {
  findMany: mock.fn(),
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
    (prisma.permission.findUnique as any).mock.resetCalls();
    (prisma.userPermissionOverride.findMany as any).mock.resetCalls();
    (prisma.userRole.findMany as any).mock.resetCalls();
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

  it('should reject canonical unsafe schemes and malformed URLs', () => {
    // Unsafe schemes
    assert.throws(
      () => SeoService.validateCanonicalUrl('javascript:alert(1)'),
      { message: 'INVALID_CANONICAL_URL' }
    );
    assert.throws(
      () => SeoService.validateCanonicalUrl('data:text/html,<script>evil</script>'),
      { message: 'INVALID_CANONICAL_URL' }
    );
    assert.throws(
      () => SeoService.validateCanonicalUrl('vbscript:msgbox("hello")'),
      { message: 'INVALID_CANONICAL_URL' }
    );

    // Protocol-relative
    assert.throws(
      () => SeoService.validateCanonicalUrl('//attacker.com/exploit'),
      { message: 'INVALID_CANONICAL_URL' }
    );

    // Backslashes
    assert.throws(
      () => SeoService.validateCanonicalUrl('\\attacker.com'),
      { message: 'INVALID_CANONICAL_URL' }
    );

    // Control characters
    assert.throws(
      () => SeoService.validateCanonicalUrl('/path\x00null'),
      { message: 'INVALID_CANONICAL_URL' }
    );

    // Malformed URL
    assert.throws(
      () => SeoService.validateCanonicalUrl('http://[::1'),
      { message: 'INVALID_CANONICAL_URL' }
    );
  });

  it('should isolate SEO settings by project', async () => {
    const seoProject2 = await SeoService.resolveEffectiveSeo('other-project-id', null);
    assert.strictEqual(seoProject2.metaTitle, '');
    assert.strictEqual(seoProject2.metaDescription, '');
    assert.strictEqual(seoProject2.ogImage, '');
  });

  it('should enforce RBAC denial and fail-closed behavior for SEO permissions', async () => {
    // 1. Permission doesn't exist in system -> returns false
    (prisma.permission.findUnique as any).mock.mockImplementation(async () => null);
    const allowedNonExistent = await hasPermission('user-1', 'seo.read', projectId);
    assert.strictEqual(allowedNonExistent, false);

    // 2. Permission exists, but user has no roles or overrides -> returns false
    (prisma.permission.findUnique as any).mock.mockImplementation(async () => ({
      id: 'perm-seo-read',
      key: 'seo.read',
    }));
    (prisma.userPermissionOverride.findMany as any).mock.mockImplementation(async () => []);
    (prisma.userRole.findMany as any).mock.mockImplementation(async () => []);

    const allowedNoRole = await hasPermission('user-1', 'seo.read', projectId);
    assert.strictEqual(allowedNoRole, false);

    // 3. User has explicit DENY override -> returns false
    (prisma.userPermissionOverride.findMany as any).mock.mockImplementation(async () => [
      { projectId, isGranted: false }
    ]);
    const allowedExplicitDeny = await hasPermission('user-1', 'seo.read', projectId);
    assert.strictEqual(allowedExplicitDeny, false);
  });
});
