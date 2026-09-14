'use client';

import React from 'react';
import { MediaAsset } from '@/lib/domain/media/types';
import { MediaAssetCard } from './MediaAssetCard';
import { Image as ImageIcon, Search } from 'lucide-react';

interface MediaGridProps {
  assets: MediaAsset[];
  selectedAsset: MediaAsset | null;
  onSelect: (asset: MediaAsset) => void;
  onOpenDetail: (asset: MediaAsset) => void;
  onOpenUpload: () => void;
}

export function MediaGrid({
  assets,
  selectedAsset,
  onSelect,
  onOpenDetail,
  onOpenUpload,
}: MediaGridProps) {
  if (assets.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 sm:p-12 text-center flex flex-col items-center justify-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
          <Search className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-foreground">Žádná média neodpovídají filtrům</h3>
          <p className="text-xs text-muted-foreground max-w-sm">
            Zkuste upravit vyhledávací dotaz, změnit zvolený typ nebo nahrát nový soubor.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenUpload}
          className="mt-2 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
        >
          Nahrát nové médium
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
      {assets.map((asset) => (
        <MediaAssetCard
          key={asset.id}
          asset={asset}
          isSelected={selectedAsset?.id === asset.id}
          onSelect={onSelect}
          onOpenDetail={onOpenDetail}
        />
      ))}
    </div>
  );
}
