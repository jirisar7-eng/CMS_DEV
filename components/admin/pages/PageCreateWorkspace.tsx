'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageSummary, PageStatus, PageVisibility, pagesRepository } from '@/lib/domain/pages';
import { useI18n } from '@/lib/i18n';
import {
  ArrowLeft,
  FolderTree,
  Link2,
  AlertCircle,
  Sparkles,
  Save,
  X,
} from 'lucide-react';

/**
 * Helper to transliterate Czech text into a clean URL slug
 */
function generateSlug(text: string): string {
  const czechMap: Record<string, string> = {
    á: 'a',
    č: 'c',
    ď: 'd',
    é: 'e',
    ě: 'e',
    í: 'i',
    ň: 'n',
    ó: 'o',
    ř: 'r',
    š: 's',
    ť: 't',
    ú: 'u',
    ů: 'u',
    ý: 'y',
    ž: 'z',
  };

  return text
    .toLowerCase()
    .trim()
    .split('')
    .map((char) => czechMap[char] || char)
    .join('')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const AVAILABLE_STATUSES: PageStatus[] = [
  'Koncept',
  'Ke kontrole',
  'Schváleno',
  'Naplánováno',
  'Publikováno',
  'Archivováno',
];

const AVAILABLE_VISIBILITIES: PageVisibility[] = [
  'Veřejná',
  'Neveřejná (přes odkaz)',
  'Chráněná heslem',
  'Interní (pouze CMS)',
];

export function PageCreateWorkspace() {
  const router = useRouter();
  const t = useI18n();
  const dict = t.page_create;

  // Form State
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [parentId, setParentId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<PageStatus>('Koncept');
  const [visibility, setVisibility] = useState<PageVisibility>('Veřejná');

  // UI state
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // Load existing pages for parent selector
  useEffect(() => {
    let isMounted = true;
    pagesRepository
      .getPages()
      .then((data) => {
        if (isMounted) {
          setPages(data);
          setIsLoadingPages(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setIsLoadingPages(false);
          setServerError('Nepodařilo se načíst existující stránky.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Sync slug from title if not manually edited
  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!isSlugManuallyEdited) {
      setSlug(generateSlug(val));
    }
    if (validationErrors.title) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next.title;
        return next;
      });
    }
  };

  const handleSlugChange = (val: string) => {
    setIsSlugManuallyEdited(true);
    setSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, ''));
    if (validationErrors.slug) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next.slug;
        return next;
      });
    }
  };

  // Compute live preview path
  const previewPath = useMemo(() => {
    const cleanSlug = slug.trim() || 'nova-stranka';
    if (!parentId) {
      return `/${cleanSlug}`;
    }
    const parent = pages.find((p) => p.id === parentId);
    if (!parent) return `/${cleanSlug}`;
    const base = parent.path === '/' ? '' : parent.path;
    return `${base}/${cleanSlug}`;
  }, [parentId, slug, pages]);

  // Form Validation
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!title.trim()) {
      errors.title = dict.validation_title_required;
    } else if (title.trim().length < 2) {
      errors.title = dict.validation_title_min;
    }

    if (!slug.trim()) {
      errors.slug = dict.validation_slug_required;
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim())) {
      errors.slug = dict.validation_slug_format;
    } else {
      // Check for conflict on same parent level
      const conflict = pages.some(
        (p) =>
          (p.parentId || null) === (parentId || null) &&
          p.slug.toLowerCase() === slug.trim().toLowerCase()
      );
      if (conflict) {
        errors.slug = dict.validation_slug_conflict;
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setServerError(null);

    try {
      const created = await pagesRepository.createPage({
        title: title.trim(),
        slug: slug.trim(),
        parentId: parentId || null,
        description: description.trim(),
        status,
        visibility,
      });

      // Navigate straight to detail of newly created page
      router.push(`/admin/pages/${created.id}`);
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : 'Chyba při vytváření stránky.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 sm:space-y-6">
      {/* Header & Back Action */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link
            href="/admin/pages"
            id="btn-back-to-pages"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Zpět na přehled stránek"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
              {dict.title}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 line-clamp-1">
              {dict.description}
            </p>
          </div>
        </div>

        {/* Desktop Quick Cancel */}
        <Link
          href="/admin/pages"
          className="hidden sm:inline-flex items-center px-3 py-2 min-h-[44px] text-xs sm:text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
        >
          {dict.action_cancel}
        </Link>
      </div>

      {/* Error alert */}
      {serverError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{serverError}</span>
          </div>
          <button
            type="button"
            onClick={() => setServerError(null)}
            className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center hover:opacity-75"
            aria-label="Zavřít"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Single-Column Form */}
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        <div className="p-4 sm:p-6 rounded-xl border border-border bg-card shadow-xs space-y-4 sm:space-y-5">
          {/* Název stránky */}
          <div className="space-y-1.5">
            <label
              htmlFor="field-page-title"
              className="block text-xs sm:text-sm font-semibold text-foreground"
            >
              {dict.field_title} <span className="text-destructive">*</span>
            </label>
            <input
              id="field-page-title"
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder={dict.field_title_placeholder}
              className={`w-full px-3.5 py-2.5 min-h-[44px] text-sm rounded-lg border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors ${
                validationErrors.title
                  ? 'border-destructive focus:ring-destructive'
                  : 'border-input'
              }`}
            />
            {validationErrors.title && (
              <p className="text-xs text-destructive font-medium mt-1">
                {validationErrors.title}
              </p>
            )}
          </div>

          {/* Nadřazená stránka */}
          <div className="space-y-1.5">
            <label
              htmlFor="field-page-parent"
              className="block text-xs sm:text-sm font-semibold text-foreground"
            >
              {dict.field_parent}
            </label>
            <div className="relative">
              <FolderTree className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                id="field-page-parent"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                disabled={isLoadingPages}
                className="w-full pl-9 pr-8 py-2.5 min-h-[44px] text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors appearance-none cursor-pointer"
              >
                <option value="">{dict.field_parent_root}</option>
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.path} ({p.title})
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground">
              Určuje pozici v navigačním stromu a prefix výsledné URL adresy.
            </p>
          </div>

          {/* URL Slug (identifikátor) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="field-page-slug"
                className="block text-xs sm:text-sm font-semibold text-foreground"
              >
                {dict.field_slug} <span className="text-destructive">*</span>
              </label>
              {isSlugManuallyEdited && (
                <button
                  type="button"
                  onClick={() => {
                    setIsSlugManuallyEdited(false);
                    setSlug(generateSlug(title));
                  }}
                  className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Vygenerovat z názvu</span>
                </button>
              )}
            </div>

            <div className="relative">
              <Link2 className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="field-page-slug"
                type="text"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder={dict.field_slug_placeholder}
                className={`w-full pl-9 pr-3.5 py-2.5 min-h-[44px] text-sm font-mono rounded-lg border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors ${
                  validationErrors.slug
                    ? 'border-destructive focus:ring-destructive'
                    : 'border-input'
                }`}
              />
            </div>
            {validationErrors.slug ? (
              <p className="text-xs text-destructive font-medium mt-1">
                {validationErrors.slug}
              </p>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-muted-foreground font-mono bg-muted/40 p-2 rounded-md border border-border/50">
                <span className="shrink-0 text-muted-foreground/70">Výsledná URL:</span>
                <span className="text-foreground font-semibold truncate">{previewPath}</span>
              </div>
            )}
          </div>

          {/* Popis stránky */}
          <div className="space-y-1.5">
            <label
              htmlFor="field-page-description"
              className="block text-xs sm:text-sm font-semibold text-foreground"
            >
              {dict.field_description}
            </label>
            <textarea
              id="field-page-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={dict.field_description_placeholder}
              className="w-full p-3 text-sm rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors resize-y"
            />
          </div>

          {/* Grid pro Stav a Viditelnost */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/60">
            {/* Výchozí stav */}
            <div className="space-y-1.5">
              <label
                htmlFor="field-page-status"
                className="block text-xs sm:text-sm font-semibold text-foreground"
              >
                {dict.field_status}
              </label>
              <select
                id="field-page-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as PageStatus)}
                className="w-full px-3 py-2.5 min-h-[44px] text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors cursor-pointer"
              >
                {AVAILABLE_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            {/* Viditelnost */}
            <div className="space-y-1.5">
              <label
                htmlFor="field-page-visibility"
                className="block text-xs sm:text-sm font-semibold text-foreground"
              >
                {dict.field_visibility}
              </label>
              <select
                id="field-page-visibility"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as PageVisibility)}
                className="w-full px-3 py-2.5 min-h-[44px] text-sm rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors cursor-pointer"
              >
                {AVAILABLE_VISIBILITIES.map((vis) => (
                  <option key={vis} value={vis}>
                    {vis}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Action Bar (Sticky on mobile for seamless thumb reach) */}
        <div className="sticky bottom-3 z-20 p-3 rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-lg flex items-center justify-between gap-3">
          <Link
            href="/admin/pages"
            className="px-4 py-2 min-h-[44px] flex items-center justify-center text-xs sm:text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
          >
            {dict.action_cancel}
          </Link>

          <button
            type="submit"
            id="btn-submit-create-page"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] text-xs sm:text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-lg shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Save className="w-4 h-4" />
            <span>{isSubmitting ? 'Ukládám...' : dict.action_save_draft}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
