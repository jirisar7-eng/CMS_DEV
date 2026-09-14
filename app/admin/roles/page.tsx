"use client";

import React, { useState } from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  KeyRound, 
  Shield, 
  Check, 
  X as XIcon, 
  Plus, 
  Save, 
  Info 
} from 'lucide-react';

export default function RolesPage() {
  const [selectedRole, setSelectedRole] = useState('editor');

  const roles = [
    { id: 'admin', name: 'Administrátor', desc: 'Plný přístup k celému systému, nastavení a správě uživatelů.', usersCount: 1 },
    { id: 'editor', name: 'Editor obsahu', desc: 'Může vytvářet, upravovat a publikovat stránky a spravovat média.', usersCount: 2 },
    { id: 'author', name: 'Redaktor (Autor)', desc: 'Může zakládat a upravovat koncepty, ale nemůže samostatně publikovat.', usersCount: 3 },
    { id: 'reviewer', name: 'Korektor', desc: 'Přístup pouze ke kontrole textů a komentování rozpracovaných revizí.', usersCount: 1 },
  ];

  const permissionsMatrix = [
    { module: 'Stránky a obsah', read: true, create: true, edit: true, publish: true, delete: false },
    { module: 'Knihovna médií', read: true, create: true, edit: true, publish: true, delete: true },
    { module: 'SEO a přesměrování', read: true, create: true, edit: true, publish: false, delete: false },
    { module: 'Uživatelé a oprávnění', read: true, create: false, edit: false, publish: false, delete: false },
    { module: 'Systémové nastavení', read: false, create: false, edit: false, publish: false, delete: false },
  ];

  return (
    <CapabilityShell
      group="SPRÁVA"
      title="Role a oprávnění (RBAC)"
      description="Nastavení matice přístupových práv podle principu nejnižších privilegií (Zero Trust, Least Privilege)."
      status="UI PŘIPRAVENO"
      helpKey="management.roles.view"
      emptyTitle="Nebyly nalezeny žádné role"
      emptyDescription="Vytvořte novou roli nebo obnovte výchozí systémové role."
      emptyActionLabel="Vytvořit roli"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Roles Selection */}
            <div className="rounded-2xl border border-border bg-card shadow-xs divide-y divide-border overflow-hidden h-fit">
              <div className="p-3 bg-muted/40 text-xs font-bold text-muted-foreground flex justify-between items-center">
                <span>Systémové role</span>
                <button
                  type="button"
                  onClick={() => handleUnfinishedAction('Vytvořit novou roli')}
                  className="text-primary hover:underline text-xs"
                >
                  + Přidat roli
                </button>
              </div>

              {roles.map(r => (
                <div
                  key={r.id}
                  onClick={() => setSelectedRole(r.id)}
                  className={`p-3.5 space-y-1 cursor-pointer transition-colors ${
                    selectedRole === r.id
                      ? 'bg-primary/10 border-l-4 border-l-primary'
                      : 'hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-foreground">{r.name}</span>
                    <span className="text-[10px] bg-muted px-2 py-0.5 rounded text-muted-foreground">
                      {r.usersCount} uživatelů
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{r.desc}</p>
                </div>
              ))}
            </div>

            {/* Permissions Matrix */}
            <div className="lg:col-span-2 p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    Oprávnění pro roli: {roles.find(r => r.id === selectedRole)?.name}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Servery vynucují tyto autorizace na každém koncovém bodu.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleUnfinishedAction('Uložit matici oprávnění')}
                  className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Uložit oprávnění</span>
                </button>
              </div>

              <div className="rounded-xl border border-border overflow-hidden text-xs">
                <div className="grid grid-cols-6 p-2.5 bg-muted/50 font-bold text-muted-foreground">
                  <span className="col-span-2">Modul</span>
                  <span className="text-center">Čtení</span>
                  <span className="text-center">Tvorba</span>
                  <span className="text-center">Úpravy</span>
                  <span className="text-center">Publikace</span>
                </div>

                {permissionsMatrix.map(row => (
                  <div key={row.module} className="grid grid-cols-6 p-2.5 border-t border-border items-center">
                    <span className="col-span-2 font-semibold text-foreground">{row.module}</span>
                    <div className="text-center">
                      <input type="checkbox" defaultChecked={row.read} className="rounded border-input text-primary" />
                    </div>
                    <div className="text-center">
                      <input type="checkbox" defaultChecked={row.create} className="rounded border-input text-primary" />
                    </div>
                    <div className="text-center">
                      <input type="checkbox" defaultChecked={row.edit} className="rounded border-input text-primary" />
                    </div>
                    <div className="text-center">
                      <input type="checkbox" defaultChecked={row.publish} className="rounded border-input text-primary" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
