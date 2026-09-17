"use client";
import React from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { Plus, CheckCircle2, FolderOpen } from 'lucide-react';

interface ProjectData {
  id: string;
  name: string;
  key: string;
  status: string;
  createdAt: Date;
}

interface Props {
  projects: ProjectData[];
  activeProjectId: string | null;
}

export function ClientProjectList({ projects, activeProjectId }: Props) {
  return (
    <CapabilityShell
      group="PLATFORMA"
      title="Správa projektů a prostředí"
      description="Přepínání mezi webovými projekty, izolace prostředí a správa projektových tenantů."
      status="ZÁKLAD"
      helpKey="platform.projects.view"
      emptyTitle="Zatím nebyl založen žádný projekt"
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
            {projects.length === 0 ? (
               <div className="col-span-full py-8 text-center bg-muted/30 border border-dashed rounded-xl">
                 <FolderOpen className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
                 <p className="text-sm font-medium text-foreground">Žádné projekty</p>
                 <p className="text-xs text-muted-foreground mt-1">Nemáte přístup k žádným projektům.</p>
               </div>
            ) : projects.map(p => {
              const isCurrent = p.id === activeProjectId;
              return (
              <div
                key={p.id}
                className={`p-5 rounded-2xl border bg-card shadow-xs flex flex-col justify-between space-y-4 transition-all ${
                  isCurrent
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border hover:border-border/80'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      {p.status}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Aktuální
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-foreground">{p.name}</h4>
                  <p className="font-mono text-[10px] text-muted-foreground">ID: {p.id}</p>
                  <p className="font-mono text-xs text-muted-foreground">{p.key}</p>
                </div>
                <div className="pt-2 flex items-center justify-between border-t border-border mt-auto">
                  <span className="text-[11px] text-muted-foreground">
                     {new Date(p.createdAt).toLocaleDateString('cs-CZ')}
                  </span>
                  {!isCurrent ? (
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
            )})}
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
