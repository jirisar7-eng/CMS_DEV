"use client";

import React from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  FolderKanban, 
  Plus, 
  CheckCircle2, 
  ExternalLink, 
  Layers, 
  Globe, 
  Calendar,
  Sparkles
} from 'lucide-react';

export default function ProjectsPage() {
  const projects = [
    {
      id: 'proj_synthesis_cms',
      name: 'Synthesis CMS (Hlavní prezentace)',
      domain: 'synthesis-cms.dev',
      environment: 'ENV-CMS-DEV',
      status: 'Aktivní projekt',
      isCurrent: true,
      updated: '13. 09. 2026 10:15',
    },
    {
      id: 'proj_docs_portal',
      name: 'Synthesis Documentation Hub',
      domain: 'docs.synthesis.com',
      environment: 'ENV-DOCS-DEV',
      status: 'Aktivní',
      isCurrent: false,
      updated: '11. 09. 2026 18:20',
    },
    {
      id: 'proj_partner_portal',
      name: 'Partnerský portál',
      domain: 'partners.synthesis.com',
      environment: 'ENV-STAGING',
      status: 'Ve vývoji',
      isCurrent: false,
      updated: '08. 09. 2026 12:00',
    },
  ];

  return (
    <CapabilityShell
      group="PLATFORMA"
      title="Správa projektů a prostředí"
      description="Přepínání mezi webovými projekty, izolace prostředí (DEV, STAGING, PROD) a správa projektových tenantů."
      status="UI PŘIPRAVENO"
      helpKey="platform.projects.view"
      emptyTitle="Zatím nebyl založen žádný další projekt"
      emptyDescription="Vytvořte nový nezávislý webový projekt v rámci Synthesis ekosystému."
      emptyActionLabel="Založit nový projekt"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Dostupné projekty ({projects.length})</h3>
            <button
              type="button"
              onClick={() => handleUnfinishedAction('Založit nový projekt')}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nový projekt</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(p => (
              <div
                key={p.id}
                className={`p-5 rounded-2xl border bg-card shadow-xs flex flex-col justify-between space-y-4 transition-all ${
                  p.isCurrent
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border hover:border-border/80'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      {p.environment}
                    </span>
                    {p.isCurrent && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Aktuální
                      </span>
                    )}
                  </div>

                  <h4 className="text-sm font-bold text-foreground">{p.name}</h4>
                  <p className="font-mono text-xs text-muted-foreground">{p.domain}</p>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-border">
                  <span className="text-[11px] text-muted-foreground">{p.updated}</span>
                  {!p.isCurrent ? (
                    <button
                      type="button"
                      onClick={() => handleUnfinishedAction(`Přepnout do projektu ${p.name}`)}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Přepnout sem
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-muted-foreground">Otevřeno</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
