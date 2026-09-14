"use client";

import React from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  Package, 
  Layers, 
  Download, 
  CheckCircle2, 
  Sparkles, 
  Blocks,
  ArrowRight
} from 'lucide-react';

export default function ProjectPacksPage() {
  const packs = [
    { id: 'pack-corporate', name: 'Corporate & Services Pack', desc: 'Kompletní sada pro prezentační weby, ceníky, portfolio, reference a poptávkové formuláře.', blocksCount: 28, status: 'PŘIPRAVENO' },
    { id: 'pack-editorial', name: 'Editorial & Blog Pack', desc: 'Optimalizováno pro magazíny, novinky, autorské profily a čtenářské rubriky.', blocksCount: 19, status: 'PŘIPRAVENO' },
    { id: 'pack-commerce-lite', name: 'Product Showcase Pack', desc: 'Katalog produktů, detail položky, filtrace parametrů a lead generation.', blocksCount: 22, status: 'PLÁNOVÁNO' },
  ];

  return (
    <CapabilityShell
      group="PLATFORMA"
      title="Project Packs a distribuční balíčky"
      description="Předpřipravené a certifikované sady bloků, šablon a předkonfigurovaných modulů pro rychlý start."
      status="PLÁNOVÁNO"
      helpKey="platform.project_packs.view"
      emptyTitle="Zatím nebyl nainstalován žádný Project Pack"
      emptyDescription="Nainstalujte doporučený balíček pro váš typ webového projektu."
      emptyActionLabel="Procházet katalog balíčků"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6 max-w-4xl">
          <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs leading-relaxed space-y-1">
            <span className="font-bold block">Schválená schopnost v roadmapě:</span>
            <span>
              Project Packy definují standardizované balíčky bloků a předvoleb pro konkrétní doménové vertikály.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {packs.map(pack => (
              <div
                key={pack.id}
                className="p-5 rounded-2xl border border-border bg-card shadow-xs flex flex-col justify-between space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      {pack.blocksCount} certifikovaných bloků
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.2 rounded bg-emerald-500/10 text-emerald-600">
                      {pack.status}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-foreground">{pack.name}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{pack.desc}</p>
                </div>

                <div className="pt-2 flex items-center justify-end border-t border-border">
                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction(`Nainstalovat balíček ${pack.name}`)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Použít tento balíček</span>
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
