'use client';

import React, { useState, useEffect } from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import {
  Sliders,
  FolderKanban,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Globe,
  Clock,
  Mail,
  Calendar,
  ShieldCheck,
  Building,
} from 'lucide-react';

interface SettingsWorkspaceProps {
  initialProjectId?: string | null;
}

interface SystemSettingsState {
  'system.instance_name': string;
  'system.default_locale': string;
  'system.default_timezone': string;
}

interface ProjectSettingsState {
  'project.public_url': string;
  'project.default_locale': string;
  'project.default_timezone': string;
  'project.date_format': string;
  'project.contact_email': string;
}

export function SettingsWorkspace({ initialProjectId }: SettingsWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'system' | 'project'>('system');
  const [projectId, setProjectId] = useState<string | null>(initialProjectId || null);

  // System settings state
  const [systemLoading, setSystemLoading] = useState<boolean>(true);
  const [systemSaving, setSystemSaving] = useState<boolean>(false);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [systemSuccess, setSystemSuccess] = useState<string | null>(null);
  const [systemSettings, setSystemSettings] = useState<SystemSettingsState>({
    'system.instance_name': 'Synthesis CMS',
    'system.default_locale': 'cs',
    'system.default_timezone': 'Europe/Prague',
  });

  // Project settings state
  const [projectLoading, setProjectLoading] = useState<boolean>(Boolean(initialProjectId));
  const [projectSaving, setProjectSaving] = useState<boolean>(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectSuccess, setProjectSuccess] = useState<string | null>(null);
  const [projectSettings, setProjectSettings] = useState<ProjectSettingsState>({
    'project.public_url': '',
    'project.default_locale': 'cs',
    'project.default_timezone': 'Europe/Prague',
    'project.date_format': 'DD.MM.YYYY',
    'project.contact_email': '',
  });

  // Sync project ID from cookie
  useEffect(() => {
    let isMounted = true;
    const checkProjectCookie = () => {
      const match = document.cookie.match(/(?:^|;)\s*syn_project_id=([^;]*)/);
      const cookieId = match ? match[1].trim() : null;
      if (isMounted && cookieId && cookieId !== projectId) {
        setProjectId(cookieId);
      }
    };
    checkProjectCookie();
    const interval = setInterval(checkProjectCookie, 1500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [projectId]);

  // Initial Load Effect for System Settings
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const fetchSystem = async () => {
      try {
        const res = await fetch('/api/admin/settings', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });

        if (!res.ok) {
          if (res.status === 401) {
            return { error: 'Pro zobrazení systémového nastavení se musíte přihlásit.' };
          }
          if (res.status === 403) {
            return {
              error: 'Pro zobrazení a správu systémového nastavení je vyžadováno oprávnění správce systému (system.manage).',
            };
          }
          const data = await res.json().catch(() => ({}));
          return { error: data.message || 'Nepodařilo se načíst systémové nastavení.' };
        }

        const data = await res.json();
        return { data: data.settings };
      } catch (err: any) {
        if (controller.signal.aborted || err.name === 'AbortError') {
          return {};
        }
        return { error: 'Chyba při komunikaci se serverem při načítání systémového nastavení.' };
      }
    };

    fetchSystem().then((result) => {
      if (!isMounted || controller.signal.aborted) return;
      if (result.error) {
        setSystemError(result.error);
      } else if (result.data) {
        setSystemSettings({
          'system.instance_name': result.data['system.instance_name'] ?? 'Synthesis CMS',
          'system.default_locale': result.data['system.default_locale'] ?? 'cs',
          'system.default_timezone': result.data['system.default_timezone'] ?? 'Europe/Prague',
        });
        setSystemError(null);
      }
      setSystemLoading(false);
    });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  // Project Settings Load Effect
  useEffect(() => {
    if (!projectId) {
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    const fetchProject = async (pId: string) => {
      try {
        const res = await fetch(`/api/admin/projects/${encodeURIComponent(pId)}/settings`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });

        if (!res.ok) {
          if (res.status === 401) {
            return { error: 'Pro zobrazení projektového nastavení se musíte přihlásit.' };
          }
          if (res.status === 403) {
            return {
              error: 'Pro zobrazení a správu tohoto projektu je vyžadováno oprávnění správce projektu (projects.manage).',
            };
          }
          if (res.status === 404) {
            return { error: 'Vybraný projekt nebyl nalezen.' };
          }
          const data = await res.json().catch(() => ({}));
          return { error: data.message || 'Nepodařilo se načíst projektové nastavení.' };
        }

        const data = await res.json();
        return { data: data.settings };
      } catch (err: any) {
        if (controller.signal.aborted || err.name === 'AbortError') {
          return {};
        }
        return { error: 'Chyba při komunikaci se serverem při načítání projektového nastavení.' };
      }
    };

    fetchProject(projectId).then((result) => {
      if (!isMounted || controller.signal.aborted) return;
      if (result.error) {
        setProjectError(result.error);
      } else if (result.data) {
        setProjectSettings({
          'project.public_url': result.data['project.public_url'] ?? '',
          'project.default_locale': result.data['project.default_locale'] ?? 'cs',
          'project.default_timezone': result.data['project.default_timezone'] ?? 'Europe/Prague',
          'project.date_format': result.data['project.date_format'] ?? 'DD.MM.YYYY',
          'project.contact_email': result.data['project.contact_email'] ?? '',
        });
        setProjectError(null);
      }
      setProjectLoading(false);
    });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [projectId]);

  // Save System Settings
  const handleSaveSystemSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSystemSaving(true);
    setSystemError(null);
    setSystemSuccess(null);

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            'system.instance_name': systemSettings['system.instance_name'],
            'system.default_locale': systemSettings['system.default_locale'],
            'system.default_timezone': systemSettings['system.default_timezone'],
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.validationErrors) {
          const detail = Object.entries(data.validationErrors)
            .map(([k, v]) => `${k}: ${v}`)
            .join('; ');
          throw new Error(`Chyba validace: ${detail}`);
        }
        throw new Error(data.message || 'Uložení systémového nastavení selhalo.');
      }

      setSystemSuccess('Systémové nastavení bylo úspěšně uloženo a zaznamenáno do auditu.');
      setTimeout(() => setSystemSuccess(null), 4000);
    } catch (err: any) {
      setSystemError(err.message || 'Uložení selhalo.');
    } finally {
      setSystemSaving(false);
    }
  };

  // Save Project Settings
  const handleSaveProjectSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) {
      setProjectError('Není vybrán žádný projekt.');
      return;
    }

    setProjectSaving(true);
    setProjectError(null);
    setProjectSuccess(null);

    try {
      const res = await fetch(`/api/admin/projects/${encodeURIComponent(projectId)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            'project.public_url': projectSettings['project.public_url'] || null,
            'project.default_locale': projectSettings['project.default_locale'],
            'project.default_timezone': projectSettings['project.default_timezone'],
            'project.date_format': projectSettings['project.date_format'],
            'project.contact_email': projectSettings['project.contact_email'] || null,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.validationErrors) {
          const detail = Object.entries(data.validationErrors)
            .map(([k, v]) => `${k}: ${v}`)
            .join('; ');
          throw new Error(`Chyba validace: ${detail}`);
        }
        throw new Error(data.message || 'Uložení projektového nastavení selhalo.');
      }

      setProjectSuccess('Projektové nastavení bylo úspěšně uloženo a izolováno pro aktivní projekt.');
      setTimeout(() => setProjectSuccess(null), 4000);
    } catch (err: any) {
      setProjectError(err.message || 'Uložení selhalo.');
    } finally {
      setProjectSaving(false);
    }
  };

  return (
    <CapabilityShell
      group="SYSTÉM"
      title="Nastavení systému a projektů"
      description="Globální parametry instalace Synthesis CMS a specifická konfigurace aktivního projektu."
      status="FUNKČNÍ"
      helpKey="system.settings.view"
    >
      {() => (
        <div className="space-y-6 max-w-4xl">
          {/* Tabs Navigation */}
          <div className="flex border-b border-border gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('system')}
              className={`px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors inline-flex items-center gap-2 ${
                activeTab === 'system'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Globální systémové nastavení</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('project')}
              className={`px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors inline-flex items-center gap-2 ${
                activeTab === 'project'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <FolderKanban className="w-4 h-4" />
              <span>Projektové nastavení</span>
            </button>
          </div>

          {/* SYSTEM SETTINGS TAB */}
          {activeTab === 'system' && (
            <div className="p-6 rounded-2xl border border-border bg-card shadow-xs space-y-6">
              <div className="flex items-start justify-between border-b border-border pb-4">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Building className="w-4 h-4 text-primary" />
                    <span>Globální parametry instance</span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Nastavení platné pro celou instalaci Synthesis CMS. Změny vyžadují oprávnění správce systému (system.manage).
                  </p>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-primary/20 bg-primary/5 text-primary text-[11px] font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>system.manage</span>
                </div>
              </div>

              {systemError && (
                <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Chyba systémového nastavení</span>
                    <span>{systemError}</span>
                  </div>
                </div>
              )}

              {systemSuccess && (
                <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{systemSuccess}</span>
                </div>
              )}

              {systemLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-xs">Načítání systémové konfigurace...</span>
                </div>
              ) : (
                <form onSubmit={handleSaveSystemSettings} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="md:col-span-2">
                      <label className="block font-semibold text-foreground mb-1.5 text-xs">
                        Název systémové instance (system.instance_name)
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={100}
                        value={systemSettings['system.instance_name']}
                        onChange={(e) =>
                          setSystemSettings((prev) => ({
                            ...prev,
                            'system.instance_name': e.target.value,
                          }))
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-foreground text-xs focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                        placeholder="Synthesis CMS"
                      />
                      <span className="text-[11px] text-muted-foreground mt-1 block">
                        Zobrazuje se v záhlaví administrace a systémových hlášeních.
                      </span>
                    </div>

                    <div>
                      <label className="block font-semibold text-foreground mb-1.5 text-xs flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Výchozí systémový jazyk (system.default_locale)</span>
                      </label>
                      <select
                        value={systemSettings['system.default_locale']}
                        onChange={(e) =>
                          setSystemSettings((prev) => ({
                            ...prev,
                            'system.default_locale': e.target.value,
                          }))
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-foreground text-xs focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="cs">Čeština (cs)</option>
                        <option value="en">English (en)</option>
                        <option value="sk">Slovenčina (sk)</option>
                        <option value="de">Deutsch (de)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-foreground mb-1.5 text-xs flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Výchozí systémové časové pásmo (system.default_timezone)</span>
                      </label>
                      <select
                        value={systemSettings['system.default_timezone']}
                        onChange={(e) =>
                          setSystemSettings((prev) => ({
                            ...prev,
                            'system.default_timezone': e.target.value,
                          }))
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-foreground text-xs focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="Europe/Prague">Europe/Prague (Středoevropský čas)</option>
                        <option value="UTC">UTC (Koordinovaný světový čas)</option>
                        <option value="Europe/London">Europe/London (GMT/BST)</option>
                        <option value="America/New_York">America/New_York (EST/EDT)</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border flex items-center justify-end">
                    <button
                      type="submit"
                      disabled={systemSaving}
                      className="px-4 py-2.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2 disabled:opacity-50"
                    >
                      {systemSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      <span>{systemSaving ? 'Ukládání...' : 'Uložit systémové nastavení'}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* PROJECT SETTINGS TAB */}
          {activeTab === 'project' && (
            <div className="p-6 rounded-2xl border border-border bg-card shadow-xs space-y-6">
              <div className="flex items-start justify-between border-b border-border pb-4">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <FolderKanban className="w-4 h-4 text-primary" />
                    <span>Konfigurace aktivního projektu</span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Nastavení platné pouze pro vybraný webový projekt. Izolováno na úrovni databáze.
                  </p>
                </div>
                {projectId && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-primary/20 bg-primary/5 text-primary text-[11px] font-medium">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>projects.manage</span>
                  </div>
                )}
              </div>

              {!projectId ? (
                <div className="py-12 px-6 rounded-xl border border-dashed border-border text-center space-y-3">
                  <FolderKanban className="w-8 h-8 text-muted-foreground mx-auto" />
                  <h4 className="text-sm font-semibold text-foreground">Projekt není vybrán</h4>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    Pro zobrazení a úpravu projektové konfigurace vyberte požadovaný projekt v horním přepínači projektů v navigaci.
                  </p>
                </div>
              ) : (
                <>
                  {projectError && (
                    <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold block">Chyba projektového nastavení</span>
                        <span>{projectError}</span>
                      </div>
                    </div>
                  )}

                  {projectSuccess && (
                    <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{projectSuccess}</span>
                    </div>
                  )}

                  {projectLoading ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      <span className="text-xs">Načítání konfigurace projektu...</span>
                    </div>
                  ) : (
                    <form onSubmit={handleSaveProjectSettings} className="space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="md:col-span-2">
                          <label className="block font-semibold text-foreground mb-1.5 text-xs flex items-center gap-1.5">
                            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>Kanonická veřejná URL webu (project.public_url)</span>
                          </label>
                          <input
                            type="url"
                            value={projectSettings['project.public_url']}
                            onChange={(e) =>
                              setProjectSettings((prev) => ({
                                ...prev,
                                'project.public_url': e.target.value,
                              }))
                            }
                            className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-foreground text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                            placeholder="https://example.com"
                          />
                          <span className="text-[11px] text-muted-foreground mt-1 block">
                            Základní absolutní URL adresa pro generování sitemapy, RSS a kanonických odkazů.
                          </span>
                        </div>

                        <div>
                          <label className="block font-semibold text-foreground mb-1.5 text-xs flex items-center gap-1.5">
                            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>Jazyk projektu (project.default_locale)</span>
                          </label>
                          <select
                            value={projectSettings['project.default_locale']}
                            onChange={(e) =>
                              setProjectSettings((prev) => ({
                                ...prev,
                                'project.default_locale': e.target.value,
                              }))
                            }
                            className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-foreground text-xs focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                          >
                            <option value="cs">Čeština (cs)</option>
                            <option value="en">English (en)</option>
                            <option value="sk">Slovenčina (sk)</option>
                            <option value="de">Deutsch (de)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block font-semibold text-foreground mb-1.5 text-xs flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>Časové pásmo projektu (project.default_timezone)</span>
                          </label>
                          <select
                            value={projectSettings['project.default_timezone']}
                            onChange={(e) =>
                              setProjectSettings((prev) => ({
                                ...prev,
                                'project.default_timezone': e.target.value,
                              }))
                            }
                            className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-foreground text-xs focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                          >
                            <option value="Europe/Prague">Europe/Prague (Středoevropský čas)</option>
                            <option value="UTC">UTC (Koordinovaný světový čas)</option>
                            <option value="Europe/London">Europe/London (GMT/BST)</option>
                            <option value="America/New_York">America/New_York (EST/EDT)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block font-semibold text-foreground mb-1.5 text-xs flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>Formát zobrazení data (project.date_format)</span>
                          </label>
                          <select
                            value={projectSettings['project.date_format']}
                            onChange={(e) =>
                              setProjectSettings((prev) => ({
                                ...prev,
                                'project.date_format': e.target.value,
                              }))
                            }
                            className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-foreground text-xs focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                          >
                            <option value="DD.MM.YYYY">DD.MM.YYYY (např. 28.09.2026)</option>
                            <option value="YYYY-MM-DD">YYYY-MM-DD (např. 2026-09-28)</option>
                            <option value="MM/DD/YYYY">MM/DD/YYYY (např. 09/28/2026)</option>
                            <option value="D. M. YYYY">D. M. YYYY (např. 28. 9. 2026)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block font-semibold text-foreground mb-1.5 text-xs flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>Kontaktní e-mail projektu (project.contact_email)</span>
                          </label>
                          <input
                            type="email"
                            value={projectSettings['project.contact_email']}
                            onChange={(e) =>
                              setProjectSettings((prev) => ({
                                ...prev,
                                'project.contact_email': e.target.value,
                              }))
                            }
                            className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-foreground text-xs focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                            placeholder="kontakt@example.com"
                          />
                        </div>
                      </div>

                      <div className="pt-4 border-t border-border flex items-center justify-end">
                        <button
                          type="submit"
                          disabled={projectSaving}
                          className="px-4 py-2.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2 disabled:opacity-50"
                        >
                          {projectSaving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                          <span>{projectSaving ? 'Ukládání...' : 'Uložit projektové nastavení'}</span>
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </CapabilityShell>
  );
}
