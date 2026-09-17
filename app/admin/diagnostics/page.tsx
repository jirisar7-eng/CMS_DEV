"use client";

import React from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  Activity, 
  CheckCircle2, 
  Cpu, 
  HardDrive, 
  Database, 
  RefreshCw, 
  Server,
  Zap
} from 'lucide-react';

export default function DiagnosticsPage() {
  const healthChecks = [
    { name: 'Databázové spojení (PostgreSQL)', status: 'NENÍ PŘIPOJENO', latency: 'Neověřeno', detail: 'Vyžaduje připojení produkční databáze' },
    { name: 'Knihovna médií (Object Storage)', status: 'NENÍ PŘIPOJENO', latency: 'Neověřeno', detail: 'Vyžaduje konfiguraci R2 / S3 bucketu' },
    { name: 'Fulltextový vyhledávací index', status: 'NENÍ PŘIPOJENO', latency: 'Neověřeno', detail: 'Vyžaduje inicializaci indexeru' },
    { name: 'Renderer statických stránek', status: 'POUZE UI', latency: 'Lokální', detail: 'Next.js App Router rozhraní' },
  ];

  return (
    <CapabilityShell
      group="SYSTÉM"
      title="Diagnostika a stav systému"
      description="Sledování dostupnosti infrastruktury, latence databáze, využití paměti a health checků."
      status="POUZE UI"
      helpKey="system.diagnostics.view"
      emptyTitle="Diagnostická data nejsou dostupná"
      emptyDescription="Diagnostika bude aktivní po připojení produkčních poskytovatelů a databázové vrstvy."
      emptyActionLabel="Zkontrolovat stav"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6">
          {/* Truthfulness Notice Banner */}
          <div className="p-4 rounded-2xl border border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200 text-xs leading-relaxed space-y-1">
            <span className="font-bold block">Stav schopnosti: POUZE UI (Ukázková data)</span>
            <span>
              Telemetrie a health checky nejsou v této fázi připojeny k reálnému monitoringu. Zobrazené položky demonstrují plánovanou diagnostickou matici.
            </span>
          </div>

          {/* Quick System Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl border border-border bg-card shadow-xs space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold">Využití paměti instance</span>
                <Cpu className="w-4 h-4" />
              </div>
              <div className="text-xl font-bold text-foreground">Neověřeno</div>
              <span className="text-[11px] text-muted-foreground">Ukázková data</span>
            </div>

            <div className="p-4 rounded-2xl border border-border bg-card shadow-xs space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold">Doba běhu instance (Uptime)</span>
                <Server className="w-4 h-4" />
              </div>
              <div className="text-xl font-bold text-foreground">Neověřeno</div>
              <span className="text-[11px] text-muted-foreground">
                Není připojeno
              </span>
            </div>

            <div className="p-4 rounded-2xl border border-border bg-card shadow-xs flex flex-col justify-between">
              <span className="text-xs text-muted-foreground font-semibold">Manuální health check</span>
              <button
                type="button"
                onClick={() => handleUnfinishedAction('Spustit prověrku služeb')}
                className="mt-2 w-full py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Otestovat stav služeb</span>
              </button>
            </div>
          </div>

          {/* Health Checks List */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-foreground">Plánované health checky komponent</h3>

            <div className="rounded-2xl border border-border bg-card shadow-xs divide-y divide-border overflow-hidden">
              {healthChecks.map(hc => (
                <div
                  key={hc.name}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-muted/30 transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-bold text-foreground">{hc.name}</span>
                      <span className="text-[10px] font-bold px-2 py-0.2 rounded bg-muted text-muted-foreground border border-border">
                        {hc.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{hc.detail}</p>
                  </div>

                  <div className="text-right text-xs font-mono text-muted-foreground">
                    Odezva: {hc.latency}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
