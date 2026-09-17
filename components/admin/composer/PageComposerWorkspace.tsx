'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  PageDetail,
  ContentBlock,
  ContentBlockType,
  PageContent,
} from '@/lib/domain/pages';
import { createAdminPagesClient } from '@/lib/domain/pages-client/client';
import { AdminPageLifecycleState } from '@/lib/domain/pages-client/types';
import {
  normalizeAdminProjectId,
  withAdminProjectContext,
} from '@/lib/domain/pages-client/project-context';
import { getBlockDefinition } from '@/lib/composer/registry';
import {
  ContentCapabilities,
  ViewportMode,
  ProjectEntitlements,
} from '@/lib/composer/types';
import { resolveProjectEntitlements } from '@/lib/composer/entitlements';
import { ComposerHeader } from './ComposerHeader';
import { BlockPalette } from './BlockPalette';
import { BlockCanvas } from './BlockCanvas';
import { BlockInspector } from './BlockInspector';
import {
  AlertCircle,
  CheckCircle,
  X,
  RefreshCw,
} from 'lucide-react';

interface PageComposerWorkspaceProps {
  pageId: string;
  projectId?: string | null;
}

export const PageComposerWorkspace: React.FC<PageComposerWorkspaceProps> = ({
  pageId,
  projectId: propProjectId,
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawProjectId = propProjectId !== undefined ? propProjectId : searchParams.get('projectId');
  const projectId = normalizeAdminProjectId(rawProjectId);

  const [page, setPage] = useState<PageDetail | null>(null);
  const [lifecycle, setLifecycle] = useState<AdminPageLifecycleState | null>(null);
  const [lockConflict, setLockConflict] = useState(false);
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [viewport, setViewport] = useState<ViewportMode>('desktop');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // History State for Undo / Redo
  const [history, setHistory] = useState<ContentBlock[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Mobile Sheet states
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);

  // Entitlements
  const entitlements: ProjectEntitlements = useMemo(() => {
    return resolveProjectEntitlements();
  }, []);

  const client = useMemo(() => {
    return createAdminPagesClient(projectId || '');
  }, [projectId]);

  // Derived editing permission checks
  const isDraft = page?.status === 'Koncept' || lifecycle?.status === 'DRAFT';
  const canEdit = isDraft;
  const canSave = isDraft;

  const capabilities: ContentCapabilities = useMemo(() => {
    if (!canEdit) {
      return {
        'content.block.create': false,
        'content.block.edit': false,
        'content.block.move': false,
        'content.block.duplicate': false,
        'content.block.delete': false,
        'content.draft.save': false,
        'content.preview': true,
        'content.undo_redo': false,
        'content.outline': true,
        'content.rich_text': false,
        'content.plugins': false,
      };
    }
    return {
      'content.block.create': true,
      'content.block.edit': true,
      'content.block.move': true,
      'content.block.duplicate': true,
      'content.block.delete': true,
      'content.draft.save': canSave,
      'content.preview': true,
      'content.undo_redo': true,
      'content.outline': true,
      'content.rich_text': true,
      'content.plugins': true,
    };
  }, [canEdit, canSave]);

  const loadData = useCallback(() => {
    if (!projectId) {
      setErrorMessage('Není vybrán žádný aktivní projekt.');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    client
      .getPageById(pageId)
      .then((result) => {
        setPage(result.page);
        setLifecycle(result.lifecycle);
        const content = result.page.content as PageContent | undefined;
        const initialBlocks: ContentBlock[] = Array.isArray(content?.blocks) ? content.blocks : [];
        setBlocks(initialBlocks);
        setHistory([initialBlocks]);
        setHistoryIndex(0);
        setIsDirty(false);
        setIsLoading(false);
      })
      .catch((err) => {
        setErrorMessage(err.message || 'Nepodařilo se načíst obsah stránky');
        setIsLoading(false);
      });
  }, [client, pageId, projectId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  // Push new state to history stack
  const updateBlocksWithHistory = useCallback(
    (newBlocks: ContentBlock[]) => {
      setBlocks(newBlocks);
      setIsDirty(true);

      const nextHistory = history.slice(0, historyIndex + 1);
      nextHistory.push(newBlocks);
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);
    },
    [history, historyIndex]
  );

  // Undo / Redo handlers
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setBlocks(history[prevIndex]);
      setHistoryIndex(prevIndex);
      setIsDirty(true);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setBlocks(history[nextIndex]);
      setHistoryIndex(nextIndex);
      setIsDirty(true);
    }
  }, [history, historyIndex]);

  // Block manipulations
  const handleAddBlock = useCallback(
    (type: ContentBlockType, insertIndex?: number) => {
      if (!capabilities['content.block.create']) return;

      const def = getBlockDefinition(type);
      const newBlock: ContentBlock = {
        id: `block-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        type,
        order: insertIndex !== undefined ? insertIndex : blocks.length,
        data: def.createDefaultData(),
      };

      let nextBlocks: ContentBlock[];
      if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= blocks.length) {
        nextBlocks = [...blocks];
        nextBlocks.splice(insertIndex, 0, newBlock);
      } else {
        nextBlocks = [...blocks, newBlock];
      }

      // Re-index orders
      nextBlocks = nextBlocks.map((b, idx) => ({ ...b, order: idx }));
      updateBlocksWithHistory(nextBlocks);
      setSelectedBlockId(newBlock.id);
    },
    [blocks, capabilities, updateBlocksWithHistory]
  );

  const handleUpdateBlockData = useCallback(
    (id: string, data: Record<string, unknown>) => {
      if (!capabilities['content.block.edit']) return;

      const nextBlocks = blocks.map((b) => {
        if (b.id === id) {
          return { ...b, data };
        }
        return b;
      });
      updateBlocksWithHistory(nextBlocks);
    },
    [blocks, capabilities, updateBlocksWithHistory]
  );

  const handleMoveUp = useCallback(
    (id: string) => {
      if (!capabilities['content.block.move']) return;
      const idx = blocks.findIndex((b) => b.id === id);
      if (idx <= 0) return;

      const nextBlocks = [...blocks];
      const temp = nextBlocks[idx - 1];
      nextBlocks[idx - 1] = nextBlocks[idx];
      nextBlocks[idx] = temp;

      const reindexed = nextBlocks.map((b, i) => ({ ...b, order: i }));
      updateBlocksWithHistory(reindexed);
    },
    [blocks, capabilities, updateBlocksWithHistory]
  );

  const handleMoveDown = useCallback(
    (id: string) => {
      if (!capabilities['content.block.move']) return;
      const idx = blocks.findIndex((b) => b.id === id);
      if (idx < 0 || idx >= blocks.length - 1) return;

      const nextBlocks = [...blocks];
      const temp = nextBlocks[idx + 1];
      nextBlocks[idx + 1] = nextBlocks[idx];
      nextBlocks[idx] = temp;

      const reindexed = nextBlocks.map((b, i) => ({ ...b, order: i }));
      updateBlocksWithHistory(reindexed);
    },
    [blocks, capabilities, updateBlocksWithHistory]
  );

  const handleDuplicate = useCallback(
    (id: string) => {
      if (!capabilities['content.block.duplicate']) return;
      const idx = blocks.findIndex((b) => b.id === id);
      if (idx < 0) return;

      const src = blocks[idx];
      const duplicated: ContentBlock = {
        ...src,
        id: `block-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        data: JSON.parse(JSON.stringify(src.data)),
      };

      const nextBlocks = [...blocks];
      nextBlocks.splice(idx + 1, 0, duplicated);

      const reindexed = nextBlocks.map((b, i) => ({ ...b, order: i }));
      updateBlocksWithHistory(reindexed);
      setSelectedBlockId(duplicated.id);
    },
    [blocks, capabilities, updateBlocksWithHistory]
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (!capabilities['content.block.delete']) return;
      const nextBlocks = blocks.filter((b) => b.id !== id).map((b, i) => ({ ...b, order: i }));
      updateBlocksWithHistory(nextBlocks);
      if (selectedBlockId === id) {
        setSelectedBlockId(null);
      }
    },
    [blocks, capabilities, selectedBlockId, updateBlocksWithHistory]
  );

  // Save Draft Action via client
  const handleSaveDraft = async () => {
    if (!canSave || !page || isSaving) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setLockConflict(false);

    try {
      const payload: PageContent = {
        version: 1,
        schemaVersion: 'syn-content-v1',
        blocks: blocks.map((b, idx) => ({ ...b, order: idx })),
      };

      const lockVersion = lifecycle?.lockVersion || 1;
      const mutationResult = await client.updateDraft(page.id, lockVersion, {
        content: payload,
      });

      setLifecycle((prev) =>
        prev
          ? {
              ...prev,
              lockVersion: mutationResult.lockVersion,
            }
          : null
      );
      setIsDirty(false);
      setSuccessMessage('Koncept stránky byl úspěšně uložen.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      if (err.code === 'LOCK_CONFLICT' || err.status === 409) {
        setLockConflict(true);
        setErrorMessage('Konflikt verzí: Koncept byl mezi tím upraven jiným uživatelem. Načtěte prosím nejnovější verzi.');
      } else {
        setErrorMessage(err.message || 'Při ukládání konceptu došlo k chybě.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const selectedBlock = useMemo(() => {
    if (!selectedBlockId) return null;
    return blocks.find((b) => b.id === selectedBlockId) || null;
  }, [blocks, selectedBlockId]);

  const selectedIndex = useMemo(() => {
    if (!selectedBlockId) return -1;
    return blocks.findIndex((b) => b.id === selectedBlockId);
  }, [blocks, selectedBlockId]);

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background text-foreground gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm font-medium text-muted-foreground">Načítám vizuální editor stránky...</p>
      </div>
    );
  }

  if (errorMessage && !page) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-6 text-center bg-background">
        <div className="w-12 h-12 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Nepodařilo se otevřít editor</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">{errorMessage}</p>
        <button
          type="button"
          onClick={() => router.push(withAdminProjectContext('/admin/pages', projectId))}
          className="mt-4 px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Zpět na přehled stránek
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Top Header */}
      <ComposerHeader
        title={page?.title || 'Editor stránky'}
        status={page?.status || 'Koncept'}
        isDirty={isDirty}
        isSaving={isSaving}
        isPreview={isPreview}
        viewport={viewport}
        capabilities={capabilities}
        entitlements={entitlements}
        selectedBlockId={selectedBlockId}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onBack={() => router.push(withAdminProjectContext(`/admin/pages/${pageId}`, projectId))}
        onTogglePreview={() => {
          setIsPreview((prev) => !prev);
          setSelectedBlockId(null);
        }}
        onSaveDraft={handleSaveDraft}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onChangeViewport={setViewport}
        onOpenPaletteMobile={() => setMobilePaletteOpen(true)}
        onOpenInspectorMobile={() => setMobileInspectorOpen(true)}
      />

      {/* Status Banners (Read-only / Lock conflict / Error) */}
      {!isDraft && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs sm:text-sm font-medium text-amber-900 dark:text-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              Stránka je ve stavu <strong>{page?.status}</strong> a je pouze pro čtení. Úpravy jsou povoleny pouze ve stavu Koncept.
            </span>
          </div>
          <button
            type="button"
            onClick={() => router.push(withAdminProjectContext(`/admin/pages/${pageId}`, projectId))}
            className="text-xs underline hover:no-underline text-amber-800 dark:text-amber-300 ml-4 shrink-0"
          >
            Přejít na detail pro schválení / vrácení
          </button>
        </div>
      )}

      {lockConflict && (
        <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-xs sm:text-sm font-medium text-destructive flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Konflikt verzí: Jiný uživatel uložil novější verzi konceptu.</span>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="px-3 py-1 rounded bg-destructive text-destructive-foreground text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Načíst aktuální data</span>
          </button>
        </div>
      )}

      {successMessage && (
        <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-xs sm:text-sm font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Main 3-Column Studio Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left: Component Catalog (Palette) */}
        {!isPreview && (
          <aside className="hidden lg:block w-72 h-full shrink-0">
            <BlockPalette
              onAddBlock={(type) => handleAddBlock(type)}
              canCreate={capabilities['content.block.create']}
              entitlements={entitlements}
            />
          </aside>
        )}

        {/* Center: Interactive Visual Canvas */}
        <main className="flex-1 h-full flex flex-col overflow-hidden">
          <BlockCanvas
            blocks={blocks}
            selectedBlockId={selectedBlockId}
            isPreview={isPreview}
            viewport={viewport}
            capabilities={capabilities}
            onSelectBlock={(id) => {
              if (capabilities['content.block.edit']) {
                setSelectedBlockId(id);
              }
            }}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            onQuickAdd={(idx) => handleAddBlock('paragraph', idx)}
            onOpenPalette={() => setMobilePaletteOpen(true)}
          />
        </main>

        {/* Right: Inspector & Schema Settings */}
        {!isPreview && (
          <aside className="hidden lg:block w-80 h-full shrink-0">
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
      </div>

      {/* Mobile Catalog Modal */}
      {mobilePaletteOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
          <div className="w-full max-w-md h-[80vh] bg-card rounded-2xl border border-border shadow-xl overflow-hidden flex flex-col">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Katalog komponent</h3>
              <button
                type="button"
                onClick={() => setMobilePaletteOpen(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <BlockPalette
                onAddBlock={(type) => handleAddBlock(type)}
                canCreate={capabilities['content.block.create']}
                entitlements={entitlements}
                onCloseMobile={() => setMobilePaletteOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Mobile Inspector Modal */}
      {mobileInspectorOpen && selectedBlock && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
          <div className="w-full max-w-md h-[80vh] bg-card rounded-2xl border border-border shadow-xl overflow-hidden flex flex-col">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Vlastnosti vybraného bloku</h3>
              <button
                type="button"
                onClick={() => setMobileInspectorOpen(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <BlockInspector
                block={selectedBlock}
                onUpdateBlockData={handleUpdateBlockData}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
                onDeselect={() => {
                  setSelectedBlockId(null);
                  setMobileInspectorOpen(false);
                }}
                capabilities={capabilities}
                isFirst={selectedIndex === 0}
                isLast={selectedIndex === blocks.length - 1}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
