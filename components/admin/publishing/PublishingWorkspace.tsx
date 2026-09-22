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

export type PublishingRevisionStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "APPROVED"
  | "PUBLISHED";

export type PublishingAction =
  | "submit-review"
  | "approve"
  | "request-changes"
  | "publish";

export interface PublishingRevision {
  id: string;
  pageId: string;
  revisionNumber: number;
  status: PublishingRevisionStatus;
  title: string;
  slug: string;
  lockVersion: number;
}

const ACTION_LABELS: Record<PublishingAction, string> = {
  "submit-review": "Odeslat ke schválení",
  approve: "Schválit",
  "request-changes": "Vrátit k úpravám",
  publish: "Publikovat",
};

export function getAllowedPublishingActions(
  status: PublishingRevisionStatus
): PublishingAction[] {
  switch (status) {
    case "DRAFT":
      return ["submit-review"];
    case "IN_REVIEW":
      return ["approve", "request-changes"];
    case "APPROVED":
      return ["publish"];
    default:
      return [];
  }
}

export function getLatestActionableRevisions(
  revisions: PublishingRevision[]
): PublishingRevision[] {
  const latestByPage = new Map<string, PublishingRevision>();

  for (const revision of revisions) {
    const current = latestByPage.get(revision.pageId);
    if (
      !current ||
      revision.revisionNumber > current.revisionNumber ||
      (revision.revisionNumber === current.revisionNumber &&
        revision.id.localeCompare(current.id) > 0)
    ) {
      latestByPage.set(revision.pageId, revision);
    }
  }

  return [...latestByPage.values()]
    .filter((revision) => getAllowedPublishingActions(revision.status).length > 0)
    .sort(
      (a, b) =>
        a.title.localeCompare(b.title, "cs") ||
        a.pageId.localeCompare(b.pageId)
    );
}

export function publishingActionEndpoint(
  projectId: string,
  pageId: string,
  action: PublishingAction
): string {
  return `/api/admin/projects/${projectId}/pages/${pageId}/actions/${action}`;
}

export function PublishingWorkspace({ projectId }: { projectId: string | null }) {
  const [releases, setReleases] = useState<ReleaseData[]>([]);
  const [revisions, setRevisions] = useState<PublishingRevision[]>([]);
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(null);
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

    async function loadPublishingData() {
      setLoading(true);

      try {
        const [releasesRes, revisionsRes] = await Promise.all([
          fetch(`/api/admin/projects/${projectId}/releases`),
          fetch(`/api/admin/projects/${projectId}/revisions`),
        ]);

        for (const res of [releasesRes, revisionsRes]) {
          if (res.status === 403) {
            throw new Error(
              "Nemáte oprávnění k publikačnímu workspace (content.view)."
            );
          }
          if (res.status === 401) {
            throw new Error("Relace vypršela. Přihlaste se prosím znovu.");
          }
          if (!res.ok) {
            throw new Error("Nepodařilo se načíst publikační data.");
          }
        }

        const [releasesBody, revisionsBody] = await Promise.all([
          releasesRes.json(),
          revisionsRes.json(),
        ]);

        if (isMounted) {
          setReleases(
            releasesBody.data?.releases || releasesBody.releases || []
          );
          setRevisions(
            revisionsBody.data?.revisions || revisionsBody.revisions || []
          );
          setResolvedProjectId(projectId);
          setError(null);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg =
            err instanceof Error
              ? err.message
              : "Chyba při načítání publikačního workspace.";
          setResolvedProjectId(projectId);
          setError(msg);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadPublishingData();

    return () => {
      isMounted = false;
    };
  }, [projectId, reloadToken]);

  const isCurrentProjectResolved = resolvedProjectId === projectId;
  const workspaceLoading = loading || !isCurrentProjectResolved;
  const visibleReleases = isCurrentProjectResolved ? releases : [];
  const actionableRevisions = isCurrentProjectResolved
    ? getLatestActionableRevisions(revisions)
    : [];

  const handleLifecycleAction = async (
    revision: PublishingRevision,
    action: PublishingAction
  ) => {
    if (!projectId) return;

    const processingKey = `${revision.pageId}:${action}`;
    setProcessingId(processingKey);
    setActionMessage(null);

    try {
      const res = await fetch(
        publishingActionEndpoint(projectId, revision.pageId, action),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CMS-Origin-Check": "1",
          },
          body: JSON.stringify({
            expectedLockVersion: revision.lockVersion,
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));

        if (res.status === 401) {
          throw new Error("Relace vypršela. Přihlaste se prosím znovu.");
        }
        if (res.status === 403) {
          throw new Error(
            errData.error?.message ||
              errData.message ||
              "Pro tuto publikační akci nemáte oprávnění."
          );
        }

        throw new Error(
          errData.error?.message ||
            errData.message ||
            `Publikační akce selhala (${res.status}).`
        );
      }

      setActionMessage(
        `${ACTION_LABELS[action]} dokončeno. Data byla znovu načtena ze serveru.`
      );
      handleRefresh();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Publikační akce selhala.";
      setActionMessage(`Chyba: ${msg}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRollbackPage = async (pageId: string, expectedPublishedRevisionId: string) => {
    if (!projectId) return;
    setProcessingId(`${pageId}:rollback`);
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

          {!workspaceLoading && !error && (
            <div className="space-y-3">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-foreground">
                  Publikační workflow
                </h3>
                <p className="text-xs text-muted-foreground">
                  Aktuální revize připravené pro review, schválení nebo publikaci.
                </p>
              </div>

              {actionableRevisions.length === 0 ? (
                <div className="p-5 rounded-2xl border border-dashed border-border bg-card/50 text-center">
                  <p className="text-xs text-muted-foreground">
                    Momentálně není žádná revize čekající na publikační akci.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {actionableRevisions.map((revision) => (
                    <div
                      key={revision.id}
                      className="p-4 rounded-2xl border border-border bg-card shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-foreground">
                            {revision.title}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border border-border bg-muted text-muted-foreground">
                            {revision.status}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          /{revision.slug} • revize {revision.revisionNumber} • lock {revision.lockVersion}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2 shrink-0">
                        {getAllowedPublishingActions(revision.status).map(
                          (action) => {
                            const processingKey = `${revision.pageId}:${action}`;
                            return (
                              <button
                                key={action}
                                type="button"
                                disabled={processingId === processingKey}
                                onClick={() =>
                                  handleLifecycleAction(revision, action)
                                }
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                {processingId === processingKey && (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                )}
                                <span>{ACTION_LABELS[action]}</span>
                              </button>
                            );
                          }
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
              disabled={workspaceLoading}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${workspaceLoading ? "animate-spin" : ""}`} />
              <span>Obnovit</span>
            </button>
          </div>

          {workspaceLoading ? (
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
          ) : visibleReleases.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-border bg-card/50 text-center space-y-3">
              <Clock className="w-8 h-8 text-muted-foreground mx-auto" />
              <h4 className="text-sm font-bold text-foreground">Žádné publikované snapshoty</h4>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Pro tento projekt dosud nebyly vytvořeny žádné studiové publikační snapshoty.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {visibleReleases.map(({ release, items }) => (
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
                              disabled={processingId === `${item.pageId}:rollback`}
                              onClick={() => handleRollbackPage(item.pageId, item.revisionId)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                            >
                              {processingId === `${item.pageId}:rollback` ? (
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
