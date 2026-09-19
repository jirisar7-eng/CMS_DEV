'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import {
  CornerUpRight,
  Plus,
  Search,
  Trash2,
  Edit3,
  CheckCircle2,
  ArrowRight,
  AlertCircle,
  Loader2,
  X,
  Check,
  Power,
  Clock
} from 'lucide-react';

interface RedirectRule {
  id: string;
  projectId: string;
  sourcePath: string;
  targetPath: string;
  type: 'MOVED_PERMANENTLY' | 'FOUND';
  active: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

interface RedirectsWorkspaceProps {
  projectId?: string | null;
}

function getReadableError(errorMsg: string): string {
  switch (errorMsg) {
    case 'RESERVED_ROUTE':
      return 'Původní ani cílová URL nesmí zasahovat do rezervovaných cest systému (/admin, /api, /_next).';
    case 'EXTERNAL_TARGET_NOT_ALLOWED':
      return 'Směrování na externí URL adresy ani nepovolená schémata není dovoleno.';
    case 'SELF_REDIRECT':
      return 'Pravidlo nesmí odkazovat samo na sebe (vytvořilo by okamžitou smyčku).';
    case 'CYCLE_DETECTED':
      return 'Detekováno zacyklení řetězce přesměrování s jiným existujícím pravidlem.';
    case 'INVALID_PATH':
      return 'Neplatný formát URL cesty (musí začínat / a nesmí obsahovat nepovolené znaky).';
    case 'INVALID_REDIRECT_TYPE':
      return 'Neplatný typ přesměrování (povoleny jsou pouze 301 a 302).';
    case 'INVALID_PRIORITY':
      return 'Priorita musí být celé číslo.';
    case 'DUPLICATE_SOURCE_PATH':
      return 'Přesměrování pro tuto výchozí URL adresu v projektu již existuje.';
    case 'NOT_FOUND':
      return 'Požadované pravidlo přesměrování nebylo nalezeno.';
    case 'UNAUTHORIZED':
    case 'FORBIDDEN':
      return 'Nemáte oprávnění k provedení této akce.';
    case 'UNAUTHENTICATED':
      return 'Vaše relace vypršela. Přihlaste se prosím znovu.';
    default:
      return errorMsg || 'Došlo k neočekávané chybě.';
  }
}

export function RedirectsWorkspace({ projectId }: RedirectsWorkspaceProps) {
  const [rules, setRules] = useState<RedirectRule[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(projectId));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Create modal state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSource, setCreateSource] = useState<string>('');
  const [createTarget, setCreateTarget] = useState<string>('');
  const [createType, setCreateType] = useState<'MOVED_PERMANENTLY' | 'FOUND'>('MOVED_PERMANENTLY');
  const [createPriority, setCreatePriority] = useState<number>(0);

