'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  X,
  Copy,
  Check,
  RefreshCw,
  Archive,
  Trash2,
  ShieldCheck,
  ExternalLink,
  FileText,
  FileCode,
  File,
  Save,
  CheckCircle2,
} from 'lucide-react';
import { MediaAsset } from '@/lib/domain/media/types';
import { formatBytes } from './MediaAssetCard';
import { HelpTrigger } from '@/components/help/HelpTrigger';

interface MediaDetailDrawerProps {
  asset: MediaAsset | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateMetadata: (assetId: string, metadata: Partial<MediaAsset['metadata']>) => void;
  onOpenReplace: (asset: MediaAsset) => void;
  onOpenDelete: (asset: MediaAsset) => void;
  onToggleArchive: (assetId: string, isArchived: boolean) => void;
}

interface MediaMetadataFormProps {
  asset: MediaAsset;
  onSave: (metadata: Partial<MediaAsset['metadata']>) => void;
}

function MediaMetadataForm({ asset, onSave }: MediaMetadataFormProps) {
  const [title, setTitle] = useState(asset.metadata.title || '');
  const [altText, setAltText] = useState(asset.metadata.altText || '');
  const [description, setDescription] = useState(asset.metadata.description || '');
  const [tagsInput, setTagsInput] = useState(asset.metadata.tags?.join(', ') || '');
  const [author, setAuthor] = useState(asset.metadata.author || '');
  const [isSaved, setIsSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    onSave({
      title,
      altText,
      description,
      tags,
      author,
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  const isImage = asset.mediaType === 'image';

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      <div className="flex items-center justify-between">
        <span className="font-bold text-foreground uppercase tracking-wider text-[11px]">
          Metadata a přístupnost
        </span>
        {isSaved && (
          <span className="text-emerald-800 dark:text-emerald-300 font-semibold text-[11px] flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> Uloženo
          </span>
        )}
      </div>

      <div>
        <label className="block font-semibold text-foreground mb-1">Název média</label>
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {isImage && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block font-semibold text-foreground">
              Alternativní text (ALT)
            </label>
            <HelpTrigger helpKey="media.alt" />
          </div>
          <input
            type="text"
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            placeholder="Popis pro čtečky obrazovky a vyhledávače"
            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary/20"
          />
        </div>
      )}

      <div>
        <label className="block font-semibold text-foreground mb-1">Popis aktiva</label>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary/20 resize-none"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block font-semibold text-foreground mb-1">Štítky</label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="oddělené čárkou"
            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div>
          <label className="block font-semibold text-foreground mb-1">Autor</label>
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <button
        type="submit"
        className="w-full py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors shadow-xs flex items-center justify-center gap-1.5"
      >
        <Save className="w-4 h-4" />
        <span>Uložit změny metadat</span>
      </button>
    </form>
  );
}

export function MediaDetailDrawer({
  asset,
  isOpen,
  onClose,
  onUpdateMetadata,
  onOpenReplace,
  onOpenDelete,
  onToggleArchive,
}: MediaDetailDrawerProps) {
  const [isCopied, setIsCopied] = useState(false);

  if (!isOpen || !asset) return null;

  const isArchived = asset.status === 'archived';
  const isImage = asset.mediaType === 'image';
  const isVector = asset.mediaType === 'vector';

  const handleCopyReference = () => {
    navigator.clipboard.writeText(asset.storageKey);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-xs">
      <div
        id="media-detail-drawer"
        className="w-full max-w-lg bg-card border-l border-border h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="min-w-0 pr-2">
            <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-muted-foreground">
              DETAIL MÉDIA
            </span>
            <h3 className="text-sm font-bold text-foreground truncate" title={asset.metadata.title}>
              {asset.metadata.title}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <HelpTrigger helpKey="media.library" />
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6 text-xs">
          {/* Preview Canvas */}
          <div className="rounded-2xl border border-border bg-muted/40 overflow-hidden flex items-center justify-center relative min-h-[220px]">
            {isImage ? (
              <div className="relative w-full h-56">
                <Image
                  src={asset.url}
                  alt={asset.metadata.altText || asset.metadata.title}
                  fill
                  sizes="480px"
                  className="object-contain p-2"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : isVector ? (
              <div className="flex flex-col items-center justify-center gap-2 p-8 text-sky-500">
                <FileCode className="w-16 h-16" />
                <span className="font-mono text-xs font-bold uppercase">SVG Vektorový formát</span>
              </div>
            ) : asset.mediaType === 'document' ? (
              <div className="flex flex-col items-center justify-center gap-2 p-8 text-amber-500">
                <FileText className="w-16 h-16" />
                <span className="font-mono text-xs font-bold uppercase">Dokument ({asset.mimeType})</span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground">
                <File className="w-16 h-16" />
                <span className="font-mono text-xs font-bold uppercase">{asset.mediaType}</span>
              </div>
            )}

            {/* Status tags on canvas */}
            <div className="absolute top-2 left-2 flex flex-wrap gap-1">
              {isArchived && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                  Archivováno
                </span>
              )}
              {asset.security.activeContent && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500 text-white shadow-xs">
                  Aktivní obsah (SVG)
                </span>
              )}
            </div>
          </div>

          {/* Quick Actions Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={handleCopyReference}
              className="p-2 rounded-xl border border-border bg-muted/30 hover:bg-muted font-semibold text-foreground transition-colors flex flex-col items-center justify-center gap-1 text-[11px]"
              title="Zkopírovat bezpečný klíč aktiva"
            >
              {isCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
              <span>{isCopied ? 'Zkopírováno' : 'Kopírovat ID'}</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenReplace(asset)}
              className="p-2 rounded-xl border border-border bg-muted/30 hover:bg-muted font-semibold text-foreground transition-colors flex flex-col items-center justify-center gap-1 text-[11px]"
              title="Nahradit soubor se zachováním vazeb"
            >
              <RefreshCw className="w-4 h-4 text-sky-500" />
              <span>Nahradit</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleArchive(asset.id, isArchived)}
              className="p-2 rounded-xl border border-border bg-muted/30 hover:bg-muted font-semibold text-foreground transition-colors flex flex-col items-center justify-center gap-1 text-[11px]"
            >
              <Archive className="w-4 h-4 text-amber-500" />
              <span>{isArchived ? 'Obnovit' : 'Archivovat'}</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenDelete(asset)}
              className="p-2 rounded-xl border border-border bg-muted/30 hover:bg-destructive/10 text-destructive font-semibold transition-colors flex flex-col items-center justify-center gap-1 text-[11px]"
            >
              <Trash2 className="w-4 h-4" />
              <span>Smazat</span>
            </button>
          </div>

          {/* Usage References Breakdown */}
          <div className="rounded-2xl border border-border p-4 bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-foreground">
                <CheckCircle2 className={`w-4 h-4 ${asset.usageCount > 0 ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                <span>Využití na stránkách ({asset.usageCount}×)</span>
              </div>
              <HelpTrigger helpKey="media.usage" />
            </div>

            {asset.usageCount > 0 ? (
              <div className="space-y-1.5">
                {asset.usageReferences.map((ref) => (
                  <div
                    key={ref.id}
                    className="p-2.5 rounded-xl border border-border/80 bg-card flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-foreground truncate">{ref.pageTitle}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {ref.pageSlug} • {ref.blockType || 'Blok'}
                      </div>
                    </div>
                    <Link
                      href={`/admin/pages/${ref.pageId}/edit`}
                      target="_blank"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-muted hover:bg-muted/80 text-[11px] font-semibold text-primary shrink-0 transition-colors"
                    >
                      <span>Otevřít</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Toto médium zatím není použito na žádné stránce. Lze jej bezpečně odstranit nebo archivovat.
              </p>
            )}
          </div>

          {/* Editable Metadata Form (keyed by asset.id) */}
          <MediaMetadataForm
            key={asset.id}
            asset={asset}
            onSave={(meta) => onUpdateMetadata(asset.id, meta)}
          />

          {/* Technical & Security Details */}
          <div className="rounded-2xl border border-border p-4 bg-muted/30 space-y-2.5">
            <span className="font-bold text-foreground uppercase tracking-wider text-[11px] block">
              Technická a bezpečnostní data
            </span>
            <div className="space-y-1.5 font-mono text-[11px] text-muted-foreground">
              <div className="flex justify-between py-1 border-b border-border/40">
                <span>Původní soubor:</span>
                <span className="text-foreground truncate max-w-[200px]">{asset.filename}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span>Úložištní klíč:</span>
                <span className="text-foreground truncate max-w-[200px]">{asset.storageKey}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span>MIME Typ:</span>
                <span className="text-foreground">{asset.mimeType}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span>Velikost:</span>
                <span className="text-foreground">{formatBytes(asset.sizeBytes)}</span>
              </div>
              {asset.dimensions && (
                <div className="flex justify-between py-1 border-b border-border/40">
                  <span>Rozměry:</span>
                  <span className="text-foreground">{asset.dimensions.width} × {asset.dimensions.height} px ({asset.dimensions.aspectRatio})</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-border/40">
                <span>Bezpečnostní sken:</span>
                <span className="text-emerald-800 dark:text-emerald-300 font-sans font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Čistý (bez hrozeb)
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span>Datum nahrání:</span>
                <span className="text-foreground font-sans">{new Date(asset.createdAt).toLocaleString('cs-CZ')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
