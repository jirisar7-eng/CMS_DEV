'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  PageDetail,
  ContentBlock,
  ContentBlockType,
  PageContent,
  pagesRepository,
} from '@/lib/domain/pages';
import { getBlockDefinition } from '@/lib/composer/registry';
import {
  ContentCapabilities,
  DEFAULT_CONTENT_CAPABILITIES,
  ViewportMode,
} from '@/lib/composer/types';
import { ComposerHeader } from './ComposerHeader';
import { BlockPalette } from './BlockPalette';
import { BlockCanvas } from './BlockCanvas';
import { BlockInspector } from './BlockInspector';
import {
  AlertCircle,
  CheckCircle,
  X,
  Layers,
} from 'lucide-react';

interface PageComposerWorkspaceProps {
  pageId: string;
}

export const PageComposerWorkspace: React.FC<PageComposerWorkspaceProps> = ({ pageId }) => {
  const router = useRouter();

  const [page, setPage] = useState<PageDetail | null>(null);
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [viewport, setViewport] = useState<ViewportMode>('desktop');
  const [mobileSheet, setMobileSheet] = useState<'none' | 'palette' | 'inspector'>('none');
  const [showExitPrompt, setShowExitPrompt] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Load page from repository abstraction
  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await pagesRepository.getPageById(pageId);
        if (isMounted) {
          if (data) {
            setPage(data);
            const initialBlocks = (data.content?.blocks || []).map((b, i) => ({
              ...b,
              order: b.order || i + 1,
            }));
            setBlocks(initialBlocks);
            if (initialBlocks.length > 0) {
              setSelectedBlockId(initialBlocks[0].id);
            }
          } else {
            setPage(null);
          }
        }
      } catch {
        if (isMounted) {
          setFeedback({ message: 'Chyba při načítání detailu stránky.', type: 'error' });
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [pageId]);

  // Capabilities model derived strictly from page capabilities
  const capabilities: ContentCapabilities = useMemo(() => {
    if (!page) return DEFAULT_CONTENT_CAPABILITIES;
    const canEdit = Boolean(page.capabilities?.canEdit);
    return {
      'content.block.create': canEdit,
      'content.block.edit': canEdit,
      'content.block.move': canEdit,
      'content.block.duplicate': canEdit,
      'content.block.delete': canEdit,
      'content.draft.save': canEdit || Boolean(page.capabilities?.canSave),
      'content.preview': Boolean(page.capabilities?.canPreview ?? true),
    };
  }, [page]);

  // Find currently selected block
  const selectedBlock = useMemo(() => {
    if (!selectedBlockId) return null;
    return blocks.find((b) => b.id === selectedBlockId) || null;
  }, [blocks, selectedBlockId]);

  const selectedIndex = useMemo(() => {
    if (!selectedBlockId) return -1;
    return blocks.findIndex((b) => b.id === selectedBlockId);
  }, [blocks, selectedBlockId]);

  // Add block
  const handleAddBlock = useCallback(
    (type: ContentBlockType, insertIndex?: number) => {
      if (!capabilities['content.block.create']) return;

      const def = getBlockDefinition(type);
      const newId = `blk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newBlock: ContentBlock = {
        id: newId,
        type,
        order: 0,
        data: def.createDefaultData(),
      };

      setBlocks((prev) => {
        const next = [...prev];
        const targetIndex =
          typeof insertIndex === 'number'
            ? insertIndex
            : selectedIndex !== -1
            ? selectedIndex + 1
            : next.length;

        next.splice(targetIndex, 0, newBlock);
        return next.map((b, idx) => ({ ...b, order: idx + 1 }));
      });

      setSelectedBlockId(newId);
      setIsDirty(true);
    },
    [capabilities, selectedIndex]
  );

  // Update block data
  const handleUpdateBlockData = useCallback(
    (id: string, nextData: Record<string, unknown>) => {
      if (!capabilities['content.block.edit']) return;
      setBlocks((prev) =>
        prev.map((b) => (b.id === id ? { ...b, data: nextData } : b))
      );
      setIsDirty(true);
    },
    [capabilities]
  );

  // Move block up
  const handleMoveUp = useCallback(
    (id: string) => {
      if (!capabilities['content.block.move']) return;
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === id);
        if (idx <= 0) return prev;
        const next = [...prev];
        const temp = next[idx];
        next[idx] = next[idx - 1];
        next[idx - 1] = temp;
        return next.map((b, i) => ({ ...b, order: i + 1 }));
      });
      setIsDirty(true);
    },
    [capabilities]
  );

  // Move block down
  const handleMoveDown = useCallback(
    (id: string) => {
      if (!capabilities['content.block.move']) return;
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === id);
        if (idx < 0 || idx >= prev.length - 1) return prev;
        const next = [...prev];
        const temp = next[idx];
        next[idx] = next[idx + 1];
        next[idx + 1] = temp;
        return next.map((b, i) => ({ ...b, order: i + 1 }));
      });
      setIsDirty(true);
    },
    [capabilities]
  );

  // Duplicate block
  const handleDuplicate = useCallback(
    (id: string) => {
      if (!capabilities['content.block.duplicate']) return;
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === id);
        if (idx === -1) return prev;
        const source = prev[idx];
        const cloneId = `blk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const clone: ContentBlock = {
          id: cloneId,
          type: source.type,
          order: source.order + 1,
          data: JSON.parse(JSON.stringify(source.data || {})),
        };
        const next = [...prev];
        next.splice(idx + 1, 0, clone);
        setSelectedBlockId(cloneId);
        return next.map((b, i) => ({ ...b, order: i + 1 }));
      });
      setIsDirty(true);
    },
    [capabilities]
  );

  // Delete block
  const handleDelete = useCallback(
    (id: string) => {
      if (!capabilities['content.block.delete']) return;
      setBlocks((prev) => {
        const next = prev.filter((b) => b.id !== id);
        return next.map((b, i) => ({ ...b, order: i + 1 }));
      });
      if (selectedBlockId === id) {
        setSelectedBlockId(null);
      }
      setIsDirty(true);
    },
    [capabilities, selectedBlockId]
  );

  // Save draft
  const handleSaveDraft = async () => {
    if (!page || !capabilities['content.draft.save']) return;
    setIsSaving(true);
    setFeedback(null);

    try {
      const canonicalContent: PageContent = {
        version: (page.content?.version || 0) + 1,
        schemaVersion: 'syn-block-v1',
        blocks: blocks.map((b, idx) => ({ ...b, order: idx + 1 })),
      };

      const updated = await pagesRepository.updatePage(page.id, {
        content: canonicalContent,
      });

      setPage(updated);
      setIsDirty(false);
      setFeedback({
        message: 'Koncept stránky byl úspěšně uložen do kanonického modelu.',
        type: 'success',
      });
    } catch {
      setFeedback({
        message: 'Došlo k chybě při ukládání konceptu.',
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Back button with unsaved changes verification
  const handleBack = () => {
    if (isDirty) {
      setShowExitPrompt(true);
    } else {
      router.push(`/admin/pages/${pageId}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground font-medium">Načítám editor stránky...</p>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 rounded-xl border border-border bg-card text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
        <h2 className="text-lg font-bold text-foreground">Stránka nenalezena</h2>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Požadovaná stránka s ID <span className="font-mono">{pageId}</span> neexistuje nebo byla odstraněna.
        </p>
        <button
          type="button"
          onClick={() => router.push('/admin/pages')}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 cursor-pointer"
        >
          Zpět na přehled stránek
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full overflow-hidden bg-background">
      {/* Sticky Header */}
      <ComposerHeader
        title={page.title}
        status={page.status}
        isDirty={isDirty}
        isSaving={isSaving}
        isPreview={isPreview}
        viewport={viewport}
        capabilities={capabilities}
        selectedBlockId={selectedBlockId}
        onBack={handleBack}
        onTogglePreview={() => setIsPreview(!isPreview)}
        onSaveDraft={handleSaveDraft}
        onChangeViewport={setViewport}
        onOpenPaletteMobile={() => setMobileSheet('palette')}
        onOpenInspectorMobile={() => setMobileSheet('inspector')}
      />

      {/* Feedback Toast */}
      {feedback && (
        <div
          role="status"
          className={`mx-4 mt-2 p-3 rounded-lg border text-xs sm:text-sm flex items-center justify-between animate-in fade-in duration-150 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
              : 'bg-destructive/10 border-destructive/20 text-destructive'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 hover:opacity-75 cursor-pointer"
            aria-label="Zavřít"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Composer Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* DESKTOP LEFT PANEL: Block Palette */}
        {!isPreview && (
          <aside className="hidden lg:block w-72 xl:w-80 shrink-0 h-full">
            <BlockPalette
              onAddBlock={(type) => handleAddBlock(type)}
              canCreate={capabilities['content.block.create']}
            />
          </aside>
        )}

        {/* CENTER: Live Block Canvas */}
        <main className="flex-1 flex flex-col h-full overflow-hidden">
          <BlockCanvas
            blocks={blocks}
            selectedBlockId={selectedBlockId}
            isPreview={isPreview}
            viewport={viewport}
            capabilities={capabilities}
            onSelectBlock={(id) => {
              setSelectedBlockId(id);
            }}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            onQuickAdd={(idx) => handleAddBlock('paragraph', idx)}
            onOpenPalette={() => {
              if (window.innerWidth < 1024) {
                setMobileSheet('palette');
              }
            }}
          />
        </main>

        {/* DESKTOP RIGHT PANEL: Block Inspector */}
        {!isPreview && (
          <aside className="hidden lg:block w-80 xl:w-96 shrink-0 h-full">
            <BlockInspector
              block={selectedBlock}
              onUpdateBlockData={handleUpdateBlockData}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onDeselect={() => setSelectedBlockId(null)}
              capabilities={capabilities}
              isFirst={selectedIndex === 0}
              isLast={selectedIndex === blocks.length - 1}
            />
          </aside>
        )}

        {/* MOBILE BOTTOM SHEET MODAL (Palette) */}
        {mobileSheet === 'palette' && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end animate-in fade-in duration-200">
            <div className="w-full max-h-[80vh] bg-card rounded-t-2xl border-t border-border flex flex-col overflow-hidden shadow-2xl">
              <div className="p-3 border-b border-border flex items-center justify-between bg-muted/20">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <Layers className="w-4 h-4 text-primary" />
                  <span>Katalog bloků</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileSheet('none')}
                  className="p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground cursor-pointer"
                  aria-label="Zavřít"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <BlockPalette
                  onAddBlock={(type) => handleAddBlock(type)}
                  canCreate={capabilities['content.block.create']}
                  onCloseMobile={() => setMobileSheet('none')}
                />
              </div>
            </div>
          </div>
        )}

        {/* MOBILE BOTTOM SHEET MODAL (Inspector) */}
        {mobileSheet === 'inspector' && selectedBlock && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end animate-in fade-in duration-200">
            <div className="w-full max-h-[85vh] bg-card rounded-t-2xl border-t border-border flex flex-col overflow-hidden shadow-2xl">
              <div className="p-3 border-b border-border flex items-center justify-between bg-muted/20">
                <div className="font-semibold text-sm">Vlastnosti bloku</div>
                <button
                  type="button"
                  onClick={() => setMobileSheet('none')}
                  className="p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground cursor-pointer"
                  aria-label="Zavřít"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <BlockInspector
                  block={selectedBlock}
                  onUpdateBlockData={handleUpdateBlockData}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                  onDeselect={() => {
                    setSelectedBlockId(null);
                    setMobileSheet('none');
                  }}
                  capabilities={capabilities}
                  isFirst={selectedIndex === 0}
                  isLast={selectedIndex === blocks.length - 1}
                />
              </div>
            </div>
          </div>
        )}

        {/* CONFIRMATION MODAL: Unsaved Changes Exit Prompt */}
        {showExitPrompt && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    Máte neuložené změny
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">
                    Pokud opustíte editor bez uložení konceptu, veškeré provedené úpravy v blocích budou ztraceny.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  id="btn-cancel-exit"
                  onClick={() => setShowExitPrompt(false)}
                  className="px-4 py-2 min-h-[44px] rounded-lg border border-border bg-background hover:bg-muted text-xs sm:text-sm font-medium text-foreground transition-colors cursor-pointer"
                >
                  Zůstat v editoru
                </button>
                <button
                  type="button"
                  id="btn-confirm-exit"
                  onClick={() => {
                    setShowExitPrompt(false);
                    router.push(`/admin/pages/${pageId}`);
                  }}
                  className="px-4 py-2 min-h-[44px] rounded-lg bg-destructive text-destructive-foreground text-xs sm:text-sm font-medium hover:bg-destructive/90 transition-colors cursor-pointer"
                >
                  Odejít bez uložení
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
