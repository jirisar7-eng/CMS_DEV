'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  PageDetail,
  PageStatus,
  PageVisibility,
  PageSummary,
  PageContent,
  ContentBlock,
  pagesRepository,
} from '@/lib/domain/pages';
import { PageStatusBadge } from './PageStatusBadge';
import { useI18n } from '@/lib/i18n';
import {
  ArrowLeft,
  ExternalLink,
  Save,
  CheckCircle,
  Clock,
  Layers,
  Settings,
  Search,
  Compass,
  History,
  Activity,
  AlertCircle,
  RefreshCw,
  X,
  Check,
  User,
  Calendar,
  FileText,
  Type,
  LayoutGrid,
  Info,
  Sparkles,
  Blocks,
  Edit3,
} from 'lucide-react';

interface PageDetailWorkspaceProps {
  pageId: string;
}

type DetailTab = 'content' | 'settings' | 'seo' | 'navigation' | 'revisions' | 'activity';

const ALL_STATUSES: PageStatus[] = [
  'Koncept',
  'Ke kontrole',
  'Schváleno',
  'Naplánováno',
  'Publikováno',
  'Archivováno',
];

const ALL_VISIBILITIES: PageVisibility[] = [
  'Veřejná',
  'Neveřejná (přes odkaz)',
  'Chráněná heslem',
  'Interní (pouze CMS)',
];

