"use client";

import React, { useState } from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  Code, 
  Play, 
  Copy, 
  Check, 
  ExternalLink, 
  Lock, 
  Sparkles,
  Server
} from 'lucide-react';

export default function ApiExplorerPage() {
  const [selectedEndpoint, setSelectedEndpoint] = useState('GET /api/v1/pages');

  const endpoints = [
    { method: 'GET', path: '/api/v1/pages', desc: 'Vrátí seznam všech publikovaných stránek v projektu' },
    { method: 'GET', path: '/api/v1/pages/:slug', desc: 'Vrátí detail a bloky konkrétní publikované stránky' },
    { method: 'GET', path: '/api/v1/media', desc: 'Vrátí knihovnu nahraných médií s metadaty' },
    { method: 'POST', path: '/api/v1/publish', desc: 'Spustí bezpečný publikační proces (vyžaduje API klíč s rolí PUBLISH)' },
  ];

  return (
    <CapabilityShell
      group="PLATFORMA"
      title="API Explorer a OpenAPI"
      description="Interaktivní konzole pro testování veřejných a interních REST API koncových bodů Synthesis CMS."
      status="UI PŘIPRAVENO"
      helpKey="tools.api_explorer.view"
      emptyTitle="API specifikace není dostupná"
      emptyDescription="Kliknutím níže načtěte aktuální OpenAPI v3.1 specifikaci."
      emptyActionLabel="Načíst API schéma"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Endpoints list */}
            <div className="rounded-2xl border border-border bg-card shadow-xs divide-y divide-border overflow-hidden h-fit">
              <div className="p-3 bg-muted/40 text-xs font-bold text-muted-foreground flex justify-between items-center">
                <span>Dostupné API koncové body</span>
                <span className="font-mono text-[11px]">OpenAPI 3.1</span>
              </div>

              {endpoints.map(ep => (
                <div
                  key={ep.path}
                  onClick={() => setSelectedEndpoint(`${ep.method} ${ep.path}`)}
                  className={`p-3 space-y-1 cursor-pointer transition-colors ${
                    selectedEndpoint === `${ep.method} ${ep.path}`
                      ? 'bg-primary/10 border-l-4 border-l-primary'
                      : 'hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                        ep.method === 'GET'
                          ? 'bg-blue-500/10 text-blue-600'
                          : 'bg-emerald-500/10 text-emerald-600'
                      }`}
                    >
                      {ep.method}
                    </span>
                    <span className="text-xs font-mono font-bold text-foreground truncate">{ep.path}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{ep.desc}</p>
                </div>
              ))}
            </div>

            {/* Interactive Request & Response Box */}
            <div className="lg:col-span-2 p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600">
                    GET
                  </span>
                  <span className="text-xs sm:text-sm font-mono font-bold text-foreground">
                    /api/v1/pages
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleUnfinishedAction('Spustit testovací API volání')}
                  className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Odeslat požadavek</span>
                </button>
              </div>

              {/* Sample Response */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                  <span>Ukázková odpověď (200 OK - application/json)</span>
                  <span className="font-mono text-[11px]">Latence: 8ms</span>
                </div>

                <pre className="p-4 rounded-xl bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto">
{`{
  "status": "success",
  "data": {
    "project": "synthesis-demo",
    "totalPages": 2,
    "pages": [
      { "id": "p_01", "slug": "/", "title": "Úvodní stránka", "status": "PUBLISHED" },
      { "id": "p_02", "slug": "/sluzby", "title": "Služby", "status": "PUBLISHED" }
    ]
  }
}`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
