import React from 'react';
import { ContentBlock } from '@/lib/domain/pages';
import { getBlockDefinition } from '@/lib/composer/registry';
import { BlockRenderer } from './BlockRenderer';
import { ViewportMode, ContentCapabilities } from '@/lib/composer/types';
import {
  ChevronUp,
  ChevronDown,
  Copy,
  Trash2,
  Plus,
  Layers,
} from 'lucide-react';

interface BlockCanvasProps {
  blocks: ContentBlock[];
  selectedBlockId: string | null;
  isPreview: boolean;
  viewport: ViewportMode;
  capabilities: ContentCapabilities;
  onSelectBlock: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onQuickAdd: (index: number) => void;
  onOpenPalette: () => void;
}

export const BlockCanvas: React.FC<BlockCanvasProps> = ({
  blocks,
  selectedBlockId,
  isPreview,
  viewport,
  capabilities,
  onSelectBlock,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  onQuickAdd,
  onOpenPalette,
}) => {
  const viewportClass = isPreview
    ? viewport === 'mobile'
      ? 'max-w-[390px] border-x border-border shadow-md my-6 rounded-2xl min-h-[700px]'
      : viewport === 'tablet'
      ? 'max-w-[768px] border-x border-border shadow-md my-6 rounded-xl min-h-[800px]'
      : 'max-w-4xl my-6'
    : 'max-w-4xl';

  return (
    <div className="flex-1 overflow-y-auto bg-muted/20 p-3 sm:p-6 flex flex-col items-center">
      <div
        className={`w-full ${viewportClass} bg-card text-card-foreground transition-all duration-200 rounded-xl border border-border/80 shadow-xs p-4 sm:p-8 min-h-[500px] flex flex-col`}
      >
        {blocks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-12 text-center border-2 border-dashed border-border rounded-xl my-auto">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
              <Layers className="w-7 h-7" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-foreground">
              Plátno je zatím prázdné
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 max-w-sm leading-relaxed">
              Začněte přidáním prvního bloku. Můžete vložit nadpis, odstavec textu, zvýrazněné upozornění nebo tlačítko.
            </p>
            {capabilities['content.block.create'] && (
              <button
                type="button"
                id="btn-canvas-add-first-block"
                onClick={onOpenPalette}
                className="mt-5 px-4 py-2.5 min-h-[44px] inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Přidat první blok</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {blocks.map((block, index) => {
              const isSelected = selectedBlockId === block.id;
              const def = getBlockDefinition(block.type);
              const Icon = def.icon;
              const isFirst = index === 0;
              const isLast = index === blocks.length - 1;

              if (isPreview) {
                return (
                  <div key={block.id} className="py-2">
                    <BlockRenderer block={block} isPreview={true} />
                  </div>
                );
              }

              return (
                <div key={block.id} className="relative group">
                  {/* Quick Insert bar above first block */}
                  {index === 0 && capabilities['content.block.create'] && (
                    <div className="h-4 -mt-2 mb-1 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => onQuickAdd(0)}
                        title="Vložit blok na začátek"
                        className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[11px] font-medium flex items-center gap-1 shadow-xs hover:scale-105 transition-transform cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Vložit sem</span>
                      </button>
                    </div>
                  )}

                  {/* Block Wrapper Box */}
                  <div
                    tabIndex={0}
                    role="button"
                    id={`canvas-block-${block.id}`}
                    onClick={() => onSelectBlock(block.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectBlock(block.id);
                      }
                    }}
                    className={`relative rounded-xl transition-all duration-150 p-4 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isSelected
                        ? 'border-2 border-primary bg-primary/5 shadow-xs'
                        : 'border border-border/80 hover:border-border hover:bg-muted/30 bg-background/50'
                    }`}
                  >
                    {/* Block Info Badge (Top-left) */}
                    <div className="flex items-center justify-between gap-2 mb-2 select-none">
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-md bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-mono font-medium">
                          {index + 1}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                            isSelected
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-muted text-foreground border-border'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>{def.label}</span>
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground hidden sm:inline">
                          #{block.id.slice(-6)}
                        </span>
                      </div>

                      {/* Inline Action Toolbar */}
                      <div
                        className={`flex items-center gap-1 transition-opacity ${
                          isSelected ? 'opacity-100' : 'opacity-0 sm:group-hover:opacity-100'
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Mandatory Accessible Move Up */}
                        <button
                          type="button"
                          id={`btn-canvas-move-up-${block.id}`}
                          onClick={() => onMoveUp(block.id)}
                          disabled={isFirst || !capabilities['content.block.move']}
                          title="Posunout nahoru"
                          aria-label="Posunout blok nahoru"
                          className="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>

                        {/* Mandatory Accessible Move Down */}
                        <button
                          type="button"
                          id={`btn-canvas-move-down-${block.id}`}
                          onClick={() => onMoveDown(block.id)}
                          disabled={isLast || !capabilities['content.block.move']}
                          title="Posunout dolů"
                          aria-label="Posunout blok dolů"
                          className="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>

                        {/* Duplicate */}
                        <button
                          type="button"
                          id={`btn-canvas-duplicate-${block.id}`}
                          onClick={() => onDuplicate(block.id)}
                          disabled={!capabilities['content.block.duplicate']}
                          title="Duplikovat"
                          aria-label="Duplikovat blok"
                          className="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                        >
                          <Copy className="w-4 h-4" />
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          id={`btn-canvas-delete-${block.id}`}
                          onClick={() => onDelete(block.id)}
                          disabled={!capabilities['content.block.delete']}
                          title="Smazat blok"
                          aria-label="Smazat blok"
                          className="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 hover:bg-destructive/20 text-destructive disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Block Live Renderer */}
                    <div className="pt-1">
                      <BlockRenderer block={block} isPreview={false} />
                    </div>
                  </div>

                  {/* Quick Insert bar between blocks */}
                  {capabilities['content.block.create'] && (
                    <div className="h-4 my-1 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => onQuickAdd(index + 1)}
                        title="Vložit blok sem"
                        className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[11px] font-medium flex items-center gap-1 shadow-xs hover:scale-105 transition-transform cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Vložit blok sem</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
