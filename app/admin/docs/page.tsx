"use client";

import React from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  BookOpen, 
  Search, 
  ExternalLink, 
  Sparkles, 
  FileText, 
  ShieldCheck, 
  Code,
  ArrowRight
} from 'lucide-react';

export default function DocsPage() {
  const docSections = [
    { title: 'Základní architektura Synthesis CMS', desc: 'Přehled vrstev Synthesis OS, CMS Core, Component Registry a bezpečnostních bran.', tag: 'Architektura' },
    { title: 'Životní cyklus obsahu (Content Lifecycle)', desc: 'Pravidla pro Draft, Preview, Immutable Publish a bezpečný Rollback.', tag: 'Obsah' },
    { title: 'Zero Trust a model oprávnění (RBAC)', desc: 'Server-side autorizace na každém koncovém bodu, matice rolí a auditování.', tag: 'Bezpečnost' },
    { title: 'Theme Packy a designové tokeny', desc: 'Jak vytvářet a konfigurovat sémantické designové tokeny pro světlý a tmavý režim.', tag: 'Design' },
  ];

  return (
    <CapabilityShell
      group="PLATFORMA"
      title="Systémová dokumentace"
      description="Referenční příručka pro administrátory, redaktory a vývojáře pracující se Synthesis CMS."
      status="POUZE UI"
      helpKey="tools.docs.view"
      emptyTitle="Dokumentace zatím nebyla vygenerována"
      emptyDescription="Kliknutím níže načtěte aktuální verzi systémové dokumentace."
      emptyActionLabel="Načíst dokumentaci"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6 max-w-4xl">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Vyhledat v dokumentaci (např. publikování, RBAC, bloky, API)..."
              className="w-full pl-9 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-input bg-card text-foreground"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {docSections.map(sec => (
              <div
                key={sec.title}
                onClick={() => handleUnfinishedAction(`Otevřít článek „${sec.title}“`)}
                className="p-5 rounded-2xl border border-border bg-card shadow-xs flex flex-col justify-between space-y-3 cursor-pointer hover:border-primary/50 transition-colors"
              >
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    {sec.tag}
                  </span>
                  <h4 className="text-sm font-bold text-foreground">{sec.title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{sec.desc}</p>
                </div>

                <div className="pt-2 flex items-center gap-1.5 text-xs text-primary font-semibold">
                  <span>Přečíst dokumentaci</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
