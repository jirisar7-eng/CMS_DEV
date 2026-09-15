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
      description="Konfigurace vizuální identity projektu a studia, logotypů pro světlý, tmavý a OLED režim, favicon a prvků značky."
      status="UI PŘIPRAVENO"
      helpKey="design.brands.view"
      emptyTitle="Zatím nebyla definována identita značky"
      emptyDescription="Nastavte základní název značky a nahrajte logotypy projektu či studia."
      emptyActionLabel="Založit profil značky"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6 max-w-5xl">
          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-5">
            <h3 className="text-sm font-bold text-foreground border-b border-border pb-3">
              Základní informace o značce
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
              <div>
                <label className="block font-semibold text-foreground mb-1">Plný název produktu</label>
                <input
                  type="text"
                  defaultValue="Synthesis CMS"
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
              <p className="text-xs text-muted-foreground pb-2">
                FINAL_VECTOR_LOGO = PENDING. Prozatím je zobrazen dočasný textový zástupce.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Logo Light */}
                <div className="p-4 rounded-xl border border-border bg-background flex flex-col items-center justify-center text-center space-y-2">
                  <span className="text-xs font-semibold text-foreground h-8">Logo<br/><span className="text-[10px] text-muted-foreground font-normal">(Světlý režim)</span></span>
                  <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center border border-border">
                    <span className="font-extrabold text-brand text-xl">S</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction('Nahrát logo pro světlý režim')}
                    className="text-[11px] text-primary hover:underline font-semibold"
                  >
                    Nahrát SVG / PNG
                  </button>
                </div>

                {/* Logo Dark */}
                <div className="p-4 rounded-xl border border-border bg-background flex flex-col items-center justify-center text-center space-y-2">
                  <span className="text-xs font-semibold text-foreground h-8">Logo<br/><span className="text-[10px] text-muted-foreground font-normal">(Tmavý režim)</span></span>
                  <div className="w-16 h-16 rounded-xl bg-slate-800 flex items-center justify-center border border-slate-700">
                    <span className="font-extrabold text-brand text-xl">S</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction('Nahrát logo pro tmavý režim')}
                    className="text-[11px] text-primary hover:underline font-semibold"
                  >
                    Nahrát SVG / PNG
                  </button>
                </div>

                {/* Logo Extra Dark */}
                <div className="p-4 rounded-xl border border-border bg-background flex flex-col items-center justify-center text-center space-y-2">
                  <span className="text-xs font-semibold text-foreground h-8">Logo<br/><span className="text-[10px] text-muted-foreground font-normal">(OLED Extra Tmavý)</span></span>
                  <div className="w-16 h-16 rounded-xl bg-black flex items-center justify-center border border-slate-900">
                    <span className="font-extrabold text-brand text-xl">S</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction('Nahrát logo pro extra tmavý režim')}
                    className="text-[11px] text-primary hover:underline font-semibold"
                  >
                    Nahrát SVG / PNG
                  </button>
                </div>

                {/* Favicon & PWA */}
                <div className="p-4 rounded-xl border border-border bg-background flex flex-col items-center justify-center text-center space-y-2">
                  <span className="text-xs font-semibold text-foreground h-8">Symbol<br/><span className="text-[10px] text-muted-foreground font-normal">(Favicon & PWA)</span></span>
                  <div className="w-16 h-16 rounded-xl bg-brand/10 flex items-center justify-center border border-brand/20">
                    <span className="font-extrabold text-brand text-xl">S</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction('Nahrát symbol / favicon')}
                    className="text-[11px] text-primary hover:underline font-semibold"
                  >
                    Nahrát ICO / SVG
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
