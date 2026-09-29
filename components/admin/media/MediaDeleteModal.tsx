'use client';

import React, { useRef, useEffect } from 'react';
import Link from 'next/link';
import { Trash2, AlertTriangle, ShieldAlert, Archive, X, ExternalLink, CheckCircle2 } from 'lucide-react';
import { MediaAsset } from '@/lib/domain/media/types';
import { HelpTrigger } from '@/components/help/HelpTrigger';

interface MediaDeleteModalProps {
  isOpen: boolean;
  asset: MediaAsset | null;
  onClose: () => void;
  onConfirmDelete: (assetId: string) => void;
  onArchiveInstead: (assetId: string) => void;
}

export function MediaDeleteModal({
  isOpen,
  asset,
  onClose,
  onConfirmDelete,
  onArchiveInstead,
}: MediaDeleteModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen || !asset) return;
    previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;

    const focusables = modalRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusables && focusables.length > 0) {
      focusables[0].focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusableEls = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableEls.length === 0) return;
        const firstEl = focusableEls[0];
        const lastEl = focusableEls[focusableEls.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedElementRef.current?.focus();
    };
  }, [isOpen, asset, onClose]);

  if (!isOpen || !asset) return null;

  const isUsed = asset.usageCount > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div
        ref={modalRef}
        id="media-delete-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="media-delete-modal-title"
        className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                isUsed ? 'bg-amber-500/10 text-amber-600' : 'bg-destructive/10 text-destructive'
              }`}
            >
              {isUsed ? <ShieldAlert className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
            </div>
            <div>
              <h3 id="media-delete-modal-title" className="text-sm sm:text-base font-bold text-foreground">
                {isUsed ? 'Smazání blokováno systémem' : 'Potvrdit smazání média'}
              </h3>
              <p className="text-[11px] text-muted-foreground truncate max-w-[240px]">
                {asset.metadata.title}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <HelpTrigger helpKey="media.delete" />
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-4 text-xs">
          {isUsed ? (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>Médium nelze trvale smazat (ochrana referencí)</span>
                </div>
                <p className="leading-relaxed">
                  Toto aktivum je aktivně používáno na <strong>{asset.usageCount} {asset.usageCount === 1 ? 'stránce' : 'stránkách'}</strong>.
                  Smazání by způsobilo rozbití odkazů a chybějící obrázky na veřejném webu.
                </p>
              </div>

              {/* References list */}
              <div className="space-y-1.5">
                <span className="font-bold text-foreground block">Místa aktivního použití:</span>
                <div className="rounded-xl border border-border bg-muted/40 divide-y divide-border/60 max-h-48 overflow-y-auto">
                  {asset.usageReferences.map((ref) => (
                    <div key={ref.id} className="p-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-foreground truncate">{ref.pageTitle}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {ref.pageSlug} • {ref.blockType || 'Blok'} ({ref.field || 'obsah'})
                        </div>
                      </div>
                      <Link
                        href={`/admin/pages/${ref.pageId}/edit`}
                        target="_blank"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-background hover:bg-muted border border-border text-[11px] font-semibold text-primary transition-colors shrink-0"
                      >
                        <span>Upravit stránku</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Pokud chcete soubor skrýt z výběru nových médií a zároveň zachovat stávající stránky funkční, můžete jej <strong>archivovat</strong>.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-foreground leading-relaxed">
                Opravdu si přejete trvale smazat médium <strong>{asset.metadata.title}</strong> (soubor: <code className="font-mono text-[11px]">{asset.filename}</code>)?
              </p>
              <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Bezpečná kontrola: Soubor není používán na žádné stránce.</span>
              </div>
              <p className="text-muted-foreground text-[11px]">
                Tato akce je nevratná a odstraní záznam i fyzický soubor z úložiště.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            Zavřít
          </button>

          {isUsed ? (
            <button
              type="button"
              onClick={() => {
                onArchiveInstead(asset.id);
                onClose();
              }}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-amber-600 text-white hover:bg-amber-700 transition-colors shadow-xs inline-flex items-center gap-1.5"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Archivovat médium</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                onConfirmDelete(asset.id);
                onClose();
              }}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors shadow-xs inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Trvale smazat</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
