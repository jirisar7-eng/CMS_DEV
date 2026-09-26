"use client";

import React from "react";
import { CapabilityShell } from "@/components/admin/CapabilityShell";
import {
  ShieldCheck,
  Lock,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Sliders,
  Save,
} from "lucide-react";
import {
  SESSION_IDLE_TIMEOUT_MINUTES,
  SESSION_ABSOLUTE_TIMEOUT_HOURS,
} from "@/lib/auth/session-policy";

export default function SecurityOverviewPage() {
  return (
    <CapabilityShell
      group="BEZPEČNOST"
      title="Zabezpečení a bezpečnostní štít"
      description="Centrální přehled stavu šifrování, konfigurace bezpečnostních HTTP hlaviček a zásad hesel."
      status="POUZE UI"
      helpKey="security.overview.view"
      emptyTitle="Bezpečnostní profil nebyl načten"
      emptyDescription="Kliknutím níže proveďte konfiguraci bezpečnostního profilu."
      emptyActionLabel="Konfigurovat bezpečnostní profil"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6 max-w-4xl">
          {/* Truthfulness Notice Banner */}
          <div className="p-4 rounded-2xl border border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200 text-xs leading-relaxed space-y-1">
            <span className="font-bold block">Stav schopnosti: POUZE UI (Ukázková konfigurace)</span>
            <span>
              Vybrané HTTP ochrany a limity administrátorských relací jsou aktivně vynucovány runtime. Editovatelná konfigurace Security Center a telemetrie zatím nejsou napojeny; náhledové ovládací prvky níže nepředstavují uložené nastavení.
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
                  <h3 className="text-base font-bold text-foreground">Bezpečnostní profil</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                    Částečně aktivní
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Klíčové runtime ochrany (HTTP hlavičky a relace) jsou aktivní, zatímco ovládací prvky správy představují náhled.
                </p>
              </div>
            </div>
          </div>

          {/* HTTP Security Headers */}
          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-foreground border-b border-border pb-3">
              Aktivní runtime HTTP ochrany
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
                  Aktivní runtime
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/60">
                <div className="space-y-0.5">
                  <span className="font-bold font-mono text-foreground">Strict-Transport-Security (HSTS)</span>
                  <p className="text-muted-foreground text-[11px]">
                    Vynucuje bezpečné HTTPS spojení (max-age=31536000).
                  </p>
                </div>
                <span className="text-muted-foreground font-semibold flex items-center gap-1">
                  Aktivní runtime
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/60">
                <div className="space-y-0.5">
                  <span className="font-bold font-mono text-foreground">X-Frame-Options: SAMEORIGIN</span>
                  <p className="text-muted-foreground text-[11px]">
                    Chrání před clickjacking útoky s povoleným zarámováním pouze v rámci stejného původu (CSP frame-ancestors &apos;self&apos;). Neautorizované externí vkládání je blokováno.
                  </p>
                </div>
                <span className="text-muted-foreground font-semibold flex items-center gap-1">
                  Aktivní runtime
                </span>
              </div>
            </div>
          </div>

          {/* Admin Session Policy — Active Runtime State */}
          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4 text-xs">
            <h3 className="text-sm font-bold text-foreground border-b border-border pb-3">
              Aktivní politika administrátorské relace
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/60">
                <div className="space-y-0.5">
                  <span className="font-bold text-foreground">Automatické odhlášení při neaktivitě</span>
                  <p className="text-muted-foreground text-[11px]">
                    Automatické odhlášení po {SESSION_IDLE_TIMEOUT_MINUTES} minutách neaktivity.
                  </p>
                </div>
                <span className="text-muted-foreground font-semibold">
                  Aktivní runtime
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/60">
                <div className="space-y-0.5">
                  <span className="font-bold text-foreground">Maximální doba trvání relace</span>
                  <p className="text-muted-foreground text-[11px]">
                    Maximální platnost relace: {SESSION_ABSOLUTE_TIMEOUT_HOURS} hodin.
                  </p>
                </div>
                <span className="text-muted-foreground font-semibold">
                  Aktivní runtime
                </span>
              </div>
            </div>
          </div>

          {/* Preview / Unconnected Controls */}
          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4 text-xs">
            <div className="border-b border-border pb-3">
              <h3 className="text-sm font-bold text-foreground">
                Náhled nenapojených bezpečnostních nastavení
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Následující ovládací prvky slouží pouze jako náhled budoucích nastavení a nepředstavují uloženou konfiguraci.
              </p>
            </div>
            <div className="space-y-2 opacity-75">
              <label className="flex items-center gap-2 text-foreground font-semibold cursor-not-allowed">
                <input type="checkbox" disabled className="rounded border-input text-primary cursor-not-allowed" />
                <span>Vynutit dvoufázové ověření (2FA / TOTP) pro všechny administrátorské role</span>
              </label>
              <label className="flex items-center gap-2 text-foreground font-semibold cursor-not-allowed">
                <input type="checkbox" disabled className="rounded border-input text-primary cursor-not-allowed" />
                <span>Minimální délka hesla 12 znaků s požadavkem na speciální znaky a číslice</span>
              </label>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleUnfinishedAction("Uložit bezpečnostní zásady")}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-muted text-muted-foreground hover:bg-muted/80 transition-colors inline-flex items-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Uložit zásady zabezpečení (Náhled)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
