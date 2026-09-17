"use client";

import React from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  CornerUpRight, 
  Plus, 
  Search, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  ArrowRight,
  Download,
  Upload
} from 'lucide-react';

export default function RedirectsPage() {
  const redirects = [
    { id: 1, from: '/stary-cenik', to: '/cenik', type: '301 Trvalé', hits: 342, date: '10. 09. 2026' },
    { id: 2, from: '/kontakt-podpora', to: '/kontakt', type: '301 Trvalé', hits: 189, date: '08. 09. 2026' },
    { id: 3, from: '/akce/leto-2025', to: '/sluzby', type: '302 Dočasné', hits: 54, date: '01. 09. 2026' },
    { id: 4, from: '/blog/novinky-stare', to: '/o-nas', type: '301 Trvalé', hits: 812, date: '25. 08. 2026' },
  ];

  return (
    <CapabilityShell
      group="OBSAH"
      title="Přesměrování URL (Redirects)"
      description="Správa pravidel pro automatické přesměrování URL adres (HTTP 301 trvalé a HTTP 302 dočasné) se sledováním přístupů."
      status="POUZE UI"
      helpKey="content.redirects.view"
      emptyTitle="Zatím nebyla vytvořena žádná pravidla přesměrování"
      emptyDescription="Vytvořte nové pravidlo pro zachování SEO návštěvnosti ze starých URL adres."
      emptyActionLabel="Vytvořit první přesměrování"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filtrovat přesměrování podle původní nebo cílové URL..."
                className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-input bg-card text-foreground"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleUnfinishedAction('Import přesměrování z CSV')}
                className="px-3 py-2 text-xs font-semibold rounded-xl border border-border bg-card hover:bg-muted text-foreground transition-colors min-h-[44px] cursor-pointer inline-flex items-center gap-1.5"
              >
                <Upload className="w-4 h-4" />
                <span>Import CSV</span>
              </button>
              <button
                type="button"
                onClick={() => handleUnfinishedAction('Vytvořit nové přesměrování')}
                className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px] cursor-pointer inline-flex items-center gap-2 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Nové přesměrování</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-xs divide-y divide-border overflow-hidden">
            <div className="p-3 bg-muted/40 text-xs font-bold text-muted-foreground grid grid-cols-12 gap-2">
              <span className="col-span-5 sm:col-span-4">Původní URL (Source)</span>
              <span className="col-span-4 sm:col-span-4">Cílová URL (Target)</span>
              <span className="hidden sm:inline sm:col-span-2">Typ / Zásahy</span>
              <span className="col-span-3 sm:col-span-2 text-right">Akce</span>
            </div>

            {redirects.map(rule => (
              <div
                key={rule.id}
                className="p-3 sm:p-4 text-xs sm:text-sm grid grid-cols-12 gap-2 items-center hover:bg-muted/30 transition-colors"
              >
                <div className="col-span-5 sm:col-span-4 font-mono font-bold text-foreground truncate">
                  {rule.from}
                </div>

                <div className="col-span-4 sm:col-span-4 font-mono text-muted-foreground truncate flex items-center gap-1.5">
                  <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span>{rule.to}</span>
                </div>

                <div className="hidden sm:inline sm:col-span-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-muted text-foreground font-semibold">
                    {rule.type}
                  </span>
                  <span className="text-muted-foreground ml-2 text-[11px]">{rule.hits}×</span>
                </div>

                <div className="col-span-3 sm:col-span-2 flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction(`Upravit přesměrování ${rule.from}`)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction(`Smazat přesměrování ${rule.from}`)}
                    className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
