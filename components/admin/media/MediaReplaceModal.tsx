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
  onReplaceFile: (formData: FormData) => Promise<{ success: boolean; asset?: MediaAsset; error?: string }>;
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
      const formData = new FormData();
      formData.append('id', asset.id);
      formData.append('file', selectedFile);

      setReplaceProgress(75);

      const res = await onReplaceFile(formData);

      if (!res.success || !res.asset) {
        setErrorMessage(res.error || 'Výměna souboru selhala.');
        setIsReplacing(false);
        return;
      }

      setReplaceProgress(100);

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
            {!selectedFile ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-4 rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-background hover:bg-muted/30 transition-colors flex flex-col items-center justify-center text-center text-xs"
              >
                <span className="font-semibold text-foreground">Vybrat náhradní soubor z počítače</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">Nahráním vznikne nová verze aktiva</span>
              </button>
            ) : (
              <div className="p-3 rounded-xl border border-border bg-background flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0 text-xs">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-foreground truncate">{selectedFile.name}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{formatBytes(selectedFile.size)}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground text-xs"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {isReplacing && (
            <div className="p-3 rounded-xl bg-muted/60 border border-border space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-foreground">Nahrávám novou verzi souboru...</span>
                <span className="font-mono text-muted-foreground">{replaceProgress} %</span>
              </div>
              <div className="w-full bg-border rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-amber-500 h-full transition-all duration-200"
                  style={{ width: `${replaceProgress}%` }}
                />
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
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-amber-600 text-white hover:bg-amber-700 transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isReplacing ? 'Nahrazuji...' : 'Nahradit soubor'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
