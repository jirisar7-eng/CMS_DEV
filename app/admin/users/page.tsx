"use client";

import React from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  Mail, 
  MoreHorizontal, 
  Key, 
  CheckCircle2, 
  UserX,
  Search
} from 'lucide-react';

export default function UsersPage() {
  const users = [
    { id: 1, name: 'Jiří Šár', email: 'jiri.sar@synthesis.com', role: 'Správce systému', twoFactor: true, status: 'Aktivní', lastLogin: 'Dnes 10:15' },
    { id: 2, name: 'Redaktor Obsahu', email: 'redakce@synthesis.com', role: 'Editor obsahu', twoFactor: true, status: 'Aktivní', lastLogin: 'Včera 16:30' },
    { id: 3, name: 'Korektor Textů', email: 'korektor@synthesis.com', role: 'Korektor', twoFactor: false, status: 'Pozvánka odeslána', lastLogin: 'Nikdy' },
  ];

  return (
    <CapabilityShell
      group="SPRÁVA"
      title="Uživatelé a týmové účty"
      description="Správa přístupových účtů do administrace Synthesis CMS, pozvánky a stav dvoufázového ověření (2FA)."
      status="UI PŘIPRAVENO"
      helpKey="management.users.view"
      emptyTitle="V systému zatím nejsou žádní uživatelé"
      emptyDescription="Pozvěte prvního člena týmu nebo administrátora."
      emptyActionLabel="Pozvat prvního uživatele"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Hledat uživatele podle jména nebo e-mailu..."
                className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-input bg-card text-foreground"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleUnfinishedAction('Pozvat nového uživatele')}
                className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px] cursor-pointer inline-flex items-center gap-2 shadow-xs"
              >
                <UserPlus className="w-4 h-4" />
                <span>Pozvat uživatele</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-xs divide-y divide-border overflow-hidden">
            <div className="p-3 bg-muted/40 text-xs font-bold text-muted-foreground grid grid-cols-12 gap-2">
              <span className="col-span-5 sm:col-span-4">Uživatel / E-mail</span>
              <span className="col-span-3 sm:col-span-3">Role</span>
              <span className="hidden sm:inline sm:col-span-2">2FA Ověření</span>
              <span className="hidden sm:inline sm:col-span-2">Poslední přihlášení</span>
              <span className="col-span-4 sm:col-span-1 text-right">Akce</span>
            </div>

            {users.map(u => (
              <div
                key={u.id}
                className="p-3.5 text-xs sm:text-sm grid grid-cols-12 gap-2 items-center hover:bg-muted/30 transition-colors"
              >
                <div className="col-span-5 sm:col-span-4 flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                    {u.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-foreground truncate">{u.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                  </div>
                </div>

                <div className="col-span-3 sm:col-span-3">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-muted text-foreground">
                    {u.role}
                  </span>
                </div>

                <div className="hidden sm:inline sm:col-span-2 text-xs">
                  {u.twoFactor ? (
                    <span className="text-emerald-600 font-semibold flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Aktivní
                    </span>
                  ) : (
                    <span className="text-amber-600 font-semibold">Nevyžádáno</span>
                  )}
                </div>

                <div className="hidden sm:inline sm:col-span-2 text-xs text-muted-foreground">
                  {u.lastLogin}
                </div>

                <div className="col-span-4 sm:col-span-1 flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction(`Správa účtu ${u.name}`)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                    aria-label="Nastavení uživatele"
                  >
                    <MoreHorizontal className="w-4 h-4" />
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
