'use client';

import React, { useState, useRef } from 'react';
import { RefreshCw, X, AlertTriangle, ShieldCheck, FileText, Image as ImageIcon } from 'lucide-react';
import { DEFAULT_UPLOAD_POLICY } from '@/lib/domain/media/mockProviders';
import { MediaAsset } from '@/lib/domain/media/types';
import { formatBytes } from './MediaAssetCard';
import { HelpTrigger } from '@/components/help/HelpTrigger';

interface MediaReplaceModalProps {
  isOpen: boolean;
  asset: MediaAsset | null;
  onClose: () => void;
  onReplaceSuccess: (updatedAsset: MediaAsset) => void;
  onReplaceFile: (
    assetId: string,
    file: { name: string; type: string; size: number }
  ) => Promise<{ success: boolean; asset?: MediaAsset; error?: string }>;
}

export function MediaReplaceModal({
  isOpen,
  asset,
  onClose,
  onReplaceSuccess,
  onReplaceFile,
}: MediaReplaceModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isReplacing, setIsReplacing] = useState(false);
  const [replaceProgress, setReplaceProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !asset) return null;

  const handleFileSelect = (file: File) => {
    setErrorMessage(null);
    if (file.size > DEFAULT_UPLOAD_POLICY.maxSizeBytes) {
      setErrorMessage(`Soubor překračuje limit ${formatBytes(DEFAULT_UPLOAD_POLICY.maxSizeBytes)}.`);
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (DEFAULT_UPLOAD_POLICY.disallowedExtensions.includes(ext)) {
      setErrorMessage(`Soubory typu .${ext} nelze z bezpečnostních důvodů nahrát.`);
      return;
    }

    setSelectedFile(file);
  };

  const handleReplace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !asset) return;

    setIsReplacing(true);
    setErrorMessage(null);
    setReplaceProgress(30);

    try {
      await new Promise((r) => setTimeout(r, 200));
      setReplaceProgress(75);

      const res = await onReplaceFile(asset.id, {
        name: selectedFile.name,
        type: selectedFile.type,
        size: selectedFile.size,
      });

      if (!res.success || !res.asset) {
        setErrorMessage(res.error || 'Výměna souboru selhala.');
        setIsReplacing(false);
        return;
      }

      setReplaceProgress(100);
      await new Promise((r) => setTimeout(r, 150));

      onReplaceSuccess(res.asset);
      setSelectedFile(null);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Nastala neočekávaná chyba.');
    } finally {
      setIsReplacing(false);
    }
  };

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

        <form onSubmit={handleReplace} className="p-4 sm:p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Explanation Banner */}
          <div className="p-3 rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200 text-xs leading-relaxed space-y-1">
            <span className="font-bold block">Zachování referencí a odkazů</span>
            <span>
              Nahrazením souboru se aktualizuje fyzický obsah, ale zůstane zachováno stejné ID aktiva (
              <code className="font-mono text-[10px]">{asset.storageKey}</code>). Všech {asset.usageCount} referencí na stránkách zůstane funkčních.
            </span>
          </div>

          {/* Current file info */}
          <div className="p-3 rounded-xl border border-border bg-muted/40 text-xs space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Aktuální soubor</span>
            <div className="font-bold text-foreground truncate">{asset.filename}</div>
            <div className="font-mono text-[11px] text-muted-foreground">{formatBytes(asset.sizeBytes)} • {asset.mimeType}</div>
          </div>

          {/* New file selector */}
          <div>
            <label className="block text-xs font-bold text-foreground mb-1">Nový soubor</label>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
            />
            {selectedFile ? (
              <div className="p-3 rounded-xl border border-primary/40 bg-primary/5 flex items-center justify-between">
                <div className="min-w-0 text-xs">
                  <div className="font-bold text-foreground truncate">{selectedFile.name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{formatBytes(selectedFile.size)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-semibold text-primary hover:underline shrink-0"
                >
                  Změnit
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-border hover:border-primary/50 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Vybrat náhradní soubor</span>
              </button>
            )}
          </div>

          {/* Replacing progress */}
          {isReplacing && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono text-muted-foreground">
                <span>Aktualizuji úložiště...</span>
                <span>{replaceProgress} %</span>
              </div>
              <div className="w-full bg-border rounded-full h-1.5 overflow-hidden">
                <div className="bg-primary h-full transition-all duration-150" style={{ width: `${replaceProgress}%` }} />
              </div>
            </div>
          )}

          {/* Footer Controls */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={isReplacing}
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={!selectedFile || isReplacing}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isReplacing ? 'Nahrazuji...' : 'Provést výměnu'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
