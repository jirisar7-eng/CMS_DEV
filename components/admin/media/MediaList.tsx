'use client';

import React from 'react';
import Image from 'next/image';
import { MediaAsset } from '@/lib/domain/media/types';
import { formatBytes } from './MediaAssetCard';
import {
  FileText,
  FileCode,
  Video,
  Music,
  File,
  CheckCircle2,
  Eye,
} from 'lucide-react';

interface MediaListProps {
  assets: MediaAsset[];
  selectedAsset: MediaAsset | null;
  onSelect: (asset: MediaAsset) => void;
  onOpenDetail: (asset: MediaAsset) => void;
}

export function MediaList({
  assets,
  selectedAsset,
  onSelect,
  onOpenDetail,
}: MediaListProps) {
  if (assets.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground bg-card rounded-2xl border border-border">
        Žádná média neodpovídají zadaným filtrům.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/60 border-b border-border text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
            <tr>
              <th className="py-3 px-4 w-14">Náhled</th>
              <th className="py-3 px-4">Název a soubor</th>
              <th className="py-3 px-4 hidden sm:table-cell">Typ</th>
              <th className="py-3 px-4 hidden md:table-cell">Velikost</th>
              <th className="py-3 px-4 hidden lg:table-cell">Rozměry</th>
              <th className="py-3 px-4">Použití</th>
              <th className="py-3 px-4 hidden sm:table-cell">Datum</th>
              <th className="py-3 px-4 text-right">Akce</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {assets.map((asset) => {
              const isSelected = selectedAsset?.id === asset.id;
              const isArchived = (asset.status as string).toUpperCase() === 'ARCHIVED';

              return (
                <tr
                  key={asset.id}
                  onClick={() => onSelect(asset)}
                  onDoubleClick={() => onOpenDetail(asset)}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'bg-primary/10 font-medium' : 'hover:bg-muted/40'
                  } ${isArchived ? 'opacity-70' : ''}`}
                >
                  {/* Thumbnail */}
                  <td className="py-2.5 px-4">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted flex items-center justify-center relative border border-border/50 shrink-0">
                      {asset.mediaType === 'image' ? (
                        <Image
                          src={(asset.status as string).toUpperCase() === 'PUBLISHED' ? asset.url : 'https://picsum.photos/seed/placeholder/400/300?grayscale'}
                          alt={asset.metadata.altText || asset.metadata.title}
                          fill
                          sizes="40px"
                          className="object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : asset.mediaType === 'vector' ? (
                        <FileCode className="w-5 h-5 text-sky-500" />
                      ) : asset.mediaType === 'document' ? (
                        <FileText className="w-5 h-5 text-amber-500" />
                      ) : asset.mediaType === 'video' ? (
                        <Video className="w-5 h-5 text-purple-500" />
                      ) : asset.mediaType === 'audio' ? (
                        <Music className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <File className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  </td>

                  {/* Title & Filename */}
                  <td className="py-2.5 px-4 max-w-[220px]">
                    <div className="space-y-0.5">
                      <div className="font-bold text-foreground truncate">{asset.metadata.title}</div>
                      <div className="text-[11px] font-mono text-muted-foreground truncate">{asset.filename}</div>
                    </div>
                  </td>

                  {/* MIME / Type */}
                  <td className="py-2.5 px-4 hidden sm:table-cell">
                    <span className="font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                      {asset.mediaType}
                    </span>
                  </td>

                  {/* Size */}
                  <td className="py-2.5 px-4 font-mono text-[11px] hidden md:table-cell text-muted-foreground">
                    {formatBytes(asset.sizeBytes)}
                  </td>

                  {/* Dimensions */}
                  <td className="py-2.5 px-4 font-mono text-[11px] hidden lg:table-cell text-muted-foreground">
                    {asset.dimensions ? `${asset.dimensions.width}×${asset.dimensions.height}` : '—'}
                  </td>

                  {/* Usage */}
                  <td className="py-2.5 px-4">
                    {asset.usageCount > 0 ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        {asset.usageCount}×
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">0×</span>
                    )}
                  </td>

                  {/* Date */}
                  <td className="py-2.5 px-4 text-muted-foreground text-[11px] hidden sm:table-cell whitespace-nowrap">
                    {new Date(asset.createdAt).toLocaleDateString('cs-CZ')}
                  </td>

                  {/* Action */}
                  <td className="py-2.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDetail(asset);
                      }}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Otevřít detail média"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
