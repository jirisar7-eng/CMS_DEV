"use client";

import React from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  ListTree, 
  Play, 
  RotateCw, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Trash2,
  Sparkles
} from 'lucide-react';

export default function QueuesPage() {
  const queueJobs = [
    { id: 'job_01', name: 'Optimalizace mediálních souborů (WebP/AVIF)', queue: 'media-transcode', status: 'BĚŽÍ', attempts: '1/3', progress: '65 %' },
    { id: 'job_02', name: 'Odeslání týdenního souhrnu notifikací', queue: 'notifications-bulk', status: 'ČEKÁ', attempts: '0/3', progress: '0 %' },
    { id: 'job_03', name: 'Generování sitemap.xml archivu', queue: 'sitemap-builder', status: 'DOKONČENO', attempts: '1/1', progress: '100 %' },
    { id: 'job_04', name: 'Zálohování databázového snímku', queue: 'backup-snapshot', status: 'DOKONČENO', attempts: '1/1', progress: '100 %' },
  ];

  return (
    <CapabilityShell
      group="SYSTÉM"
      title="Úlohy a asynchronní fronty"
      description="Monitorování běhu úloh na pozadí, asynchronního zpracování médií a plánovaných akcí (Cron)."
      status="PLÁNOVÁNO"
      helpKey="system.queues.view"
      emptyTitle="Ve frontě nejsou žádné aktivní ani čekající úlohy"
      emptyDescription="Jakmile systém zařadí úlohu na pozadí, zobrazí se její průběh zde."
      emptyActionLabel="Zkontrolovat stav workeru"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6 max-w-4xl">
          <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs leading-relaxed space-y-1">
            <span className="font-bold block">Schválená schopnost v roadmapě:</span>
            <span>
              Tento modul bude obsluhovat asynchronní fronty (Background Jobs) a plánovač úloh pro optimalizaci velkých objemů dat.
            </span>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Úlohy ve frontě ({queueJobs.length})</h3>
            <button
              type="button"
              onClick={() => handleUnfinishedAction('Pročistit dokončené úlohy')}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-border bg-card hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Obnovit frontu</span>
            </button>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-xs divide-y divide-border overflow-hidden">
            {queueJobs.map(job => (
              <div
                key={job.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors text-xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground truncate">{job.name}</span>
                    <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-muted text-muted-foreground">
                      {job.queue}
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    ID úlohy: <code className="font-mono">{job.id}</code> • Pokusy: {job.attempts}
                  </p>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                      job.status === 'BĚŽÍ'
                        ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                        : job.status === 'DOKONČENO'
                        ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {job.status} ({job.progress})
                  </span>

                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction(`Zastavit úlohu ${job.id}`)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground"
                    title="Správa úlohy"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
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
