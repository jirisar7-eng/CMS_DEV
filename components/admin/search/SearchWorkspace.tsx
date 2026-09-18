'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  RefreshCw, 
  Database, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  Info,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';

interface SearchWorkspaceProps {
  projectId?: string | null;
}

interface IndexStatusData {
  indexedDocuments: number;
  indexVersion: string;
}

export function SearchWorkspace({ projectId }: SearchWorkspaceProps) {
  const [statusData, setStatusData] = useState<IndexStatusData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!!projectId);
  const [isReindexing, setIsReindexing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successFeedback, setSuccessFeedback] = useState<string | null>(null);

  const fetchIndexStatus = useCallback(async () => {
    if (!projectId) {
      setStatusData(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/projects/${encodeURIComponent(projectId)}/search`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          setError('Nejste přihlášeni nebo vypršela vaše relace.');
        } else if (res.status === 403) {
          setError('Nemáte oprávnění k přístupu ke správě vyhledávání.');
        } else if (res.status === 404) {
          setError('Požadovaný projekt nebyl nalezen nebo není aktivní.');
        } else if (res.status === 503) {
          setError('Služba vyhledávání je dočasně nedostupná.');
        } else {
          setError('Nastala chyba při načítání stavu vyhledávacího indexu.');
        }
        setStatusData(null);
        return;
      }

      const data = await res.json();
      setStatusData({
        indexedDocuments: typeof data.indexedDocuments === 'number' ? data.indexedDocuments : 0,
        indexVersion: data.indexVersion || 'search_v1',
      });
    } catch {
      setError('Nepodařilo se připojit k serveru.');
      setStatusData(null);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchIndexStatus();
  }, [fetchIndexStatus]);

  const handleReindex = async () => {
    if (!projectId || isReindexing) return;

    setIsReindexing(true);
    setError(null);
    setSuccessFeedback(null);

    try {
      const res = await fetch(`/api/admin/projects/${encodeURIComponent(projectId)}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          setError('Nejste přihlášeni nebo vypršela vaše relace.');
        } else if (res.status === 403) {
          setError('Nemáte oprávnění k přeindexování vyhledávacího indexu.');
        } else if (res.status === 404) {
          setError('Požadovaný projekt nebyl nalezen nebo není aktivní.');
        } else if (res.status === 503) {
          setError('Přeindexování selhalo: vyhledávací služba je nedostupná.');
        } else {
          setError('Při reindexaci došlo k neočekávané chybě.');
        }
        return;
      }

      const data = await res.json();
      const count = typeof data.indexedCount === 'number' ? data.indexedCount : 0;
      setSuccessFeedback(`Indexace byla úspěšně dokončena. Zaindexováno ${count} ${count === 1 ? 'stránka' : (count >= 2 && count <= 4 ? 'stránky' : 'stránek')}.`);
      setStatusData({
        indexedDocuments: count,
        indexVersion: data.indexVersion || 'search_v1',
      });
    } catch {
      setError('Během komunikace se serverem nastala chyba spojení.');
    } finally {
      setIsReindexing(false);
    }
  };

  return (
    <CapabilityShell
      group="OBSAH"
      title="Vyhledávání a indexace"
      description="Správa fulltextového vyhledávače, indexace stránek a správa search indexu."
      status="ZÁKLAD"
      helpKey="content.search.view"
      emptyTitle="Projekt není vybrán"
      emptyDescription="Pro správu vyhledávacího indexu nejprve vyberte aktivní projekt."
    >
      {() => (
        <div className="space-y-6" id="search-workspace">
          {!projectId ? (
            <div className="p-6 rounded-2xl border border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 flex items-start gap-4">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold">Projekt není vybrán</h3>
                <p className="text-xs text-muted-foreground">
                  Pro správu vyhledávacího indexu nejprve vyberte aktivní projekt v záhlaví administrace.
                </p>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive flex items-center justify-between gap-3 text-xs font-medium">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                  <button
                    type="button"
                    onClick={fetchIndexStatus}
                    className="underline hover:no-underline font-semibold text-xs shrink-0"
                  >
                    Zkusit znovu
                  </button>
                </div>
              )}

              {successFeedback && (
                <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-3 text-xs font-medium">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{successFeedback}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSuccessFeedback(null)}
                    className="text-muted-foreground hover:text-foreground text-xs font-bold"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Index Status Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-semibold">Zaindexováno dokumentů</span>
                    <Database className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold text-foreground">
                    {isLoading ? (
                      <span className="text-muted-foreground text-base animate-pulse">Načítání...</span>
                    ) : (
                      `${statusData?.indexedDocuments ?? 0} ${
                        (statusData?.indexedDocuments ?? 0) === 1
                          ? 'dokument'
                          : (statusData?.indexedDocuments ?? 0) >= 2 && (statusData?.indexedDocuments ?? 0) <= 4
                          ? 'dokumenty'
                          : 'dokumentů'
                      }`
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
                    Verze indexu: {statusData?.indexVersion || 'search_v1'}
                  </span>
                </div>

                <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-semibold">Analytika vyhledávání</span>
                    <Search className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="text-sm font-semibold text-muted-foreground pt-1">
                    Nedostupné
                  </div>
                  <span className="text-[11px] text-muted-foreground leading-relaxed block">
                    Analytika vyhledávacích dotazů zatím není součástí Search Foundation.
                  </span>
                </div>

                <div className="p-5 rounded-2xl border border-border bg-card shadow-xs flex flex-col justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground font-semibold">Správa search indexu</span>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Sestaví nový deterministický index ze všech publikovaných veřejných stránek.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleReindex}
                    disabled={isReindexing || isLoading}
                    className="mt-4 w-full py-2.5 px-4 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center gap-2 shadow-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isReindexing || isLoading ? 'animate-spin' : ''}`} />
                    <span>{isReindexing ? 'Probíhá indexace...' : 'Přeindexovat obsah'}</span>
                  </button>
                </div>
              </div>

              {/* Information Panel */}
              <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-3">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Vlastnosti Search Foundation</span>
                </h3>
                <ul className="text-xs text-muted-foreground space-y-2 list-disc list-inside">
                  <li>Automatické filtrování: indexují se výhradně publikované revize stránek s veřejnou viditelností (<span className="font-mono text-foreground">PUBLIC</span>).</li>
                  <li>Bezpečnostní vyřazení (fail-closed): koncepty, archivy, stránky s heslem, interní stránky i stránky s <span className="font-mono text-foreground">noIndex</span> jsou z indexu striktně vyloučeny.</li>
                  <li>Allowlist extrakce: textový extraktor zpracovává pouze povolená obsahová pole bez interních ID a parametrů modulů.</li>
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </CapabilityShell>
  );
}
