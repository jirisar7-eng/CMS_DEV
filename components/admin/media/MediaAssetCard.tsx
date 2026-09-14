'use client';

import React from 'react';
import Image from 'next/image';
import { MediaAsset } from '@/lib/domain/media/types';
import {
  FileText,
  FileCode,
  Video,
  Music,
  Archive,
  File,
  ShieldCheck,
  AlertCircle,
  Eye,
  MoreVertical,
  CheckCircle2,
} from 'lucide-react';

interface MediaAssetCardProps {
  asset: MediaAsset;
  isSelected: boolean;
  onSelect: (asset: MediaAsset) => void;
  onOpenDetail: (asset: MediaAsset) => void;
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function MediaAssetCard({
  asset,
  isSelected,
  onSelect,
  onOpenDetail,
}: MediaAssetCardProps) {
  const isArchived = asset.status === 'archived';
  const isImage = asset.mediaType === 'image';
  const isVector = asset.mediaType === 'vector';

  return (
    <div
      id={`media-card-${asset.id}`}
      onClick={() => onSelect(asset)}
      onDoubleClick={() => onOpenDetail(asset)}
      className={`group relative rounded-2xl border transition-all duration-200 overflow-hidden flex flex-col bg-card cursor-pointer select-none ${
        isSelected
          ? 'border-primary ring-2 ring-primary/20 shadow-md bg-primary/5'
          : 'border-border hover:border-border/80 hover:shadow-xs'
      } ${isArchived ? 'opacity-70 grayscale-[30%]' : ''}`}
    >
      {/* Thumbnail Preview Area */}
      <div className="relative aspect-[4/3] w-full bg-muted/50 flex items-center justify-center overflow-hidden border-b border-border/60">
        {isImage ? (
          <div className="relative w-full h-full">
            <Image
              src={asset.url}
              alt={asset.metadata.altText || asset.metadata.title}
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              referrerPolicy="no-referrer"
            />
          </div>
        ) : isVector ? (
          <div className="flex flex-col items-center justify-center gap-1.5 p-4 text-sky-600 dark:text-sky-400">
            <FileCode className="w-10 h-10" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider">SVG Vektor</span>
          </div>
        ) : asset.mediaType === 'document' ? (
          <div className="flex flex-col items-center justify-center gap-1.5 p-4 text-amber-600 dark:text-amber-400">
            <FileText className="w-10 h-10" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider">
              {asset.filename.endsWith('.pdf') ? 'PDF Dokument' : 'Dokument'}
            </span>
          </div>
        ) : asset.mediaType === 'video' ? (
          <div className="flex flex-col items-center justify-center gap-1.5 p-4 text-purple-600 dark:text-purple-400">
            <Video className="w-10 h-10" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Video</span>
          </div>
        ) : asset.mediaType === 'audio' ? (
          <div className="flex flex-col items-center justify-center gap-1.5 p-4 text-emerald-600 dark:text-emerald-400">
            <Music className="w-10 h-10" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Audio</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-1.5 p-4 text-muted-foreground">
            <File className="w-10 h-10" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Soubor</span>
          </div>
        )}

        {/* Status & Badges Overlay */}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1 items-center max-w-[85%] pointer-events-none">
          {isArchived && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-muted/90 backdrop-blur-xs text-muted-foreground border border-border shadow-xs">
              Archiv
            </span>
          )}

          {asset.usageCount > 0 ? (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/90 text-white backdrop-blur-xs shadow-xs flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5" />
              {asset.usageCount}× použito
            </span>
          ) : (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-background/80 text-muted-foreground backdrop-blur-xs border border-border/80">
              Nepoužito
            </span>
          )}

          {asset.security.activeContent && (
            <span
              title="Aktivní obsah (SVG obsahuje vektorové struktury)"
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/90 text-white backdrop-blur-xs shadow-xs"
            >
              Aktivní
            </span>
          )}
        </div>

        {/* Quick View Button on Hover */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail(asset);
          }}
          aria-label={`Otevřít detail média ${asset.metadata.title}`}
          className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-background/90 text-foreground backdrop-blur-xs shadow-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Asset Metadata Footer */}
      <div className="p-3 flex-1 flex flex-col justify-between space-y-1.5">
        <div>
          <h4 className="text-xs font-bold text-foreground truncate" title={asset.metadata.title}>
            {asset.metadata.title}
          </h4>
          <p className="text-[11px] font-mono text-muted-foreground truncate" title={asset.filename}>
            {asset.filename}
          </p>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px] text-muted-foreground">
          <span className="font-mono">{formatBytes(asset.sizeBytes)}</span>
          {asset.dimensions ? (
            <span className="font-mono text-[10px]">
              {asset.dimensions.width}×{asset.dimensions.height}
            </span>
          ) : (
            <span className="uppercase text-[10px] font-bold">{asset.mediaType}</span>
          )}
        </div>
      </div>
    </div>
  );
}
