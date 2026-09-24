"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
  Compass,
  Plus,
  Search,
  FolderTree,
  Eye,
  RefreshCw,
  FolderPlus,
  AlertTriangle,
  Layers,
  Settings2,
  Trash2,
  CheckCircle2,
  SlidersHorizontal,
  FileText,
  ExternalLink,
  Hash,
  UploadCloud,
  Archive,
  Lock,
  Globe,
  Clock,
  Check,
} from 'lucide-react';
import {
  NavigationSet,
  NavigationItem,
  CreateNavigationSetInput,
  CreateNavigationItemInput,
  UpdateNavigationItemInput,
  BrokenPageReference,
} from '@/lib/domain/navigation/types';
import { navigationRepository } from '@/lib/domain/navigation/repository';
import { flattenAndCalculateDepths } from '@/lib/domain/navigation/validation';
import { pagesRepository, PageSummary } from '@/lib/domain/pages';
import { CapabilityStatusBadge } from '@/components/admin/CapabilityStatusBadge';
import { HelpTrigger } from '@/components/help/HelpTrigger';
import { useHelp } from '@/components/help/HelpProvider';
import { NavigationTreeItem } from './NavigationTreeItem';
import { NavigationItemModal } from './NavigationItemModal';
import { NavigationSetModal } from './NavigationSetModal';
import { NavigationDeleteModal } from './NavigationDeleteModal';
import { NavigationBrokenRefBanner } from './NavigationBrokenRefBanner';
import { NavigationPreview } from './NavigationPreview';

