"use client";

import React, { useState, useEffect, useCallback } from "react";
import { CapabilityShell } from "@/components/admin/CapabilityShell";
import {
  RotateCcw,
  Clock,
  FolderKanban,
  Loader2,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

interface ReleaseItem {
  releaseId: string;
  pageId: string;
  revisionId: string;
  previousRevisionId: string | null;
  pageTitle?: string;
  pageSlug?: string;
}

interface ReleaseData {
  release: {
    id: string;
    projectId: string;
    status: "DRAFT" | "PUBLISHED" | "ROLLED_BACK";
    createdById: string | null;
    createdAt: string;
    publishedAt: string | null;
    rolledBackAt: string | null;
  };
  items: ReleaseItem[];
}

export function PublishingWorkspace({ projectId }: { projectId: string | null }) {
  const [releases, setReleases] = useState<ReleaseData[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState<number>(0);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setReloadToken((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!projectId) return;

    let isMounted = true;

    async function loadReleases() {
      try {
        const res = await fetch(`/api/admin/projects/${projectId}/releases`);
        if (!res.ok) {
          if (res.status === 403) throw new Error("Nemáte oprávnění k zobrazení publikační historie (content.view).");
          if (res.status === 401) throw new Error("Relace vypršela. Přihlaste se prosím znovu.");
          throw new Error("Nepodařilo se načíst publikační data.");
        }
        const body = await res.json();
        if (isMounted) {
          setReleases(body.data?.releases || body.releases || []);
          setError(null);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : "Chyba při načítání releases.";
          setError(msg);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadReleases();

    return () => {
      isMounted = false;
    };
  }, [projectId, reloadToken]);

  const handleRollbackPage = async (pageId: string, expectedPublishedRevisionId: string) => {
    if (!projectId) return;
    setProcessingId(pageId);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/pages/${pageId}/actions/rollback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CMS-Origin-Check": "1",
        },
        body: JSON.stringify({ expectedPublishedRevisionId }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || errData.message || "Rollback selhal.");
      }
      setActionMessage("Rollback stránky úspěšně proveden přes canonical Content Lifecycle.");
      handleRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Chyba při rollbacku";
      setActionMessage(`Chyba při rollbacku: ${msg}`);
    } finally {
      setProcessingId(null);
    }
  };

  if (!projectId) {
    return (
      <CapabilityShell
        group="OBSAH"
        title="Publikování a verze"
        description="Publikační pipeline pro vytváření neměnných verzí (releases) obsahu webu a okamžitý rollback."
        status="ZÁKLAD"
        helpKey="content.publishing.view"
        emptyTitle="Vyberte aktivní projekt"
        emptyDescription="Pro zobrazení publikační historie a správu neměnných vydání prosím zvolte projekt v přepínači projektů."
        emptyActionLabel="Přejít do správy projektů"
      >
        {() => (
          <div className="p-8 rounded-2xl border border-dashed border-border bg-card shadow-xs text-center space-y-3">
            <FolderKanban className="w-8 h-8 text-muted-foreground mx-auto" />
            <h3 className="text-base font-bold text-foreground">Aktivní projekt není vybrán</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Publikační pipeline vyžaduje aktivní projektový kontext. Vyberte projekt v horní liště.
            </p>
          </div>
        )}
      </CapabilityShell>
    );
  }

  return (
    <CapabilityShell
      group="OBSAH"
      title="Publikování a verze"
      description="Publikační pipeline pro vytváření neměnných verzí (releases) obsahu webu a okamžitý rollback."
      status="ZÁKLAD"
      helpKey="content.publishing.view"
      emptyTitle="Zatím nebyla provedena žádná publikace obsahu"
      emptyDescription="Vytvořené a schválené revize stránek můžete publikovat z editoru stránek."
      emptyActionLabel="Přejít do správy stránek"
    >
      {() => (
        <div className="space-y-6">
          {actionMessage && (
            <div className="p-3.5 rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-900 dark:text-sky-200 text-xs flex items-center justify-between">
              <span>{actionMessage}</span>
              <button
                type="button"
                onClick={() => setActionMessage(null)}
                className="text-xs font-semibold underline hover:opacity-80"
              >
                Zavřít
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-foreground">Historie publikačních snapshotů</h3>
              <p className="text-xs text-muted-foreground">Neměnné verze (Immutable releases) z databáze projektu</p>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Obnovit</span>
            </button>
          </div>

          {loading ? (
            <div className="p-8 rounded-2xl border border-border bg-card shadow-xs text-center space-y-3">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
              <p className="text-xs text-muted-foreground">Načítání publikační historie...</p>
            </div>
          ) : error ? (
            <div className="p-6 rounded-2xl border border-destructive/20 bg-destructive/5 text-destructive text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <AlertCircle className="w-4 h-4" />
                <span>Chyba načítání: {error}</span>
              </div>
            </div>
          ) : releases.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-border bg-card/50 text-center space-y-3">
              <Clock className="w-8 h-8 text-muted-foreground mx-auto" />
              <h4 className="text-sm font-bold text-foreground">Žádné publikované snapshoty</h4>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Pro tento projekt dosud nebyly vytvořeny žádné studiové publikační snapshoty.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {releases.map(({ release, items }) => (
                <div key={release.id} className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                          release.status === "PUBLISHED"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                        }`}>
                          {release.status === "PUBLISHED" ? "PUBLIKOVANÝ RELEASE" : release.status}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">{release.id}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Vytvořeno: {new Date(release.createdAt).toLocaleString("cs-CZ")} • Autor: {release.createdById || "Systém"}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {items.length} {items.length === 1 ? "položka" : "položek"} v release
                    </span>
                  </div>

                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-foreground block">Položky vydání:</span>
                    <div className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-background/50">
                      {items.map((item) => (
                        <div key={item.revisionId} className="p-3 flex items-center justify-between gap-3 text-xs">
                          <div className="space-y-0.5">
                            <span className="font-bold text-foreground block">
                              {item.pageTitle || "Stránka"} ({item.pageSlug ? `/${item.pageSlug}` : item.pageId})
                            </span>
                            <span className="font-mono text-[11px] text-muted-foreground block">
                              Revize ID: {item.revisionId}
                            </span>
                          </div>
                          {release.status === "PUBLISHED" && (
                            <button
                              type="button"
                              disabled={processingId === item.pageId}
                              onClick={() => handleRollbackPage(item.pageId, item.revisionId)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                            >
                              {processingId === item.pageId ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3.5 h-3.5" />
                              )}
                              <span>Rollback</span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </CapabilityShell>
  );
}
