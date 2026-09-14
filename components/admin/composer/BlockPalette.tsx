import React, { useState, useMemo } from 'react';
import { ContentBlockType } from '@/lib/domain/pages';
import { BLOCK_REGISTRY, FIRST_SLICE_BLOCK_TYPES } from '@/lib/composer/registry';
import { Search, Plus, Layers } from 'lucide-react';

interface BlockPaletteProps {
  onAddBlock: (type: ContentBlockType) => void;
  canCreate: boolean;
  onCloseMobile?: () => void;
}

export const BlockPalette: React.FC<BlockPaletteProps> = ({
  onAddBlock,
  canCreate,
  onCloseMobile,
}) => {
  const [search, setSearch] = useState('');

  const filteredBlocks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return FIRST_SLICE_BLOCK_TYPES.map((type) => BLOCK_REGISTRY[type]).filter((def) => {
      if (!def) return false;
      if (!q) return true;
      return (
        def.label.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q) ||
        def.type.toLowerCase().includes(q)
      );
    });
  }, [search]);

  return (
    <div className="flex flex-col h-full border-r border-border bg-card/60 backdrop-blur-xs select-none">
      {/* Palette Header */}
      <div className="p-3 sm:p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Katalog bloků</h3>
              <p className="text-[11px] text-muted-foreground">Kanonické bloky obsahu</p>
            </div>
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            id="palette-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hledat blok..."
            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-border bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[38px]"
          />
        </div>
      </div>

      {/* Block List */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1.5">
        {filteredBlocks.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Žádný blok neodpovídá filtru „{search}“.
          </div>
        ) : (
          filteredBlocks.map((def) => {
            const Icon = def.icon;
            return (
              <button
                key={def.type}
                type="button"
                id={`btn-add-block-${def.type}`}
                disabled={!canCreate}
                onClick={() => {
                  onAddBlock(def.type);
                  if (onCloseMobile) onCloseMobile();
                }}
                className="w-full text-left p-2.5 sm:p-3 rounded-xl border border-transparent hover:border-border hover:bg-muted/60 focus-visible:border-primary focus-visible:bg-muted/80 transition-all flex items-start gap-3 group disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer min-h-[44px]"
              >
                <div className="w-9 h-9 rounded-lg bg-muted text-foreground group-hover:bg-primary/15 group-hover:text-primary flex items-center justify-center shrink-0 transition-colors border border-border/60">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs sm:text-sm font-semibold text-foreground truncate">
                      {def.label}
                    </span>
                    <Plus className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                    {def.description}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Palette Footer */}
      <div className="p-3 border-t border-border bg-muted/20 text-[11px] text-muted-foreground text-center">
        SYN-DESIGN-010 • Kanonický model
      </div>
    </div>
  );
};
