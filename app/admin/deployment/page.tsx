"use client";

import React from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  Rocket, 
  GitBranch, 
  CheckCircle2, 
  Server, 
  ExternalLink, 
  RefreshCw, 
  Clock, 
  ShieldCheck,
  Cpu
} from 'lucide-react';

export default function DeploymentPage() {
  return (
    <CapabilityShell
      group="PLATFORMA"
      title="Stav nasazení a běhové prostředí"
      description="Informace o aktuálně nasazeném Git commitu (SHA), stavu CI/CD pipeline a Cloud Run kontejneru."
      status="POUZE UI"
      helpKey="platform.deployment.view"
      emptyTitle="Informace o nasazení nejsou dostupné"
      emptyDescription="Běhová telemetrie nasazení bude napojena v příslušném integračním kroku."
      emptyActionLabel="Zkontrolovat stav"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6 max-w-4xl">
          {/* Truthfulness Notice Banner */}
          <div className="p-4 rounded-2xl border border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200 text-xs leading-relaxed space-y-1">
            <span className="font-bold block">Stav schopnosti: POUZE UI (Ukázková data)</span>
            <span>
              Živá telemetrie produkčního kontejneru a CI/CD pipeline není v tomto rozhraní připojena. Níže jsou uvedeny identifikační údaje repozitáře a cílové infrastruktury.
            </span>
          </div>

          {/* Active Deployment Summary */}
          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-muted text-foreground flex items-center justify-center shrink-0 border border-border">
                <Rocket className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-bold text-foreground">
                    Cílové prostředí: ENV-CMS-DEV
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                    POUZE UI
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Prostředí: <code className="font-mono">ENV-CMS-DEV</code> • Cloud Run Container Sandbox
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleUnfinishedAction('Spustit re-deploy')}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 self-start sm:self-auto shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Ověřit stav nasazení</span>
            </button>
          </div>

          {/* Git & Infrastructure Spec Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl border border-border bg-card space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground font-semibold">
                <GitBranch className="w-4 h-4" />
                <span>Git repozitář a větev</span>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-foreground">jirisar7-eng/CMS_DEV</p>
                <p className="text-muted-foreground font-mono text-[11px]">Větev: task/SYN-UI-006-CMS-CAPABILITY-SHELLS</p>
                <p className="text-muted-foreground font-mono text-[11px]">Base SHA: cf3ea1f4d5c6a572f11e5af9979b497c3400484b</p>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-border bg-card space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground font-semibold">
                <Server className="w-4 h-4" />
                <span>Běhová infrastruktura</span>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-foreground">Google Cloud Run (GCP)</p>
                <p className="text-muted-foreground text-[11px]">Region: europe-west1</p>
                <p className="text-muted-foreground text-[11px]">Port: 3000 (Nginx Reverse Proxy)</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
