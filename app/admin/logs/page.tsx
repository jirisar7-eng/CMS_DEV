"use client";

import React, { useState } from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  FileTerminal, 
  Search, 
  Download, 
  RefreshCw, 
  Filter, 
  AlertCircle,
  Clock,
  Play
} from 'lucide-react';

export default function LogsPage() {
  const [level, setLevel] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL');

  const logs = [
    { id: 1, level: 'INFO', time: '13. 09. 2026 10:15:22', scope: 'http.router', message: 'GET /api/health 200 OK - 4ms' },
    { id: 2, level: 'INFO', time: '13. 09. 2026 10:14:50', scope: 'cms.publisher', message: 'Release artifact #14 generated successfully (size: 2.1 MB)' },
    { id: 3, level: 'WARN', time: '13. 09. 2026 10:10:02', scope: 'auth.ratelimit', message: 'Rate limit warning: 45.134.22.10 exceeded 10 req/s' },
    { id: 4, level: 'INFO', time: '13. 09. 2026 09:58:30', scope: 'image.optimize', message: 'Optimized hero-banner.png -> hero-banner.webp (saved 64%)' },
    { id: 5, level: 'ERROR', time: '12. 09. 2026 22:15:10', scope: 'webhook.dispatch', message: 'Failed to deliver webhook to https://api.external.com: Connection timeout' },
  ];

  return (
    <CapabilityShell
      group="SYSTÉM"
      title="Protokoly a systémové logy"
      description="Živé streamování aplikačních logů, ladění chybových stavů a monitorování síťových požadavků."
      status="UI PŘIPRAVENO"
      helpKey="system.logs.view"
      emptyTitle="Zatím nebyly zaznamenány žádné logy"
      emptyDescription="Systémové logy se začnou zobrazovat po zpracování prvních požadavků."
      emptyActionLabel="Obnovit logy"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-xl border border-border">
              {['ALL', 'INFO', 'WARN', 'ERROR'].map(l => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLevel(l as any)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    level === l
                      ? 'bg-card text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {l === 'ALL' ? 'Vše' : l}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleUnfinishedAction('Exportovat systémové logy')}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-border bg-card hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Stáhnout log</span>
              </button>
            </div>
          </div>

          {/* Terminal-like log viewer */}
          <div className="rounded-2xl border border-border bg-slate-950 text-slate-100 p-4 font-mono text-xs space-y-2 shadow-sm overflow-x-auto">
            {logs
              .filter(item => level === 'ALL' || item.level === level)
              .map(l => (
                <div key={l.id} className="flex items-start gap-3 py-1 border-b border-slate-900 last:border-0">
                  <span className="text-slate-500 shrink-0">{l.time}</span>
                  <span
                    className={`font-bold px-1.5 py-0.2 rounded text-[10px] shrink-0 ${
                      l.level === 'ERROR'
                        ? 'bg-red-500/20 text-red-400'
                        : l.level === 'WARN'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-emerald-500/20 text-emerald-400'
                    }`}
                  >
                    {l.level}
                  </span>
                  <span className="text-blue-400 shrink-0">[{l.scope}]</span>
                  <span className="text-slate-300 break-all">{l.message}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
