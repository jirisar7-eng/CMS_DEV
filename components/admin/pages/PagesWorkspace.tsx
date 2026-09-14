'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { PageSummary, PageTreeNode, PageStatus, PageActionType, pagesRepository } from '@/lib/domain/pages';
import { useI18n } from '@/lib/i18n';
import { PageTreeTable } from './PageTreeTable';
import { PageListTable } from './PageListTable';
import { PageListRowMobile } from './PageListRowMobile';
import { HelpTrigger } from '@/components/help/HelpTrigger';
import { CapabilityStatusBadge } from '@/components/admin/CapabilityStatusBadge';
import {
  Plus,
  Search,
  FolderTree,
  List,
  Filter,
  FileText,
  AlertCircle,
  RefreshCw,
  X,
  Check,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const ALL_STATUSES: (PageStatus | 'Všechny')[] = [
  'Všechny',
  'Koncept',
  'Ke kontrole',
  'Schváleno',
  'Naplánováno',
  'Publikováno',
  'Archivováno',
];

export function PagesWorkspace() {
  const router = useRouter();
  const t = useI18n();
  const dict = t.pages_workspace;

  // View mode (Desktop only: tree vs list)
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PageStatus | 'Všechny'>('Všechny');

  // Data state
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [treeNodes, setTreeNodes] = useState<PageTreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tree expanded state
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});

  // Toast / feedback state
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'info' } | null>(
    null
  );

  // Modal / Action placeholder state
  const [activeModal, setActiveModal] = useState<{
    type: PageActionType | 'new';
    page?: PageSummary;
  } | null>(null);

  // Trigger for refetching
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const fetchAsync = async () => {
      try {
        const [loadedPages, loadedTree] = await Promise.all([
          pagesRepository.getPages(),
          pagesRepository.getPageTree(),
        ]);

        if (!isMounted) return;
        setPages(loadedPages);
        setTreeNodes(loadedTree);

        const initialExpanded: Record<string, boolean> = {};
        const markExpanded = (nodes: PageTreeNode[]) => {
          nodes.forEach((n) => {
            initialExpanded[n.id] = true;
            if (n.children && n.children.length > 0) {
              markExpanded(n.children);
            }
          });
        };
        markExpanded(loadedTree);
        setExpandedMap(initialExpanded);
      } catch (err: unknown) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Nepodařilo se načíst data.');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchAsync();

    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  // Fast map of id -> title for parent lookup
  const parentMap = useMemo(() => {
    const map = new Map<string, string>();
    pages.forEach((p) => map.set(p.id, p.title));
    return map;
  }, [pages]);

  // Filtered pages for flat list view & mobile view
  const filteredPages = useMemo(() => {
    let list = pages;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          p.path.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'Všechny') {
      list = list.filter((p) => p.status === statusFilter);
    }
    return list;
  }, [pages, searchQuery, statusFilter]);

  // Filtered tree nodes
  const filteredTreeNodes = useMemo(() => {
    if (!searchQuery.trim() && statusFilter === 'Všechny') {
      return treeNodes;
    }

    const q = searchQuery.toLowerCase().trim();
    const filterTree = (nodes: PageTreeNode[]): PageTreeNode[] => {
      const result: PageTreeNode[] = [];
      for (const node of nodes) {
        const matchesQuery =
          !q ||
          node.title.toLowerCase().includes(q) ||
          node.slug.toLowerCase().includes(q) ||
          node.path.toLowerCase().includes(q);
        const matchesStatus = statusFilter === 'Všechny' || node.status === statusFilter;

        const filteredChildren = filterTree(node.children);
        if ((matchesQuery && matchesStatus) || filteredChildren.length > 0) {
          result.push({
            ...node,
            children: filteredChildren,
          });
        }
      }
      return result;
    };

    return filterTree(treeNodes);
  }, [treeNodes, searchQuery, statusFilter]);

  // Toggle tree node expansion
  const handleToggleExpand = (id: string) => {
    setExpandedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Action handlers
  const handleAction = async (action: PageActionType, page: PageSummary) => {
    if (action === 'archive') {
      if (window.confirm(dict.action_archive_confirm)) {
        const success = await pagesRepository.archivePage(page.id);
        if (success) {
          setFeedback({ message: dict.action_feedback_archived, type: 'success' });
          setTimeout(() => setFeedback(null), 3500);
          setReloadKey((k) => k + 1);
        }
      }
    } else if (action === 'duplicate') {
      try {
        const copy = await pagesRepository.duplicatePage(page.id);
        setFeedback({ message: `${dict.action_feedback_duplicated} (${copy.title})`, type: 'success' });
        setTimeout(() => setFeedback(null), 3500);
        setReloadKey((k) => k + 1);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Duplikace selhala.');
      }
    } else if (action === 'edit') {
      router.push(`/admin/pages/${page.id}`);
    } else {
      // open, preview, move -> open controlled modal placeholder
      setActiveModal({ type: action, page });
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setStatusFilter('Všechny');
  };

  return (
    <div className="space-y-4 md:space-y-6 w-full max-w-7xl mx-auto">
      {/* Header section: Compact on mobile, inline title & primary action button */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
              OBSAH
            </span>
            <CapabilityStatusBadge status="PROTOTYP" size="sm" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
              {dict.title}
            </h1>
            <HelpTrigger helpKey="content.pages.view" size="sm" align="left" label="Nápověda ke správě stránek" />
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 line-clamp-1">
            {dict.description}
          </p>
        </div>

        {/* Compact primary button on mobile, standard on desktop */}
        <Link
          href="/admin/pages/new"
          id="btn-new-page-primary"
          className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 min-h-[44px] text-xs sm:text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="whitespace-nowrap">{dict.new_page}</span>
        </Link>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          role="status"
          className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm flex items-center justify-between animate-in fade-in duration-200"
        >
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-emerald-600 dark:text-emerald-400 hover:opacity-75 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center -mr-1"
            aria-label="Zavřít oznámení"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Toolbar: Clean, compact Search & Filter bar without heavy container styling */}
      <div className="p-2 sm:p-3 rounded-xl border border-border bg-card shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3">
        {/* Search input: Full width on mobile */}
        <div className="relative flex-1">
          <label htmlFor="pages-search-input" className="sr-only">
            {dict.search_placeholder}
          </label>
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="pages-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={dict.search_placeholder}
            className="w-full pl-9 pr-8 py-2 min-h-[44px] text-xs sm:text-sm rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label="Vymazat vyhledávání"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Compact filters */}
        <div className="flex items-center gap-2">
          {/* Status filter */}
          <div className="relative flex-1 sm:flex-initial min-w-[140px]">
            <Filter className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              id="pages-status-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as PageStatus | 'Všechny')}
              aria-label="Filtrovat podle stavu"
              className="w-full pl-8 pr-7 py-2 min-h-[44px] text-xs sm:text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors appearance-none cursor-pointer"
            >
              {ALL_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st === 'Všechny' ? dict.filter_all_statuses : st}
                </option>
              ))}
            </select>
          </div>

          {/* Desktop view switcher: Tree vs List (hidden on mobile) */}
          <div
            className="hidden md:inline-flex p-0.5 bg-muted rounded-lg border border-border"
            role="group"
            aria-label="Způsob zobrazení"
          >
            <button
              type="button"
              id="btn-view-tree"
              onClick={() => setViewMode('tree')}
              aria-pressed={viewMode === 'tree'}
              title={dict.view_tree}
              className={`p-1.5 rounded-md min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors text-xs font-medium gap-1.5 ${
                viewMode === 'tree'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <FolderTree className="w-4 h-4" />
              <span className="hidden lg:inline">{dict.view_tree}</span>
            </button>
            <button
              type="button"
              id="btn-view-list"
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              title={dict.view_list}
              className={`p-1.5 rounded-md min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors text-xs font-medium gap-1.5 ${
                viewMode === 'list'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <List className="w-4 h-4" />
              <span className="hidden lg:inline">{dict.view_list}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="p-12 rounded-xl border border-border bg-card shadow-xs flex flex-col items-center justify-center text-muted-foreground space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          <p className="text-sm font-medium">{dict.loading}</p>
        </div>
      ) : error ? (
        <div className="p-8 rounded-xl border border-destructive/30 bg-destructive/10 shadow-xs flex flex-col items-center justify-center text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-destructive" />
          <h2 className="text-base font-semibold text-destructive">
            {dict.error_title}
          </h2>
          <p className="text-sm text-destructive/90 max-w-md">{error}</p>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setReloadKey((k) => k + 1);
            }}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            {dict.error_retry}
          </button>
        </div>
      ) : filteredPages.length === 0 ? (
        <div className="p-12 rounded-xl border border-border bg-card shadow-xs flex flex-col items-center justify-center text-center space-y-3">
          <div className="p-3 rounded-full bg-muted text-muted-foreground">
            <FileText className="w-6 h-6" />
          </div>
          <h2 className="text-base font-semibold text-foreground">
            {dict.empty_title}
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            {dict.empty_description}
          </p>
          {(searchQuery || statusFilter !== 'Všechny') && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-4 py-2 min-h-[44px] text-xs sm:text-sm font-medium rounded-lg border border-border hover:bg-muted text-foreground transition-colors"
            >
              {dict.empty_reset}
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block">
            {viewMode === 'tree' ? (
              <PageTreeTable
                nodes={filteredTreeNodes}
                expandedMap={expandedMap}
                onToggleExpand={handleToggleExpand}
                onAction={handleAction}
              />
            ) : (
              <PageListTable
                pages={filteredPages}
                parentMap={parentMap}
                onAction={handleAction}
              />
            )}
          </div>

          {/* Mobile Clean Flat ListRow View (No nested cards) */}
          <div className="block md:hidden">
            {filteredPages.map((page) => (
              <PageListRowMobile
                key={page.id}
                page={page}
                parentTitle={page.parentId ? parentMap.get(page.parentId) : undefined}
                onAction={handleAction}
              />
            ))}
          </div>

          {/* Bottom count summary */}
          <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Zobrazeno {filteredPages.length} z {pages.length} stránek
            </span>
            <span>cs-CZ</span>
          </div>
        </div>
      )}

      {/* Controlled Modal Placeholder for planned workflows */}
      {activeModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-action-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2
                id="modal-action-title"
                className="text-base sm:text-lg font-bold text-foreground"
              >
                {activeModal.type === 'new'
                  ? 'Vytvoření nové stránky'
                  : activeModal.type === 'edit'
                  ? `Úprava stránky: ${activeModal.page?.title}`
                  : activeModal.type === 'preview'
                  ? `Náhled stránky: ${activeModal.page?.title}`
                  : activeModal.type === 'move'
                  ? `Přesun stránky: ${activeModal.page?.title}`
                  : 'Akce'}
              </h2>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                aria-label="Zavřít okno"
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-muted/40 border border-border text-xs sm:text-sm text-muted-foreground space-y-2">
              <p>
                Tato akce je součástí plánovaného workflow CMS (
                <strong>
                  {activeModal.type === 'new'
                    ? 'SYN-UI-004 Vytvoření a detail stránky'
                    : 'SYN-UI-004/005 Správa obsahu a hierarchie'}
                </strong>
                ).
              </p>
              {activeModal.page && (
                <div className="text-xs font-mono text-muted-foreground pt-2 border-t border-border">
                  ID: {activeModal.page.id} | Slug: {activeModal.page.slug || '/'}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 min-h-[44px] text-xs sm:text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
              >
                Zavřít
              </button>
              {activeModal.type === 'preview' && activeModal.page && (
                <Link
                  href={`/preview/site?path=${encodeURIComponent(activeModal.page.path || '/')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 min-h-[44px] text-xs sm:text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
                >
                  <span>Otevřít veřejný náhled</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
