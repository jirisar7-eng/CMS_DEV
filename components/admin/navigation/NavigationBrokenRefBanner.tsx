"use client";

import React from 'react';
import { AlertTriangle, ExternalLink, RefreshCw, Trash2, ArrowRight } from 'lucide-react';
import { BrokenPageReference } from '@/lib/domain/navigation/types';

interface NavigationBrokenRefBannerProps {
  brokenRefs: BrokenPageReference[];
  onFixItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onOpenHelp: () => void;
}

export const NavigationBrokenRefBanner: React.FC<NavigationBrokenRefBannerProps> = ({
  brokenRefs,
  onFixItem,
  onDeleteItem,
  onOpenHelp,
}) => {
  if (brokenRefs.length === 0) return null;

  return (
    <div
      id="nav-broken-refs-banner"
      className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-foreground space-y-3"
      role="alert"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-semibold text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Detekováno {brokenRefs.length} {brokenRefs.length === 1 ? 'neplatné propojení' : 'neplatná propojení'} na stránku (Broken References)
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenHelp}
          className="text-xs text-amber-700 dark:text-amber-300 underline hover:no-underline self-start sm:self-auto cursor-pointer"
        >
          Co znamená neplatná reference?
        </button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Následující položky navigace odkazují na identifikátory stránek, které byly smazány nebo neexistují.
        Synthesis CMS tyto odkazy nikdy nemaže tiše na pozadí — můžete vybrat náhradní stránku nebo odkaz smazat.
      </p>

      <div className="space-y-2 pt-1">
        {brokenRefs.map((ref) => (
          <div
            key={ref.itemId}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-card border border-amber-500/20 text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-foreground truncate">„{ref.itemLabel}“</span>
              <span className="text-muted-foreground font-mono text-[11px] truncate">
                (Chybějící ID: <span className="text-amber-600 dark:text-amber-400 font-bold">{ref.pageId}</span>)
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onFixItem(ref.itemId)}
                className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Vybrat novou stránku</span>
              </button>
              <button
                type="button"
                onClick={() => onDeleteItem(ref.itemId)}
                className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                title="Odstranit neplatnou položku"
                aria-label="Odstranit neplatnou položku"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
