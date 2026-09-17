"use client";

import React, { useState } from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  Blocks, 
  CheckCircle2, 
  Power, 
  Settings2, 
  ShieldCheck, 
  Package, 
  ExternalLink,
  Plus
} from 'lucide-react';

export default function ModulesPage() {
  const [modulesList, setModulesList] = useState([
    { id: 'core-pages', name: 'Správa stránek & Bloky', category: 'Core CMS', version: 'v2.4.0', active: true, essential: true, desc: 'Základní stromová struktura stránek a kanonické bloky' },
    { id: 'media-library', name: 'Knihovna médií', category: 'Core CMS', version: 'v2.1.0', active: true, essential: true, desc: 'Optimalizované nahrávání a správa obrázků a dokumentů' },
    { id: 'seo-engine', name: 'SEO & OpenGraph Engine', category: 'Obsah', version: 'v1.8.2', active: true, essential: false, desc: 'Generování sitemapy, Open Graph tagů a robots.txt' },
    { id: 'forms-builder', name: 'Formuláře a dotazníky', category: 'Interaktivita', version: 'v1.2.0', active: true, essential: false, desc: 'Vizuální tvůrce kontaktních a poptávkových formulářů' },
    { id: 'audit-logging', name: 'Bezpečnostní audit logy', category: 'Bezpečnost', version: 'v2.0.1', active: true, essential: true, desc: 'Neměnný záznam všech operací a změn v administraci' },
    { id: 'analytics-lite', name: 'Privacy-First Analytika', category: 'Data', version: 'v1.4.0', active: false, essential: false, desc: 'Sledování návštěvnosti bez ukládání sledovacích cookies' },
  ]);

  const toggleModule = (id: string) => {
    setModulesList(prev => prev.map(m => m.id === id && !m.essential ? { ...m, active: !m.active } : m));
  };

  return (
    <CapabilityShell
      group="SPRÁVA"
      title="Správa modulů a rozšíření"
      description="Aktivace, konfigurace a kontrola závislostí systémových a rozšiřujících modulů Synthesis CMS."
      status="POUZE UI"
      helpKey="management.modules.view"
      emptyTitle="V tomto projektu zatím nejsou registrovány žádné moduly"
      emptyDescription="Kliknutím níže načtěte standardní sadu modulů pro Synthesis CMS."
      emptyActionLabel="Nainstalovat výchozí moduly"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Nainstalované moduly ({modulesList.length})</h3>
            <button
              type="button"
              onClick={() => handleUnfinishedAction('Procházet katalog modulů')}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Přidat modul</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {modulesList.map(mod => (
              <div
                key={mod.id}
                className="p-5 rounded-2xl border border-border bg-card shadow-xs flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      {mod.category}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">{mod.version}</span>
                  </div>

                  <h4 className="text-sm font-bold text-foreground">{mod.name}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{mod.desc}</p>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-border">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={mod.essential}
                      onClick={() => {
                        toggleModule(mod.id);
                        handleUnfinishedAction(`${mod.active ? 'Deaktivovat' : 'Aktivovat'} modul ${mod.name}`);
                      }}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 ${
                        mod.active
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-muted text-muted-foreground border border-border'
                      } ${mod.essential ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <Power className="w-3 h-3" />
                      <span>{mod.essential ? 'Vyžadováno jádrem' : mod.active ? 'Aktivní' : 'Vypnuto'}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction(`Konfigurace modulu ${mod.name}`)}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg"
                    aria-label="Nastavení modulu"
                  >
                    <Settings2 className="w-4 h-4" />
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
