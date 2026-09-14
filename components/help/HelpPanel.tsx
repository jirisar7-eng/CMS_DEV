'use client';

import React, { useEffect } from 'react';
import { useHelp } from './HelpProvider';
import { X, ExternalLink, BookOpen, Tag } from 'lucide-react';

export const HelpPanel: React.FC = () => {
  const { currentTopic, isOpen, closeHelp } = useHelp();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeHelp();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeHelp]);

  if (!isOpen || !currentTopic) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-panel-title"
      className="fixed inset-0 z-50 flex justify-end"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={closeHelp}
        aria-hidden="true"
      />

      {/* Panel container: Slide-over on Desktop (1440px), Bottom Sheet on Mobile (390px) */}
      <div
        id="help-panel-content"
        className="relative z-10 w-full sm:w-[420px] max-h-[85vh] sm:max-h-full sm:h-full bg-card border-t sm:border-t-0 sm:border-l border-border shadow-2xl flex flex-col mt-auto sm:mt-0 rounded-t-2xl sm:rounded-none animate-in slide-in-from-bottom sm:slide-in-from-right duration-250 ease-out select-none"
      >
        {/* Mobile handle indicator */}
        <div className="sm:hidden w-full flex items-center justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Panel Header */}
        <div className="p-4 sm:p-6 border-b border-border flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="help-panel-title"
                className="text-base sm:text-lg font-bold text-foreground tracking-tight truncate"
              >
                {currentTopic.title}
              </h2>
              <p className="text-xs font-mono text-muted-foreground truncate">
                Klíč: {currentTopic.helpKey}
              </p>
            </div>
          </div>

          <button
            type="button"
            id="btn-close-help-panel"
            onClick={closeHelp}
            className="p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors shrink-0"
            aria-label="Zavřít nápovědu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Panel Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-sm leading-relaxed text-foreground select-text">
          {/* Fallback Notice if generic */}
          {currentTopic.fallback && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs">
              Upozornění: K tomuto prvku je zobrazena generická nápověda.
            </div>
          )}

          {/* Short summary block */}
          <div className="p-3.5 rounded-xl bg-muted/60 border border-border">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Shrnutí operace
            </h3>
            <p className="text-foreground font-medium text-xs sm:text-sm">
              {currentTopic.shortSummary}
            </p>
          </div>

          {/* Detailed explanation */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Podrobný popis
            </h3>
            <div className="text-muted-foreground space-y-3 leading-relaxed">
              {currentTopic.extendedBody.split('\n\n').map((paragraph, idx) => (
                <p key={idx}>{paragraph}</p>
              ))}
            </div>
          </div>

          {/* Tags */}
          {currentTopic.tags && currentTopic.tags.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />
                Související témata
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {currentTopic.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 text-xs font-medium rounded-full bg-secondary text-secondary-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Documentation Link */}
          {currentTopic.docUrl && (
            <div className="pt-2">
              <a
                href={currentTopic.docUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline min-h-[44px]"
              >
                <span>Otevřít oficiální dokumentaci</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>

        {/* Panel Footer */}
        <div className="p-4 sm:p-6 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
          <span>Synthesis CMS • Nápověda</span>
          <button
            type="button"
            onClick={closeHelp}
            className="px-3 py-1.5 min-h-[44px] text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors"
          >
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
};
