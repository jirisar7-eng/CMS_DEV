"use client";

import React, { useState } from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  Palette, 
  Sparkles, 
  Layers, 
  Type, 
  Check, 
  HelpCircle,
  ShieldCheck
} from 'lucide-react';
import { CapabilityStatusBadge } from '@/components/admin/CapabilityStatusBadge';

export default function DesignSystemPage() {
  return (
    <CapabilityShell
      group="PLATFORMA"
      title="Design systém & UI komponenty"
      description="Živá knihovna komponent, stavů, tlačítek, formulářů a typografie Synthesis Design Systemu."
      status="UI PŘIPRAVENO"
      helpKey="tools.design_system.view"
      emptyTitle="Komponenty design systému nejsou načteny"
      emptyDescription="Kliknutím níže načtěte živý přehled UI komponent."
      emptyActionLabel="Načíst design systém"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-8 max-w-5xl">
          {/* Status Badges Section */}
          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-foreground border-b border-border pb-3">
              1. Stavové odznaky schopností (Capability Badges)
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <CapabilityStatusBadge status="FUNKČNÍ" />
              <CapabilityStatusBadge status="UI PŘIPRAVENO" />
              <CapabilityStatusBadge status="PLÁNOVÁNO" />
              <CapabilityStatusBadge status="VYPNUTO" />
            </div>
          </div>

          {/* Buttons & Actions */}
          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-foreground border-b border-border pb-3">
              2. Tlačítka a interaktivní stavy (Buttons & CTA)
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => handleUnfinishedAction('Klik na primární tlačítko')}
                className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
              >
                Primární akce (Primary)
              </button>

              <button
                type="button"
                onClick={() => handleUnfinishedAction('Klik na sekundární tlačítko')}
                className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl border border-border bg-background hover:bg-muted text-foreground transition-colors cursor-pointer"
              >
                Sekundární akce (Outline)
              </button>

              <button
                type="button"
                onClick={() => handleUnfinishedAction('Klik na destruktivní akci')}
                className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors cursor-pointer"
              >
                Destruktivní akce (Danger)
              </button>
            </div>
          </div>

          {/* Form inputs */}
          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-foreground border-b border-border pb-3">
              3. Formulářové prvky (Inputs & Selects)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-foreground mb-1">Textové pole (Input)</label>
                <input
                  type="text"
                  placeholder="Ukázkový placeholder..."
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-foreground mb-1">Výběrové pole (Select)</label>
                <select className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs">
                  <option>Možnost 1 (Doporučeno)</option>
                  <option>Možnost 2</option>
                  <option>Možnost 3</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
