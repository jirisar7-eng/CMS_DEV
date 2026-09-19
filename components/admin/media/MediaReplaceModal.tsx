'use client';

import React from 'react';
import { RefreshCw, X, AlertTriangle } from 'lucide-react';
import { MediaAsset } from '@/lib/domain/media/types';
import { formatBytes } from './MediaAssetCard';
import { HelpTrigger } from '@/components/help/HelpTrigger';

interface MediaReplaceModalProps {
  isOpen: boolean;
  asset: MediaAsset | null;
  onClose: () => void;
  onReplaceSuccess?: (updatedAsset: MediaAsset) => void;
  onReplaceFile?: (formData: FormData) => Promise<{ success: boolean; asset?: MediaAsset; error?: string }>;
}

export function MediaReplaceModal({
  isOpen,
  asset,
  onClose,
}: MediaReplaceModalProps) {
  if (!isOpen || !asset) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div
        id="media-replace-modal"
        className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-foreground">Nahradit soubor</h3>
              <p className="text-[11px] text-muted-foreground truncate max-w-[240px]">
                {asset.metadata.title}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <HelpTrigger helpKey="media.replace" />
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* Explanation Banner */}
          <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs leading-relaxed space-y-1">
            <span className="font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Funkce není dostupná
            </span>
            <span>Nahrazení souboru zatím není v této verzi bezpečně dostupné.</span>
          </div>

          {/* Current file info */}
          <div className="p-3 rounded-xl border border-border bg-muted/40 text-xs space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Aktuální soubor</span>
            <div className="font-bold text-foreground truncate">{asset.filename}</div>
            <div className="font-mono text-[11px] text-muted-foreground">{formatBytes(asset.sizeBytes)} • {asset.mimeType}</div>
          </div>

          {/* Footer Controls */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              Zavřít
            </button>
            <button
              type="button"
              disabled={true}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-amber-600/50 text-white opacity-50 cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Nahradit soubor</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
