"use client";

import React from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  ArrowDownUp, 
  Download, 
  Upload, 
  Database, 
  FileArchive, 
  ShieldCheck, 
  CheckCircle2,
  HardDrive
} from 'lucide-react';

export default function ImportExportPage() {
  return (
    <CapabilityShell
      group="DATA"
      title="Import a export dat (Portabilita)"
      description="Zálohování, export celého projektu do standardního JSON/ZIP archivu a migrace obsahu."
      status="UI PŘIPRAVENO"
      helpKey="data.import_export.view"
      emptyTitle="Zatím nebyl vygenerován žádný exportní balíček"
      emptyDescription="Kliknutím níže můžete vygenerovat kompletní zálohu projektu."
      emptyActionLabel="Vygenerovat první zálohu"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6 max-w-4xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Export Card */}
            <div className="p-5 rounded-2xl border border-border bg-card shadow-xs flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary w-fit">
                  <Download className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-foreground">Export kompletního webu</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Stáhněte si kompletní obsah stránek, hierarchii, designové tokeny a reference médií v otevřeném formátu JSON/ZIP.
                </p>

                <div className="space-y-1.5 pt-2 text-xs">
                  <label className="flex items-center gap-2 text-foreground font-medium">
                    <input type="checkbox" defaultChecked className="rounded border-input text-primary" />
                    <span>Zahrnout všechny textové stránky a koncepty</span>
                  </label>
                  <label className="flex items-center gap-2 text-foreground font-medium">
                    <input type="checkbox" defaultChecked className="rounded border-input text-primary" />
                    <span>Zahrnout konfiguraci motivu a značky</span>
                  </label>
                  <label className="flex items-center gap-2 text-foreground font-medium">
                    <input type="checkbox" defaultChecked className="rounded border-input text-primary" />
                    <span>Zahrnout metadata knihovny médií</span>
                  </label>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleUnfinishedAction('Exportovat data webu do ZIP')}
                  className="w-full py-2 text-xs sm:text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center justify-center gap-2 shadow-xs"
                >
                  <Download className="w-4 h-4" />
                  <span>Stáhnout kompletní archiv (ZIP)</span>
                </button>
              </div>
            </div>

            {/* Import Card */}
            <div className="p-5 rounded-2xl border border-border bg-card shadow-xs flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="p-2.5 rounded-xl bg-muted text-foreground w-fit">
                  <Upload className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-foreground">Import dat a obnova ze zálohy</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Nahrajte dříve exportovaný archiv Synthesis balíčku pro obnovu nebo přenos dat z jiného prostředí.
                </p>

                <div className="p-6 rounded-xl border border-dashed border-border bg-muted/30 text-center space-y-2">
                  <FileArchive className="w-8 h-8 text-muted-foreground mx-auto" />
                  <p className="text-xs font-semibold text-foreground">Přetáhněte sem soubor .zip nebo .json</p>
                  <p className="text-[11px] text-muted-foreground">Maximální velikost balíčku: 100 MB</p>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleUnfinishedAction('Nahrát a validovat importní balíček')}
                  className="w-full py-2 text-xs sm:text-sm font-semibold rounded-xl border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  <span>Vybrat soubor k importu</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
