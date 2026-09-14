'use client';

import React, { useState, useRef } from 'react';
import { Upload, X, CheckCircle2, AlertTriangle, ShieldCheck, FileText, Image as ImageIcon } from 'lucide-react';
import { DEFAULT_UPLOAD_POLICY } from '@/lib/domain/media/mockProviders';
import { MediaAsset } from '@/lib/domain/media/types';
import { formatBytes } from './MediaAssetCard';
import { HelpTrigger } from '@/components/help/HelpTrigger';

interface MediaUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (asset: MediaAsset) => void;
  onUploadFile: (params: {
    file: { name: string; type: string; size: number };
    metadata: {
      title?: string;
      altText?: string;
      description?: string;
      tags?: string[];
      author?: string;
    };
  }) => Promise<{ success: boolean; asset?: MediaAsset; error?: string }>;
}

export function MediaUploadModal({
  isOpen,
  onClose,
  onUploadSuccess,
  onUploadFile,
}: MediaUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [altText, setAltText] = useState('');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [author, setAuthor] = useState('Administrátor');

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileSelect = (file: File) => {
    setErrorMessage(null);

    // Validate size
    if (file.size > DEFAULT_UPLOAD_POLICY.maxSizeBytes) {
      setErrorMessage(`Soubor překračuje limit ${formatBytes(DEFAULT_UPLOAD_POLICY.maxSizeBytes)}.`);
      return;
    }

    // Validate extension
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (DEFAULT_UPLOAD_POLICY.disallowedExtensions.includes(ext)) {
      setErrorMessage(`Soubory typu .${ext} nelze z bezpečnostních důvodů nahrát.`);
      return;
    }

    setSelectedFile(file);
    if (!title) {
      setTitle(file.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsUploading(true);
    setErrorMessage(null);
    setUploadProgress(15);
    setUploadStage('Validace parametrů a MIME typu...');

    try {
      await new Promise(r => setTimeout(r, 200));
      setUploadProgress(45);
      setUploadStage('Antivirová kontrola a skenování aktivního obsahu...');

      await new Promise(r => setTimeout(r, 250));
      setUploadProgress(80);
      setUploadStage('Ukládání do bezpečného objektového úložiště...');

      const tags = tagsInput
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

      const res = await onUploadFile({
        file: {
          name: selectedFile.name,
          type: selectedFile.type,
          size: selectedFile.size,
        },
        metadata: {
          title: title || selectedFile.name,
          altText,
          description,
          tags,
          author,
        },
      });

      if (!res.success || !res.asset) {
        setErrorMessage(res.error || 'Nahrání souboru selhalo.');
        setIsUploading(false);
        return;
      }

      setUploadProgress(100);
      setUploadStage('Dokončeno.');
      await new Promise(r => setTimeout(r, 150));

      onUploadSuccess(res.asset);
      handleReset();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Nastala neočekávaná chyba při nahrávání.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setTitle('');
    setAltText('');
    setDescription('');
    setTagsInput('');
    setErrorMessage(null);
    setUploadProgress(0);
    setUploadStage('');
  };

  const isImage = selectedFile && selectedFile.type.startsWith('image/');

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div
        id="media-upload-modal"
        className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-foreground">Nahrát nové médium</h3>
              <p className="text-[11px] text-muted-foreground">
                Bezpečné nahrání do knihovny aktiv (max. 25 MB)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <HelpTrigger helpKey="media.upload" />
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Dropzone */}
          {!selectedFile ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 sm:p-8 rounded-2xl border-2 border-dashed transition-colors flex flex-col items-center justify-center text-center cursor-pointer ${
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-muted/30'
              }`}
            >
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
              <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mb-3">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-xs sm:text-sm font-bold text-foreground">
                Přetáhněte soubor sem nebo klikněte pro výběr
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
                Podporovány jsou obrázky (JPEG, PNG, WebP, AVIF, SVG), PDF dokumenty a multimédia.
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-xl border border-border bg-muted/40 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  {isImage ? <ImageIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-foreground truncate">{selectedFile.name}</div>
                  <div className="text-[11px] font-mono text-muted-foreground">
                    {formatBytes(selectedFile.size)} • {selectedFile.type || 'Neznámý typ'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-semibold"
              >
                Změnit
              </button>
            </div>
          )}

          {/* Metadata Inputs */}
          {selectedFile && (
            <div className="space-y-3 pt-2 text-xs">
              <div>
                <label className="block font-bold text-foreground mb-1">
                  Název média <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="např. Hero fotografie – Moderní architektura"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {isImage && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-foreground">
                      Alternativní text (ALT) <span className="text-amber-600">*</span>
                    </label>
                    <HelpTrigger helpKey="media.alt" />
                  </div>
                  <input
                    type="text"
                    value={altText}
                    onChange={(e) => setAltText(e.target.value)}
                    placeholder="Stručný a věcný popis obsahu obrázku pro čtečky a SEO"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Důležité pro přístupnost a indexaci vyhledávači.
                  </p>
                </div>
              )}

              <div>
                <label className="block font-bold text-foreground mb-1">Popis / Poznámka</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Doplňující informace o použití média"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-foreground mb-1">Štítky (oddělené čárkou)</label>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="hero, homepage, banner"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block font-bold text-foreground mb-1">Autor / Zdroj</label>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="Jméno fotografa či agentury"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Uploading Progress */}
          {isUploading && (
            <div className="p-3 rounded-xl bg-muted/60 border border-border space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-foreground flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                  {uploadStage}
                </span>
                <span className="font-mono text-muted-foreground">{uploadProgress} %</span>
              </div>
              <div className="w-full bg-border rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Footer Controls */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={isUploading}
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={!selectedFile || isUploading}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isUploading ? 'Nahrávám...' : 'Nahrát a uložit'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
