"use client";

import React from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  ShieldQuestion, 
  FileCheck, 
  UserCheck, 
  Trash2, 
  Download, 
  Save, 
  Sliders 
} from 'lucide-react';

export default function PrivacyPage() {
  return (
    <CapabilityShell
      group="BEZPEČNOST"
      title="GDPR a ochrana soukromí"
      description="Nastavení souhlasů se zpracováním údajů (Cookie lišta), zásady uchovávání dat a právo na výmaz."
      status="POUZE UI"
      helpKey="security.privacy.view"
      emptyTitle="Nastavení soukromí není inicializováno"
      emptyDescription="Aktivujte výchozí předvolby ochrany osobních údajů."
      emptyActionLabel="Aktivovat předvolby GDPR"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6 max-w-4xl text-xs sm:text-sm">
          {/* Cookie Banner Configuration */}
          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-foreground border-b border-border pb-3">
              Konfigurace Cookie lišty (Consent Banner)
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-foreground mb-1 text-xs">
                  Režim cookie lišty
                </label>
                <select className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs">
                  <option>Opt-in (Vyžadovat aktivní souhlas před načtením nepovinných skriptů)</option>
                  <option>Informační pruh (Pouze nezbytné technické cookies bez sledování)</option>
                </select>
              </div>

              <div className="space-y-2 pt-2 border-t border-border">
                <span className="text-xs font-bold text-foreground block">Povolené kategorie cookies:</span>
                <label className="flex items-center gap-2 text-foreground font-semibold cursor-not-allowed opacity-80">
                  <input type="checkbox" defaultChecked disabled className="rounded border-input text-primary" />
                  <span>Nezbytné technické cookies (Vždy aktivní pro fungování relace a bezpečnosti)</span>
                </label>
                <label className="flex items-center gap-2 text-foreground font-semibold cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded border-input text-primary" />
                  <span>Analytické cookies (Anonymní statistiky návštěvnosti)</span>
                </label>
                <label className="flex items-center gap-2 text-foreground font-semibold cursor-pointer">
                  <input type="checkbox" className="rounded border-input text-primary" />
                  <span>Marketingové a preferenční cookies</span>
                </label>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleUnfinishedAction('Uložit nastavení cookie lišty')}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Uložit konfiguraci</span>
              </button>
            </div>
          </div>

          {/* Data Subject Rights (GDPR) */}
          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-foreground border-b border-border pb-3">
              Nástroje pro práva subjektů údajů (Čl. 15–20 GDPR)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-border bg-background space-y-2">
                <h4 className="text-xs font-bold text-foreground">Export osobních údajů (Čl. 15)</h4>
                <p className="text-[11px] text-muted-foreground">
                  Vygeneruje strukturovaný JSON report se všemi daty přiřazenými k e-mailové adrese.
                </p>
                <button
                  type="button"
                  onClick={() => handleUnfinishedAction('Vygenerovat GDPR export')}
                  className="w-full py-1.5 text-xs font-semibold rounded-lg border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Vygenerovat export dat</span>
                </button>
              </div>

              <div className="p-4 rounded-xl border border-border bg-background space-y-2">
                <h4 className="text-xs font-bold text-foreground">Anonymizace / Výmaz (Čl. 17)</h4>
                <p className="text-[11px] text-muted-foreground">
                  Nenávratně anonymizuje identifikační údaje v auditních logách a formulářích.
                </p>
                <button
                  type="button"
                  onClick={() => handleUnfinishedAction('Spustit anonymizaci subjektu údajů')}
                  className="w-full py-1.5 text-xs font-semibold rounded-lg text-destructive hover:bg-destructive/10 transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Anonymizovat data</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
