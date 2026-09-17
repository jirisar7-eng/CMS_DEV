"use client";

import React, { useState } from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  ShieldAlert, 
  Search, 
  Filter, 
  Download, 
  CheckCircle, 
  AlertTriangle, 
  UserCheck, 
  FileEdit, 
  Key
} from 'lucide-react';

export default function AuditPage() {
  const [filterSeverity, setFilterSeverity] = useState('ALL');

  const auditEvents = [
    { id: 1, action: 'PAGE_PUBLISH', title: 'Publikována nová verze webu v2.4.1', user: 'Jiří Šár', ip: '192.168.1.42', date: '12. 09. 2026 14:30:12', severity: 'INFO' },
    { id: 2, action: 'CONFIG_UPDATE', title: 'Změněna konfigurace SEO Open Graph šablony', user: 'Jiří Šár', ip: '192.168.1.42', date: '11. 09. 2026 09:18:44', severity: 'INFO' },
    { id: 3, action: 'LOGIN_SUCCESS', title: 'Úspěšné přihlášení správce (2FA ověřeno)', user: 'Jiří Šár', ip: '192.168.1.42', date: '11. 09. 2026 09:00:01', severity: 'INFO' },
    { id: 4, action: 'LOGIN_FAILED', title: 'Neplatný pokus o přihlášení (neznámá IP)', user: 'unknown_bot', ip: '45.134.22.10', date: '10. 09. 2026 23:41:10', severity: 'WARN' },
    { id: 5, action: 'MEDIA_UPLOAD', title: 'Nahrán soubor hero-banner-main.webp', user: 'Jiří Šár', ip: '192.168.1.42', date: '10. 09. 2026 15:22:00', severity: 'INFO' },
  ];

  return (
    <CapabilityShell
      group="SPRÁVA"
      title="Bezpečnostní auditní protokol"
      description="Neměnný záznam všech redakčních zásahů, přihlášení a bezpečnostních událostí v systému."
      status="ZÁKLAD"
      helpKey="management.audit.view"
      emptyTitle="Auditní protokol je prázdný"
      emptyDescription="V systému zatím nebyly zaznamenány žádné auditované události."
      emptyActionLabel="Obnovit protokol"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filtrovat logy podle uživatele, IP adresy nebo akce..."
                className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-input bg-card text-foreground"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleUnfinishedAction('Exportovat audit log do CSV/JSON')}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-border bg-card hover:bg-muted text-foreground transition-colors min-h-[44px] cursor-pointer inline-flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Exportovat log</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-xs divide-y divide-border overflow-hidden">
            <div className="p-3 bg-muted/40 text-xs font-bold text-muted-foreground grid grid-cols-12 gap-2">
              <span className="col-span-3 sm:col-span-2">Událost</span>
              <span className="col-span-5 sm:col-span-5">Popis akce</span>
              <span className="hidden sm:inline sm:col-span-2">Uživatel / IP</span>
              <span className="col-span-4 sm:col-span-3 text-right">Časové razítko</span>
            </div>

            {auditEvents.map(ev => (
              <div
                key={ev.id}
                className="p-3.5 text-xs sm:text-sm grid grid-cols-12 gap-2 items-center hover:bg-muted/30 transition-colors"
              >
                <div className="col-span-3 sm:col-span-2">
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                      ev.severity === 'WARN'
                        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    {ev.action}
                  </span>
                </div>

                <div className="col-span-5 sm:col-span-5 font-medium text-foreground truncate">
                  {ev.title}
                </div>

                <div className="hidden sm:inline sm:col-span-2 text-xs text-muted-foreground truncate">
                  <span className="font-semibold text-foreground block">{ev.user}</span>
                  <span className="font-mono text-[11px]">{ev.ip}</span>
                </div>

                <div className="col-span-4 sm:col-span-3 text-right text-xs text-muted-foreground font-mono">
                  {ev.date}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
