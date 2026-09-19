'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import {
  Globe,
  Search,
  Share2,
  FileCode,
  Save,
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  Clock
} from 'lucide-react';

interface SeoWorkspaceProps {
  projectId?: string | null;
}

interface SeoSettingsData {
  defaultTitle?: string | null;
  titleTemplate?: string | null;
  defaultDescription?: string | null;
  defaultOgImage?: string | null;
  robotsTxt?: string | null;
}

export function SeoWorkspace({ projectId }: SeoWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'opengraph' | 'sitemap' | 'robots'>('general');
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(projectId));
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [defaultTitle, setDefaultTitle] = useState<string>('');
  const [titleTemplate, setTitleTemplate] = useState<string>('%s | Web');
  const [defaultDescription, setDefaultDescription] = useState<string>('');
  const [defaultOgImage, setDefaultOgImage] = useState<string>('');
  const [robotsTxt, setRobotsTxt] = useState<string>('User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/');

  useEffect(() => {
    if (!projectId) {
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    const fetchSeoSettings = async (projId: string, signal?: AbortSignal) => {
      try {
        const res = await fetch(`/api/admin/projects/${encodeURIComponent(projId)}/seo`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal,
        });

        if (!res.ok) {
          if (res.status === 401) {
            return { error: 'Nejste přihlášeni nebo vypršela vaše relace.' };
          } else if (res.status === 403) {
            return { error: 'Nemáte oprávnění k prohlížení SEO nastavení (seo.read).' };
          } else if (res.status === 404) {
            return { error: 'Projekt nebyl nalezen.' };
          } else {
            return { error: 'Nepodařilo se načíst SEO konfiguraci ze serveru.' };
          }
        }

        const data: SeoSettingsData = await res.json();
        return { data };
      } catch (err: unknown) {
        if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          return {};
        }
        return { error: 'Chyba při komunikaci se serverem.' };
      }
    };

    fetchSeoSettings(projectId, controller.signal).then((result) => {
      if (!isMounted || controller.signal.aborted) return;
      if (result.error) {
        setErrorMessage(result.error);
      } else if (result.data) {
        setDefaultTitle(result.data.defaultTitle || '');
        setTitleTemplate(result.data.titleTemplate || '%s | Web');
        setDefaultDescription(result.data.defaultDescription || '');
        setDefaultOgImage(result.data.defaultOgImage || '');
        setRobotsTxt(result.data.robotsTxt || 'User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/');
        setErrorMessage(null);
      }
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [projectId]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!projectId) return;

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const payload = {
        defaultTitle: defaultTitle.trim() || null,
        titleTemplate: titleTemplate.trim() || null,
        defaultDescription: defaultDescription.trim() || null,
        defaultOgImage: defaultOgImage.trim() || null,
        robotsTxt: robotsTxt.trim() || null,
      };

      const res = await fetch(`/api/admin/projects/${encodeURIComponent(projectId)}/seo`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        if (res.status === 401) {
          setErrorMessage('Nejste přihlášeni nebo vypršela relace.');
        } else if (res.status === 403) {
          setErrorMessage('Nemáte oprávnění pro uložení SEO nastavení (seo.manage_defaults).');
        } else {
          const json = await res.json().catch(() => ({}));
          setErrorMessage(json.error || 'Uložení SEO nastavení se nezdařilo.');
        }
        return;
      }

      const savedData: SeoSettingsData = await res.json();
      setDefaultTitle(savedData.defaultTitle || '');
      setTitleTemplate(savedData.titleTemplate || '%s | Web');
      setDefaultDescription(savedData.defaultDescription || '');
      setDefaultOgImage(savedData.defaultOgImage || '');
      setRobotsTxt(savedData.robotsTxt || '');
      setSuccessMessage('SEO konfigurace byla úspěšně uložena.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch {
      setErrorMessage('Nepodařilo se uložit data na server.');
    } finally {
      setIsSaving(false);
    }
  };

  const computedPreviewTitle = titleTemplate
    ? (titleTemplate.includes('%s')
        ? titleTemplate.replace('%s', defaultTitle || 'Název stránky')
        : titleTemplate)
    : (defaultTitle || 'Název stránky');

  return (
    <CapabilityShell
      group="OBSAH"
      title="SEO a metadata"
      description="Globální optimalizace pro vyhledávače, Open Graph metadata a konfigurace robots.txt."
      status="ZÁKLAD"
      helpKey="content.seo.view"
    >
      {() => {
        if (!projectId) {
          return (
            <div className="p-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 text-amber-900 dark:text-amber-200 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm">Projekt není vybrán</h4>
                <p className="text-xs mt-1 text-muted-foreground">
                  Pro správu globálního SEO nastavení a robots.txt vyberte aktivní projekt v záhlaví administrace.
                </p>
              </div>
            </div>
          );
        }

        if (isLoading) {
          return (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-xs">Načítání SEO konfigurace...</p>
            </div>
          );
        }

        return (
          <div className="space-y-6">
            {/* Feedback messages */}
            {errorMessage && (
              <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-xl border border-border w-fit">
              {[
                { key: 'general', label: 'Základní SEO', icon: Globe },
                { key: 'opengraph', label: 'Sociální sítě (Open Graph)', icon: Share2 },
                { key: 'sitemap', label: 'Sitemap.xml', icon: Search },
                { key: 'robots', label: 'Robots.txt', icon: FileCode },
              ].map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key as any)}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                      activeTab === tab.key
                        ? 'bg-card text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab 1: General SEO */}
            {activeTab === 'general' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <form onSubmit={handleSave} className="lg:col-span-2 p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
                  <h3 className="text-sm font-bold text-foreground">Globální meta šablona</h3>

                  <div className="space-y-4 text-xs sm:text-sm">
                    <div>
                      <label className="block font-semibold text-foreground mb-1">
                        Výchozí formát titulku (Title Template)
                      </label>
                      <input
                        type="text"
                        value={titleTemplate}
                        onChange={(e) => setTitleTemplate(e.target.value)}
                        placeholder="%s | Název webu"
                        className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs"
                      />
                      <span className="text-[11px] text-muted-foreground mt-1 block">
                        Zástupný symbol <code>%s</code> bude nahrazen reálným titulkem konkrétní stránky.
                      </span>
                    </div>

                    <div>
                      <label className="block font-semibold text-foreground mb-1">
                        Výchozí titulek (Default Title)
                      </label>
                      <input
                        type="text"
                        value={defaultTitle}
                        onChange={(e) => setDefaultTitle(e.target.value)}
                        placeholder="Např. Hlavní stránka nebo Název projektu"
                        className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs"
                      />
                      <span className="text-[11px] text-muted-foreground mt-1 block">
                        Použije se jako náhradní titulek v případě, že stránka nemá vlastní meta titulek.
                      </span>
                    </div>

                    <div>
                      <label className="block font-semibold text-foreground mb-1">
                        Výchozí meta popis (Description)
                      </label>
                      <textarea
                        rows={3}
                        value={defaultDescription}
                        onChange={(e) => setDefaultDescription(e.target.value)}
                        placeholder="Popis webu zobrazovaný ve vyhledávačích pokud stránka nemá vlastní popis..."
                        className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs leading-relaxed"
                      />
                    </div>

                    <div className="p-3.5 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-foreground block mb-0.5">Kanonické URL adresy</span>
                        <span>
                          Kanonické URL (canonical URL) jsou spravovány specificky na úrovni jednotlivých stránek v editoru obsahu pro zajištění přesného cílení.
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      <span>{isSaving ? 'Ukládám...' : 'Uložit změny'}</span>
                    </button>
                  </div>
                </form>

                {/* Google Search Live Preview */}
                <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-3 h-fit">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Živý náhled ve vyhledávači
                  </h3>
                  <div className="p-4 rounded-xl border border-border/80 bg-background space-y-1.5 text-xs">
                    <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-mono text-[11px] truncate">
                      <span>vas-web.cz</span>
                      <span>›</span>
                      <span>stranka</span>
                    </div>
                    <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer break-words">
                      {computedPreviewTitle}
                    </h4>
                    <p className="text-[11px] text-muted-foreground line-clamp-3 leading-relaxed break-words">
                      {defaultDescription || 'Zadejte výchozí meta popis pro zobrazení reálného náhledu textu ve výsledcích vyhledávání.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Open Graph */}
            {activeTab === 'opengraph' && (
              <form onSubmit={handleSave} className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-foreground">Open Graph & sociální sítě</h3>
                <p className="text-xs text-muted-foreground">
                  Nastavení výchozího náhledu při sdílení odkazů vašeho webu na sociálních sítích (Facebook, X / Twitter, LinkedIn).
                </p>

                <div className="space-y-4 text-xs sm:text-sm max-w-xl">
                  <div>
                    <label className="block font-semibold text-foreground mb-1">
                      Výchozí náhledový obrázek (OG:Image)
                    </label>
                    <input
                      type="text"
                      value={defaultOgImage}
                      onChange={(e) => setDefaultOgImage(e.target.value)}
                      placeholder="/og-cover.jpg nebo https://..."
                      className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs font-mono"
                    />
                    <span className="text-[11px] text-muted-foreground mt-1 block">
                      Doporučený rozměr 1200 × 630 px.
                    </span>
                  </div>

                  {defaultOgImage && (
                    <div className="p-3 rounded-xl border border-border bg-muted/20">
                      <span className="text-[11px] font-semibold text-muted-foreground block mb-2">Náhled karty:</span>
                      <div className="rounded-lg border border-border overflow-hidden bg-background max-w-sm">
                        <div className="h-32 bg-muted/50 flex items-center justify-center overflow-hidden">
                          <img
                            src={defaultOgImage}
                            alt="OG Preview"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                            }}
                          />
                        </div>
                        <div className="p-2.5 space-y-1">
                          <p className="text-xs font-bold truncate">{computedPreviewTitle}</p>
                          <p className="text-[10px] text-muted-foreground line-clamp-2">{defaultDescription || 'Výchozí popis webu'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>{isSaving ? 'Ukládám...' : 'Uložit změny'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* Tab 3: Sitemap */}
            {activeTab === 'sitemap' && (
              <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground">Generátor Sitemap.xml</h3>
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold text-[11px] flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Plánovaný runtime</span>
                  </span>
                </div>

                <p className="text-muted-foreground leading-relaxed">
                  Automatický generátor souboru <code>sitemap.xml</code> a odpovídající veřejná routa zatím nejsou v tomto runtime prostředí aktivní.
                  Generování sitemapy z publikovaných stránek a směrování bude součástí navazujícího specializovaného subsystemu.
                </p>

                <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-2">
                  <span className="font-semibold text-foreground block">Architektonický stav sitemapy</span>
                  <p className="text-muted-foreground text-[11px]">
                    Pro zamezení nesrovnalostí nejsou v tomto rozhraní simulována žádná fiktivní data stránek.
                    Po nasazení sitemap enginu se zde zobrazí skutečné statistiky indexovaných stránek a přímý odkaz na generovaný XML soubor.
                  </p>
                </div>
              </div>
            )}

            {/* Tab 4: Robots.txt */}
            {activeTab === 'robots' && (
              <form onSubmit={handleSave} className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground">Obsah souboru robots.txt</h3>
                  <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold text-[11px] flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Konfigurace uložena v DB (veřejná routa plánována)</span>
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-muted/40 border border-border text-muted-foreground flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-foreground block mb-0.5">Runtime stav robots.txt</span>
                    <span>
                      Zde definovaná pravidla jsou perzistována v databázi pro tento projekt (pole <code>robotsTxt</code>).
                      Veřejný endpoint <code>/robots.txt</code> zatím není v runtime aktivní; pravidla budou servírována po nasazení veřejného handleru.
                    </span>
                  </div>
                </div>

                <textarea
                  rows={6}
                  value={robotsTxt}
                  onChange={(e) => setRobotsTxt(e.target.value)}
                  className="w-full font-mono text-xs p-3.5 rounded-xl border border-input bg-background text-foreground"
                  placeholder={`User-agent: *\nAllow: /\nDisallow: /admin/`}
                />

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>{isSaving ? 'Ukládám...' : 'Uložit robots.txt'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        );
      }}
    </CapabilityShell>
  );
}
