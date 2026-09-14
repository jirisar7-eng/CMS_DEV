"use client";

import React, { useState } from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  Paintbrush, 
  Check, 
  Palette, 
  Sparkles, 
  Sliders, 
  Eye, 
  Plus, 
  CheckCircle2,
  RefreshCw
} from 'lucide-react';

export default function ThemesPage() {
  const [selectedTheme, setSelectedTheme] = useState<string>('modern-clean');

  const themes = [
    {
      id: 'modern-clean',
      name: 'Modern Clean (Výchozí)',
      description: 'Čistý a minimalistický design s důrazem na vysoký kontrast a vzdušné rozvržení.',
      primaryColor: '#2563eb',
      accentColor: '#0ea5e9',
      neutralBg: '#f8fafc',
      active: true,
    },
    {
      id: 'corporate-slate',
      name: 'Corporate Slate',
      description: 'Profesionální korporátní styl s tmavě modrými a břidlicovými tóny.',
      primaryColor: '#0f172a',
      accentColor: '#38bdf8',
      neutralBg: '#f1f5f9',
      active: false,
    },
    {
      id: 'warm-editorial',
      name: 'Warm Editorial',
      description: 'Elegantní magazínový styl s teplou typografií a jemnými zemitými akcenty.',
      primaryColor: '#7c2d12',
      accentColor: '#d97706',
      neutralBg: '#fafaf9',
      active: false,
    },
  ];

  return (
    <CapabilityShell
      group="DESIGN"
      title="Vzhledy a Theme Packy"
      description="Správa vizuální identity, designových tokenů, barevných schémat a typografických sad webu."
      status="UI PŘIPRAVENO"
      helpKey="design.themes.view"
      emptyTitle="Zatím nebyl nainstalován žádný Theme Pack"
      emptyDescription="Nainstalujte výchozí Synthesis Theme Pack nebo vytvořte vlastní sadu stylů."
      emptyActionLabel="Nainstalovat výchozí motiv"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Dostupné Theme Packy</h3>
            <button
              type="button"
              onClick={() => handleUnfinishedAction('Vytvořit nový Theme Pack')}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nový Theme Pack</span>
            </button>
          </div>

          {/* Themes Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {themes.map(theme => (
              <div
                key={theme.id}
                className={`p-5 rounded-2xl border bg-card shadow-xs flex flex-col justify-between space-y-4 transition-all ${
                  selectedTheme === theme.id
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border hover:border-border/80'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-bold text-foreground">{theme.name}</h4>
                    {selectedTheme === theme.id ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Aktivní
                      </span>
                    ) : null}
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {theme.description}
                  </p>

                  {/* Color Palette Preview */}
                  <div className="flex items-center gap-2 pt-2">
                    <div
                      className="w-8 h-8 rounded-lg shadow-2xs border border-border"
                      style={{ backgroundColor: theme.primaryColor }}
                      title="Primární barva"
                    />
                    <div
                      className="w-8 h-8 rounded-lg shadow-2xs border border-border"
                      style={{ backgroundColor: theme.accentColor }}
                      title="Akcentní barva"
                    />
                    <div
                      className="w-8 h-8 rounded-lg shadow-2xs border border-border"
                      style={{ backgroundColor: theme.neutralBg }}
                      title="Podklad"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-2">
                  {selectedTheme !== theme.id ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTheme(theme.id);
                        handleUnfinishedAction(`Aktivovat motiv „${theme.name}“`);
                      }}
                      className="w-full py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      Aktivovat tento motiv
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleUnfinishedAction('Upravit design tokeny')}
                      className="w-full py-2 text-xs font-semibold rounded-xl border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center justify-center gap-1.5"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Upravit tokeny motivu</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
