"use client";

import React, { useState } from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  BarChart3, 
  Users, 
  Eye, 
  Clock, 
  ArrowUpRight, 
  Smartphone, 
  Laptop, 
  Tablet, 
  ShieldCheck,
  Calendar
} from 'lucide-react';

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const topPages = [
    { path: '/', title: 'Úvodní stránka (Domů)', views: 14250, unique: 8910, bounce: '24 %' },
    { path: '/sluzby', title: 'Naše služby & Řešení', views: 6410, unique: 4120, bounce: '31 %' },
    { path: '/cenik', title: 'Ceník služeb a licencí', views: 5120, unique: 3840, bounce: '19 %' },
    { path: '/o-projektu', title: 'O studiu a projektu Synthesis', views: 2890, unique: 1940, bounce: '38 %' },
    { path: '/kontakt', title: 'Kontaktní informace', views: 1750, unique: 1200, bounce: '22 %' },
  ];

  return (
    <CapabilityShell
      group="DATA"
      title="Webová analytika (Privacy-First)"
      description="Metriky návštěvnosti a chování uživatelů bez sledovacích cookies v plném souladu s GDPR."
      status="UI PŘIPRAVENO"
      helpKey="data.analytics.view"
      emptyTitle="Zatím nebyla zaznamenána žádná data o návštěvnosti"
      emptyDescription="Statistiky návštěvnosti se začnou generovat automaticky po prvních přístupech na web."
      emptyActionLabel="Zkontrolovat stav měření"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6">
          {/* Truthfulness Notice Banner */}
          <div className="p-4 rounded-2xl border border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200 text-xs leading-relaxed space-y-1">
            <span className="font-bold block">Stav schopnosti: UI PŘIPRAVENO (Ukázková data)</span>
            <span>
              Analytický datový sklad a sběr metrik návštěvnosti nejsou v této fázi připojeny. Níže uvedená čísla a grafy představují ukázková data rozhraní.
            </span>
          </div>

          {/* Controls & Privacy Badge */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Privacy-First architektura (Navrženo)</span>
              </span>
            </div>

            <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-xl border border-border self-start sm:self-auto">
              {[
                { key: '7d', label: 'Posledních 7 dní' },
                { key: '30d', label: 'Posledních 30 dní' },
                { key: '90d', label: 'Poslední 3 měsíce' },
              ].map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPeriod(p.key as any)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    period === p.key
                      ? 'bg-card text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Core Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 sm:p-5 rounded-2xl border border-border bg-card shadow-xs space-y-1">
              <span className="text-xs text-muted-foreground font-semibold">Celkem zobrazení stránek</span>
              <div className="text-2xl sm:text-3xl font-bold text-foreground">34 820</div>
              <span className="text-[11px] text-emerald-600 font-semibold">+18.4 % oproti min. období</span>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl border border-border bg-card shadow-xs space-y-1">
              <span className="text-xs text-muted-foreground font-semibold">Unikátní návštěvníci</span>
              <div className="text-2xl sm:text-3xl font-bold text-foreground">19 240</div>
              <span className="text-[11px] text-emerald-600 font-semibold">+12.1 % oproti min. období</span>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl border border-border bg-card shadow-xs space-y-1">
              <span className="text-xs text-muted-foreground font-semibold">Průměrná doba na stránce</span>
              <div className="text-2xl sm:text-3xl font-bold text-foreground">2 min 45 s</div>
              <span className="text-[11px] text-muted-foreground">Vysoké zapojení publika</span>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl border border-border bg-card shadow-xs space-y-1">
              <span className="text-xs text-muted-foreground font-semibold">Míra okamžitého opuštění</span>
              <div className="text-2xl sm:text-3xl font-bold text-foreground">26.8 %</div>
              <span className="text-[11px] text-emerald-600 font-semibold">Skvělá relevance obsahu</span>
            </div>
          </div>

          {/* Top Pages Table & Devices */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-3">
              <h3 className="text-sm font-bold text-foreground">Nejnavštěvovanější stránky</h3>

              <div className="rounded-2xl border border-border bg-card shadow-xs divide-y divide-border overflow-hidden">
                <div className="p-3 bg-muted/40 text-xs font-bold text-muted-foreground grid grid-cols-12 gap-2">
                  <span className="col-span-6">Stránka</span>
                  <span className="col-span-3 text-right">Zobrazení</span>
                  <span className="col-span-3 text-right">Unikátní</span>
                </div>

                {topPages.map(page => (
                  <div
                    key={page.path}
                    className="p-3.5 text-xs sm:text-sm grid grid-cols-12 gap-2 items-center hover:bg-muted/30 transition-colors"
                  >
                    <div className="col-span-6 min-w-0">
                      <p className="font-bold text-foreground truncate">{page.title}</p>
                      <p className="font-mono text-[11px] text-muted-foreground truncate">{page.path}</p>
                    </div>

                    <div className="col-span-3 text-right font-mono font-bold text-foreground">
                      {page.views.toLocaleString('cs-CZ')}
                    </div>

                    <div className="col-span-3 text-right font-mono text-muted-foreground">
                      {page.unique.toLocaleString('cs-CZ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Device breakdown */}
            <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4 h-fit">
              <h3 className="text-sm font-bold text-foreground">Zařízení návštěvníků</h3>

              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span className="flex items-center gap-1.5 text-foreground">
                      <Laptop className="w-4 h-4 text-muted-foreground" /> Desktop
                    </span>
                    <span className="font-mono">58 %</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div className="bg-primary h-full rounded-full w-[58%]"></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span className="flex items-center gap-1.5 text-foreground">
                      <Smartphone className="w-4 h-4 text-muted-foreground" /> Mobilní telefony
                    </span>
                    <span className="font-mono">36 %</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div className="bg-primary h-full rounded-full w-[36%]"></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span className="flex items-center gap-1.5 text-foreground">
                      <Tablet className="w-4 h-4 text-muted-foreground" /> Tablety
                    </span>
                    <span className="font-mono">6 %</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div className="bg-primary h-full rounded-full w-[6%]"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