export const NavigationWorkspace: React.FC = () => {
  const { openHelp } = useHelp();

  // State
  const [sets, setSets] = useState<NavigationSet[]>([]);
  const [activeSetId, setActiveSetId] = useState<string>('');
  const [availablePages, setAvailablePages] = useState<PageSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showPreview, setShowPreview] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLifecycleBusy, setIsLifecycleBusy] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(
    null
  );

  // Modals state
  const [itemModalOpen, setItemModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<NavigationItem | null>(null);
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null);
  const [setModalOpen, setSetModalOpen] = useState<boolean>(false);
  const [editingSet, setEditingSet] = useState<NavigationSet | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [itemToDelete, setItemToDelete] = useState<NavigationItem | null>(null);

  // Load initial data
  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      try {
        setIsLoading(true);
        const [allSets, allPages] = await Promise.all([
          navigationRepository.getNavigationSets(),
          pagesRepository.getPages(),
        ]);
        if (!isMounted) return;
        setSets(allSets);
        setAvailablePages(allPages);
        if (allSets.length > 0) {
          setActiveSetId((prev) => prev || allSets[0].id);
        }
      } catch (err) {
        console.error('Failed to load navigation sets:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    fetchData();
    return () => {
      isMounted = false;
    };
  }, []);

  const activeSet = useMemo(() => {
    return sets.find((s) => s.id === activeSetId) || sets[0] || null;
  }, [sets, activeSetId]);

  const isArchived = activeSet?.status === 'ARCHIVED';
  const isPublished = activeSet?.status === 'PUBLISHED';
  const hasUnpublishedChanges = useMemo(() => {
    if (!activeSet || activeSet.status !== 'PUBLISHED') return false;
    if (activeSet.publishedVersion === null || activeSet.publishedVersion === undefined) return false;
    return activeSet.version > activeSet.publishedVersion;
  }, [activeSet]);

  const pagesMap = useMemo(() => {
    const map = new Map<string, PageSummary>();
    availablePages.forEach((p) => map.set(p.id, p));
    return map;
  }, [availablePages]);

  const validPageIds = useMemo(() => {
    return availablePages.map((p) => p.id);
  }, [availablePages]);

  // Broken references in active set
  const brokenReferences = useMemo<BrokenPageReference[]>(() => {
    if (!activeSet) return [];
    return navigationRepository
      .checkBrokenReferences(activeSet.items, validPageIds, activeSet.key, activeSet.name)
      .filter((b) => b.navSetKey === activeSet.key);
  }, [activeSet, validPageIds]);

  const brokenItemIds = useMemo(() => {
    return new Set(brokenReferences.map((b) => b.itemId));
  }, [brokenReferences]);

  // Flat structured items with computed depth
  const { flatItems } = useMemo(() => {
    if (!activeSet) return { flatItems: [] };
    return flattenAndCalculateDepths(activeSet.items);
  }, [activeSet]);

  // Search filtered items
  const filteredFlatItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return flatItems;
    return flatItems.filter((i) => {
      const labelMatch = i.label.toLowerCase().includes(q);
      const urlMatch = i.externalUrl?.toLowerCase().includes(q);
      const pageMatch = i.pageId && pagesMap.get(i.pageId)?.path.toLowerCase().includes(q);
      return labelMatch || urlMatch || pageMatch;
    });
  }, [flatItems, searchQuery, pagesMap]);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setFeedbackMessage({ text, type });
    setTimeout(() => {
      setFeedbackMessage((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  };

  // Lifecycle Handlers (Publish, Unpublish, Archive)
  const handlePublishSet = async () => {
    if (!activeSet || isLifecycleBusy || isArchived) return;
    try {
      setIsLifecycleBusy(true);
      const updated = await navigationRepository.publishNavigationSet(activeSet.id);
      setSets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      showToast(`Navigační sada „${updated.name}“ byla úspěšně publikována (v${updated.publishedVersion}).`);
    } catch (err: any) {
      showToast(err.message || 'Chyba při publikování navigace', 'error');
    } finally {
      setIsLifecycleBusy(false);
    }
  };

  const handleUnpublishSet = async () => {
    if (!activeSet || isLifecycleBusy || isArchived || !isPublished) return;
    if (!confirm(`Opravdu si přejete odpublikovat navigační sadu „${activeSet.name}“? Položky přestanou být dostupné na veřejném webu.`)) {
      return;
    }
    try {
      setIsLifecycleBusy(true);
      const updated = await navigationRepository.unpublishNavigationSet(activeSet.id);
      setSets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      showToast(`Navigační sada „${updated.name}“ byla odpublikována do stavu konceptu.`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Chyba při odpublikování navigace', 'error');
    } finally {
      setIsLifecycleBusy(false);
    }
  };

  const handleArchiveSet = async () => {
    if (!activeSet || isLifecycleBusy || isArchived) return;
    if (activeSet.status === 'PUBLISHED') {
      showToast('Publikovanou navigační sadu nelze přímo archivovat. Nejprve ji odpublikujte.', 'error');
      return;
    }
    if (!confirm(`Opravdu si přejete archivovat navigační sadu „${activeSet.name}“? Archivovaná sada bude uzamčena pro čtení a nebude ji možné dále upravovat.`)) {
      return;
    }
    try {
      setIsLifecycleBusy(true);
      const updated = await navigationRepository.archiveNavigationSet(activeSet.id);
      setSets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      showToast(`Navigační sada „${updated.name}“ byla archivována.`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Chyba při archivaci navigace', 'error');
    } finally {
      setIsLifecycleBusy(false);
    }
  };

  // Handlers for Navigation Items
  const handleSaveItem = async (data: CreateNavigationItemInput | UpdateNavigationItemInput) => {
    if (!activeSet) return;
    if (isArchived) {
      showToast('Archivovanou navigační sadu nelze upravovat.', 'error');
      return;
    }
    try {
      if (editingItem) {
        const updated = await navigationRepository.updateItem(activeSet.id, editingItem.id, data);
        setSets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        showToast(`Položka „${data.label || editingItem.label}“ byla úspěšně upravena.`);
      } else {
        const updated = await navigationRepository.addItem(activeSet.id, data as CreateNavigationItemInput);
        setSets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        showToast(`Položka „${data.label}“ byla přidána do navigace.`);
      }
    } catch (err: any) {
      showToast(err.message || 'Chyba při ukládání položky', 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!activeSet || !itemToDelete) return;
    if (isArchived) {
      showToast('Archivovanou navigační sadu nelze upravovat.', 'error');
      return;
    }
    try {
      const updated = await navigationRepository.deleteItem(activeSet.id, itemToDelete.id);
      setSets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      showToast(`Položka „${itemToDelete.label}“ byla odstraněna.`);
    } catch (err: any) {
      showToast(err.message || 'Chyba při mazání položky', 'error');
    } finally {
      setDeleteModalOpen(false);
      setItemToDelete(null);
    }
  };

  const handleMoveUp = async (itemId: string) => {
    if (!activeSet || isArchived) return;
    try {
      const updated = await navigationRepository.moveItem(activeSet.id, itemId, 'UP');
      setSets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleMoveDown = async (itemId: string) => {
    if (!activeSet || isArchived) return;
    try {
      const updated = await navigationRepository.moveItem(activeSet.id, itemId, 'DOWN');
      setSets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleIndent = async (itemId: string) => {
    if (!activeSet || isArchived) return;
    try {
      const updated = await navigationRepository.indentItem(activeSet.id, itemId);
      setSets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      showToast('Položka byla zanořena pod předchozí prvek.');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleOutdent = async (itemId: string) => {
    if (!activeSet || isArchived) return;
    try {
      const updated = await navigationRepository.outdentItem(activeSet.id, itemId);
      setSets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      showToast('Položka byla posunuta o úroveň výše.');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleToggleVisibility = async (itemId: string) => {
    if (!activeSet || isArchived) return;
    try {
      const updated = await navigationRepository.toggleVisibility(activeSet.id, itemId);
      setSets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Handlers for Navigation Sets
  const handleSaveSet = async (data: CreateNavigationSetInput) => {
    try {
      if (editingSet) {
        if (editingSet.status === 'ARCHIVED') {
          showToast('Archivovanou navigační sadu nelze upravovat.', 'error');
          return;
        }
        const updated = await navigationRepository.updateNavigationSet(editingSet.id, data);
        setSets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        showToast(`Navigační sada „${updated.name}“ byla upravena.`);
      } else {
        const created = await navigationRepository.createNavigationSet(data);
        setSets((prev) => [...prev, created]);
        setActiveSetId(created.id);
        showToast(`Byla vytvořena nová navigační sada „${created.name}“.`);
      }
    } catch (err: any) {
      showToast(err.message || 'Chyba při ukládání navigační sady', 'error');
    }
  };

  const handleDeleteSet = async (setId: string) => {
    if (sets.length <= 1) {
      showToast('Poslední navigační sadu nelze smazat.', 'error');
      return;
    }
    const target = sets.find((s) => s.id === setId);
    if (!target) return;
    if (target.status === 'PUBLISHED') {
      showToast('Publikovanou navigační sadu nelze smazat. Nejprve ji odpublikujte.', 'error');
      return;
    }
    if (confirm(`Opravdu si přejete smazat sadu „${target.name}“ včetně všech jejích položek?`)) {
      try {
        await navigationRepository.deleteNavigationSet(setId);
        const remaining = sets.filter((s) => s.id !== setId);
        setSets(remaining);
        setActiveSetId(remaining[0].id);
        showToast(`Navigační sada „${target.name}“ byla smazána.`);
      } catch (err: any) {
        showToast(err.message || 'Chyba při mazání navigační sady', 'error');
      }
    }
  };

  // Count child items for delete modal
  const childCountForDelete = useMemo(() => {
    if (!activeSet || !itemToDelete) return 0;
    return activeSet.items.filter((i) => i.parentId === itemToDelete.id).length;
  }, [activeSet, itemToDelete]);

  return (
    <div id="navigation-workspace-container" className="space-y-6">
      {/* Toast Feedback Notification */}
      {feedbackMessage && (
        <div
          role="status"
          className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between shadow-lg transition-all animate-in fade-in slide-in-from-top-2 duration-200 ${
            feedbackMessage.type === 'error'
              ? 'bg-destructive text-destructive-foreground'
              : feedbackMessage.type === 'info'
              ? 'bg-blue-600 text-white'
              : 'bg-emerald-600 text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-white/80 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Header / Breadcrumb Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Compass className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
              Správa navigace a menu
            </h1>
            <CapabilityStatusBadge status="FUNKČNÍ" />
            <HelpTrigger helpKey="navigation.manager" />
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Konfigurace hierarchických navigačních struktur, zanoření odkazů, životního cyklu publikování a náhledu.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              showPreview
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-card text-foreground hover:bg-muted'
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>{showPreview ? 'Skrýt náhled' : 'Zobrazit náhled'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingSet(null);
              setSetModalOpen(true);
            }}
            className="px-3 py-2 rounded-xl border border-border bg-card text-foreground hover:bg-muted text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" />
            <span>Nová sada</span>
          </button>
          {!isArchived && (
            <button
              type="button"
              onClick={() => {
                setEditingItem(null);
                setDefaultParentId(null);
                setItemModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Přidat položku</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Sets Tabs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
            <Layers className="w-3.5 h-3.5" />
            <span>Dostupné navigační sady ({sets.length})</span>
          </div>
          <HelpTrigger helpKey="navigation.manager" size="icon-only" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sets.map((set) => {
            const isSelected = activeSet?.id === set.id;
            const setArchived = set.status === 'ARCHIVED';
            const setPublished = set.status === 'PUBLISHED';
            return (
              <button
                key={set.id}
                type="button"
                onClick={() => setActiveSetId(set.id)}
                className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  isSelected
                    ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/40 shadow-xs'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <span>{set.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                    setArchived
                      ? 'bg-muted text-muted-foreground'
                      : setPublished
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  }`}
                >
                  {set.status}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    isSelected ? 'bg-primary text-primary-foreground font-semibold' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {set.items.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Set Details & Lifecycle Controls */}
      {activeSet && (
        <div className="p-4 rounded-2xl border border-border bg-card shadow-xs space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs">
            {/* Left: Metadata & Status Badges */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-foreground text-sm">{activeSet.name}</span>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                  Klíč: {activeSet.key}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary font-bold">
                  Kontext: {activeSet.context}
                </span>
                {/* Lifecycle Status Badge */}
                <span
                  className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 ${
                    isArchived
                      ? 'bg-muted text-muted-foreground border border-border'
                      : isPublished
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300/40'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300/40'
                  }`}
                >
                  {isArchived && <Lock className="w-3 h-3" />}
                  {isPublished && <Globe className="w-3 h-3" />}
                  <span>{activeSet.status}</span>
                </span>
              </div>

              {/* Version and Publication Timestamps */}
              <div className="flex items-center gap-3 text-muted-foreground text-[11px] flex-wrap">
                <span>
                  Koncept verze: <strong className="text-foreground">v{activeSet.version}</strong>
                </span>
                <span>•</span>
                <span>
                  Publikovaná verze:{' '}
                  {activeSet.publishedVersion ? (
                    <strong className="text-foreground">v{activeSet.publishedVersion}</strong>
                  ) : (
                    <span className="italic">Zatím nepublikováno</span>
                  )}
                </span>
                {activeSet.publishedAt && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(activeSet.publishedAt).toLocaleString('cs-CZ')}</span>
                    </span>
                  </>
                )}
              </div>

              {/* Unpublished Changes Warning or Up-to-date Confirmation */}
              {isPublished && hasUnpublishedChanges && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Nepublikované změny (koncept v{activeSet.version} je novější než veřejná v{activeSet.publishedVersion})</span>
                </div>
              )}
              {isPublished && !hasUnpublishedChanges && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>Veřejná verze je aktuální (v{activeSet.version})</span>
                </div>
              )}

              {activeSet.description && (
                <p className="text-muted-foreground text-xs">{activeSet.description}</p>
              )}
            </div>

            {/* Right: Lifecycle Actions and Settings */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Lifecycle Actions */}
              {!isArchived && (
                <>
                  {/* Publish / Publish Changes Button */}
                  <button
                    type="button"
                    onClick={handlePublishSet}
                    disabled={isLifecycleBusy}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      hasUnpublishedChanges
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>
                      {isLifecycleBusy
                        ? 'Zpracovávám...'
                        : hasUnpublishedChanges
                        ? 'Publikovat změny'
                        : isPublished
                        ? 'Znovu publikovat'
                        : 'Publikovat sadu'}
                    </span>
                  </button>

                  {/* Unpublish Button */}
                  {isPublished && (
                    <button
                      type="button"
                      onClick={handleUnpublishSet}
                      disabled={isLifecycleBusy}
                      className="px-2.5 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span>Odpublikovat</span>
                    </button>
                  )}

                  {/* Archive Button */}
                  {!isPublished && (
                    <button
                      type="button"
                      onClick={handleArchiveSet}
                      disabled={isLifecycleBusy}
                      className="px-2.5 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      <span>Archivovat</span>
                    </button>
                  )}
                </>
              )}

              {/* Set Settings Button (only when not archived) */}
              {!isArchived && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingSet(activeSet);
                    setSetModalOpen(true);
                  }}
                  className="px-2.5 py-1.5 rounded-xl border border-border bg-muted/40 hover:bg-muted text-foreground flex items-center gap-1 font-semibold text-xs transition-colors cursor-pointer"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  <span>Nastavení</span>
                </button>
              )}

              {/* Delete Set Button (allowed for DRAFT / ARCHIVED, disabled for PUBLISHED) */}
              {sets.length > 1 && !isPublished && (
                <button
                  type="button"
                  onClick={() => handleDeleteSet(activeSet.id)}
                  disabled={isLifecycleBusy}
                  className="p-2 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50"
                  title="Smazat navigační sadu"
                  aria-label="Smazat sadu"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Archived notice banner if activeSet is ARCHIVED */}
          {isArchived && (
            <div className="p-3 rounded-xl bg-muted/50 border border-border flex items-center gap-2.5 text-xs text-muted-foreground">
              <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>
                Tato navigační sada je <strong>archivována</strong>. Veškeré úpravy struktury, položek a publikování jsou z bezpečnostních důvodů uzamčeny (pouze pro čtení).
              </span>
            </div>
          )}
        </div>
      )}

      {/* Broken Reference Warning Banner if any */}
      <NavigationBrokenRefBanner
        brokenRefs={brokenReferences}
        onFixItem={(itemId) => {
          if (isArchived) return;
          const item = activeSet?.items.find((i) => i.id === itemId);
          if (item) {
            setEditingItem(item);
            setItemModalOpen(true);
          }
        }}
        onDeleteItem={(itemId) => {
          if (isArchived) return;
          const item = activeSet?.items.find((i) => i.id === itemId);
          if (item) {
            setItemToDelete(item);
            setDeleteModalOpen(true);
          }
        }}
        onOpenHelp={() => openHelp('navigation.broken_reference')}
      />

      {/* Live Preview (Collapsible) */}
      {showPreview && activeSet && (
        <NavigationPreview currentSet={activeSet} pagesMap={pagesMap} />
      )}

      {/* Navigation Tree Table / Editor */}
      <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden space-y-0">
        {/* Table Header Controls */}
        <div className="p-3 sm:px-4 bg-muted/30 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <FolderTree className="w-4 h-4" />
            </div>
            <span className="font-bold text-foreground text-xs sm:text-sm">
              Stromová struktura položek ({filteredFlatItems.length})
            </span>
            <HelpTrigger helpKey="navigation.reorder" size="icon-only" />
          </div>

          <div className="flex items-center gap-2">
            {/* Search filter */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrovat položky menu..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-input bg-background text-foreground text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary outline-hidden"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {!isArchived && (
              <button
                type="button"
                onClick={() => {
                  setEditingItem(null);
                  setDefaultParentId(null);
                  setItemModalOpen(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-xs flex items-center gap-1 shrink-0 transition-colors shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Nová položka</span>
              </button>
            )}
          </div>
        </div>

        {/* Tree Table Header Labels (Hidden on tiny screens) */}
        <div className="hidden sm:grid grid-cols-12 gap-2 p-2.5 px-4 bg-muted/50 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
          <div className="col-span-5 flex items-center gap-1">
            <span>Název a hierarchie</span>
            <HelpTrigger helpKey="navigation.item" size="icon-only" />
          </div>
          <div className="col-span-3 flex items-center gap-1">
            <span>Cílová URL / Reference</span>
            <HelpTrigger helpKey="navigation.internal_link" size="icon-only" />
          </div>
          <div className="col-span-1">Typ</div>
          <div className="col-span-3 text-right flex items-center justify-end gap-1">
            <span>Ovládání & Pořadí</span>
            <HelpTrigger helpKey="navigation.reorder" size="icon-only" />
          </div>
        </div>

        {/* Tree Rows */}
        <div className="divide-y divide-border/60">
          {filteredFlatItems.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground mx-auto">
                <FolderTree className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="font-bold text-foreground text-sm">
                  {searchQuery ? 'Nebyly nalezeny žádné položky' : 'Tato navigační sada je zatím prázdná'}
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {searchQuery
                    ? 'Zkuste změnit vyhledávací dotaz nebo filtr.'
                    : 'Vytvořte první položku menu odkazující na interní stránku, externí URL nebo kotvu.'}
                </p>
              </div>
              {!searchQuery && !isArchived && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingItem(null);
                    setDefaultParentId(null);
                    setItemModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs inline-flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Přidat první položku</span>
                </button>
              )}
            </div>
          ) : (
            filteredFlatItems.map((item, idx) => {
              // Calculate siblings
              const siblings = filteredFlatItems.filter((i) => i.parentId === item.parentId);
              const siblingIndex = siblings.findIndex((i) => i.id === item.id);
              const hasChildren = filteredFlatItems.some((i) => i.parentId === item.id);
              const isBroken = brokenItemIds.has(item.id);

              return (
                <NavigationTreeItem
                  key={item.id}
                  item={item}
                  index={idx}
                  totalSiblings={siblings.length}
                  siblingIndex={siblingIndex}
                  depth={item.depth || 0}
                  hasChildren={hasChildren}
                  pagesMap={pagesMap}
                  isBroken={isBroken}
                  onMoveUp={isArchived ? () => {} : handleMoveUp}
                  onMoveDown={isArchived ? () => {} : handleMoveDown}
                  onIndent={isArchived ? () => {} : handleIndent}
                  onOutdent={isArchived ? () => {} : handleOutdent}
                  onToggleVisibility={isArchived ? () => {} : handleToggleVisibility}
                  onEdit={isArchived ? () => {} : (itemToEdit) => {
                    setEditingItem(itemToEdit);
                    setDefaultParentId(itemToEdit.parentId || null);
                    setItemModalOpen(true);
                  }}
                  onDelete={isArchived ? () => {} : (itemDel) => {
                    setItemToDelete(itemDel);
                    setDeleteModalOpen(true);
                  }}
                  onAddSubItem={isArchived ? () => {} : (parentId) => {
                    setEditingItem(null);
                    setDefaultParentId(parentId);
                    setItemModalOpen(true);
                  }}
                />
              );
            })
          )}
        </div>
      </div>

      {/* Accessibility & Guide Info Box */}
      <div className="p-4 rounded-2xl border border-border bg-muted/20 text-xs text-muted-foreground space-y-2">
        <div className="font-bold text-foreground flex items-center gap-2">
          <span>Klávesnicová přístupnost a pravidla hierarchie</span>
          <HelpTrigger helpKey="navigation.reorder" size="icon-only" />
        </div>
        <p className="leading-relaxed">
          Položky menu můžete libovolně přesouvat pomocí tlačítek posunu v řádku. Pomocí funkce{' '}
          <strong className="text-foreground">Zanořit (Indent)</strong> vytvoříte podnabídku pod předchozím prvkem
          (až do hloubky 3 úrovní). Funkce <strong className="text-foreground">Vyjmout (Outdent)</strong> vrátí
          položku zpět do nadřazené úrovně.
        </p>
      </div>

      {/* Modals */}
      <NavigationItemModal
        isOpen={itemModalOpen}
        onClose={() => {
          setItemModalOpen(false);
          setEditingItem(null);
          setDefaultParentId(null);
        }}
        onSave={handleSaveItem}
        item={editingItem}
        parentCandidateItems={flatItems.map((f) => ({ id: f.id, label: f.label, depth: f.depth }))}
        availablePages={availablePages}
        defaultParentId={defaultParentId}
      />

      <NavigationSetModal
        isOpen={setModalOpen}
        onClose={() => {
          setSetModalOpen(false);
          setEditingSet(null);
        }}
        onSave={handleSaveSet}
        existingSet={editingSet}
      />

      <NavigationDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setItemToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        item={itemToDelete}
        childCount={childCountForDelete}
      />
    </div>
  );
};
