'use client';

import React, { useState, useRef } from 'react';
import { RefreshCw, X, AlertTriangle, Upload, CheckCircle2, File } from 'lucide-react';
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
  onReplaceSuccess,
  onReplaceFile,
}: MediaReplaceModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);



  if (!isOpen || !asset) return null;

  const isPublished = (asset.status as string)?.toUpperCase() === 'PUBLISHED';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
    } else {
      setSelectedFile(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || isSubmitting || isPublished) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('assetId', asset.id);
      formData.append('file', selectedFile);

      if (onReplaceFile) {
        const res = await onReplaceFile(formData);
        if (res.success && res.asset) {
          onReplaceSuccess?.(res.asset);
          onClose();
          return;
        }
        setError(res.error || 'Nahrazení souboru se nezdařilo.');
      }
    } catch (err: any) {
      setError(err.message || 'Neočekávaná chyba při nahrazování souboru.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div
        id="media-replace-modal"
        className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center shrink-0">
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
              disabled={isSubmitting}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {/* Published warning banner */}
          {isPublished && (
            <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs leading-relaxed space-y-1">
              <span className="font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Publikované médium nelze nahradit
              </span>
              <span>
                Toto médium má stav PUBLISHED a je veřejně dostupné. Nahrazení souboru je z bezpečnostních důvodů zablokováno. Pro změnu obsahu nejdříve médium odpublikujte nebo vytvořte novou verzi.
              </span>
            </div>
          )}

          {/* Current file info */}
          <div className="p-3 rounded-xl border border-border bg-muted/40 text-xs space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Aktuální soubor</span>
            <div className="font-bold text-foreground truncate">{asset.filename}</div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {formatBytes(asset.sizeBytes)} • {asset.mimeType}
            </div>
          </div>

          {/* Replacement file selection */}
          {!isPublished && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Nový náhradní soubor
              </label>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                disabled={isSubmitting || isPublished}
                className="hidden"
                id="replace-file-input"
              />

              {selectedFile ? (
                <div className="p-3 rounded-xl border border-sky-500/30 bg-sky-500/5 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <File className="w-4 h-4 text-sky-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-bold text-foreground truncate">{selectedFile.name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {formatBytes(selectedFile.size)} • {selectedFile.type || 'neznámý typ'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    disabled={isSubmitting}
                    className="text-xs text-muted-foreground hover:text-destructive p-1 rounded-md transition-colors"
                  >
                    Změnit
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="replace-file-input"
                  className="border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-all"
                >
                  <Upload className="w-6 h-6 text-muted-foreground" />
                  <div className="text-xs font-semibold text-foreground">Vyberte nový soubor z počítače</div>
                  <div className="text-[10px] text-muted-foreground">
                    Soubor bude validován a nahradí stávající data při zachování ID média a vazeb na stránky
                  </div>
                </label>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
            </div>
          )}

          {/* Footer Controls */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedFile || isPublished}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
              <span>{isSubmitting ? 'Nahrazuji soubor…' : 'Nahradit soubor'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
