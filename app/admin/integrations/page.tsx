"use client";

import React from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  Puzzle, 
  Webhook, 
  ExternalLink, 
  CheckCircle2, 
  Power, 
  Settings2, 
  Key,
  Plus
} from 'lucide-react';

export default function IntegrationsPage() {
  const integrations = [
    { id: 'resend', name: 'Resend / SMTP E-mail', desc: 'Doručování transakčních e-mailů a potvrzení formulářů.', status: 'Aktivní', connected: true, category: 'E-mail' },
    { id: 's3', name: 'S3 / Cloudflare R2 Úložiště', desc: 'Ukládání a CDN distribuce mediálních souborů a obrázků.', status: 'Aktivní', connected: true, category: 'Storage' },
    { id: 'webhook-ci', name: 'Deploy Webhooks (GitHub / Vercel)', desc: 'Spouštění automatických sestavení při publikaci obsahu.', status: 'Aktivní', connected: true, category: 'DevOps' },
    { id: 'slack', name: 'Slack / Discord Notifikace', desc: 'Zasílání upozornění na bezpečnostní incidenty a žádosti o schválení.', status: 'Nenakonfigurováno', connected: false, category: 'Chat' },
  ];

  return (
    <CapabilityShell
      group="SYSTÉM"
      title="Integrace a externí služby"
      description="Správa napojení na externí cloudové služby, API konektory, webhooks a poskytovatele infrastruktury."
      status="UI PŘIPRAVENO"
      helpKey="system.integrations.view"
      emptyTitle="Zatím nebyly připojeny žádné externí služby"
      emptyDescription="Propojte Synthesis CMS s úložištěm médií nebo e-mailovým poskytovatelem."
      emptyActionLabel="Procházet dostupné integrace"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Aktivní integrace ({integrations.length})</h3>
            <button
              type="button"
              onClick={() => handleUnfinishedAction('Přidat novou integraci')}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nové napojení</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {integrations.map(item => (
              <div
                key={item.id}
                className="p-5 rounded-2xl border border-border bg-card shadow-xs flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      {item.category}
                    </span>
                    {item.connected ? (
                      <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Připojeno
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Neaktivní</span>
                    )}
                  </div>

                  <h4 className="text-sm font-bold text-foreground">{item.name}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-border">
                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction(`Konfigurovat integraci ${item.name}`)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    <span>Konfigurovat</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction(`Test spojení pro ${item.name}`)}
                    className="text-xs text-primary hover:underline font-semibold"
                  >
                    Otestovat spojení
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
