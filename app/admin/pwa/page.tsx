"use client";

import React from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  Smartphone, 
  WifiOff, 
  Download, 
  Sparkles, 
  ShieldCheck, 
  CheckCircle2, 
  Settings2,
  Save
} from 'lucide-react';

export default function PwaPage() {
  return (
    <CapabilityShell
      group="DESIGN"
      title="Progressive Web App (PWA)"
      description="Konfigurace instalačního manifestu pro mobilní telefony a desktop, offline mezipaměti a notifikací."
      status="PLÁNOVÁNO"
      helpKey="design.pwa.view"
      emptyTitle="PWA modul zatím není v tomto projektu nakonfigurován"
      emptyDescription="Aktivujte PWA podporu pro umožnění instalace webu jako nativní aplikace."
      emptyActionLabel="Inicializovat PWA konfiguraci"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6 max-w-4xl">
          {/* Roadmap Info Box */}
          <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs leading-relaxed space-y-1">
            <span className="font-bold block">Schválená schopnost v roadmapě Synthesis CMS:</span>
            <span>
              Tento modul je připraven pro fázi G6 (Theme/Brand/App Identity/PWA). Níže uvedené ovládací prvky reprezentují finální model nastavení manifestu a Service Workeru.
            </span>
          </div>

          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-5 text-xs sm:text-sm">
            <h3 className="text-sm font-bold text-foreground border-b border-border pb-3">
              Web App Manifest nastavení
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-foreground mb-1">
                  Název aplikace v mobilu (Short Name)
                </label>
                <input
                  type="text"
                  defaultValue="Synthesis"
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-foreground mb-1">
                  Režim zobrazení (Display Mode)
                </label>
                <select className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs">
                  <option>standalone (Samostatné okno bez adresního řádku)</option>
                  <option>fullscreen (Plná obrazovka)</option>
                  <option>minimal-ui (Minimalistické rozhraní)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-foreground mb-1">
                  Barva motivu (Theme Color)
                </label>
                <input
                  type="text"
                  defaultValue="#2563eb"
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-foreground mb-1">
                  Podkladová barva (Background Color)
                </label>
                <input
                  type="text"
                  defaultValue="#0f172a"
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded border-input text-primary" />
                <span>Povolit offline mezipaměť (Cache First strategie pro statická aktiva)</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded border-input text-primary" />
                <span>Zobrazovat automatickou výzvu k instalaci na mobilních zařízeních</span>
              </label>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleUnfinishedAction('Uložit PWA manifest')}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Uložit PWA konfiguraci</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
