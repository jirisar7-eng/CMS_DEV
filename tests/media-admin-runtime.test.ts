// @ts-nocheck
import Module from "node:module";
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === "lucide-react") {
    return new Proxy({}, { get: () => () => null });
  }
  return originalRequire.call(this, id);
};
import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { getCapabilityStatus } from '../lib/navigation/adminNav';

describe('SYN-MEDIA-002 Phase C: Admin Media Workflow & Runtime Contracts', () => {
  const rootDir = path.resolve(__dirname, '..');

  const actionsFilePath = path.join(rootDir, 'app/admin/media/actions.ts');
  const replaceModalPath = path.join(rootDir, 'components/admin/media/MediaReplaceModal.tsx');
  const detailDrawerPath = path.join(rootDir, 'components/admin/media/MediaDetailDrawer.tsx');
  const workspacePath = path.join(rootDir, 'components/admin/media/MediaLibraryWorkspace.tsx');

  const actionsCode = fs.readFileSync(actionsFilePath, 'utf8');
  const replaceModalCode = fs.readFileSync(replaceModalPath, 'utf8');
  const detailDrawerCode = fs.readFileSync(detailDrawerPath, 'utf8');
  const workspaceCode = fs.readFileSync(workspacePath, 'utf8');

  it('1. replaceMediaAsset is no longer placeholder/disabled', () => {
    assert.doesNotMatch(
      actionsCode,
      /Nahrazení souboru zatím není v této verzi bezpečně dostupné/,
      'replaceMediaAsset must not return disabled placeholder error'
    );
    assert.match(actionsCode, /export async function replaceMediaAsset/);
    assert.doesNotMatch(actionsCode, /_formData:\s*FormData/);
  });

  it('2. replace action requires media.replace permission', () => {
    assert.match(
      actionsCode,
      /hasPermission\(\s*context\.userId\s*,\s*['"]media\.replace['"]\s*,\s*context\.projectId\s*\)/,
      'replaceMediaAsset must strictly check media.replace with active projectId'
    );
  });

  it('3. replace action reads assetId + File from FormData', () => {
    assert.match(actionsCode, /formData\.get\(['"]assetId['"]\)/);
    assert.match(actionsCode, /formData\.get\(['"]file['"]\)/);
    assert.match(actionsCode, /typeof file === ['"]string['"]/);
  });

  it('4. replace action derives projectId from active project context and ignores client input', () => {
    assert.match(actionsCode, /getActiveProjectContext\(\)/);
    assert.doesNotMatch(
      actionsCode,
      /formData\.get\(['"]projectId['"]\)/,
      'replaceMediaAsset must never read or trust projectId from FormData'
    );
    assert.match(actionsCode, /mediaService\.replaceAsset\(\s*assetId\.trim\(\)\s*,\s*\{[^}]+\}\s*,\s*context\.projectId\s*\)/);
  });

  it('5. replace action calls mediaService.replaceAsset', () => {
    assert.match(actionsCode, /mediaService\.replaceAsset\(/);
    assert.match(actionsCode, /name:\s*file\.name/);
    assert.match(actionsCode, /data:\s*buffer/);
  });

  it('6. MediaReplaceModal creates FormData', () => {
    assert.match(replaceModalCode, /new FormData\(\)/);
  });

  it('7. MediaReplaceModal appends assetId', () => {
    assert.match(replaceModalCode, /formData\.append\(['"]assetId['"],\s*asset\.id\)/);
  });

  it('8. MediaReplaceModal appends file', () => {
    assert.match(replaceModalCode, /formData\.append\(['"]file['"],\s*selectedFile\)/);
  });

  it('9. modal calls onReplaceFile with FormData', () => {
    assert.match(replaceModalCode, /onReplaceFile\(\s*formData\s*\)/);
  });

  it('10. modal handles success callback', () => {
    assert.match(replaceModalCode, /onReplaceSuccess\?\.\(res\.asset\)/);
    assert.match(replaceModalCode, /onClose\(\)/);
  });

  it('11. PUBLISHED UI replace is disabled', () => {
    assert.match(replaceModalCode, /isPublished/);
    assert.match(replaceModalCode, /disabled=\{[^}]*isPublished[^}]*\}/);
    assert.match(replaceModalCode, /Publikované médium nelze nahradit/);
  });

  it('12. listMediaAssetVersions requires media.view', () => {
    assert.match(actionsCode, /export async function listMediaAssetVersions/);
    assert.match(
      actionsCode,
      /hasPermission\(\s*context\.userId\s*,\s*['"]media\.view['"]\s*,\s*context\.projectId\s*\)/
    );
  });

  it('13. restoreMediaAssetVersion requires media.replace', () => {
    assert.match(actionsCode, /export async function restoreMediaAssetVersion/);
    assert.match(
      actionsCode,
      /hasPermission\(\s*context\.userId\s*,\s*['"]media\.replace['"]\s*,\s*context\.projectId\s*\)/
    );
  });

  it('14. version operations use active project context', () => {
    assert.match(
      actionsCode,
      /mediaService\.listVersions\(\s*assetId\.trim\(\)\s*,\s*context\.projectId\s*\)/
    );
    assert.match(
      actionsCode,
      /mediaService\.setCurrentVersion\(\s*assetId\.trim\(\)\s*,\s*versionId\.trim\(\)\s*,\s*context\.projectId\s*\)/
    );
  });

  it('15. MediaDetailDrawer exposes version history', () => {
    assert.match(detailDrawerCode, /Historie verzí/);
    assert.match(detailDrawerCode, /v\{ver\.versionNumber\}/);
    assert.match(detailDrawerCode, /onRestoreVersion\?\.\(ver\.id\)/);
    assert.match(detailDrawerCode, /Médium je ve stavu PUBLISHED\. Obnova historických verzí je zablokována/);
  });

  it('16. version restore does not expose storage signed URL or raw storageKey to client', () => {
    assert.doesNotMatch(detailDrawerCode, /ver\.storageKey/);
    assert.doesNotMatch(detailDrawerCode, /signedUrl/i);
    assert.doesNotMatch(actionsCode, /signedUrl/i);
  });

  it('17. workspace refreshes assets after replacement', () => {
    assert.match(workspaceCode, /refreshAssets\(\)/);
    assert.match(workspaceCode, /onReplaceSuccess=\{async\s*\(updated\)\s*=>\s*\{[^}]*refreshAssets\(\)/);
  });

  it('18. workspace refreshes version history after replacement/restore', () => {
    assert.match(workspaceCode, /loadVersions\(updated\.id\)/);
    assert.match(workspaceCode, /handleRestoreVersion/);
    assert.match(workspaceCode, /loadVersions\(selectedAsset\.id\)/);
  });

  // Base navigation and capability checks
  it('Media capability status is strictly ZÁKLAD', () => {
    assert.strictEqual(getCapabilityStatus('media'), 'ZÁKLAD');
  });

  it('app/admin/media/page.tsx is a Server Component reading getActiveProjectContext', () => {
    const pageCode = fs.readFileSync(path.join(rootDir, 'app/admin/media/page.tsx'), 'utf8');
    assert.doesNotMatch(pageCode, /'use client'/);
    assert.match(pageCode, /getActiveProjectContext/);
    assert.match(pageCode, /<MediaLibraryWorkspace/);
  });

  it('MediaLibraryWorkspace does not contain fake placeholder notices', () => {
    assert.doesNotMatch(workspaceCode, /BEZPEČNOSTNÍ BLOK: Chybí Auth Hranice/);
    assert.doesNotMatch(workspaceCode, /Knihovna médií je připravena na reálná data/);
  });
});
