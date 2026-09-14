import React from 'react';
import { PageStatus } from '@/lib/domain/pages';
import { ViewportMode, ContentCapabilities } from '@/lib/composer/types';
import { PageStatusBadge } from '@/components/admin/pages/PageStatusBadge';
import {
  ArrowLeft,
  Eye,
  Edit3,
  Save,
  Monitor,
  Tablet,
  Smartphone,
  Plus,
  Settings2,
  Check,
} from 'lucide-react';

interface ComposerHeaderProps {
  title: string;
  status: PageStatus;
  isDirty: boolean;
  isSaving: boolean;
  isPreview: boolean;
  viewport: ViewportMode;
  capabilities: ContentCapabilities;
  selectedBlockId: string | null;
  onBack: () => void;
  onTogglePreview: () => void;
  onSaveDraft: () => void;
  onChangeViewport: (v: ViewportMode) => void;
  onOpenPaletteMobile: () => void;
  onOpenInspectorMobile: () => void;
}

export const ComposerHeader: React.FC<ComposerHeaderProps> = ({
  title,
  status,
  isDirty,
  isSaving,
  isPreview,
  viewport,
  capabilities,
  selectedBlockId,
  onBack,
  onTogglePreview,
  onSaveDraft,
  onChangeViewport,
  onOpenPaletteMobile,
  onOpenInspectorMobile,
}) => {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-card/95 backdrop-blur-xs px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 sm:gap-4 select-none">
      {/* Left: Back button & Page title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          id="btn-composer-back"
          onClick={onBack}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Zpět na detail stránky"
          aria-label="Zpět na detail stránky"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-bold text-foreground truncate max-w-[140px] sm:max-w-[280px] md:max-w-md">
              {title}
            </h1>
            <div className="hidden sm:block">
              <PageStatusBadge status={status} size="sm" />
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Editor obsahu</span>
            {isDirty ? (
              <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                Neuložené změny
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Check className="w-3 h-3 text-emerald-500" />
                Vše uloženo
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Center: Preview Viewport controls (Only active in Preview mode) */}
      {isPreview && (
        <div className="hidden md:flex items-center p-1 rounded-lg border border-border bg-muted/40">
          <button
            type="button"
            onClick={() => onChangeViewport('desktop')}
            className={`p-1.5 rounded-md min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors ${
              viewport === 'desktop'
                ? 'bg-background shadow-2xs text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Desktop (100%)"
          >
            <Monitor className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onChangeViewport('tablet')}
            className={`p-1.5 rounded-md min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors ${
              viewport === 'tablet'
                ? 'bg-background shadow-2xs text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Tablet (768px)"
          >
            <Tablet className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onChangeViewport('mobile')}
            className={`p-1.5 rounded-md min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors ${
              viewport === 'mobile'
                ? 'bg-background shadow-2xs text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Mobil (375px)"
          >
            <Smartphone className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Right: Mobile Sheet triggers & Main Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Mobile-only Trigger: Palette (+) */}
        {!isPreview && (
          <button
            type="button"
            id="btn-mobile-palette"
            onClick={onOpenPaletteMobile}
            className="lg:hidden p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-border bg-background text-foreground hover:bg-muted"
            title="Katalog bloků"
            aria-label="Katalog bloků"
          >
            <Plus className="w-5 h-5 text-primary" />
          </button>
        )}

        {/* Mobile-only Trigger: Inspector (Settings) */}
        {!isPreview && selectedBlockId && (
          <button
            type="button"
            id="btn-mobile-inspector"
            onClick={onOpenInspectorMobile}
            className="lg:hidden p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
            title="Vlastnosti vybraného bloku"
            aria-label="Vlastnosti vybraného bloku"
          >
            <Settings2 className="w-5 h-5" />
          </button>
        )}

        {/* Preview Mode Toggle */}
        {capabilities['content.preview'] && (
          <button
            type="button"
            id="btn-toggle-preview"
            onClick={onTogglePreview}
            className={`px-3 py-2 min-h-[44px] inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-medium rounded-lg border transition-colors ${
              isPreview
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-background hover:bg-muted text-foreground'
            }`}
          >
            {isPreview ? (
              <>
                <Edit3 className="w-4 h-4" />
                <span className="hidden sm:inline">Upravit</span>
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" />
                <span className="hidden sm:inline">Náhled</span>
              </>
            )}
          </button>
        )}

        {/* Save Draft Button */}
        {capabilities['content.draft.save'] && (
          <button
            type="button"
            id="btn-save-draft"
            onClick={onSaveDraft}
            disabled={isSaving || !isDirty}
            className="px-3.5 sm:px-4 py-2 min-h-[44px] inline-flex items-center justify-center gap-2 text-xs sm:text-sm font-medium rounded-lg text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Ukládám...' : 'Uložit koncept'}</span>
          </button>
        )}
      </div>
    </header>
  );
};
