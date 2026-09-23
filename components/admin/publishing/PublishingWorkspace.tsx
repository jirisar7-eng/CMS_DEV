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
  Calendar,
  CalendarClock,
  CalendarX,
  EyeOff,
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
  | "publish"
  | "schedule-publish"
  | "cancel-schedule"
  | "unpublish";

export interface PublishingRevision {
  id: string;
  pageId: string;
  revisionNumber: number;
  status: PublishingRevisionStatus;
  title: string;
  slug: string;
  lockVersion: number;
  draftRevisionId?: string | null;
  publishedRevisionId?: string | null;
  scheduledRevisionId?: string | null;
  scheduledPublishAt?: string | null;
}

export const ACTION_LABELS: Record<PublishingAction, string> = {
  "submit-review": "Odeslat ke schválení",
  approve: "Schválit",
  "request-changes": "Vrátit k úpravám",
  publish: "Publikovat",
  "schedule-publish": "Naplánovat publikaci",
  "cancel-schedule": "Zrušit plán",
  unpublish: "Zrušit publikaci (Unpublish)",
};

export function getAllowedPublishingActions(
  status: PublishingRevisionStatus,
  options?: {
    scheduledRevisionId?: string | null;
    scheduledPublishAt?: string | null;
    publishedRevisionId?: string | null;
    id?: string;
  }
): PublishingAction[] {
  switch (status) {
    case "DRAFT":
      return ["submit-review"];
    case "IN_REVIEW":
      return ["approve", "request-changes"];
    case "APPROVED": {
      const isScheduled = Boolean(
        options?.scheduledPublishAt ||
          (options?.scheduledRevisionId &&
            options?.id &&
            options.scheduledRevisionId === options.id)
      );
      if (isScheduled) {
        return ["publish", "cancel-schedule"];
      }
      return ["publish", "schedule-publish"];
    }
    case "PUBLISHED":
      return [];
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
    .filter(
      (revision) =>
        getAllowedPublishingActions(revision.status, revision).length > 0
    )
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

function getFormattedDefaultFutureDateTime(): string {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function PublishingWorkspace({
  projectId,
}: {
  projectId: string | null;
}) {
  const [releases, setReleases] = useState<ReleaseData[]>([]);
  const [revisions, setRevisions] = useState<PublishingRevision[]>([]);
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState<boolean>(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState<number>(0);

  // Scheduling state
  const [schedulingRevisionId, setSchedulingRevisionId] = useState<string | null>(
    null
  );
  const [scheduledDateTime, setScheduledDateTime] = useState<string>(
    getFormattedDefaultFutureDateTime()
  );

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

  const handleSchedulePublish = async (
    revision: PublishingRevision,
    publishAtInput: string
  ) => {
    if (!projectId) return;

    const date = new Date(publishAtInput);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      setActionMessage("Chyba: Zadejte platné budoucí datum a čas publikace.");
      return;
    }

    const processingKey = `${revision.pageId}:schedule-publish`;
    setProcessingId(processingKey);
    setActionMessage(null);

    try {
      const res = await fetch(
        publishingActionEndpoint(projectId, revision.pageId, "schedule-publish"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CMS-Origin-Check": "1",
          },
          body: JSON.stringify({
            expectedLockVersion: revision.lockVersion,
            publishAt: date.toISOString(),
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.error?.message ||
            errData.message ||
            "Naplánování publikace selhalo."
        );
      }

      setActionMessage(
        `Publikace stránky byla úspěšně naplánována na ${date.toLocaleString("cs-CZ")}.`
      );
      setSchedulingRevisionId(null);
      handleRefresh();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Naplánování publikace selhalo.";
      setActionMessage(`Chyba: ${msg}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancelSchedule = async (revision: PublishingRevision) => {
    if (!projectId) return;

    const scheduledRevisionId = revision.scheduledRevisionId || revision.id;
    const scheduledPublishAt = revision.scheduledPublishAt;

    if (!scheduledRevisionId || !scheduledPublishAt) {
      setActionMessage("Chyba: Chybí údaje o plánované publikaci.");
      return;
    }

    const processingKey = `${revision.pageId}:cancel-schedule`;
    setProcessingId(processingKey);
    setActionMessage(null);

    try {
      const res = await fetch(
        publishingActionEndpoint(projectId, revision.pageId, "cancel-schedule"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CMS-Origin-Check": "1",
          },
          body: JSON.stringify({
            expectedScheduledRevisionId: scheduledRevisionId,
            expectedScheduledPublishAt: scheduledPublishAt,
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.error?.message ||
            errData.message ||
            "Zrušení plánu publikace selhalo."
        );
      }

      setActionMessage("Plánovaná publikace byla úspěšně zrušena.");
      handleRefresh();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Zrušení plánu publikace selhalo.";
      setActionMessage(`Chyba: ${msg}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleUnpublishPage = async (
    pageId: string,
    expectedPublishedRevisionId: string
  ) => {
    if (!projectId) return;

    setProcessingId(`${pageId}:unpublish`);
    setActionMessage(null);

    try {
      const res = await fetch(
        publishingActionEndpoint(projectId, pageId, "unpublish"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CMS-Origin-Check": "1",
          },
          body: JSON.stringify({
            expectedPublishedRevisionId,
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.error?.message ||
            errData.message ||
            "Zrušení publikace (unpublish) selhalo."
        );
      }

      setActionMessage(
        "Publikace stránky byla úspěšně zrušena (Unpublish). Data byla znovu načtena ze serveru."
      );
      handleRefresh();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Chyba při zrušení publikace (unpublish).";
      setActionMessage(`Chyba: ${msg}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRollbackPage = async (
    pageId: string,
    expectedPublishedRevisionId: string
  ) => {
    if (!projectId) return;

    setProcessingId(`${pageId}:rollback`);
    setActionMessage(null);

    try {
      const res = await fetch(
        `/api/admin/projects/${projectId}/pages/${pageId}/actions/rollback`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CMS-Origin-Check": "1",
          },
          body: JSON.stringify({ expectedPublishedRevisionId }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.error?.message || errData.message || "Rollback selhal."
        );
      }

      setActionMessage(
        "Rollback stránky úspěšně proveden přes canonical Content Lifecycle."
      );
      handleRefresh();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Chyba při rollbacku";
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
        description="Publikační pipeline pro plánování publikací, schvalování, vytváření neměnných verzí (releases) obsahu webu, unpublish a okamžitý rollback."
        status="ZÁKLAD"
        helpKey="content.publishing.view"
        emptyTitle="Vyberte aktivní projekt"
        emptyDescription="Pro zobrazení publikační historie a správu neměnných vydání prosím zvolte projekt v přepínači projektů."
        emptyActionLabel="Přejít do správy projektů"
      >
        {() => (
          <div className="p-8 rounded-2xl border border-dashed border-border bg-card shadow-xs text-center space-y-3">
            <FolderKanban className="w-8 h-8 text-muted-foreground mx-auto" />
            <h3 className="text-base font-bold text-foreground">
              Aktivní projekt není vybrán
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Publikační pipeline vyžaduje aktivní projektový kontext. Vyberte
              projekt v horní liště.
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
      description="Publikační pipeline pro plánování publikací, schvalování, vytváření neměnných verzí (releases) obsahu webu, unpublish a okamžitý rollback."
      status="ZÁKLAD"
      helpKey="content.publishing.view"
      emptyTitle="Zatím nebyla provedena žádná publikace obsahu"
      emptyDescription="Vytvořené a schválené revize stránek můžete publikovat z editoru stránek nebo centrálního workflow."
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
                className="text-xs font-semibold underline hover:opacity-80 cursor-pointer"
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
                  Aktuální revize připravené pro review, schválení, okamžitou nebo plánovanou publikaci.
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
                  {actionableRevisions.map((revision) => {
                    const isScheduled = Boolean(
                      revision.scheduledPublishAt ||
                        (revision.scheduledRevisionId &&
                          revision.scheduledRevisionId === revision.id)
                    );
                    const isSchedulingOpen =
                      schedulingRevisionId === revision.id;
                    const allowedActions = getAllowedPublishingActions(
                      revision.status,
                      revision
                    );

                    return (
                      <div
                        key={revision.id}
                        className="p-4 rounded-2xl border border-border bg-card shadow-xs space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-sm text-foreground">
                                {revision.title}
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border border-border bg-muted text-muted-foreground">
                                {revision.status}
                              </span>
                              {isScheduled && revision.scheduledPublishAt && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 inline-flex items-center gap-1">
                                  <CalendarClock className="w-3 h-3" />
                                  Plánováno:{" "}
                                  {new Date(
                                    revision.scheduledPublishAt
                                  ).toLocaleString("cs-CZ")}
                                </span>
                              )}
                              {revision.publishedRevisionId && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md border border-border bg-background text-muted-foreground">
                                  Live: {revision.publishedRevisionId}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              /{revision.slug} • revize {revision.revisionNumber} • lock {revision.lockVersion}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2 shrink-0">
                            {allowedActions.map((action) => {
                              const processingKey = `${revision.pageId}:${action}`;
                              const isProcessing =
                                processingId === processingKey;

                              if (action === "schedule-publish") {
                                return (
                                  <button
                                    key={action}
                                    type="button"
                                    disabled={Boolean(processingId)}
                                    onClick={() => {
                                      setSchedulingRevisionId(
                                        isSchedulingOpen ? null : revision.id
                                      );
                                      if (!isSchedulingOpen) {
                                        setScheduledDateTime(
                                          getFormattedDefaultFutureDateTime()
                                        );
                                      }
                                    }}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                  >
                                    <Calendar className="w-3.5 h-3.5" />
                                    <span>
                                      {isSchedulingOpen
                                        ? "Zavřít plánování"
                                        : ACTION_LABELS[action]}
                                    </span>
                                  </button>
                                );
                              }

                              if (action === "cancel-schedule") {
                                return (
                                  <button
                                    key={action}
                                    type="button"
                                    disabled={isProcessing}
                                    onClick={() =>
                                      handleCancelSchedule(revision)
                                    }
                                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                  >
                                    {isProcessing ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <CalendarX className="w-3.5 h-3.5" />
                                    )}
                                    <span>{ACTION_LABELS[action]}</span>
                                  </button>
                                );
                              }

                              return (
                                <button
                                  key={action}
                                  type="button"
                                  disabled={isProcessing}
                                  onClick={() =>
                                    handleLifecycleAction(revision, action)
                                  }
                                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                  {isProcessing && (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  )}
                                  <span>{ACTION_LABELS[action]}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Inline schedule publish form */}
                        {isSchedulingOpen && (
                          <div className="pt-3 border-t border-border mt-3 space-y-3 bg-muted/30 p-3.5 rounded-xl">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                <CalendarClock className="w-3.5 h-3.5 text-primary" />
                                Naplánovat automatickou publikaci revize č. {revision.revisionNumber}
                              </span>
                              <div className="flex items-center gap-1 text-[11px]">
                                <span className="text-muted-foreground mr-1">
                                  Rychlé volby:
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const d = new Date(
                                      Date.now() + 60 * 60 * 1000
                                    );
                                    d.setMinutes(0, 0, 0);
                                    setScheduledDateTime(
                                      d.toISOString().slice(0, 16)
                                    );
                                  }}
                                  className="px-2 py-0.5 rounded border border-border bg-background hover:bg-muted text-foreground cursor-pointer"
                                >
                                  +1h
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const d = new Date(
                                      Date.now() + 24 * 60 * 60 * 1000
                                    );
                                    d.setMinutes(0, 0, 0);
                                    setScheduledDateTime(
                                      d.toISOString().slice(0, 16)
                                    );
                                  }}
                                  className="px-2 py-0.5 rounded border border-border bg-background hover:bg-muted text-foreground cursor-pointer"
                                >
                                  +1 den
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const d = new Date(
                                      Date.now() + 7 * 24 * 60 * 60 * 1000
                                    );
                                    d.setMinutes(0, 0, 0);
                                    setScheduledDateTime(
                                      d.toISOString().slice(0, 16)
                                    );
                                  }}
                                  className="px-2 py-0.5 rounded border border-border bg-background hover:bg-muted text-foreground cursor-pointer"
                                >
                                  +1 týden
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                              <input
                                type="datetime-local"
                                value={scheduledDateTime}
                                onChange={(e) =>
                                  setScheduledDateTime(e.target.value)
                                }
                                className="px-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={
                                    processingId ===
                                    `${revision.pageId}:schedule-publish`
                                  }
                                  onClick={() =>
                                    handleSchedulePublish(
                                      revision,
                                      scheduledDateTime
                                    )
                                  }
                                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                  {processingId ===
                                  `${revision.pageId}:schedule-publish` ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <CalendarClock className="w-3.5 h-3.5" />
                                  )}
                                  <span>Potvrdit datum a čas publikace</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSchedulingRevisionId(null)}
                                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors cursor-pointer"
                                >
                                  Zrušit
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-foreground">
                Historie publikačních snapshotů
              </h3>
              <p className="text-xs text-muted-foreground">
                Neměnné verze (Immutable releases) z databáze projektu s podporou rollbacku a unpublish
              </p>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={workspaceLoading}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  workspaceLoading ? "animate-spin" : ""
                }`}
              />
              <span>Obnovit</span>
            </button>
          </div>

          {workspaceLoading ? (
            <div className="p-8 rounded-2xl border border-border bg-card shadow-xs text-center space-y-3">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
              <p className="text-xs text-muted-foreground">
                Načítání publikační historie...
              </p>
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
              <h4 className="text-sm font-bold text-foreground">
                Žádné publikované snapshoty
              </h4>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Pro tento projekt dosud nebyly vytvořeny žádné studiové publikační snapshoty.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {visibleReleases.map(({ release, items }) => (
                <div
                  key={release.id}
                  className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                            release.status === "PUBLISHED"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                          }`}
                        >
                          {release.status === "PUBLISHED"
                            ? "PUBLIKOVANÝ RELEASE"
                            : release.status}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {release.id}
                        </span>
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
                    <span className="text-xs font-semibold text-foreground block">
                      Položky vydání:
                    </span>
                    <div className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-background/50">
                      {items.map((item) => {
                        const isRollbackProcessing =
                          processingId === `${item.pageId}:rollback`;
                        const isUnpublishProcessing =
                          processingId === `${item.pageId}:unpublish`;

                        return (
                          <div
                            key={item.revisionId}
                            className="p-3 flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="space-y-0.5">
                              <span className="font-bold text-foreground block">
                                {item.pageTitle || "Stránka"}{" "}
                                ({item.pageSlug ? `/${item.pageSlug}` : item.pageId})
                              </span>
                              <span className="font-mono text-[11px] text-muted-foreground block">
                                Revize ID: {item.revisionId}
                              </span>
                            </div>

                            {release.status === "PUBLISHED" && (
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  disabled={
                                    isUnpublishProcessing || isRollbackProcessing
                                  }
                                  onClick={() =>
                                    handleUnpublishPage(
                                      item.pageId,
                                      item.revisionId
                                    )
                                  }
                                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-destructive/30 bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                  {isUnpublishProcessing ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <EyeOff className="w-3.5 h-3.5" />
                                  )}
                                  <span>Zrušit publikaci</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    isRollbackProcessing || isUnpublishProcessing
                                  }
                                  onClick={() =>
                                    handleRollbackPage(
                                      item.pageId,
                                      item.revisionId
                                    )
                                  }
                                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                  {isRollbackProcessing ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  )}
                                  <span>Rollback</span>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
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
