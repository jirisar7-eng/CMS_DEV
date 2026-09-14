"use client";

import React, { useState } from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  Globe, 
  Search, 
  Share2, 
  FileCode, 
  CheckCircle, 
  Save,
  ExternalLink,
  Sparkles
} from 'lucide-react';

export default function SeoPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'opengraph' | 'sitemap' | 'robots'>('general');

  return (
    <CapabilityShell
      group="OBSAH"
      title="SEO a metadata"
      description="Globální optimalizace pro vyhledávače, Open Graph karty pro sociální sítě a správa sitemap.xml."
      status="UI PŘIPRAVENO"
      helpKey="content.seo.view"
      emptyTitle="SEO konfigurace zatím nebyla nastavena"
      emptyDescription="Kliknutím níže načtěte výchozí doporučenou SEO šablonu."
      emptyActionLabel="Inicializovat SEO nastavení"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-xl border border-border w-fit">
            {[
              { key: 'general', label: 'Základní SEO' },
              { key: 'opengraph', label: 'Sociální sítě (Open Graph)' },
              { key: 'sitemap', label: 'Sitemap.xml' },
              { key: 'robots', label: 'Robots.txt' },
            ].map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as any)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  activeTab === tab.key
                    ? 'bg-card text-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab 1: General SEO */}
          {activeTab === 'general' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-foreground">Globální meta šablona</h3>

                <div className="space-y-3 text-xs sm:text-sm">
                  <div>
                    <label className="block font-semibold text-foreground mb-1">
                      Výchozí formát titulku (Title Template)
                    </label>
                    <input
                      type="text"
                      defaultValue="%page_title% | Synthesis CMS"
                      className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs"
                    />
                    <span className="text-[11px] text-muted-foreground mt-1 block">
                      Proměnná <code>%page_title%</code> bude nahrazena reálným titulkem stránky.
                    </span>
                  </div>

                  <div>
                    <label className="block font-semibold text-foreground mb-1">
                      Výchozí meta popis (Description)
                    </label>
                    <textarea
                      rows={3}
                      defaultValue="Moderní, vysoce modulární a bezpečný redakční systém Synthesis CMS pro správu obsahu nové generace."
                      className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs leading-relaxed"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-foreground mb-1">
                      Kanonická doména (Canonical Domain)
                    </label>
                    <input
                      type="text"
                      defaultValue="https://synthesis-cms.dev"
                      className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction('Uložit SEO konfiguraci')}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>Uložit změny</span>
                  </button>
                </div>
              </div>

              {/* Google Search Live Preview */}
              <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-3 h-fit">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Náhled ve vyhledávači Google
                </h3>
                <div className="p-4 rounded-xl border border-border/80 bg-background space-y-1 text-xs">
                  <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-mono text-[11px] truncate">
                    <span>https://synthesis-cms.dev</span>
                    <span>›</span>
                    <span>prehled</span>
                  </div>
                  <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
                    Úvodní stránka | Synthesis CMS
                  </h4>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    Moderní, vysoce modulární a bezpečný redakční systém Synthesis CMS pro správu obsahu nové generace.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Open Graph */}
          {activeTab === 'opengraph' && (
            <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-foreground">Open Graph & Twitter Card konfigurace</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    Výchozí náhledový obrázek (OG:Image)
                  </label>
                  <input
                    type="text"
                    defaultValue="https://synthesis-cms.dev/og-default-cover.webp"
                    className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    Twitter Card typ
                  </label>
                  <select className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs">
                    <option>summary_large_image</option>
                    <option>summary</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Sitemap */}
          {activeTab === 'sitemap' && (
            <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">Automatický generátor Sitemap.xml</h3>
                <span className="text-emerald-600 font-bold flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />
                  <span>Aktivní a validní</span>
                </span>
              </div>
              <p className="text-muted-foreground">
                Sitemap obsahuje 24 publikovaných stránek a aktualizuje se v reálném čase při každé publikaci.
              </p>
              <div className="p-3 rounded-xl bg-muted/60 font-mono text-[11px] text-foreground flex items-center justify-between">
                <span>https://synthesis-cms.dev/sitemap.xml</span>
                <button
                  type="button"
                  onClick={() => handleUnfinishedAction('Otevřít veřejný sitemap.xml')}
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Zobrazit</span>
                </button>
              </div>
            </div>
          )}

          {/* Tab 4: Robots.txt */}
          {activeTab === 'robots' && (
            <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4 text-xs">
              <h3 className="text-sm font-bold text-foreground">Obsah souboru robots.txt</h3>
              <textarea
                rows={5}
                defaultValue={`User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nSitemap: https://synthesis-cms.dev/sitemap.xml`}
                className="w-full font-mono text-xs p-3 rounded-xl border border-input bg-background text-foreground"
              />
            </div>
          )}
        </div>
      )}
    </CapabilityShell>
  );
}
