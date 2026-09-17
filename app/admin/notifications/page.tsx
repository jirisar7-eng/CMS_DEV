"use client";

import React from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  Bell, 
  CheckCheck, 
  MessageSquare, 
  AlertTriangle, 
  Send, 
  ShieldAlert, 
  Clock 
} from 'lucide-react';

export default function NotificationsPage() {
  const notifications = [
    { id: 1, title: 'Nová stránka čeká na schválení', detail: 'Uživatel Redaktor Obsahu odeslal stránku „Služby pro firmy“ ke kontrole.', time: 'Před 20 minutami', unread: true, type: 'review' },
    { id: 2, title: 'Publikace verze v2.4.1 byla úspěšně dokončena', detail: 'Všechny statické stránky byly vygenerovány za 4.2 sekundy.', time: 'Včera 14:30', unread: false, type: 'success' },
    { id: 3, title: 'Bezpečnostní varování: 3 neúspěšné pokusy o přihlášení', detail: 'IP adresa 45.134.22.10 byla dočasně zablokována na 15 minut.', time: '10. 09. 2026', unread: false, type: 'security' },
  ];

  return (
    <CapabilityShell
      group="KOMUNIKACE"
      title="Centrum notifikací"
      description="Přehled systémových a redakčních upozornění, žádostí o schválení a bezpečnostních výstrah."
      status="POUZE UI"
      helpKey="communication.notifications.view"
      emptyTitle="Nemáte žádná nová upozornění"
      emptyDescription="Všechny zprávy byly přečteny. Jakmile se v systému něco stane, uvidíte to zde."
      emptyActionLabel="Zkontrolovat nové zprávy"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6 max-w-4xl">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Nedávná upozornění</h3>
            <button
              type="button"
              onClick={() => handleUnfinishedAction('Označit vše jako přečtené')}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-border bg-card hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Označit vše jako přečtené</span>
            </button>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-xs divide-y divide-border overflow-hidden">
            {notifications.map(n => (
              <div
                key={n.id}
                className={`p-4 flex items-start gap-3.5 transition-colors ${
                  n.unread ? 'bg-primary/5' : 'hover:bg-muted/30'
                }`}
              >
                <div className="p-2 rounded-xl bg-muted shrink-0 mt-0.5">
                  <Bell className={`w-4 h-4 ${n.unread ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-xs sm:text-sm font-bold truncate ${n.unread ? 'text-primary' : 'text-foreground'}`}>
                      {n.title}
                    </p>
                    <span className="text-[11px] text-muted-foreground shrink-0">{n.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{n.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
