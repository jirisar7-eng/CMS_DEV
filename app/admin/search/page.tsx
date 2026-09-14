"use client";

import React from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  Search, 
  RefreshCw, 
  Database, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2,
  Sliders
} from 'lucide-react';

export default function SearchIndexPage() {
  const topQueries = [
    { query: 'ceník', count: 1420, resultsCount: 4, ctr: '82 %' },
    { query: 'kontakt', count: 980, resultsCount: 2, ctr: '94 %' },
    { query: 'školení a kurzy', count: 410, resultsCount: 8, ctr: '68 %' },
    { query: 'reklamace', count: 185, resultsCount: 0, ctr: '0 %' },
    { query: 'poptávka', count: 140, resultsCount: 3, ctr: '75 %' },
  ];

  return (
    <CapabilityShell
      group="OBSAH"
      title="Vyhledávání a indexace"
      description="Správa fulltextového vyhledávače, indexace stránek a analytika vyhledávacích dotazů návštěvníků."
      status="UI PŘIPRAVENO"
      helpKey="content.search.view"
      emptyTitle="Vyhledávací index zatím nebyl sestaven"
      emptyDescription="Spusťte prvotní indexaci pro zpřístupnění fulltextového vyhledávání na webu."
      emptyActionLabel="Spustit indexaci obsahu"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6">
          {/* Index Status Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl border border-border bg-card shadow-xs space-y-1">
              <span className="text-xs text-muted-foreground font-semibold">Zaindexováno dokumentů</span>
              <div className="text-2xl font-bold text-foreground">24 stránek</div>
              <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> 100 % obsahu v indexu
              </span>
            </div>

            <div className="p-4 rounded-2xl border border-border bg-card shadow-xs space-y-1">
              <span className="text-xs text-muted-foreground font-semibold">Vyhledávání za posledních 30 dní</span>
              <div className="text-2xl font-bold text-foreground">3 135 dotazů</div>
              <span className="text-[11px] text-muted-foreground">Průměrná latence: 12 ms</span>
            </div>

            <div className="p-4 rounded-2xl border border-border bg-card shadow-xs flex flex-col justify-between">
              <span className="text-xs text-muted-foreground font-semibold">Reindexace indexu</span>
              <button
                type="button"
                onClick={() => handleUnfinishedAction('Přeindexovat celý web')}
                className="mt-2 w-full py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Přeindexovat obsah</span>
              </button>
            </div>
          </div>

          {/* Top Search Queries Table */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-foreground">Nejhledanější výrazy na webu</h3>

            <div className="rounded-2xl border border-border bg-card shadow-xs divide-y divide-border overflow-hidden">
              <div className="p-3 bg-muted/40 text-xs font-bold text-muted-foreground grid grid-cols-12 gap-2">
                <span className="col-span-5">Hledaný výraz</span>
                <span className="col-span-3 text-right">Počet hledání</span>
                <span className="col-span-2 text-right">Nalezeno výsledků</span>
                <span className="col-span-2 text-right">Míra prokliku (CTR)</span>
              </div>

              {topQueries.map(q => (
                <div
                  key={q.query}
                  className="p-3.5 text-xs sm:text-sm grid grid-cols-12 gap-2 items-center hover:bg-muted/30 transition-colors"
                >
                  <div className="col-span-5 font-semibold text-foreground flex items-center gap-2">
                    <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span>{q.query}</span>
                  </div>

                  <div className="col-span-3 text-right font-mono font-bold text-foreground">
                    {q.count}×
                  </div>

                  <div className="col-span-2 text-right">
                    {q.resultsCount === 0 ? (
                      <span className="text-destructive font-bold text-xs bg-destructive/10 px-2 py-0.5 rounded">
                        0 (Bez výsledku)
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{q.resultsCount}</span>
                    )}
                  </div>

                  <div className="col-span-2 text-right font-semibold text-foreground">
                    {q.ctr}
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
