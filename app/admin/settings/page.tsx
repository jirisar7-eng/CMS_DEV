"use client";

import React from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  Settings, 
  Globe, 
  Clock, 
  Save, 
  Power, 
  Sliders, 
  CheckCircle2 
} from 'lucide-react';

export default function SettingsPage() {
  return (
    <CapabilityShell
      group="SYSTÉM"
      title="Globální systémové nastavení"
      description="Konfigurace základních systémových parametrů, lokalizace, výchozího jazyka a časového pásma."
      status="UI PŘIPRAVENO"
      helpKey="system.settings.view"
      emptyTitle="Nastavení systému není dostupné"
      emptyDescription="Kliknutím níže obnovte výchozí konfiguraci systému."
      emptyActionLabel="Obnovit výchozí konfiguraci"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6 max-w-4xl text-xs sm:text-sm">
          {/* General project settings */}
          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-foreground border-b border-border pb-3">
              Základní identifikace projektu
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-foreground mb-1 text-xs">
                  Název webového projektu
                </label>
                <input
                  type="text"
                  defaultValue="Synthesis CMS Prezentace"
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-foreground mb-1 text-xs">
                  Primární URL adresa projektu
                </label>
                <input
                  type="text"
                  defaultValue="https://synthesis-cms.dev"
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-foreground mb-1 text-xs">
                  Výchozí jazyk webu a administrace
                </label>
                <select className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs">
                  <option>cs-CZ (Čeština)</option>
                  <option>en-US (English)</option>
                  <option>sk-SK (Slovenčina)</option>
                  <option>de-DE (Deutsch)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-foreground mb-1 text-xs">
                  Časové pásmo (Timezone)
                </label>
                <select className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs">
                  <option>Europe/Prague (UTC+01:00 / UTC+02:00 CEST)</option>
                  <option>UTC (Coordinated Universal Time)</option>
                </select>
              </div>
            </div>

            {/* Maintenance Mode */}
            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-2 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-foreground text-xs block">Režim plánované údržby (Maintenance Mode)</span>
                  <p className="text-[11px] text-muted-foreground">
                    Při aktivaci uvidí běžní návštěvníci informační stránku s probíhající údržbou.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnfinishedAction('Přepnout režim údržby')}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors"
                >
                  Aktivovat údržbu
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleUnfinishedAction('Uložit systémové nastavení')}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Uložit systémové nastavení</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
