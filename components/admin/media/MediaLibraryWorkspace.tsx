'use client';

import React, { useState, useMemo } from 'react';
import {
  Search,
  Upload,
  LayoutGrid,
  List,
  ArrowUpDown,
  Image as ImageIcon,
  HardDrive,
  CheckCircle2,
  Archive,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import {
  MediaAsset,
  MediaAssetVersion,
  MediaSortOption,
  MediaType,
} from '@/lib/domain/media/types';
import {
  listMediaAssets,
  uploadMediaAsset,
  updateMediaMetadata,
  archiveMediaAsset,
  restoreMediaAsset,
  replaceMediaAsset,
  deleteMediaAsset,
  listMediaAssetVersions,
  restoreMediaAssetVersion,
} from '@/app/admin/media/actions';
import { MediaGrid } from './MediaGrid';
import { MediaList } from './MediaList';
import { MediaDetailDrawer } from './MediaDetailDrawer';
import { MediaUploadModal } from './MediaUploadModal';
import { MediaReplaceModal } from './MediaReplaceModal';
import { MediaDeleteModal } from './MediaDeleteModal';
import { CapabilityStatusBadge } from '@/components/admin/CapabilityStatusBadge';
import { HelpTrigger } from '@/components/help/HelpTrigger';
import { formatBytes } from './MediaAssetCard';

interface MediaLibraryWorkspaceProps {
  initialProjectId?: string | null;
}

export function MediaLibraryWorkspace({ initialProjectId }: MediaLibraryWorkspaceProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Versions state
  const [versions, setVersions] = useState<MediaAssetVersion[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [isRestoringVersion, setIsRestoringVersion] = useState(false);

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

  const showToast = React.useCallback((message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  }, []);

  const refreshAssets = React.useCallback(async () => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const response = await listMediaAssets();
      if (response.error) {
        setAuthError(response.error);
        setAssets([]);
      } else {
        setAssets(response.data || []);
      }
    } catch (e: any) {
      showToast('Nepodařilo se načíst média', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  const loadVersions = React.useCallback(async (assetId: string) => {
    setIsLoadingVersions(true);
    try {
      const res = await listMediaAssetVersions(assetId);
      if (res.data) {
        setVersions(res.data);
      } else {
        setVersions([]);
      }
    } catch {
      setVersions([]);
    } finally {
      setIsLoadingVersions(false);
    }
  }, []);

  React.useEffect(() => {
    let mounted = true;
    const initialLoad = async () => {
      try {
        const response = await listMediaAssets();
        if (!mounted) return;
        if (response.error) {
          setAuthError(response.error);
          setAssets([]);
        } else {
          setAssets(response.data || []);
        }
      } catch (e) {
        if (mounted) showToast('Nepodařilo se načíst média', 'error');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    initialLoad();
    return () => { mounted = false; };
  }, [showToast]);

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

  // Handlers
  const handleOpenDetail = (asset: MediaAsset) => {
    setSelectedAsset(asset);
    setVersions([]);
    setIsDetailOpen(true);
    loadVersions(asset.id);
  };

  const handleSelectAsset = (asset: MediaAsset) => {
    setSelectedAsset(asset);
    setVersions([]);
    if (isDetailOpen) {
      loadVersions(asset.id);
    }
  };

  const handleUpdateMetadata = async (assetId: string, metadata: Partial<MediaAsset['metadata']>) => {
    const res = await updateMediaMetadata(assetId, metadata);
    if (res.error) {
      showToast(res.error, 'error');
    } else if (res.data) {
      showToast('Metadata byla úspěšně uložena.');
      setSelectedAsset(res.data);
      refreshAssets();
    }
  };

  const handleToggleArchive = async (assetId: string, currentlyArchived: boolean) => {
    const res = currentlyArchived
      ? await restoreMediaAsset(assetId)
      : await archiveMediaAsset(assetId);
    if (res.error) {
      showToast(res.error, 'error');
    } else if (res.data) {
      showToast(currentlyArchived ? 'Médium bylo obnoveno z archivu.' : 'Médium bylo archivováno.');
      setSelectedAsset(res.data);
      refreshAssets();
    }
  };

  const handleOpenReplace = (asset: MediaAsset) => {
    setModalTargetAsset(asset);
    setIsReplaceOpen(true);
  };

  const handleOpenDelete = (asset: MediaAsset) => {
    setModalTargetAsset(asset);
    setIsDeleteOpen(true);
  };

  const handleConfirmDelete = async (assetId: string) => {
    const res = await deleteMediaAsset(assetId);
    if (res.error) {
      showToast(res.error, 'error');
    } else {
      showToast('Médium bylo úspěšně smazáno.');
      setIsDeleteOpen(false);
      setModalTargetAsset(null);
      if (selectedAsset?.id === assetId) {
        setSelectedAsset(null);
        setIsDetailOpen(false);
        setVersions([]);
      }
      refreshAssets();
    }
  };

  const handleArchiveInstead = async (assetId: string) => {
    setIsDeleteOpen(false);
    setModalTargetAsset(null);
    await handleToggleArchive(assetId, false);
  };

  const handleRestoreVersion = async (versionId: string) => {
    if (!selectedAsset) return;
    setIsRestoringVersion(true);
    try {
      const res = await restoreMediaAssetVersion(selectedAsset.id, versionId);
      if (res.error || !res.data) {
        showToast(res.error || 'Chyba při obnově verze média.', 'error');
        return;
      }
      setSelectedAsset(res.data);
      await refreshAssets();
      await loadVersions(selectedAsset.id);
      showToast('Předchozí verze média byla úspěšně obnovena.');
    } catch (err: any) {
      showToast(err.message || 'Chyba při obnově verze média.', 'error');
    } finally {
      setIsRestoringVersion(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-2.5 text-xs font-semibold animate-in slide-in-from-bottom duration-200 ${
            notification.type === 'error'
              ? 'bg-destructive text-destructive-foreground border-destructive/20'
              : 'bg-card text-foreground border-border'
          }`}
        >
          {notification.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-destructive-foreground shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header & Capability Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Knihovna médií
            </h1>
            <CapabilityStatusBadge status="ZÁKLAD" size="sm" />
            <HelpTrigger helpKey="media.library" />
          </div>
          <p className="text-xs text-muted-foreground">
            Správa obrázků, vektorů, dokumentů a assetů s bezpečným ukládáním, verzováním a sledováním vazeb.
          </p>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <button
            type="button"
            onClick={refreshAssets}
            disabled={isLoading}
            className="p-2 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
            title="Obnovit seznam médií"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setIsUploadOpen(true)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-all shadow-sm"
          >
            <Upload className="w-4 h-4" />
            <span>Nahrát soubor</span>
          </button>
        </div>
      </div>

      {/* Auth / Permission Notice if active */}
      {authError && (
        <div className="p-4 rounded-2xl border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{authError}</span>
          </div>
          <button
            type="button"
            onClick={refreshAssets}
            className="px-3 py-1.5 rounded-xl bg-background text-foreground font-semibold text-xs border border-border hover:bg-muted transition-colors"
          >
            Zkusit znovu
          </button>
        </div>
      )}

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl border border-border bg-card">
          <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Celkem médií</span>
          </div>
          <div className="text-lg font-bold text-foreground mt-1 font-mono">{stats.count}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">ve vašem projektu</div>
        </div>

        <div className="p-3.5 rounded-2xl border border-border bg-card">
          <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5" />
            <span>Využité místo</span>
          </div>
          <div className="text-lg font-bold text-foreground mt-1 font-mono">{formatBytes(stats.totalBytes)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">bezpečné úložiště</div>
        </div>

        <div className="p-3.5 rounded-2xl border border-border bg-card">
          <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Aktivní reference</span>
          </div>
          <div className="text-lg font-bold text-foreground mt-1 font-mono">{stats.totalUsage}×</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">použití na stránkách</div>
        </div>

        <div className="p-3.5 rounded-2xl border border-border bg-card">
          <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
            <Archive className="w-3.5 h-3.5" />
            <span>V archivu</span>
          </div>
          <div className="text-lg font-bold text-foreground mt-1 font-mono">{stats.archivedCount}</div>
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
            onSelect={handleSelectAsset}
            onOpenDetail={handleOpenDetail}
            onOpenUpload={() => setIsUploadOpen(true)}
          />
        ) : (
          <MediaList
            assets={filteredAssets}
            selectedAsset={selectedAsset}
            onSelect={handleSelectAsset}
            onOpenDetail={handleOpenDetail}
          />
        )}
      </div>

      {/* Modals & Drawers */}
      <MediaDetailDrawer
        asset={selectedAsset}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setVersions([]);
        }}
        onUpdateMetadata={handleUpdateMetadata}
        onOpenReplace={handleOpenReplace}
        onOpenDelete={handleOpenDelete}
        onToggleArchive={handleToggleArchive}
        versions={versions}
        isLoadingVersions={isLoadingVersions}
        onRestoreVersion={handleRestoreVersion}
        isRestoringVersion={isRestoringVersion}
      />

      <MediaUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={(newAsset) => {
          refreshAssets();
          setSelectedAsset(newAsset);
          setIsDetailOpen(true);
          setVersions([]);
          loadVersions(newAsset.id);
          showToast(`Médium „${newAsset.metadata.title}“ bylo úspěšně nahráno.`);
        }}
        onUploadFile={async (formData) => {
          const res = await uploadMediaAsset(formData);
          return { success: !res.error && !!res.data, asset: res.data, error: res.error };
        }}
      />

      {isReplaceOpen && modalTargetAsset && (
        <MediaReplaceModal
          key={modalTargetAsset.id}
          isOpen={isReplaceOpen}
          asset={modalTargetAsset}
          onClose={() => {
            setIsReplaceOpen(false);
            setModalTargetAsset(null);
          }}
          onReplaceSuccess={async (updated) => {
            setSelectedAsset(updated);
            await refreshAssets();
            await loadVersions(updated.id);
            showToast(`Soubor pro médium „${updated.metadata.title}“ byl úspěšně nahrazen.`);
          }}
          onReplaceFile={async (formData) => {
            const res = await replaceMediaAsset(formData);
            return { success: !res.error && !!res.data, asset: res.data, error: res.error };
          }}
        />
      )}

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
