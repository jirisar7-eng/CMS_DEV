'use client';

import React, { useState, useMemo } from 'react';
import {
  Search,
  Upload,
  LayoutGrid,
  List,
  Filter,
  ArrowUpDown,
  Image as ImageIcon,
  FileText,
  FileCode,
  HardDrive,
  CheckCircle2,
  Archive,
  Info,
  Layers,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import {
  MediaAsset,
  MediaFilterOptions,
  MediaSortOption,
  MediaType,
} from '@/lib/domain/media/types';
import { listMediaAssets } from '@/app/admin/media/actions';
import { MediaGrid } from './MediaGrid';
import { MediaList } from './MediaList';
import { MediaDetailDrawer } from './MediaDetailDrawer';
import { MediaUploadModal } from './MediaUploadModal';
import { MediaReplaceModal } from './MediaReplaceModal';
import { MediaDeleteModal } from './MediaDeleteModal';
import { CapabilityStatusBadge } from '@/components/admin/CapabilityStatusBadge';
import { HelpTrigger } from '@/components/help/HelpTrigger';
import { formatBytes } from './MediaAssetCard';

export function MediaLibraryWorkspace() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  React.useEffect(() => {
    refreshAssets();
  }, []);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [modalTargetAsset, setModalTargetAsset] = useState<MediaAsset | null>(null);

  // Filters & Sorting state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<MediaType | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [sortOption, setSortOption] = useState<MediaSortOption>('createdAt_desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Notification feedback
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const refreshAssets = async () => {
    setIsLoading(true);
    try {
      const data = await listMediaAssets({});
      setAssets(data);
    } catch (e) {
      showToast('Nepodařilo se načíst média', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Filtered and sorted assets
  const filteredAssets = useMemo(() => {
    let result = [...assets];

    if (!showArchived) {
      result = result.filter((a) => (a.status as string).toUpperCase() !== 'ARCHIVED');
    }

    if (selectedType !== 'all') {
      result = result.filter((a) => a.mediaType === selectedType);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (a) =>
          a.filename.toLowerCase().includes(q) ||
          a.metadata.title.toLowerCase().includes(q) ||
          a.metadata.altText.toLowerCase().includes(q) ||
          a.metadata.description.toLowerCase().includes(q) ||
          a.metadata.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      switch (sortOption) {
        case 'createdAt_desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'createdAt_asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'title_asc':
          return a.metadata.title.localeCompare(b.metadata.title, 'cs');
        case 'title_desc':
          return b.metadata.title.localeCompare(a.metadata.title, 'cs');
        case 'size_desc':
          return b.sizeBytes - a.sizeBytes;
        case 'size_asc':
          return a.sizeBytes - b.sizeBytes;
        case 'usage_desc':
          return b.usageCount - a.usageCount;
        default:
          return 0;
      }
    });

    return result;
  }, [assets, searchQuery, selectedType, showArchived, sortOption]);

  // Statistics
  const stats = useMemo(() => {
    const totalBytes = assets.reduce((sum, a) => sum + a.sizeBytes, 0);
    const totalUsage = assets.reduce((sum, a) => sum + a.usageCount, 0);
    const archivedCount = assets.filter((a) => (a.status as string).toUpperCase() === 'ARCHIVED').length;
    return {
      count: assets.length,
      totalBytes,
      totalUsage,
      archivedCount,
    };
  }, [assets]);

  // Actions
  const handleOpenDetail = (asset: MediaAsset) => {
    setSelectedAsset(asset);
    setIsDetailOpen(true);
  };

  const handleUpdateMetadata = (assetId: string, metadata: Partial<MediaAsset['metadata']>) => {
    showToast('Vyžaduje aktivní oprávnění správce', 'error');
  };

  const handleToggleArchive = (assetId: string, currentlyArchived: boolean) => {
    showToast('Vyžaduje aktivní oprávnění správce', 'error');
  };

  const handleOpenReplace = (asset: MediaAsset) => {
    setModalTargetAsset(asset);
    setIsReplaceOpen(true);
  };

  const handleOpenDelete = (asset: MediaAsset) => {
    setModalTargetAsset(asset);
    setIsDeleteOpen(true);
  };

  const handleConfirmDelete = (assetId: string) => {
    showToast('Vyžaduje aktivní oprávnění správce', 'error');
    setIsDeleteOpen(false);
  };

  const handleArchiveInstead = (assetId: string) => {
    showToast('Vyžaduje aktivní oprávnění správce', 'error');
    setIsDeleteOpen(false);
  };

  return (
    <div id="media-library-workspace" className="space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-2xl shadow-lg border text-xs font-semibold flex items-center gap-2 animate-in slide-in-from-bottom-5 duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-500 text-white border-emerald-600'
              : notification.type === 'error'
              ? 'bg-destructive text-destructive-foreground border-destructive'
              : 'bg-primary text-primary-foreground border-primary'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
              OBSAH
            </span>
            <CapabilityStatusBadge status="PROTOTYP" size="sm" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
              Knihovna médií
            </h1>
            <HelpTrigger helpKey="media.library" />
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Správa obrázků, vektorové grafiky a dokumentů s ochranou referencí a kontrolou přístupnosti.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setIsUploadOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-xs"
          >
            <Upload className="w-4 h-4" />
            <span>Nahrát médium</span>
          </button>
        </div>
      </div>

      {/* Truthfulness Notice Banner */}
      <div className="p-3.5 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 text-indigo-900 dark:text-indigo-200 text-xs flex items-start gap-3">
        <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold block">PROTOTYP: Reálná data (Oprávnění správce chybí)</span>
          <p className="text-[11px] leading-relaxed opacity-90">
            Zobrazení je nyní napojeno na skutečnou databázi. Operace pro zápis jsou však dočasně uzamčeny (fail-closed), protože projekt dosud nedefinuje bezpečnou RBAC (Role-Based Access Control) hranici.</p>
        </div>
      </div>

      {/* Statistics Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-3.5 sm:p-4 rounded-2xl border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[11px] font-semibold">Celkem médií</span>
            <ImageIcon className="w-4 h-4 text-primary" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-foreground font-mono">{stats.count}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">v knihovně projektu</div>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[11px] font-semibold">Velikost úložiště</span>
            <HardDrive className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-foreground font-mono">{formatBytes(stats.totalBytes)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">optimalizovaná data</div>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[11px] font-semibold">Aktivní reference</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-foreground font-mono">{stats.totalUsage}×</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">výskytů na stránkách</div>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[11px] font-semibold">Archivováno</span>
            <Archive className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-foreground font-mono">{stats.archivedCount}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">vyřazených souborů</div>
        </div>
      </div>

      {/* Controls Bar: Search, Type Filter, Sort & View switcher */}
      <div className="p-3 sm:p-4 rounded-2xl border border-border bg-card shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Hledat podle názvu, souboru, ALT textu, štítků..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground font-bold"
              >
                ×
              </button>
            )}
          </div>

          {/* Controls Right */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Sort dropdown */}
            <div className="flex items-center gap-1.5 text-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as MediaSortOption)}
                aria-label="Řazení médií"
                className="py-2 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-medium focus:ring-2 focus:ring-primary/20"
              >
                <option value="createdAt_desc">Nejnovější</option>
                <option value="createdAt_asc">Nejstarší</option>
                <option value="title_asc">Abecedně (A-Z)</option>
                <option value="title_desc">Abecedně (Z-A)</option>
                <option value="size_desc">Největší soubory</option>
                <option value="size_asc">Nejmenší soubory</option>
                <option value="usage_desc">Nejvíce používané</option>
              </select>
            </div>

            {/* View Mode */}
            <div className="flex items-center rounded-xl border border-border bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  viewMode === 'grid' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Mřížkové zobrazení"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  viewMode === 'list' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Seznamové zobrazení"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Type Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">Typ:</span>
            {[
              { id: 'all', label: 'Vše' },
              { id: 'image', label: 'Obrázky' },
              { id: 'vector', label: 'SVG Vektory' },
              { id: 'document', label: 'Dokumenty' },
              { id: 'video', label: 'Video' },
              { id: 'audio', label: 'Audio' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedType(t.id as any)}
                className={`px-3 py-1 rounded-xl text-xs font-medium transition-colors ${
                  selectedType === t.id
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded-md border-border text-primary focus:ring-primary/20"
            />
            <span>Zobrazit i archivované</span>
          </label>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>
            Zobrazeno <strong>{filteredAssets.length}</strong> z celkem {stats.count} médií
          </span>
          {selectedAsset && (
            <button
              type="button"
              onClick={() => handleOpenDetail(selectedAsset)}
              className="text-primary font-semibold hover:underline"
            >
              Otevřít detail vybraného ({selectedAsset.metadata.title})
            </button>
          )}
        </div>

        {viewMode === 'grid' ? (
          <MediaGrid
            assets={filteredAssets}
            selectedAsset={selectedAsset}
            onSelect={(asset) => setSelectedAsset(asset)}
            onOpenDetail={handleOpenDetail}
            onOpenUpload={() => setIsUploadOpen(true)}
          />
        ) : (
          <MediaList
            assets={filteredAssets}
            selectedAsset={selectedAsset}
            onSelect={(asset) => setSelectedAsset(asset)}
            onOpenDetail={handleOpenDetail}
          />
        )}
      </div>

      {/* Modals & Drawers */}
      <MediaDetailDrawer
        asset={selectedAsset}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        onUpdateMetadata={handleUpdateMetadata}
        onOpenReplace={handleOpenReplace}
        onOpenDelete={handleOpenDelete}
        onToggleArchive={handleToggleArchive}
      />

      <MediaUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={(newAsset) => {
          refreshAssets();
          setSelectedAsset(newAsset);
          setIsDetailOpen(true);
          showToast(`Médium „${newAsset.metadata.title}“ bylo úspěšně nahráno.`);
        }}
        onUploadFile={(params) => { showToast('Vyžaduje aktivní oprávnění správce', 'error'); return { success: false, error: 'Vyžaduje aktivní oprávnění správce' } as any; }}
      />

      <MediaReplaceModal
        isOpen={isReplaceOpen}
        asset={modalTargetAsset}
        onClose={() => {
          setIsReplaceOpen(false);
          setModalTargetAsset(null);
        }}
        onReplaceSuccess={(updated) => {
          refreshAssets();
          setSelectedAsset(updated);
          showToast(`Soubor pro médium „${updated.metadata.title}“ byl úspěšně nahrazen.`);
        }}
        onReplaceFile={(id, file) => { showToast('Vyžaduje aktivní oprávnění správce', 'error'); return Promise.resolve({ success: false, error: 'Vyžaduje aktivní oprávnění správce' }); }}
      />

      <MediaDeleteModal
        isOpen={isDeleteOpen}
        asset={modalTargetAsset}
        onClose={() => {
          setIsDeleteOpen(false);
          setModalTargetAsset(null);
        }}
        onConfirmDelete={handleConfirmDelete}
        onArchiveInstead={handleArchiveInstead}
      />
    </div>
  );
}
