"use client";

import React from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  ShieldCheck, 
  Lock, 
  KeyRound, 
  CheckCircle2, 
  AlertTriangle, 
  FileCheck, 
  Sliders, 
  Save 
} from 'lucide-react';

export default function SecurityOverviewPage() {
  return (
    <CapabilityShell
      group="BEZPEČNOST"
      title="Zabezpečení a bezpečnostní štít"
      description="Centrální přehled stavu šifrování, konfigurace bezpečnostních HTTP hlaviček a zásad hesel."
      status="UI PŘIPRAVENO"
      helpKey="security.overview.view"
      emptyTitle="Bezpečnostní profil nebyl načten"
      emptyDescription="Kliknutím níže proveďte konfiguraci bezpečnostního profilu."
      emptyActionLabel="Konfigurovat bezpečnostní profil"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6 max-w-4xl">
          {/* Truthfulness Notice Banner */}
          <div className="p-4 rounded-2xl border border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200 text-xs leading-relaxed space-y-1">
            <span className="font-bold block">Stav schopnosti: UI PŘIPRAVENO (Ukázková konfigurace)</span>
            <span>
              Bezpečnostní backend a telemetrie zatím nejsou připojeny. Níže uvedené položky představují schválený vzor bezpečnostní konfigurace.
            </span>
          </div>

          {/* Overall Security Profile Card (Truthful) */}
          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-muted text-foreground flex items-center justify-center shrink-0 border border-border">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground">Bezpečnostní profil (Ukázková data)</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                    Neověřeno
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Doporučené bezpečnostní hlavičky, TLS šifrování a zásady ověřování připravené k nasazení.
                </p>
              </div>
            </div>
          </div>

          {/* Security Headers Checklist */}
          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-foreground border-b border-border pb-3">
              Návrh bezpečnostních HTTP hlaviček
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/60">
                <div className="space-y-0.5">
                  <span className="font-bold font-mono text-foreground">Content-Security-Policy (CSP)</span>
                  <p className="text-muted-foreground text-[11px]">
                    Zabraňuje injektáži škodlivých skriptů a XSS útokům.
                  </p>
                </div>
                <span className="text-muted-foreground font-semibold flex items-center gap-1">
                  Předkonfigurováno
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/60">
                <div className="space-y-0.5">
                  <span className="font-bold font-mono text-foreground">Strict-Transport-Security (HSTS)</span>
                  <p className="text-muted-foreground text-[11px]">
                    Vynucuje bezpečné HTTPS spojení (max-age=31536000; includeSubDomains).
                  </p>
                </div>
                <span className="text-muted-foreground font-semibold flex items-center gap-1">
                  Předkonfigurováno
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/60">
                <div className="space-y-0.5">
                  <span className="font-bold font-mono text-foreground">X-Frame-Options: DENY</span>
                  <p className="text-muted-foreground text-[11px]">
                    Chrání před clickjacking útoky v neautorizovaných rámech.
                  </p>
                </div>
                <span className="text-muted-foreground font-semibold flex items-center gap-1">
                  Předkonfigurováno
                </span>
              </div>
            </div>
          </div>

          {/* Password Policy & 2FA */}
          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4 text-xs">
            <h3 className="text-sm font-bold text-foreground border-b border-border pb-3">
              Zásady hesel a dvoufázové ověření (2FA)
            </h3>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-foreground font-semibold cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded border-input text-primary" />
                <span>Vynutit dvoufázové ověření (2FA / TOTP) pro všechny administrátorské role</span>
              </label>
              <label className="flex items-center gap-2 text-foreground font-semibold cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded border-input text-primary" />
                <span>Minimální délka hesla 12 znaků s požadavkem na speciální znaky a číslice</span>
              </label>
              <label className="flex items-center gap-2 text-foreground font-semibold cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded border-input text-primary" />
                <span>Automatické odhlášení po 30 minutách neaktivity</span>
              </label>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleUnfinishedAction('Uložit bezpečnostní zásady')}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Uložit zásady zabezpečení</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
