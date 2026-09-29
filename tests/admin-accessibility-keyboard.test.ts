import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('SYN-UX-001: Admin Accessibility & Keyboard Release Contracts', () => {
  describe('1. AdminShell Accessibility Contracts', () => {
    const shellPath = path.join(process.cwd(), 'components/admin/AdminShell.tsx');
    const shellCode = fs.readFileSync(shellPath, 'utf8');

    it('contains accessible skip link with exact Czech copy', () => {
      assert.match(shellCode, /Přeskočit na hlavní obsah/);
      assert.match(shellCode, /href="#admin-main"/);
      assert.match(shellCode, /sr-only focus:not-sr-only/);
    });

    it('contains matching main element id target #admin-main', () => {
      assert.match(shellCode, /<main[^>]+id="admin-main"/);
    });

    it('mobile navigation button contains aria-expanded and aria-controls', () => {
      assert.match(shellCode, /aria-expanded=\{sidebarOpen\}/);
      assert.match(shellCode, /aria-controls="admin-sidebar"/);
    });

    it('sidebar element contains stable id="admin-sidebar"', () => {
      assert.match(shellCode, /id="admin-sidebar"/);
    });

    it('mobile navigation enforces max-md:invisible when closed and max-md:visible when open', () => {
      assert.match(shellCode, /sidebarOpen\s*\?\s*['"]translate-x-0 max-md:visible['"]\s*:\s*['"]-translate-x-full max-md:invisible['"]/);
    });

    it('implements Escape key handler to dismiss mobile navigation', () => {
      assert.match(shellCode, /e\.key === ['"]Escape['"]/);
      assert.match(shellCode, /setSidebarOpen\(false\)/);
    });

    it('desktop sidebar remains untouched', () => {
      assert.match(shellCode, /md:translate-x-0 md:static md:flex/);
      assert.match(shellCode, /md:w-72/);
    });
  });

  describe('2. ProjectSelector Truthful Semantic Contract', () => {
    const selectorPath = path.join(process.cwd(), 'components/admin/ProjectSelector.tsx');
    const selectorCode = fs.readFileSync(selectorPath, 'utf8');

    it('trigger button contains aria-expanded and aria-controls', () => {
      assert.match(selectorCode, /aria-expanded=\{isOpen\}/);
      assert.match(selectorCode, /aria-controls="project-selector-dropdown"/);
    });

    it('popup container uses role="group" and accessible label', () => {
      assert.match(selectorCode, /id="project-selector-dropdown"/);
      assert.match(selectorCode, /role="group"/);
      assert.match(selectorCode, /aria-label="Seznam projektů"/);
    });

    it('does NOT introduce unmanaged composite listbox or menu roles', () => {
      assert.doesNotMatch(selectorCode, /role="listbox"/);
      assert.doesNotMatch(selectorCode, /role="option"/);
      assert.doesNotMatch(selectorCode, /role="menu"/);
      assert.doesNotMatch(selectorCode, /role="menuitem"/);
      assert.doesNotMatch(selectorCode, /aria-haspopup="listbox"/);
    });

    it('active project choice receives aria-current="true"', () => {
      assert.match(selectorCode, /aria-current=\{activeProjectId === p\.id \? "true" : undefined\}/);
    });

    it('implements Escape key listener and restores focus to trigger button', () => {
      assert.match(selectorCode, /e\.key === ['"]Escape['"]/);
      assert.match(selectorCode, /triggerRef\.current\?\.focus\(\)/);
    });

    it('implements outside click handler as useful UX', () => {
      assert.match(selectorCode, /handleClickOutside/);
      assert.match(selectorCode, /containerRef\.current/);
    });

    it('preserves existing project cookie and reload mechanics', () => {
      assert.match(selectorCode, /document\.cookie = `syn_project_id=\$\{id\}; path=\/; max-age=31536000`/);
      assert.match(selectorCode, /window\.location\.reload\(\)/);
    });
  });

  describe('3. MediaDetailDrawer Accessibility & Focus Contract', () => {
    const drawerPath = path.join(process.cwd(), 'components/admin/media/MediaDetailDrawer.tsx');
    const drawerCode = fs.readFileSync(drawerPath, 'utf8');

    it('drawer container has role="dialog", aria-modal="true", and aria-labelledby', () => {
      assert.match(drawerCode, /role="dialog"/);
      assert.match(drawerCode, /aria-modal="true"/);
      assert.match(drawerCode, /aria-labelledby="media-drawer-title"/);
    });

    it('drawer header heading has id="media-drawer-title"', () => {
      assert.match(drawerCode, /id="media-drawer-title"/);
    });

    it('drawer implements Escape key dismissal', () => {
      assert.match(drawerCode, /e\.key === ['"]Escape['"]/);
      assert.match(drawerCode, /onClose\(\)/);
    });

    it('drawer implements Tab focus containment', () => {
      assert.match(drawerCode, /e\.key === ['"]Tab['"]/);
      assert.match(drawerCode, /e\.shiftKey/);
    });

    it('drawer implements focus restoration to opener', () => {
      assert.match(drawerCode, /previouslyFocusedElementRef\.current\?\.focus\(\)/);
    });
  });

  describe('4. Media Modals Accessibility & Focus Contracts', () => {
    const uploadPath = path.join(process.cwd(), 'components/admin/media/MediaUploadModal.tsx');
    const uploadCode = fs.readFileSync(uploadPath, 'utf8');

    it('MediaUploadModal has role="dialog", aria-modal="true", and aria-labelledby', () => {
      assert.match(uploadCode, /role="dialog"/);
      assert.match(uploadCode, /aria-modal="true"/);
      assert.match(uploadCode, /aria-labelledby="media-upload-modal-title"/);
      assert.match(uploadCode, /id="media-upload-modal-title"/);
    });

    it('MediaUploadModal implements Escape and Tab trap', () => {
      assert.match(uploadCode, /e\.key === ['"]Escape['"]/);
      assert.match(uploadCode, /e\.key === ['"]Tab['"]/);
      assert.match(uploadCode, /previouslyFocusedElementRef\.current\?\.focus\(\)/);
    });

    const deletePath = path.join(process.cwd(), 'components/admin/media/MediaDeleteModal.tsx');
    const deleteCode = fs.readFileSync(deletePath, 'utf8');

    it('MediaDeleteModal has role="alertdialog", aria-modal="true", and aria-labelledby', () => {
      assert.match(deleteCode, /role="alertdialog"/);
      assert.match(deleteCode, /aria-modal="true"/);
      assert.match(deleteCode, /aria-labelledby="media-delete-modal-title"/);
      assert.match(deleteCode, /id="media-delete-modal-title"/);
    });

    it('MediaDeleteModal implements Escape and Tab trap while preserving delete confirmation callbacks', () => {
      assert.match(deleteCode, /e\.key === ['"]Escape['"]/);
      assert.match(deleteCode, /e\.key === ['"]Tab['"]/);
      assert.match(deleteCode, /onConfirmDelete\(asset\.id\)/);
      assert.match(deleteCode, /previouslyFocusedElementRef\.current\?\.focus\(\)/);
    });

    const navModalPath = path.join(process.cwd(), 'components/admin/navigation/NavigationItemModal.tsx');
    const navModalCode = fs.readFileSync(navModalPath, 'utf8');

    it('NavigationItemModal preserves role="dialog" and implements Escape and Tab trap', () => {
      assert.match(navModalCode, /role="dialog"/);
      assert.match(navModalCode, /aria-modal="true"/);
      assert.match(navModalCode, /aria-labelledby="nav-item-modal-title"/);
      assert.match(navModalCode, /e\.key === ['"]Escape['"]/);
      assert.match(navModalCode, /e\.key === ['"]Tab['"]/);
      assert.match(navModalCode, /previouslyFocusedElementRef\.current\?\.focus\(\)/);
    });
  });
});
