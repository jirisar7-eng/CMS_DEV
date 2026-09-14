"use client";

import React, { useState } from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  History, 
  GitCompare, 
  RotateCcw, 
  FileText, 
  User, 
  Clock, 
  ArrowRight,
  CheckCircle,
  Eye
} from 'lucide-react';

export default function RevisionsPage() {
  const [selectedRevision, setSelectedRevision] = useState<number>(1);

  const revisions = [
    {
      id: 1,
      page: 'Úvodní stránka (Domů)',
      path: '/',
      author: 'Jiří Šár',
      timestamp: '13. 09. 2026 10:15',
      changes: '+3 bloky, -1 blok',
      message: 'Aktualizován Hero banner a přidána mřížka funkcí',
      isCurrent: true,
    },
    {
      id: 2,
      page: 'Ceník služeb',
      path: '/cenik',
      author: 'Jiří Šár',
      timestamp: '12. 09. 2026 14:00',
      changes: '+1 blok',
      message: 'Přidána tabulka srovnání tarifů Enterprise',
      isCurrent: false,
    },
    {
      id: 3,
      page: 'O nás',
      path: '/o-nas',
      author: 'Jiří Šár',
      timestamp: '10. 09. 2026 16:45',
      changes: '+2 bloky',
      message: 'Rozšíření sekce historie a vize společnosti',
      isCurrent: false,
    },
  ];

  return (
    <CapabilityShell
      group="OBSAH"
      title="Revize a historie změn"
      description="Porovnání verzí obsahu (diff) a sledování kompletní redakční historie úprav stránek."
      status="UI PŘIPRAVENO"
      helpKey="content.revisions.view"
      emptyTitle="Zatím nebyly zaznamenány žádné revize"
      emptyDescription="Při každém uložení konceptu nebo publikaci se zde automaticky vytvoří nová revize."
      emptyActionLabel="Přejít do editoru stránek"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Revisions List */}
            <div className="lg:col-span-1 rounded-2xl border border-border bg-card shadow-xs divide-y divide-border overflow-hidden h-fit">
              <div className="p-3 bg-muted/40 text-xs font-bold text-muted-foreground flex justify-between items-center">
                <span>Nedávné revize obsahu</span>
                <span>{revisions.length} záznamů</span>
              </div>

              {revisions.map(rev => (
                <div
                  key={rev.id}
                  onClick={() => setSelectedRevision(rev.id)}
                  className={`p-3.5 space-y-1 cursor-pointer transition-colors ${
                    selectedRevision === rev.id
                      ? 'bg-primary/10 border-l-4 border-l-primary'
                      : 'hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-foreground truncate">{rev.page}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{rev.changes}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{rev.message}</p>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                    <span>{rev.author}</span>
                    <span>{rev.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Visual Diff View Inspector */}
            <div className="lg:col-span-2 p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-foreground">
                      Porovnání revize: Úvodní stránka
                    </h3>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                      Aktuální koncept
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Změněno uživatelem Jiří Šár • 13. 09. 2026 10:15
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction('Obnovit stav z této revize')}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Obnovit revizi</span>
                  </button>
                </div>
              </div>

              {/* Side-by-side block diff simulation */}
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-1">
                  <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 font-bold">
                    <span>[+] Přidaný blok: Feature Grid (Vizuální mřížka funkcí)</span>
                    <span className="text-[11px]">Pozice #2</span>
                  </div>
                  <p className="text-muted-foreground">
                    Nakonfigurováno 3 sloupce s ikonami (Rychlost, Bezpečnost, Portabilita).
                  </p>
                </div>

                <div className="p-3 rounded-xl border border-border bg-muted/40 space-y-1">
                  <div className="flex items-center justify-between font-bold text-foreground">
                    <span>[~] Upravený blok: Hero Banner</span>
                    <span className="text-[11px] text-muted-foreground">Pozice #1</span>
                  </div>
                  <p className="text-muted-foreground">
                    Změněn hlavní nadpis z „Vítejte“ na „Synthesis CMS — Nová generace redakčního systému“.
                  </p>
                </div>

                <div className="p-3 rounded-xl border border-destructive/20 bg-destructive/5 space-y-1">
                  <div className="flex items-center justify-between text-destructive font-bold">
                    <span>[-] Odstraněný blok: Dočasný oznamovací pruh</span>
                    <span className="text-[11px]">Bývalá pozice #3</span>
                  </div>
                  <p className="text-muted-foreground">
                    Blok byl odstraněn na základě schváleného plánu vydání.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
