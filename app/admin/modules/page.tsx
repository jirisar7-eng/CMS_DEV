"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import {
  Power,
  Settings2,
  AlertTriangle,
  RefreshCw,
  Sliders,
  X,
  Check
} from 'lucide-react';

interface PluginStateView {
  pluginId: string;
  projectId: string;
  enabled: boolean;
  config: Record<string, any> | null;
  enabledAt: string | null;
  enabledById: string | null;
  manifest?: {
    id: string;
    name: string;
    version: string;
    description: string;
    category: string;
    type: string;
    dependencies?: { pluginId: string; kind: string; versionRange?: string }[];
    configSchema?: {
      fields: {
        key: string;
        label: string;
        type: string;
        required?: boolean;
        sensitive?: boolean;
        description?: string;
        defaultValue?: any;
        options?: { label: string; value: string }[];
      }[];
    };
  };
  isOrphan?: boolean;
}

export default function ModulesPage() {
  const [projectId, setProjectId] = useState<string | null>(() => {
    if (typeof document !== "undefined") {
      const match = document.cookie.match(/syn_project_id=([^;]+)/);
      return match ? match[1] : null;
    }
    return null;
  });
  const [plugins, setPlugins] = useState<PluginStateView[]>([]);
  const [loading, setLoading] = useState<boolean>(() => {
    if (typeof document !== "undefined") {
      const match = document.cookie.match(/syn_project_id=([^;]+)/);
      return !!(match && match[1]);
    }
    return false;
  });
  const [error, setError] = useState<string | null>(() => {
    if (typeof document !== "undefined") {
      const match = document.cookie.match(/syn_project_id=([^;]+)/);
      if (!match || !match[1]) {
        return "Projekt nevybrán nebo aktivní projekt chybí. Vyberte platný projekt v administraci.";
      }
    }
    return null;
  });

  // Cascade confirm modal
  const [cascadePluginId, setCascadePluginId] = useState<string | null>(null);
  const [cascadeDependents, setCascadeDependents] = useState<string[]>([]);

  // Configure modal
  const [configPlugin, setConfigPlugin] = useState<PluginStateView | null>(null);
  const [configForm, setConfigForm] = useState<Record<string, any>>({});
  const [configError, setConfigError] = useState<string | null>(null);

  const fetchPlugins = useCallback(async (pId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${pId}/plugins`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || 'Failed to fetch project plugins.');
      }
      const data = await res.json();
      setPlugins(data.plugins || []);
    } catch (err: any) {
      setError(err.message || 'Error loading modules.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!projectId) return;

    let isMounted = true;

    (async () => {
      try {
        const res = await fetch(`/api/admin/projects/${projectId}/plugins`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || data.error || "Failed to fetch project plugins.");
        }
        const data = await res.json();
        if (isMounted) {
          setPlugins(data.plugins || []);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Error loading modules.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const handleToggle = async (pluginId: string, currentEnabled: boolean, cascade = false) => {
    if (!projectId) return;
    setError(null);

    const action = currentEnabled ? 'DISABLE' : 'ENABLE';

    try {
      const res = await fetch(`/api/admin/projects/${projectId}/plugins/${pluginId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, cascade }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'PLUGIN_HAS_ACTIVE_DEPENDENTS' && data.details?.activeDependents) {
          setCascadePluginId(pluginId);
          setCascadeDependents(data.details.activeDependents);
          return;
        }
        throw new Error(data.message || data.error || 'Failed to update plugin state.');
      }

      setCascadePluginId(null);
      setCascadeDependents([]);
      await fetchPlugins(projectId);
    } catch (err: any) {
      setError(err.message || 'Error toggling plugin.');
    }
  };

  const handleOpenConfig = (p: PluginStateView) => {
    setConfigPlugin(p);
    setConfigError(null);
    const initialConfig: Record<string, any> = {};
    const fields = p.manifest?.configSchema?.fields || [];
    for (const f of fields) {
      if (f.sensitive) continue;
      initialConfig[f.key] = p.config?.[f.key] ?? f.defaultValue ?? '';
    }
    setConfigForm(initialConfig);
  };

  const handleSaveConfig = async () => {
    if (!projectId || !configPlugin) return;
    setConfigError(null);

    try {
      const res = await fetch(`/api/admin/projects/${projectId}/plugins/${configPlugin.pluginId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CONFIGURE', config: configForm }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to save plugin configuration.');
      }

      setConfigPlugin(null);
      await fetchPlugins(projectId);
    } catch (err: any) {
      setConfigError(err.message || 'Error saving configuration.');
    }
  };

  return (
    <CapabilityShell
      group="SPRÁVA"
      title="Správa modulů a rozšíření"
      description="Aktivace, konfigurace a kontrola závislostí systémových a rozšiřujících modulů Synthesis CMS."
      status="ZÁKLAD"
      helpKey="management.modules.view"
      emptyTitle="V tomto projektu zatím nejsou registrovány žádné moduly"
      emptyDescription="Moduly registrované v globálním registru se zde zobrazí s možností aktivace pro aktuální projekt."
      emptyActionLabel="Obnovit seznam"
    >
      {() => (
        <div className="space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-xs font-bold hover:underline"
              >
                Zavřít
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">
              Registrované moduly ({plugins.length})
            </h3>
            <button
              type="button"
              onClick={() => projectId && fetchPlugins(projectId)}
              disabled={loading}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-muted text-foreground hover:bg-muted/80 transition-colors inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Obnovit</span>
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Načítání modulů...
            </div>
          ) : plugins.length === 0 ? (
            <div className="p-12 border border-dashed border-border rounded-2xl text-center space-y-3">
              <p className="text-sm font-semibold text-foreground">
                V tomto projektu nejsou registrovány žádné moduly
              </p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Přidáním modulů do registru systému získáte možnost jejich aktivace a konfigurace.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {plugins.map(p => {
                const manifest = p.manifest;
                const name = manifest?.name || p.pluginId;
                const desc = manifest?.description || (p.isOrphan ? 'Sirotčí modul (nenačten v registru)' : '');
                const category = manifest?.category || 'NEZAŘAZENO';
                const version = manifest?.version || 'v1.0.0';
                const hasConfigSchema = (manifest?.configSchema?.fields?.length || 0) > 0;

                return (
                  <div
                    key={p.pluginId}
                    className="p-5 rounded-2xl border border-border bg-card shadow-xs flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          {category}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">{version}</span>
                      </div>

                      <h4 className="text-sm font-bold text-foreground">{name}</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>

                      {manifest?.dependencies && manifest.dependencies.length > 0 && (
                        <div className="pt-2">
                          <p className="text-[11px] font-semibold text-muted-foreground">Závislosti:</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {manifest.dependencies.map(d => (
                              <span
                                key={d.pluginId}
                                className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                  d.kind === 'REQUIRED'
                                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                                    : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {d.pluginId} ({d.kind})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 flex items-center justify-between border-t border-border">
                      <button
                        type="button"
                        onClick={() => handleToggle(p.pluginId, p.enabled)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 ${
                          p.enabled
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                            : 'bg-muted text-muted-foreground border border-border'
                        } cursor-pointer`}
                      >
                        <Power className="w-3 h-3" />
                        <span>{p.enabled ? 'Aktivní' : 'Vypnuto'}</span>
                      </button>

                      {hasConfigSchema && (
                        <button
                          type="button"
                          onClick={() => handleOpenConfig(p)}
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg"
                          title="Konfigurace modulu"
                        >
                          <Settings2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Cascade disable confirmation modal */}
          {cascadePluginId && (
            <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
                <div className="flex items-center gap-3 text-amber-600">
                  <AlertTriangle className="w-6 h-6 shrink-0" />
                  <h4 className="font-bold text-foreground">Vyžadována kaskádová deaktivace</h4>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  Deaktivace modulu <span className="font-bold text-foreground">{cascadePluginId}</span> ovlivní
                  následující aktivní moduly, které na něm závisí:
                </p>

                <ul className="space-y-1 bg-muted/50 p-3 rounded-xl border border-border font-mono text-xs">
                  {cascadeDependents.map(dep => (
                    <li key={dep} className="text-foreground">• {dep}</li>
                  ))}
                </ul>

                <p className="text-xs text-muted-foreground">
                  Přejete si provést kaskádovou deaktivaci všech závislých modulů?
                </p>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCascadePluginId(null);
                      setCascadeDependents([]);
                    }}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-border hover:bg-muted"
                  >
                    Zrušit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggle(cascadePluginId, true, true)}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Deaktivovat vše
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Configure Modal */}
          {configPlugin && (
            <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-primary" />
                    <h4 className="font-bold text-foreground">
                      Konfigurace modulu: {configPlugin.manifest?.name || configPlugin.pluginId}
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfigPlugin(null)}
                    className="p-1 text-muted-foreground hover:text-foreground rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {configError && (
                  <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                    {configError}
                  </div>
                )}

                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                  {(configPlugin.manifest?.configSchema?.fields || []).map(f => {
                    if (f.sensitive) {
                      return (
                        <div key={f.key} className="p-3 rounded-xl bg-muted/60 border border-border text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">{f.label || f.key}:</span>{' '}
                          Citlivé údaje musejí být spravovány přes Credential Vault.
                        </div>
                      );
                    }

                    return (
                      <div key={f.key} className="space-y-1">
                        <label className="text-xs font-bold text-foreground block">
                          {f.label || f.key} {f.required && <span className="text-destructive">*</span>}
                        </label>
                        {f.description && (
                          <p className="text-[11px] text-muted-foreground">{f.description}</p>
                        )}

                        {f.type === 'boolean' ? (
                          <input
                            type="checkbox"
                            checked={!!configForm[f.key]}
                            onChange={e => setConfigForm(prev => ({ ...prev, [f.key]: e.target.checked }))}
                            className="rounded border-border"
                          />
                        ) : f.type === 'number' ? (
                          <input
                            type="number"
                            value={configForm[f.key] ?? ''}
                            onChange={e => setConfigForm(prev => ({ ...prev, [f.key]: parseFloat(e.target.value) }))}
                            className="w-full px-3 py-1.5 text-xs rounded-xl border border-border bg-background"
                          />
                        ) : f.type === 'select' ? (
                          <select
                            value={configForm[f.key] ?? ''}
                            onChange={e => setConfigForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                            className="w-full px-3 py-1.5 text-xs rounded-xl border border-border bg-background"
                          >
                            <option value="">-- Vyberte --</option>
                            {f.options?.map(o => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={configForm[f.key] ?? ''}
                            onChange={e => setConfigForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                            className="w-full px-3 py-1.5 text-xs rounded-xl border border-border bg-background"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setConfigPlugin(null)}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-border hover:bg-muted"
                  >
                    Zrušit
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveConfig}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Uložit konfiguraci</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </CapabilityShell>
  );
}