  // Edit modal state
  const [editingRule, setEditingRule] = useState<RedirectRule | null>(null);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSource, setEditSource] = useState<string>('');
  const [editTarget, setEditTarget] = useState<string>('');
  const [editType, setEditType] = useState<'MOVED_PERMANENTLY' | 'FOUND'>('MOVED_PERMANENTLY');
  const [editPriority, setEditPriority] = useState<number>(0);
  const [editActive, setEditActive] = useState<boolean>(true);

  // Delete modal state
  const [deletingRule, setDeletingRule] = useState<RedirectRule | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const fetchRedirects = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) return;
    try {
      setErrorMessage(null);
      const res = await fetch(`/api/admin/projects/${encodeURIComponent(projectId)}/redirects`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal,
      });

      if (!res.ok) {
        if (res.status === 401) {
          setErrorMessage('Nejste přihlášeni nebo vypršela vaše relace.');
        } else if (res.status === 403) {
          setErrorMessage('Nemáte oprávnění k prohlížení přesměrování (redirects.read).');
        } else if (res.status === 404) {
          setErrorMessage('Projekt nebyl nalezen.');
        } else {
          setErrorMessage('Nepodařilo se načíst seznam přesměrování.');
        }
        return;
      }

      const data: RedirectRule[] = await res.json();
      setRules(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        return;
      }
      setErrorMessage('Chyba při komunikaci se serverem.');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    const loadInitialRules = async () => {
      try {
        const res = await fetch(`/api/admin/projects/${encodeURIComponent(projectId)}/redirects`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });

        if (!res.ok) {
          if (res.status === 401) {
            return { error: 'Nejste přihlášeni nebo vypršela vaše relace.' };
          } else if (res.status === 403) {
            return { error: 'Nemáte oprávnění k prohlížení přesměrování (redirects.read).' };
          } else if (res.status === 404) {
            return { error: 'Projekt nebyl nalezen.' };
          } else {
            return { error: 'Nepodařilo se načíst seznam přesměrování.' };
          }
        }

        const data: RedirectRule[] = await res.json();
        return { data: Array.isArray(data) ? data : [] };
      } catch (err: unknown) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          return {};
        }
        return { error: 'Chyba při komunikaci se serverem.' };
      }
    };

    loadInitialRules().then((result) => {
      if (!isMounted || controller.signal.aborted) return;
      if (result.error) {
        setErrorMessage(result.error);
      } else if (result.data) {
        setRules(result.data);
        setErrorMessage(null);
      }
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [projectId]);

  const handleOpenCreate = () => {
    setCreateSource('');
    setCreateTarget('');
    setCreateType('MOVED_PERMANENTLY');
    setCreatePriority(0);
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      const res = await fetch(`/api/admin/projects/${encodeURIComponent(projectId)}/redirects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sourcePath: createSource.trim(),
          targetPath: createTarget.trim(),
          type: createType,
          priority: Number(createPriority) || 0,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(getReadableError(json.error));
        return;
      }

      setIsCreateOpen(false);
      setSuccessMessage('Pravidlo přesměrování bylo úspěšně vytvořeno.');
      setTimeout(() => setSuccessMessage(null), 4000);
      await fetchRedirects();
    } catch {
      setCreateError('Nepodařilo se odeslat požadavek na server.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenEdit = (rule: RedirectRule) => {
    setEditingRule(rule);
    setEditSource(rule.sourcePath);
    setEditTarget(rule.targetPath);
    setEditType(rule.type);
    setEditPriority(rule.priority);
    setEditActive(rule.active);
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !editingRule) return;

    setIsUpdating(true);
    setEditError(null);

    try {
      const res = await fetch(
        `/api/admin/projects/${encodeURIComponent(projectId)}/redirects/${encodeURIComponent(editingRule.id)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            sourcePath: editSource.trim(),
            targetPath: editTarget.trim(),
            type: editType,
            priority: Number(editPriority) || 0,
            active: editActive,
          }),
        }
      );

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(getReadableError(json.error));
        return;
      }

      setEditingRule(null);
      setSuccessMessage('Pravidlo přesměrování bylo úspěšně upraveno.');
      setTimeout(() => setSuccessMessage(null), 4000);
      await fetchRedirects();
    } catch {
      setEditError('Nepodařilo se uložit změny na server.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!projectId || !deletingRule) return;

    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/admin/projects/${encodeURIComponent(projectId)}/redirects/${encodeURIComponent(deletingRule.id)}`,
        {
          method: 'DELETE',
          headers: { Accept: 'application/json' },
        }
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErrorMessage(getReadableError(json.error));
      } else {
        setSuccessMessage('Pravidlo přesměrování bylo smazáno.');
        setTimeout(() => setSuccessMessage(null), 4000);
        await fetchRedirects();
      }
    } catch {
      setErrorMessage('Chyba při mazání přesměrování.');
    } finally {
      setIsDeleting(false);
      setDeletingRule(null);
    }
  };

  const filteredRules = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return rules;
    return rules.filter(
      r => r.sourcePath.toLowerCase().includes(q) || r.targetPath.toLowerCase().includes(q)
    );
  }, [rules, searchQuery]);

  return (
    <CapabilityShell
      group="OBSAH"
      title="Přesměrování URL (Redirects)"
      description="Správa pravidel pro automatické přesměrování URL adres (HTTP 301 trvalé a HTTP 302 dočasné) v aktivním projektu."
      status="FUNKČNÍ"
      helpKey="content.redirects.view"
      emptyTitle="Zatím nebyla vytvořena žádná pravidla přesměrování"
      emptyDescription="Vytvořte nové pravidlo pro zachování návštěvnosti a SEO hodnocení ze starých URL adres."
      emptyActionLabel="Vytvořit první přesměrování"
      onEmptyAction={handleOpenCreate}
    >
      {() => {
        if (!projectId) {
          return (
            <div className="p-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 text-amber-900 dark:text-amber-200 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm">Projekt není vybrán</h4>
                <p className="text-xs mt-1 text-muted-foreground">
                  Pro zobrazení a správu přesměrování vyberte aktivní projekt v záhlaví administrace.
                </p>
              </div>
            </div>
          );
        }

        if (isLoading) {
          return (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-xs">Načítání pravidel přesměrování...</p>
            </div>
          );
        }

        return (
          <div className="space-y-6">
            {/* Notifications */}
            {errorMessage && (
              <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="p-1 hover:bg-destructive/10 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {successMessage && (
              <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrovat podle původní nebo cílové cesty..."
                  className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-input bg-card text-foreground"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenCreate}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px] cursor-pointer inline-flex items-center gap-2 shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nové přesměrování</span>
                </button>
              </div>
            </div>

            {/* Table */}
            {filteredRules.length === 0 ? (
              <div className="p-8 text-center rounded-2xl border border-border bg-card text-muted-foreground space-y-2">
                <p className="text-sm font-medium">
                  {searchQuery ? 'Žádná pravidla neodpovídají zadanému filtru.' : 'Nebylo nalezeno žádné aktivní pravidlo přesměrování.'}
                </p>
                {!searchQuery && (
                  <button
                    type="button"
                    onClick={handleOpenCreate}
                    className="text-xs text-primary font-semibold hover:underline cursor-pointer"
                  >
                    Vytvořit první přesměrování
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card shadow-xs divide-y divide-border overflow-hidden">
                <div className="p-3 bg-muted/40 text-xs font-bold text-muted-foreground grid grid-cols-12 gap-2 items-center">
                  <span className="col-span-4 sm:col-span-3">Původní URL (Source)</span>
                  <span className="col-span-4 sm:col-span-3">Cílová URL (Target)</span>
                  <span className="col-span-2 sm:col-span-2">Typ / Priorita</span>
                  <span className="hidden sm:inline sm:col-span-2">Stav / Datum</span>
                  <span className="col-span-2 sm:col-span-2 text-right">Akce</span>
                </div>

                {filteredRules.map(rule => (
                  <div
                    key={rule.id}
                    className="p-3 sm:p-4 text-xs sm:text-sm grid grid-cols-12 gap-2 items-center hover:bg-muted/30 transition-colors"
                  >
                    <div className="col-span-4 sm:col-span-3 font-mono font-bold text-foreground truncate" title={rule.sourcePath}>
                      {rule.sourcePath}
                    </div>

                    <div className="col-span-4 sm:col-span-3 font-mono text-muted-foreground truncate flex items-center gap-1.5" title={rule.targetPath}>
                      <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{rule.targetPath}</span>
                    </div>

                    <div className="col-span-2 sm:col-span-2 text-xs flex flex-col sm:flex-row sm:items-center gap-1">
                      <span className="px-2 py-0.5 rounded bg-muted text-foreground font-semibold w-fit">
                        {rule.type === 'MOVED_PERMANENTLY' ? '301 Trvalé' : '302 Dočasné'}
                      </span>
                      {rule.priority !== 0 && (
                        <span className="text-muted-foreground text-[11px]">
                          p:{rule.priority}
                        </span>
                      )}
                    </div>

                    <div className="hidden sm:flex sm:col-span-2 text-xs flex-col">
                      <span className={`inline-flex items-center gap-1 font-semibold ${rule.active ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${rule.active ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                        {rule.active ? 'Aktivní' : 'Neaktivní'}
                      </span>
                      <span className="text-[11px] text-muted-foreground mt-0.5">
                        {rule.createdAt ? new Date(rule.createdAt).toLocaleDateString('cs-CZ') : '—'}
                      </span>
                    </div>

                    <div className="col-span-2 sm:col-span-2 flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(rule)}
                        aria-label={`Upravit ${rule.sourcePath}`}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingRule(rule)}
                        aria-label={`Smazat ${rule.sourcePath}`}
                        className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Create Modal */}
            {isCreateOpen && (
              <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-foreground">Nové pravidlo přesměrování</h3>
                    <button
                      type="button"
                      onClick={() => setIsCreateOpen(false)}
                      className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {createError && (
                    <div className="p-3 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{createError}</span>
                    </div>
                  )}

                  <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
                    <div>
                      <label className="block font-semibold text-foreground mb-1">
                        Původní URL (Source Path)
                      </label>
                      <input
                        type="text"
                        required
                        value={createSource}
                        onChange={(e) => setCreateSource(e.target.value)}
                        placeholder="/stara-cesta"
                        className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground font-mono"
                      />
                      <span className="text-[11px] text-muted-foreground mt-1 block">
                        Cesta musí začínat lomítkem (např. <code>/stary-clanek</code>).
                      </span>
                    </div>

                    <div>
                      <label className="block font-semibold text-foreground mb-1">
                        Cílová URL (Target Path)
                      </label>
                      <input
                        type="text"
                        required
                        value={createTarget}
                        onChange={(e) => setCreateTarget(e.target.value)}
                        placeholder="/nova-cesta"
                        className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground font-mono"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-foreground mb-1">
                          Typ přesměrování
                        </label>
                        <select
                          value={createType}
                          onChange={(e) => setCreateType(e.target.value as any)}
                          className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground font-medium"
                        >
                          <option value="MOVED_PERMANENTLY">301 Trvalé</option>
                          <option value="FOUND">302 Dočasné</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-semibold text-foreground mb-1">
                          Priorita
                        </label>
                        <input
                          type="number"
                          value={createPriority}
                          onChange={(e) => setCreatePriority(parseInt(e.target.value, 10) || 0)}
                          step="1"
                          className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground font-mono"
                        />
                      </div>
                    </div>

                    <div className="pt-3 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsCreateOpen(false)}
                        className="px-4 py-2 rounded-xl border border-border text-foreground hover:bg-muted font-semibold transition-colors cursor-pointer"
                      >
                        Zrušit
                      </button>
                      <button
                        type="submit"
                        disabled={isCreating}
                        className="px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                        <span>{isCreating ? 'Vytvářím...' : 'Vytvořit'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Edit Modal */}
            {editingRule && (
              <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-foreground">Upravit pravidlo přesměrování</h3>
                    <button
                      type="button"
                      onClick={() => setEditingRule(null)}
                      className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {editError && (
                    <div className="p-3 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{editError}</span>
                    </div>
                  )}

                  <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
                    <div>
                      <label className="block font-semibold text-foreground mb-1">
                        Původní URL (Source Path)
                      </label>
                      <input
                        type="text"
                        required
                        value={editSource}
                        onChange={(e) => setEditSource(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-foreground mb-1">
                        Cílová URL (Target Path)
                      </label>
                      <input
                        type="text"
                        required
                        value={editTarget}
                        onChange={(e) => setEditTarget(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground font-mono"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-foreground mb-1">
                          Typ přesměrování
                        </label>
                        <select
                          value={editType}
                          onChange={(e) => setEditType(e.target.value as any)}
                          className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground font-medium"
                        >
                          <option value="MOVED_PERMANENTLY">301 Trvalé</option>
                          <option value="FOUND">302 Dočasné</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-semibold text-foreground mb-1">
                          Priorita
                        </label>
                        <input
                          type="number"
                          value={editPriority}
                          onChange={(e) => setEditPriority(parseInt(e.target.value, 10) || 0)}
                          step="1"
                          className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground font-mono"
                        />
                      </div>
                    </div>

                    <div className="pt-1">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={editActive}
                          onChange={(e) => setEditActive(e.target.checked)}
                          className="w-4 h-4 rounded border-input text-primary focus:ring-primary"
                        />
                        <span className="font-semibold text-foreground">Pravidlo je aktivní</span>
                      </label>
                    </div>

                    <div className="pt-3 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingRule(null)}
                        className="px-4 py-2 rounded-xl border border-border text-foreground hover:bg-muted font-semibold transition-colors cursor-pointer"
                      >
                        Zrušit
                      </button>
                      <button
                        type="submit"
                        disabled={isUpdating}
                        className="px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isUpdating && <Loader2 className="w-4 h-4 animate-spin" />}
                        <span>{isUpdating ? 'Ukládám...' : 'Uložit změny'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Delete Confirmation Modal */}
            {deletingRule && (
              <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-xl p-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-destructive/10 text-destructive shrink-0">
                      <Trash2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">Smazat přesměrování?</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Opravdu chcete smazat pravidlo z <code className="font-mono text-foreground">{deletingRule.sourcePath}</code> na <code className="font-mono text-foreground">{deletingRule.targetPath}</code>?
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => setDeletingRule(null)}
                      className="px-3.5 py-1.5 text-xs rounded-xl border border-border text-foreground hover:bg-muted font-semibold transition-colors cursor-pointer"
                    >
                      Zrušit
                    </button>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={handleDeleteConfirm}
                      className="px-3.5 py-1.5 text-xs rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>{isDeleting ? 'Mažu...' : 'Smazat pravidlo'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      }}
    </CapabilityShell>
  );
}
