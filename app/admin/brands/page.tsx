"use client";

import React from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  Tags, 
  Upload, 
  Image as ImageIcon, 
  Save, 
  Sparkles, 
  Globe, 
  ExternalLink
} from 'lucide-react';

export default function BrandsPage() {
  return (
    <CapabilityShell
      group="DESIGN"
      title="Značky a identita (Brands)"
      description="Konfigurace firemní identity, logotypů pro světlý i tmavý režim, favicon a prvků značky."
      status="UI PŘIPRAVENO"
      helpKey="design.brands.view"
      emptyTitle="Zatím nebyla definována identita značky"
      emptyDescription="Nastavte základní název značky a nahrajte logotypy organizace."
      emptyActionLabel="Založit profil značky"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6 max-w-4xl">
          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-5">
            <h3 className="text-sm font-bold text-foreground border-b border-border pb-3">
              Základní informace o značce
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
              <div>
                <label className="block font-semibold text-foreground mb-1">Název značky / firmy</label>
                <input
                  type="text"
                  defaultValue="Synthesis Ecosystem s.r.o."
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-foreground mb-1">Zkrácený název (pro mobilní UI)</label>
                <input
                  type="text"
                  defaultValue="Synthesis"
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs"
                />
              </div>
            </div>

            {/* Logo Assets Upload Boxes */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-bold text-foreground">Vizuální aktiva značky</h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Logo Light */}
                <div className="p-4 rounded-xl border border-border bg-background flex flex-col items-center justify-center text-center space-y-2">
                  <span className="text-xs font-semibold text-foreground">Logo (Světlý režim)</span>
                  <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center border border-border">
                    <span className="font-bold text-slate-800 text-lg">S</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction('Nahrát logo pro světlý režim')}
                    className="text-[11px] text-primary hover:underline font-semibold"
                  >
                    Změnit SVG / PNG
                  </button>
                </div>

                {/* Logo Dark */}
                <div className="p-4 rounded-xl border border-border bg-background flex flex-col items-center justify-center text-center space-y-2">
                  <span className="text-xs font-semibold text-foreground">Logo (Tmavý režim)</span>
                  <div className="w-16 h-16 rounded-xl bg-slate-900 flex items-center justify-center border border-slate-800">
                    <span className="font-bold text-white text-lg">S</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction('Nahrát logo pro tmavý režim')}
                    className="text-[11px] text-primary hover:underline font-semibold"
                  >
                    Změnit SVG / PNG
                  </button>
                </div>

                {/* Favicon */}
                <div className="p-4 rounded-xl border border-border bg-background flex flex-col items-center justify-center text-center space-y-2">
                  <span className="text-xs font-semibold text-foreground">Favicon (Ikona záložky)</span>
                  <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center border border-border">
                    <span className="font-bold text-primary text-base">S</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction('Nahrát favicon')}
                    className="text-[11px] text-primary hover:underline font-semibold"
                  >
                    Změnit .ICO / .SVG
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-3">
              <button
                type="button"
                onClick={() => handleUnfinishedAction('Uložit nastavení značky')}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Uložit nastavení značky</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