export function PageDetailWorkspace({ pageId }: PageDetailWorkspaceProps) {
  const t = useI18n();
  const dict = t.page_detail;

  // Active Tab
  const [activeTab, setActiveTab] = useState<DetailTab>('content');

  // Page data state
  const [page, setPage] = useState<PageDetail | null>(null);
  const [allPages, setAllPages] = useState<PageSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'info' } | null>(
    null
  );

  // Editable form fields state (synced with loaded page)
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<PageStatus>('Koncept');
  const [visibility, setVisibility] = useState<PageVisibility>('Veřejná');
  const [content, setContent] = useState<PageContent>({ version: 1, schemaVersion: 'syn-block-v1', blocks: [] });

  // SEO fields
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [canonicalUrl, setCanonicalUrl] = useState('');
  const [noIndex, setNoIndex] = useState(false);

  // Navigation fields
  const [showInMainNavigation, setShowInMainNavigation] = useState(false);
  const [showInFooter, setShowInFooter] = useState(false);
  const [navigationLabel, setNavigationLabel] = useState('');

  // Initial fetch
  useEffect(() => {
    let isMounted = true;

    Promise.all([
      pagesRepository.getPageById(pageId),
      pagesRepository.getPages(),
    ])
      .then(([loadedPage, list]) => {
        if (!isMounted) return;
        if (!loadedPage) {
          setError(dict.error_not_found);
          setIsLoading(false);
          return;
        }

        setPage(loadedPage);
        setAllPages(list.filter((p) => p.id !== pageId)); // cannot be parent to itself

        // populate fields
        setTitle(loadedPage.title);
        setSlug(loadedPage.slug);
        setParentId(loadedPage.parentId || '');
        setDescription(loadedPage.description || '');
        setStatus(loadedPage.status);
        setVisibility(loadedPage.visibility);
        setContent(loadedPage.content || { version: 1, schemaVersion: 'syn-block-v1', blocks: [] });

        setMetaTitle(loadedPage.seo?.metaTitle || '');
        setMetaDescription(loadedPage.seo?.metaDescription || '');
        setCanonicalUrl(loadedPage.seo?.canonicalUrl || '');
        setNoIndex(loadedPage.seo?.noIndex || false);

        setShowInMainNavigation(loadedPage.navigation?.showInMainNavigation || false);
        setShowInFooter(loadedPage.navigation?.showInFooter || false);
        setNavigationLabel(loadedPage.navigation?.navigationLabel || loadedPage.title);

        setIsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Chyba při načítání detailu stránky.');
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [pageId, dict.error_not_found]);

  // Save handler
  const handleSave = async (newStatus?: PageStatus) => {
    if (!page) return;
    setIsSaving(true);
    setError(null);

    const targetStatus = newStatus || status;

    try {
      const updated = await pagesRepository.updatePage(page.id, {
        title,
        slug,
        parentId: parentId || null,
        description,
        status: targetStatus,
        visibility,
        content,
        seo: {
          metaTitle,
          metaDescription,
          canonicalUrl,
          noIndex,
        },
        navigation: {
          showInMainNavigation,
          showInFooter,
          navigationLabel,
        },
      });

      setPage(updated);
      setStatus(updated.status);
      setFeedback({
        message:
          targetStatus === 'Publikováno'
            ? dict.feedback_published
            : targetStatus === 'Ke kontrole'
            ? dict.feedback_submitted
            : dict.feedback_saved,
        type: 'success',
      });
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Chyba při ukládání změn.');
    } finally {
      setIsSaving(false);
    }
  };

  // Capabilities from permission model
  const caps = page?.capabilities || {
    canOpen: true,
    canEdit: true,
    canPreview: true,
    canDuplicate: true,
    canMove: true,
    canArchive: true,
    canPublish: true,
    canSave: true,
    canSubmitReview: true,
  };

  if (isLoading) {
    return (
      <div className="p-16 rounded-xl border border-border bg-card shadow-xs flex flex-col items-center justify-center text-muted-foreground space-y-3">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        <p className="text-sm font-medium">{dict.loading}</p>
      </div>
    );
  }

  if (error && !page) {
    return (
      <div className="p-8 rounded-xl border border-destructive/30 bg-destructive/10 shadow-xs flex flex-col items-center justify-center text-center space-y-3 max-w-lg mx-auto">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <h2 className="text-base font-semibold text-destructive">{dict.error_not_found}</h2>
        <p className="text-xs sm:text-sm text-destructive/90">{error}</p>
        <Link
          href="/admin/pages"
          className="px-4 py-2 min-h-[44px] inline-flex items-center justify-center text-xs sm:text-sm font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors"
        >
          {dict.back_to_pages}
        </Link>
      </div>
    );
  }

  if (!page) return null;

  const formattedDate = new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(page.updatedAt));

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* Top Header: Back button, Title, Status & Primary Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 pb-2 border-b border-border">
        {/* Left Side: Back & Title + Metadata */}
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <Link
            href="/admin/pages"
            id="btn-back-to-pages"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 mt-0.5 sm:mt-0"
            title={dict.back_to_pages}
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <PageStatusBadge status={page.status} size="sm" />
              <span className="text-xs font-mono text-muted-foreground truncate">
                {page.path || '/'}
              </span>
            </div>
            <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-foreground truncate">
              {page.title}
            </h1>
          </div>
        </div>

        {/* Right Side Actions (Reflecting Capabilities Model) */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Edit Content in Composer */}
          {caps.canEdit && (
            <Link
              href={`/admin/pages/${page.id}/edit`}
              id="btn-page-edit-content"
              className="px-3.5 py-2 min-h-[44px] inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs transition-colors cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
              <span>Upravit obsah</span>
            </Link>
          )}

          {/* Public Preview */}
          {caps.canPreview && (
            <Link
              href={`/preview/site?path=${encodeURIComponent(page.path || '/')}`}
              target="_blank"
              rel="noopener noreferrer"
              id="btn-page-preview"
              className="px-3 py-2 min-h-[44px] inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors"
            >
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
              <span>{dict.header_actions.preview}</span>
            </Link>
          )}

          {/* Submit for Review (if allowed) */}
          {caps.canSubmitReview && page.status === 'Koncept' && (
            <button
              type="button"
              id="btn-page-submit-review"
              onClick={() => handleSave('Ke kontrole')}
              disabled={isSaving}
              className="px-3 py-2 min-h-[44px] inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-medium rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
            >
              <Clock className="w-4 h-4 text-amber-500" />
              <span>{dict.header_actions.submit_review}</span>
            </button>
          )}

          {/* Publish Action (if allowed) */}
          {caps.canPublish && page.status !== 'Publikováno' && (
            <button
              type="button"
              id="btn-page-publish"
              onClick={() => handleSave('Publikováno')}
              disabled={isSaving}
              className="px-3.5 py-2 min-h-[44px] inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-medium text-emerald-950 dark:text-emerald-100 bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 dark:hover:bg-emerald-600 rounded-lg shadow-xs transition-colors"
            >
              <CheckCircle className="w-4 h-4 text-white" />
              <span>{dict.header_actions.publish}</span>
            </button>
          )}

          {/* Save Button */}
          {caps.canSave && (
            <button
              type="button"
              id="btn-page-save"
              onClick={() => handleSave()}
              disabled={isSaving}
              className="px-4 py-2 min-h-[44px] inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-lg shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Ukládám...' : dict.header_actions.save}</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Alert */}
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
            className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center hover:opacity-75 -mr-1"
            aria-label="Zavřít"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Tabs Bar (Scrollable on small mobile) */}
      <div className="border-b border-border overflow-x-auto no-scrollbar">
        <nav className="flex space-x-2 sm:space-x-4 min-w-max pb-px" aria-label="Záložky detailu stránky">
          <button
            type="button"
            id="tab-content"
            onClick={() => setActiveTab('content')}
            aria-current={activeTab === 'content' ? 'page' : undefined}
            className={`flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
              activeTab === 'content'
                ? 'border-primary text-foreground font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>{dict.tabs.content}</span>
          </button>

          <button
            type="button"
            id="tab-settings"
            onClick={() => setActiveTab('settings')}
            aria-current={activeTab === 'settings' ? 'page' : undefined}
            className={`flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
              activeTab === 'settings'
                ? 'border-primary text-foreground font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>{dict.tabs.settings}</span>
          </button>

          <button
            type="button"
            id="tab-seo"
            onClick={() => setActiveTab('seo')}
            aria-current={activeTab === 'seo' ? 'page' : undefined}
            className={`flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
              activeTab === 'seo'
                ? 'border-primary text-foreground font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>{dict.tabs.seo}</span>
          </button>

          <button
            type="button"
            id="tab-navigation"
            onClick={() => setActiveTab('navigation')}
            aria-current={activeTab === 'navigation' ? 'page' : undefined}
            className={`flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
              activeTab === 'navigation'
                ? 'border-primary text-foreground font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>{dict.tabs.navigation}</span>
          </button>

          <button
            type="button"
            id="tab-revisions"
            onClick={() => setActiveTab('revisions')}
            aria-current={activeTab === 'revisions' ? 'page' : undefined}
            className={`flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
              activeTab === 'revisions'
                ? 'border-primary text-foreground font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <History className="w-4 h-4" />
            <span>{dict.tabs.revisions}</span>
            {page.revisions?.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                {page.revisions.length}
              </span>
            )}
          </button>

          <button
            type="button"
            id="tab-activity"
            onClick={() => setActiveTab('activity')}
            aria-current={activeTab === 'activity' ? 'page' : undefined}
            className={`flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
              activeTab === 'activity'
                ? 'border-primary text-foreground font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>{dict.tabs.activity}</span>
          </button>
        </nav>
      </div>

      {/* Tab Panels */}
      <div className="space-y-6">
        {/* TAB 1: Obsah */}
        {activeTab === 'content' && (
          <div className="space-y-4">
            <div className="p-4 sm:p-6 rounded-xl border border-border bg-card shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border">
                <div>
                  <div className="flex items-center gap-2">
                    <Blocks className="w-5 h-5 text-primary" />
                    <h2 className="text-base font-semibold text-foreground">Kanonický blokový obsah</h2>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Strukturovaný model SYN-DESIGN-010 nezávislý na konkrétním editoru.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-muted text-muted-foreground border border-border">
                    {content.schemaVersion || 'syn-block-v1'}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                    {content.blocks.length} {content.blocks.length === 1 ? 'blok' : content.blocks.length < 5 ? 'bloky' : 'bloků'}
                  </span>
                  {caps.canEdit && (
                    <Link
                      href={`/admin/pages/${page.id}/edit`}
                      id="btn-edit-content-tab"
                      className="ml-1 sm:ml-2 px-3 py-1.5 min-h-[36px] inline-flex items-center gap-1.5 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted hover:border-primary/40 transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-primary" />
                      <span>Upravit v Composeru</span>
                    </Link>
                  )}
                </div>
              </div>

              {/* Block list preview */}
              <div className="space-y-2.5">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Přehled stromu bloků
                </div>

                {content.blocks.length === 0 ? (
                  <div className="p-8 rounded-xl border border-dashed border-border text-center space-y-3">
                    <p className="text-muted-foreground text-sm">
                      Tato stránka zatím neobsahuje žádné kanonické bloky.
                    </p>
                    {caps.canEdit && (
                      <Link
                        href={`/admin/pages/${page.id}/edit`}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                        <span>Otevřít v Composeru a přidat obsah</span>
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-border rounded-lg border border-border bg-background overflow-hidden">
                    {content.blocks.map((block: ContentBlock, idx: number) => {
                      const blockType = block.type;
                      const textData = (block.data?.text as string) || '';
                      const level = (block.data?.level as number) || 2;

                      return (
                        <div
                          key={block.id || idx}
                          className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <span className="shrink-0 w-6 h-6 rounded bg-muted flex items-center justify-center text-xs font-mono font-medium text-muted-foreground">
                              {idx + 1}
                            </span>
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground">
                                  {blockType === 'heading' && `Nadpis H${level}`}
                                  {blockType === 'paragraph' && 'Odstavec textu'}
                                  {blockType === 'rich_text' && 'Formátovaný text'}
                                  {blockType === 'callout' && 'Upozornění / Callout'}
                                  {blockType === 'image' && 'Obrázek'}
                                  {blockType === 'columns' && 'Sloupcový layout'}
                                  {blockType === 'quote' && 'Citace'}
                                  {blockType === 'button' && 'Tlačítko'}
                                  {blockType === 'divider' && 'Oddělovač'}
                                  {blockType === 'module_embed' && 'Modulární embed'}
                                  {![
                                    'heading',
                                    'paragraph',
                                    'rich_text',
                                    'callout',
                                    'image',
                                    'columns',
                                    'quote',
                                    'button',
                                    'divider',
                                    'module_embed',
                                  ].includes(blockType) && 'Neznámý blok (bezpečný fallback)'}
                                </span>
                                <span className="text-xs font-mono text-muted-foreground">
                                  {block.id}
                                </span>
                              </div>
                              <p className="text-sm text-foreground line-clamp-2">
                                {textData ? (
                                  textData
                                ) : blockType === 'module_embed' ? (
                                  <span className="text-xs font-mono text-muted-foreground">
                                    Modul: {String(block.data?.moduleId || 'neznámý')} (v{String(block.data?.schemaVersion || '1')})
                                    {block.data?.fallbackText ? ` – Fallback: ${String(block.data.fallbackText)}` : ''}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground italic font-mono text-xs">
                                    {String((block.data?.fallbackText as string) || 'Bezpečný obsah')}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground shrink-0 self-end sm:self-center font-mono">
                            pořadí: {block.order ?? idx}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Architectural Notice Card */}
              <div className="p-3.5 rounded-lg border border-primary/20 bg-primary/5 flex items-start gap-3">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-foreground">
                    Architektura obsahu SYN-DESIGN-010 (SYN-UI-004R01)
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    Markdown byl vyřazen z role kanonického těla stránky. Data jsou ukládána jako strom strukturovaných bloků připravených pro plný vizuální editor v úloze <strong>SYN-UI-005 (Content Composer First Slice)</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span>Šablona: <code className="font-mono">{page.templateId}</code></span>
                <span>Jazyk obsahu: {page.locale}</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Nastavení */}
        {activeTab === 'settings' && (
          <div className="p-4 sm:p-6 rounded-xl border border-border bg-card shadow-xs space-y-5">
            <h2 className="text-base font-semibold text-foreground">Metadata a umístění stránky</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Název */}
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="field-settings-title" className="block text-xs sm:text-sm font-semibold text-foreground">
                  Název stránky
                </label>
                <input
                  id="field-settings-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                />
              </div>

              {/* Slug */}
              <div className="space-y-1.5">
                <label htmlFor="field-settings-slug" className="block text-xs sm:text-sm font-semibold text-foreground">
                  URL Identifikátor (Slug)
                </label>
                <input
                  id="field-settings-slug"
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm font-mono rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                />
              </div>

              {/* Nadřazená stránka */}
              <div className="space-y-1.5">
                <label htmlFor="field-settings-parent" className="block text-xs sm:text-sm font-semibold text-foreground">
                  Nadřazená stránka ve stromu
                </label>
                <select
                  id="field-settings-parent"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors cursor-pointer"
                >
                  <option value="">— Kořenová úroveň (bez rodiče) —</option>
                  {allPages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.path} ({p.title})
                    </option>
                  ))}
                </select>
              </div>

              {/* Popis */}
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="field-settings-description" className="block text-xs sm:text-sm font-semibold text-foreground">
                  Popis stránky
                </label>
                <textarea
                  id="field-settings-description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-3 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors resize-y"
                />
              </div>

              {/* Stav */}
              <div className="space-y-1.5">
                <label htmlFor="field-settings-status" className="block text-xs sm:text-sm font-semibold text-foreground">
                  Stav stránky
                </label>
                <select
                  id="field-settings-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PageStatus)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors cursor-pointer"
                >
                  {ALL_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              {/* Viditelnost */}
              <div className="space-y-1.5">
                <label htmlFor="field-settings-visibility" className="block text-xs sm:text-sm font-semibold text-foreground">
                  Viditelnost
                </label>
                <select
                  id="field-settings-visibility"
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as PageVisibility)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors cursor-pointer"
                >
                  {ALL_VISIBILITIES.map((vis) => (
                    <option key={vis} value={vis}>
                      {vis}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Read-only metadata summary */}
            <div className="pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span>Autor: {page.author.name}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span>Poslední změna: {formattedDate}</span>
              </div>
              <div>ID: {page.id}</div>
            </div>
          </div>
        )}

        {/* TAB 3: SEO */}
        {activeTab === 'seo' && (
          <div className="p-4 sm:p-6 rounded-xl border border-border bg-card shadow-xs space-y-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">Optimalizace pro vyhledávače (SEO)</h2>
              <p className="text-xs text-muted-foreground">
                Nastavení meta značek pro vyhledávače a sociální sítě.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="field-seo-title" className="block text-xs sm:text-sm font-semibold text-foreground">
                  Meta titulek (Title)
                </label>
                <input
                  id="field-seo-title"
                  type="text"
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  placeholder="Výchozí: Název stránky | Synthesis CMS"
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="field-seo-desc" className="block text-xs sm:text-sm font-semibold text-foreground">
                  Meta popisek (Description)
                </label>
                <textarea
                  id="field-seo-desc"
                  rows={3}
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  placeholder="Doporučeno 120–160 znaků pro výsledky vyhledávání..."
                  className="w-full p-3 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors resize-y"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="field-seo-canonical" className="block text-xs sm:text-sm font-semibold text-foreground">
                  Kanonická URL (Canonical)
                </label>
                <input
                  id="field-seo-canonical"
                  type="text"
                  value={canonicalUrl}
                  onChange={(e) => setCanonicalUrl(e.target.value)}
                  placeholder="https://domena.cz/cesta"
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm font-mono rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={noIndex}
                    onChange={(e) => setNoIndex(e.target.checked)}
                    className="w-4 h-4 rounded border-input text-primary focus:ring-ring"
                  />
                  <span className="text-xs sm:text-sm text-foreground">
                    Zakázat indexaci vyhledávači (noindex, nofollow)
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Navigace */}
        {activeTab === 'navigation' && (
          <div className="p-4 sm:p-6 rounded-xl border border-border bg-card shadow-xs space-y-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">Umístění v navigaci webu</h2>
              <p className="text-xs text-muted-foreground">
                Určete, kde se odkaz na tuto stránku zobrazí návštěvníkům webu.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="field-nav-label" className="block text-xs sm:text-sm font-semibold text-foreground">
                  Název položky v menu
                </label>
                <input
                  id="field-nav-label"
                  type="text"
                  value={navigationLabel}
                  onChange={(e) => setNavigationLabel(e.target.value)}
                  placeholder={title || 'Zadejte popisek'}
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                />
              </div>

              <div className="space-y-3 pt-2">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showInMainNavigation}
                    onChange={(e) => setShowInMainNavigation(e.target.checked)}
                    className="w-4 h-4 rounded border-input text-primary focus:ring-ring"
                  />
                  <span className="text-xs sm:text-sm text-foreground">
                    Zobrazit v hlavním horním navigačním menu
                  </span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showInFooter}
                    onChange={(e) => setShowInFooter(e.target.checked)}
                    className="w-4 h-4 rounded border-input text-primary focus:ring-ring"
                  />
                  <span className="text-xs sm:text-sm text-foreground">
                    Zobrazit v patičce webu (Footer)
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: Revize */}
        {activeTab === 'revisions' && (
          <div className="p-4 sm:p-6 rounded-xl border border-border bg-card shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">Historie verzí a revizí</h2>
                <p className="text-xs text-muted-foreground">
                  Přehled uložených snapshotů a časových revizí obsahu.
                </p>
              </div>
            </div>

            {(!page.revisions || page.revisions.length === 0) ? (
              <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                Žádné předchozí revize pro tuto stránku nejsou evidovány.
              </div>
            ) : (
              <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                {page.revisions.map((rev) => (
                  <div key={rev.id} className="p-3.5 flex items-center justify-between gap-3 text-xs sm:text-sm bg-card hover:bg-muted/30 transition-colors">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold font-mono text-foreground">{rev.version}</span>
                        <PageStatusBadge status={rev.status} size="sm" />
                      </div>
                      <p className="text-muted-foreground text-xs">{rev.note}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground shrink-0">
                      <div>{rev.author.name}</div>
                      <div>{new Date(rev.createdAt).toLocaleDateString('cs-CZ')}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 6: Aktivita */}
        {activeTab === 'activity' && (
          <div className="p-4 sm:p-6 rounded-xl border border-border bg-card shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">Auditní log aktivity</h2>
              <p className="text-xs text-muted-foreground">
                Záznamy o operacích a změnách provedených nad touto stránkou.
              </p>
            </div>

            {(!page.activity || page.activity.length === 0) ? (
              <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                Žádná nedávná aktivita nebyla zaznamenána.
              </div>
            ) : (
              <div className="space-y-3">
                {page.activity.map((act) => (
                  <div key={act.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border/60 text-xs sm:text-sm">
                    <Activity className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground">{act.action}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Intl.DateTimeFormat('cs-CZ', {
                            day: 'numeric',
                            month: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          }).format(new Date(act.timestamp))}
                        </span>
                      </div>
                      {act.details && <p className="text-xs text-muted-foreground mt-0.5">{act.details}</p>}
                      <p className="text-[11px] text-muted-foreground/70 mt-1">Uživatel: {act.actor.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky Bottom Bar for Mobile View */}
      <div className="block md:hidden sticky bottom-3 z-20 p-3 rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/admin/pages"
            className="px-3 py-2 min-h-[44px] flex items-center justify-center text-xs font-medium rounded-lg border border-border text-foreground hover:bg-muted"
          >
            {dict.back_to_pages}
          </Link>

          <div className="flex items-center gap-2">
            {caps.canPreview && (
              <Link
                href={`/preview/site?path=${encodeURIComponent(page.path || '/')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-border text-foreground hover:bg-muted"
                title={dict.header_actions.preview}
              >
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
              </Link>
            )}

            {caps.canSave && (
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={isSaving}
                className="px-4 py-2 min-h-[44px] inline-flex items-center justify-center gap-1.5 text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-lg shadow-xs"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Ukládám...' : dict.header_actions.save}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
