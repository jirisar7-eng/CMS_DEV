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
  GripVertical,
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
        className={`w-full ${viewportClass} bg-card rounded-2xl border border-border/80 shadow-xs p-4 sm:p-8 min-h-[500px] flex flex-col transition-all duration-200`}
      >
        {blocks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-12 text-center border-2 border-dashed border-border rounded-xl bg-background/50 my-auto">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-foreground">Plátno je prázdné</h3>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-sm leading-relaxed">
              Tato stránka zatím nemá žádné bloky obsahu. Začněte přidáním prvního bloku z katalogu.
            </p>
            {capabilities['content.block.create'] && !isPreview && (
              <button
                type="button"
                id="btn-empty-canvas-add"
                onClick={onOpenPalette}
                className="mt-5 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2 shadow-2xs"
              >
                <Plus className="w-4 h-4" />
                <span>Přidat první blok</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4 w-full">
            {blocks.map((block, index) => {
              const isSelected = selectedBlockId === block.id;
              const def = getBlockDefinition(block.type);

              if (isPreview) {
                return (
                  <div key={block.id} className="w-full">
                    <BlockRenderer block={block} isPreview={true} />
                  </div>
                );
              }

              return (
                <div key={block.id} className="relative group">
                  {/* Quick Add Divider Trigger Before Block */}
                  {capabilities['content.block.create'] && (
                    <div className="absolute -top-3 left-0 right-0 h-2 opacity-0 hover:opacity-100 group-hover/divider:opacity-100 flex items-center justify-center z-20 transition-opacity">
                      <button
                        type="button"
                        onClick={() => onQuickAdd(index)}
                        className="p-1 rounded-full bg-primary text-primary-foreground shadow-xs hover:scale-110 transition-transform"
                        title="Vložit blok sem"
                        aria-label="Vložit blok sem"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Block Container with Outline and Selection Frame */}
                  <div
                    onClick={() => onSelectBlock(block.id)}
                    className={`relative w-full rounded-xl p-3 sm:p-4 transition-all cursor-pointer border ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary/20 bg-background shadow-xs'
                        : 'border-border/50 bg-background/60 hover:border-border hover:bg-background'
                    }`}
                  >
                    {/* Block Outline Header Bar */}
                    <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-border/40 select-none">
                      <div className="flex items-center gap-2">
                        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50" />
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          {def.czechLabel || def.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60 font-mono">
                          #{index + 1}
                        </span>
                      </div>

                      {/* Inline Quick Action Buttons */}
                      <div
                        className={`flex items-center gap-1 transition-opacity ${
                          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {capabilities['content.block.move'] && (
                          <>
                            <button
                              type="button"
                              onClick={() => onMoveUp(block.id)}
                              disabled={index === 0}
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20"
                              title="Posunout nahoru"
                              aria-label="Posunout nahoru"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onMoveDown(block.id)}
                              disabled={index === blocks.length - 1}
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20"
                              title="Posunout dolů"
                              aria-label="Posunout dolů"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {capabilities['content.block.duplicate'] && (
                          <button
                            type="button"
                            onClick={() => onDuplicate(block.id)}
                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                            title="Duplikovat"
                            aria-label="Duplikovat"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {capabilities['content.block.delete'] && (
                          <button
                            type="button"
                            onClick={() => onDelete(block.id)}
                            className="p-1 rounded text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                            title="Smazat"
                            aria-label="Smazat"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Render Content */}
                    <div className="pointer-events-none select-none">
                      <BlockRenderer block={block} isPreview={false} />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Quick Add at the bottom of the list */}
            {capabilities['content.block.create'] && !isPreview && (
              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  id="btn-add-block-bottom"
                  onClick={() => onQuickAdd(blocks.length)}
                  className="px-4 py-2 rounded-lg border border-dashed border-border hover:border-primary text-xs font-semibold text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Přidat další blok</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
