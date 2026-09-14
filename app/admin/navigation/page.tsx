"use client";

import React, { useState } from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  Plus, 
  Menu as MenuIcon, 
  ChevronRight, 
  MoveUp, 
  MoveDown, 
  ExternalLink, 
  FileText, 
  Eye, 
  Settings2, 
  Trash2,
  Check
} from 'lucide-react';

export default function NavigationPage() {
  const [selectedMenu, setSelectedMenu] = useState<'header' | 'footer' | 'mobile'>('header');

  const menuItems = [
    { id: 1, title: 'Domů', target: '/', type: 'Interní stránka', depth: 0, visible: true },
    { id: 2, title: 'O projektu', target: '/o-projektu', type: 'Interní stránka', depth: 0, visible: true },
    { id: 3, title: 'Studio & Vývoj', target: '/o-projektu/studio', type: 'Interní stránka', depth: 1, visible: true },
    { id: 4, title: 'Roadmapa', target: '/roadmapa', type: 'Interní stránka', depth: 0, visible: true },
    { id: 5, title: 'Služby', target: '/sluzby', type: 'Interní stránka', depth: 0, visible: true },
    { id: 6, title: 'GitHub repozitář', target: 'https://github.com/jirisar7-eng/CMS_DEV', type: 'Externí odkaz', depth: 0, visible: true },
    { id: 7, title: 'Kontakt', target: '/kontakt', type: 'Interní stránka', depth: 0, visible: true },
  ];

  return (
    <CapabilityShell
      group="OBSAH"
      title="Správa navigace"
      description="Konfigurace hlavního navigačního menu, struktury odkazů v záhlaví a patičce webu."
      status="UI PŘIPRAVENO"
      helpKey="content.navigation.view"
      emptyTitle="V tomto menu zatím nejsou žádné navigační položky"
      emptyDescription="Kliknutím na tlačítko níže přidejte první odkaz do navigačního menu."
      emptyActionLabel="Přidat první položku"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6">
          {/* Menu Selector & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-xl border border-border">
              {[
                { key: 'header', label: 'Hlavní menu (Záhlaví)' },
                { key: 'footer', label: 'Patička webu' },
                { key: 'mobile', label: 'Mobilní navigace' },
              ].map(menu => (
                <button
                  key={menu.key}
                  type="button"
                  onClick={() => setSelectedMenu(menu.key as any)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    selectedMenu === menu.key
                      ? 'bg-card text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {menu.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleUnfinishedAction('Přidat novou položku menu')}
                className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px] cursor-pointer inline-flex items-center gap-2 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Přidat položku menu</span>
              </button>
            </div>
          </div>

          {/* Nav Items Tree List */}
          <div className="rounded-2xl border border-border bg-card shadow-xs divide-y divide-border overflow-hidden">
            <div className="p-3 bg-muted/40 text-xs font-bold text-muted-foreground grid grid-cols-12 gap-2">
              <span className="col-span-5 sm:col-span-4">Název položky</span>
              <span className="col-span-4 sm:col-span-4">Cíl odkazu</span>
              <span className="hidden sm:inline sm:col-span-2">Typ cíle</span>
              <span className="col-span-3 sm:col-span-2 text-right">Akce</span>
            </div>

            {menuItems.map(item => (
              <div
                key={item.id}
                className="p-3 sm:p-4 text-xs sm:text-sm grid grid-cols-12 gap-2 items-center hover:bg-muted/30 transition-colors"
              >
                <div className="col-span-5 sm:col-span-4 flex items-center gap-2 min-w-0" style={{ paddingLeft: `${item.depth * 20}px` }}>
                  {item.depth > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  <MenuIcon className="w-4 h-4 text-muted-foreground shrink-0 cursor-grab" />
                  <span className="font-bold text-foreground truncate">{item.title}</span>
                </div>

                <div className="col-span-4 sm:col-span-4 text-muted-foreground truncate font-mono text-xs">
                  {item.target}
                </div>

                <div className="hidden sm:inline sm:col-span-2">
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/50">
                    {item.type}
                  </span>
                </div>

                <div className="col-span-3 sm:col-span-2 flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction(`Upravit položku „${item.title}“`)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                    aria-label="Upravit"
                  >
                    <Settings2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction(`Odstranit položku „${item.title}“`)}
                    className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10"
                    aria-label="Smazat"
                  >
                    <Trash2 className="w-4 h-4" />
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
