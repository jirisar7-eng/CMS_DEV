"use client";

import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  ExternalLink,
  Hash,
  FolderTree,
  AlertCircle,
  Check,
  Search,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import {
  NavigationItem,
  NavigationItemType,
  CreateNavigationItemInput,
  UpdateNavigationItemInput,
} from '@/lib/domain/navigation/types';
import { isSafeUrl, sanitizeLabel, MAX_NAVIGATION_DEPTH } from '@/lib/domain/navigation/validation';
import { PageSummary } from '@/lib/domain/pages';

interface NavigationItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (itemData: CreateNavigationItemInput | UpdateNavigationItemInput) => Promise<void>;
  item?: NavigationItem | null;
  parentCandidateItems: { id: string; label: string; depth?: number }[];
  availablePages: PageSummary[];
  defaultParentId?: string | null;
}

const NavigationItemModalInner: React.FC<Omit<NavigationItemModalProps, 'isOpen'>> = ({
  onClose,
  onSave,
  item,
  parentCandidateItems,
  availablePages,
  defaultParentId = null,
}) => {
  const isEditing = !!item;

  const [type, setType] = useState<NavigationItemType>(item?.type || 'PAGE');
  const [label, setLabel] = useState<string>(item?.label || '');
  const [pageId, setPageId] = useState<string>(item?.pageId || '');
  const [externalUrl, setExternalUrl] = useState<string>(item?.externalUrl || '');
  const [anchor, setAnchor] = useState<string>(item?.anchor || '');
  const [parentId, setParentId] = useState<string | null>(item ? item.parentId : defaultParentId);
  const [visibility, setVisibility] = useState<boolean>(item ? item.visibility : true);
  const [openInNewTab, setOpenInNewTab] = useState<boolean>(item ? item.openInNewTab : false);

  const [pageSearchQuery, setPageSearchQuery] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Real-time URL safety check
  const urlCheck = type === 'EXTERNAL_LINK' ? isSafeUrl(externalUrl) : { safe: true };

  // Filtered pages for picker
  const filteredPages = availablePages.filter((p) => {
    const q = pageSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return p.title.toLowerCase().includes(q) || p.path.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q);
  });

  const handlePageSelect = (page: PageSummary) => {
    setPageId(page.id);
    if (!label.trim()) {
      setLabel(page.title);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const cleanLabel = sanitizeLabel(label);
    if (!cleanLabel) {
      setValidationError('Zadejte prosím název položky.');
      return;
    }

    if (type === 'PAGE' && !pageId) {
      setValidationError('Vyberte prosím cílovou interní stránku.');
      return;
    }

    if (type === 'EXTERNAL_LINK') {
      if (!externalUrl.trim()) {
        setValidationError('Zadejte prosím externí URL adresu.');
        return;
      }
      const safety = isSafeUrl(externalUrl);
      if (!safety.safe) {
        setValidationError(safety.reason || 'Zadaná URL adresa obsahuje nepovolené nebo nebezpečné schéma.');
        return;
      }
    }

    if (type === 'ANCHOR') {
      if (!anchor.trim()) {
        setValidationError('Zadejte prosím název kotvy (např. #kontakt).');
        return;
      }
    }

    try {
      setIsSubmitting(true);
      await onSave({
        type,
        label: cleanLabel,
        pageId: type === 'PAGE' ? pageId : null,
        externalUrl: type === 'EXTERNAL_LINK' ? externalUrl.trim() : null,
        anchor: type === 'ANCHOR' ? (anchor.startsWith('#') ? anchor.trim() : `#${anchor.trim()}`) : null,
        parentId: parentId || null,
        visibility,
        openInNewTab: type === 'EXTERNAL_LINK' ? openInNewTab : false,
      });
      onClose();
    } catch (err: any) {
      setValidationError(err.message || 'Při ukládání položky došlo k chybě.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nav-item-modal-title"
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl p-5 sm:p-6 space-y-5 max-h-[90vh] overflow-y-auto"
        id="nav-item-modal-container"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <FolderTree className="w-5 h-5" />
            </div>
            <div>
              <h3 id="nav-item-modal-title" className="font-bold text-foreground text-base">
                {isEditing ? `Upravit položku „${item?.label}“` : 'Přidat novou položku navigace'}
              </h3>
              <p className="text-xs text-muted-foreground">
                Nastavení cíle odkazu, zanoření v hierarchii a pravidel viditelnosti.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            aria-label="Zavřít"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {validationError && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{validationError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
          {/* Type Selector */}
          <div>
            <label className="block font-semibold text-foreground mb-1.5 text-xs">Typ položky</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'PAGE', label: 'Stránka', icon: FileText, desc: 'Kanonické pageId' },
                { id: 'EXTERNAL_LINK', label: 'Externí URL', icon: ExternalLink, desc: 'Vnější adresa' },
                { id: 'ANCHOR', label: 'Kotva', icon: Hash, desc: 'Sekce #kotva' },
                { id: 'GROUP', label: 'Skupina', icon: FolderTree, desc: 'Nadpis bez prokliku' },
              ].map((t) => {
                const Icon = t.icon;
                const isSelected = type === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setType(t.id as NavigationItemType);
                      if (t.id === 'EXTERNAL_LINK' && !isEditing) {
                        setOpenInNewTab(true);
                      }
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4 mb-1.5" />
                    <span className="font-bold text-xs leading-none">{t.label}</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">{t.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Item Label */}
          <div>
            <label htmlFor="nav-item-label" className="block font-semibold text-foreground mb-1 text-xs">
              Název odkazu (Zobrazený text) <span className="text-destructive">*</span>
            </label>
            <input
              id="nav-item-label"
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="např. O projektu, Ceník, Kontakt..."
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary outline-hidden"
            />
          </div>

          {/* Conditional Target inputs */}
          {type === 'PAGE' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block font-semibold text-foreground text-xs">
                  Cílová stránka (Kanonická reference) <span className="text-destructive">*</span>
                </label>
                {pageId && (
                  <span className="text-[11px] text-primary font-mono">
                    Vybráno: {availablePages.find((p) => p.id === pageId)?.path || pageId}
                  </span>
                )}
              </div>

              {/* Search filter for pages */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={pageSearchQuery}
                  onChange={(e) => setPageSearchQuery(e.target.value)}
                  placeholder="Vyhledat v seznamu stránek..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-input bg-muted/40 text-foreground text-xs"
                />
              </div>

              <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-muted/20 divide-y divide-border/50">
                {filteredPages.length === 0 ? (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    Žádná stránka neodpovídá filtru.
                  </div>
                ) : (
                  filteredPages.map((page) => {
                    const isSelected = pageId === page.id;
                    return (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => handlePageSelect(page)}
                        className={`w-full p-2 text-left flex items-center justify-between gap-2 hover:bg-muted/60 transition-colors cursor-pointer text-xs ${
                          isSelected ? 'bg-primary/10 text-primary font-bold' : 'text-foreground'
                        }`}
                      >
                        <div className="min-w-0 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{page.title}</span>
                          <span className="text-[11px] text-muted-foreground font-mono truncate">{page.path}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                            {page.status}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {type === 'EXTERNAL_LINK' && (
            <div className="space-y-2">
              <label htmlFor="nav-item-url" className="block font-semibold text-foreground text-xs">
                Externí URL adresa <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <input
                  id="nav-item-url"
                  type="text"
                  required
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://example.com nebo /cesta"
                  className={`w-full px-3 py-2 rounded-xl border bg-background text-foreground text-xs focus:ring-2 focus:ring-primary/20 outline-hidden ${
                    externalUrl && !urlCheck.safe
                      ? 'border-destructive focus:border-destructive'
                      : 'border-input focus:border-primary'
                  }`}
                />
              </div>

              {externalUrl && (
                <div
                  className={`p-2 rounded-lg text-xs flex items-center gap-2 ${
                    urlCheck.safe
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                      : 'bg-destructive/10 text-destructive border border-destructive/20'
                  }`}
                >
                  {urlCheck.safe ? (
                    <>
                      <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span>URL je bezpečné. Atribut rel=&quot;noopener noreferrer&quot; bude aktivován automaticky.</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="w-4 h-4 shrink-0 text-destructive" />
                      <span>{urlCheck.reason}</span>
                    </>
                  )}
                </div>
              )}

              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={openInNewTab}
                  onChange={(e) => setOpenInNewTab(e.target.checked)}
                  className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                />
                <span className="text-xs text-foreground font-medium">
                  Otevřít odkaz v novém okně (target=&quot;_blank&quot; s noopener/noreferrer)
                </span>
              </label>
            </div>
          )}

          {type === 'ANCHOR' && (
            <div>
              <label htmlFor="nav-item-anchor" className="block font-semibold text-foreground mb-1 text-xs">
                Cílová kotva (ID elementu) <span className="text-destructive">*</span>
              </label>
              <input
                id="nav-item-anchor"
                type="text"
                required
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
                placeholder="#kontakt, #sluzby, #cenik..."
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary outline-hidden"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Kotva slouží k plynulému posunu na konkrétní sekci aktuální stránky.
              </p>
            </div>
          )}

          {/* Parent Item Selector */}
          <div>
            <label htmlFor="nav-item-parent" className="block font-semibold text-foreground mb-1 text-xs">
              Nadřazená položka v hierarchii
            </label>
            <select
              id="nav-item-parent"
              value={parentId || ''}
              onChange={(e) => setParentId(e.target.value ? e.target.value : null)}
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary outline-hidden"
            >
              <option value="">-- Hlavní (kořenová) úroveň --</option>
              {parentCandidateItems
                .filter((p) => !item || p.id !== item.id) // Can't be parent to itself
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {'-'.repeat(p.depth || 0)} {p.label}
                  </option>
                ))}
            </select>
          </div>

          {/* Visibility toggle */}
          <div className="pt-2 border-t border-border flex items-center justify-between">
            <div>
              <label className="font-semibold text-foreground text-xs block">Stav viditelnosti</label>
              <p className="text-[11px] text-muted-foreground">
                Skrytá položka se nezobrazí na veřejném webu, ale zůstane zachována v modelu.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={visibility}
                onChange={(e) => setVisibility(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-muted peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-border bg-card text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (type === 'EXTERNAL_LINK' && !urlCheck.safe)}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{isEditing ? 'Uložit změny' : 'Vytvořit položku'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const NavigationItemModal: React.FC<NavigationItemModalProps> = (props) => {
  if (!props.isOpen) return null;
  const key = props.item?.id ? `edit-${props.item.id}` : `new-${props.defaultParentId || 'root'}`;
  return <NavigationItemModalInner key={key} {...props} />;
};

