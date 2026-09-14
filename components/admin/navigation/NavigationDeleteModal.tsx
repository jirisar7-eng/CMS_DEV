"use client";

import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { NavigationItem } from '@/lib/domain/navigation/types';

interface NavigationDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  item: NavigationItem | null;
  childCount?: number;
}

export const NavigationDeleteModal: React.FC<NavigationDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  item,
  childCount = 0,
}) => {
  if (!isOpen || !item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nav-delete-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="nav-delete-modal-title" className="font-bold text-foreground text-sm sm:text-base">
                Smazat položku navigace
              </h3>
              <p className="text-xs text-muted-foreground">Tuto akci nelze vzít zpět.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            aria-label="Zavřít"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 text-xs sm:text-sm text-foreground">
          <p>
            Opravdu si přejete odstranit položku <strong className="text-foreground">„{item.label}“</strong>?
          </p>

          {childCount > 0 && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Pozor: Položka obsahuje {childCount} {childCount === 1 ? 'podpoložku' : 'podpoložky'}</span>
              </div>
              <p className="text-[11px] text-destructive/90">
                Smazáním této nadřazené položky budou současně odstraněny i všechny její vnořené odkazy.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-border bg-card text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-destructive text-white hover:bg-destructive/90 transition-colors shadow-xs cursor-pointer inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            <span>Potvrdit smazání</span>
          </button>
        </div>
      </div>
    </div>
  );
};
