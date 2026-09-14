"use client";

import React from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  Mail, 
  MessageSquare, 
  Plus, 
  Edit3, 
  Send, 
  Eye, 
  Clock, 
  Sparkles 
} from 'lucide-react';

export default function TemplatesPage() {
  const templates = [
    { id: 'welcome', title: 'Uvítací e-mail nového uživatele', trigger: 'Registrace / Pozvánka', subject: 'Vítejte v týmu Synthesis CMS', updated: '10. 09. 2026' },
    { id: 'reset-pwd', title: 'Obnovení zapomenutého hesla', trigger: 'Žádost uživatele', subject: 'Instrukce k obnovení hesla', updated: '05. 09. 2026' },
    { id: 'form-contact', title: 'Potvrzení kontaktního formuláře', trigger: 'Odeslání z webu', subject: 'Děkujeme za vaši zprávu', updated: '01. 09. 2026' },
    { id: 'publish-notify', title: 'Oznámení o schválení publikace', trigger: 'Publikační proces', subject: 'Vaše stránka byla schválena a publikována', updated: '28. 08. 2026' },
  ];

  return (
    <CapabilityShell
      group="KOMUNIKACE"
      title="Šablony zpráv a e-mailů"
      description="Správa transakčních šablon pro automatické systémové e-maily a potvrzení odeslaných formulářů."
      status="PLÁNOVÁNO"
      helpKey="communication.templates.view"
      emptyTitle="Zatím nebyly vytvořeny žádné e-mailové šablony"
      emptyDescription="Vytvořte transakční šablonu pro uvítací e-maily nebo odpovědi z formulářů."
      emptyActionLabel="Vytvořit první šablonu"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6 max-w-4xl">
          <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs leading-relaxed space-y-1">
            <span className="font-bold block">Schválená schopnost v roadmapě:</span>
            <span>
              Tento modul bude plně napojen po dokončení základní e-mailové a formulářové infrastruktury.
            </span>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Transakční šablony</h3>
            <button
              type="button"
              onClick={() => handleUnfinishedAction('Vytvořit novou šablonu zprávy')}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nová šablona</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map(tpl => (
              <div
                key={tpl.id}
                className="p-5 rounded-2xl border border-border bg-card shadow-xs flex flex-col justify-between space-y-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      {tpl.trigger}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{tpl.updated}</span>
                  </div>
                  <h4 className="text-sm font-bold text-foreground">{tpl.title}</h4>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Předmět:</span> {tpl.subject}
                  </p>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction(`Náhled šablony ${tpl.title}`)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Náhled</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction(`Upravit šablonu ${tpl.title}`)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Upravit</span>
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
