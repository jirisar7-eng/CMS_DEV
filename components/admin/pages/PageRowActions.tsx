import React, { useState, useRef, useEffect } from 'react';
import { PageSummary, PageActionType } from '@/lib/domain/pages';
import { MoreHorizontal, ExternalLink, Edit3, Eye, Copy, Move, Archive } from 'lucide-react';
import Link from 'next/link';

interface PageRowActionsProps {
  page: PageSummary;
  onAction: (action: PageActionType, page: PageSummary) => void;
}

export function PageRowActions({ page, onAction }: PageRowActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const caps = page.capabilities;

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        id={`page-action-menu-${page.id}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={`Akce pro stránku ${page.title}`}
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="w-5 h-5" />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          aria-labelledby={`page-action-menu-${page.id}`}
          className="absolute right-0 mt-1 w-48 rounded-xl bg-popover text-popover-foreground border border-border shadow-xl py-1 z-30 focus:outline-none animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Otevřít */}
          <Link
            href={`/preview/site?path=${encodeURIComponent(page.path || '/')}`}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setIsOpen(false)}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs sm:text-sm font-medium transition-colors ${
              caps.canOpen
                ? 'text-foreground hover:bg-muted'
                : 'text-muted-foreground/50 cursor-not-allowed'
            }`}
            aria-disabled={!caps.canOpen}
          >
            <ExternalLink className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span>Otevřít</span>
          </Link>

          {/* Upravit */}
          <button
            type="button"
            role="menuitem"
            disabled={!caps.canEdit}
            onClick={() => {
              setIsOpen(false);
              onAction('edit', page);
            }}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs sm:text-sm font-medium transition-colors text-left ${
              caps.canEdit
                ? 'text-foreground hover:bg-muted'
                : 'text-muted-foreground/50 cursor-not-allowed'
            }`}
          >
            <Edit3 className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span>Upravit</span>
          </button>

          {/* Náhled */}
          <button
            type="button"
            role="menuitem"
            disabled={!caps.canPreview}
            onClick={() => {
              setIsOpen(false);
              onAction('preview', page);
            }}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs sm:text-sm font-medium transition-colors text-left ${
              caps.canPreview
                ? 'text-foreground hover:bg-muted'
                : 'text-muted-foreground/50 cursor-not-allowed'
            }`}
          >
            <Eye className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span>Náhled</span>
          </button>

          {/* Duplikovat */}
          <button
            type="button"
            role="menuitem"
            disabled={!caps.canDuplicate}
            onClick={() => {
              setIsOpen(false);
              onAction('duplicate', page);
            }}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs sm:text-sm font-medium transition-colors text-left ${
              caps.canDuplicate
                ? 'text-foreground hover:bg-muted'
                : 'text-muted-foreground/50 cursor-not-allowed'
            }`}
          >
            <Copy className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span>Duplikovat</span>
          </button>

          {/* Přesunout */}
          <button
            type="button"
            role="menuitem"
            disabled={!caps.canMove}
            onClick={() => {
              setIsOpen(false);
              onAction('move', page);
            }}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs sm:text-sm font-medium transition-colors text-left ${
              caps.canMove
                ? 'text-foreground hover:bg-muted'
                : 'text-muted-foreground/50 cursor-not-allowed'
            }`}
          >
            <Move className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span>Přesunout</span>
          </button>

          <div className="my-1 border-t border-border/60" />

          {/* Archivovat */}
          <button
            type="button"
            role="menuitem"
            disabled={!caps.canArchive}
            onClick={() => {
              setIsOpen(false);
              onAction('archive', page);
            }}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs sm:text-sm font-medium transition-colors text-left ${
              caps.canArchive
                ? 'text-destructive hover:bg-destructive/10'
                : 'text-muted-foreground/50 cursor-not-allowed'
            }`}
          >
            <Archive className="w-4 h-4 shrink-0 text-destructive" />
            <span>Archivovat</span>
          </button>
        </div>
      )}
    </div>
  );
}
