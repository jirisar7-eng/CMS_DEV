// @ts-nocheck
import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { getCapabilityStatus } from '../lib/navigation/adminNav';

describe('SYN-MEDIA-001B: Admin Media UI & Runtime Truthfulness', () => {
  const rootDir = path.resolve(__dirname, '..');

  it('Media capability status is strictly ZÁKLAD (not FUNKČNÍ because full non-SVG scan is pending)', () => {
    assert.strictEqual(getCapabilityStatus('media'), 'ZÁKLAD');
  });

  it('app/admin/media/page.tsx is a Server Component reading getActiveProjectContext', () => {
    const pageCode = fs.readFileSync(path.join(rootDir, 'app/admin/media/page.tsx'), 'utf8');
    assert.doesNotMatch(pageCode, /'use client'/);
    assert.match(pageCode, /getActiveProjectContext/);
    assert.match(pageCode, /<MediaLibraryWorkspace/);
  });

  it('MediaLibraryWorkspace does not contain fake placeholder notice "Chybí Auth Hranice"', () => {
    const workspaceCode = fs.readFileSync(
      path.join(rootDir, 'components/admin/media/MediaLibraryWorkspace.tsx'),
      'utf8'
    );
    assert.doesNotMatch(workspaceCode, /BEZPEČNOSTNÍ BLOK: Chybí Auth Hranice/);
    assert.doesNotMatch(workspaceCode, /Knihovna médií je připravena na reálná data/);
  });

  it('MediaUploadModal transmits FormData with real file bytes', () => {
    const uploadModalCode = fs.readFileSync(
      path.join(rootDir, 'components/admin/media/MediaUploadModal.tsx'),
      'utf8'
    );
    assert.match(uploadModalCode, /new FormData\(\)/);
    assert.match(uploadModalCode, /formData\.append\('file', selectedFile\)/);
  });

  it('app/api/media/[id]/route.ts uses resolvePublicProjectContext for project isolation', () => {
    const publicRouteCode = fs.readFileSync(
      path.join(rootDir, 'app/api/media/[id]/route.ts'),
      'utf8'
    );
    assert.match(publicRouteCode, /resolvePublicProjectContext/);
    assert.match(publicRouteCode, /mediaService\.getAsset/);
  });
});

