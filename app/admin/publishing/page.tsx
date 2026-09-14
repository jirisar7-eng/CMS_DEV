"use client";

import React, { useState } from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  Send, 
  RotateCcw, 
  CheckCircle2, 
  Clock, 
  GitCommit, 
  ShieldCheck, 
  Calendar, 
  AlertCircle,
  ExternalLink
} from 'lucide-react';

export default function PublishingPage() {
  const releases = [
    {
      version: 'v2.4.1',
      hash: 'sha-e8b912a',
      title: 'Aktualizace ceníku a redesign kontaktní stránky',
      author: 'Jiří Šár',
      date: '12. 09. 2026 14:30',
      status: 'Aktivní produkce',
      isCurrent: true,
      pagesCount: 24,
    },
    {
      version: 'v2.4.0',
      hash: 'sha-9f44b1c',
      title: 'Zavedení nového Theme Packu a SEO optimalizace',
      author: 'Jiří Šár',
      date: '08. 09. 2026 09:15',
      status: 'Archivováno',
      isCurrent: false,
      pagesCount: 24,
    },
    {
      version: 'v2.3.9',
      hash: 'sha-1a22c8f',
      title: 'Oprava typografie a responzivity na mobilních zařízeních',
      author: 'Jiří Šár',
      date: '01. 09. 2026 18:40',
      status: 'Archivováno',
      isCurrent: false,
      pagesCount: 22,
    },
  ];

  return (
    <CapabilityShell
      group="OBSAH"
      title="Publikování a verze"
      description="Publikační pipeline pro vytváření neměnných verzí (releases) obsahu webu a okamžitý rollback."
      status="UI PŘIPRAVENO"
      helpKey="content.publishing.view"
      emptyTitle="Zatím nebyla provedena žádná publikace obsahu"
      emptyDescription="Kliknutím na tlačítko níže sestavte a publikujte první neměnnou verzi webu."
      emptyActionLabel="Publikovat první verzi"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6">
          {/* Truthfulness Notice Banner */}
          <div className="p-4 rounded-2xl border border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200 text-xs leading-relaxed space-y-1">
            <span className="font-bold block">Stav schopnosti: UI PŘIPRAVENO (Ukázková data)</span>
            <span>
              Publikační release pipeline a úložiště neměnných vydání nejsou v této fázi připojeny. Níže uvedená vydání představují ukázkový model verzování.
            </span>
          </div>

          {/* Active Release Card */}
          <div className="p-5 sm:p-6 rounded-2xl border border-border bg-card shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                    Ukázkový release
                  </span>
                  <span className="font-mono text-xs font-bold text-foreground">v2.4.1</span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-foreground">
                  Aktualizace ceníku a redesign kontaktní stránky
                </h3>
                <p className="text-xs text-muted-foreground flex items-center gap-3">
                  <span>Publikováno: 12. 09. 2026 14:30</span>
                  <span>•</span>
                  <span>Autor: Jiří Šár</span>
                  <span>•</span>
                  <span className="font-mono">SHA: sha-e8b912a</span>
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleUnfinishedAction('Vytvořit novou publikaci')}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px] cursor-pointer inline-flex items-center gap-2 shadow-xs"
                >
                  <Send className="w-4 h-4" />
                  <span>Publikovat nový release</span>
                </button>
              </div>
            </div>
          </div>

          {/* Releases History Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Historie publikačních snapshotů</h3>
              <span className="text-xs text-muted-foreground">Neměnné verze (Immutable releases)</span>
            </div>

            <div className="rounded-2xl border border-border bg-card shadow-xs divide-y divide-border overflow-hidden">
              {releases.map(release => (
                <div
                  key={release.version}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-foreground bg-muted px-2 py-0.5 rounded border border-border">
                        {release.version}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {release.hash}
                      </span>
                      {release.isCurrent && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          Aktivní
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm font-semibold text-foreground truncate">
                      {release.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {release.date} • {release.author} • {release.pagesCount} stránek v release
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!release.isCurrent && (
                      <button
                        type="button"
                        onClick={() => handleUnfinishedAction(`Vrátit web k verzi ${release.version} (Rollback)`)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Rollback</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleUnfinishedAction(`Zobrazit manifest verze ${release.version}`)}
                      className="p-2 text-muted-foreground hover:text-foreground rounded-lg"
                      aria-label="Manifest verze"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
