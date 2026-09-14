"use client";

import React from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  Laptop, 
  Smartphone, 
  Globe, 
  LogOut, 
  ShieldCheck, 
  Clock,
  CheckCircle2
} from 'lucide-react';

export default function SessionsPage() {
  const sessions = [
    { id: 1, device: 'MacBook Pro 16" (macOS)', browser: 'Chrome 128.0', ip: '192.168.1.42 (Praha, CZ)', isCurrent: true, lastActive: 'Právě aktivní' },
    { id: 2, device: 'iPhone 15 Pro (iOS 18)', browser: 'Safari Mobile', ip: '192.168.1.42 (Praha, CZ)', isCurrent: false, lastActive: 'Před 2 hodinami' },
    { id: 3, device: 'Dell XPS 15 (Windows 11)', browser: 'Firefox 130.0', ip: '89.24.112.5 (Brno, CZ)', isCurrent: false, lastActive: 'Před 3 dny' },
  ];

  return (
    <CapabilityShell
      group="BEZPEČNOST"
      title="Relace a přihlášená zařízení"
      description="Přehled aktivních přihlášených zařízení k vašemu účtu s možností okamžitého vzdáleného odhlášení."
      status="UI PŘIPRAVENO"
      helpKey="security.sessions.view"
      emptyTitle="Nebyly nalezeny žádné aktivní relace"
      emptyDescription="Seznam přihlášených relací se zobrazí po přihlášení."
      emptyActionLabel="Obnovit seznam relací"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6 max-w-4xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-foreground">Aktivní relace ({sessions.length})</h3>
            <button
              type="button"
              onClick={() => handleUnfinishedAction('Odhlásit všechna ostatní zařízení')}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl text-destructive hover:bg-destructive/10 border border-destructive/20 transition-colors inline-flex items-center gap-1.5 self-start sm:self-auto"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Odhlásit ostatní zařízení</span>
            </button>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-xs divide-y divide-border overflow-hidden">
            {sessions.map(s => (
              <div
                key={s.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-xl bg-muted shrink-0 text-foreground">
                    {s.device.includes('iPhone') ? <Smartphone className="w-5 h-5" /> : <Laptop className="w-5 h-5" />}
                  </div>

                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="text-xs sm:text-sm font-bold text-foreground">{s.device}</p>
                      {s.isCurrent && (
                        <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          Tato relace
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{s.browser} • {s.ip}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">Poslední aktivita: {s.lastActive}</p>
                  </div>
                </div>

                {!s.isCurrent && (
                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction(`Odhlásit zařízení ${s.device}`)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5 self-end sm:self-auto"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Ukončit relaci</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
