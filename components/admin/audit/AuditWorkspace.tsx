"use client";

import React, { useState, useEffect, useCallback } from "react";
import { CapabilityShell } from "@/components/admin/CapabilityShell";
import {
  ShieldAlert,
  Filter,
  RefreshCw,
  Loader2,
  AlertCircle,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  FileCode,
} from "lucide-react";
import type { SafeAuditRecord } from "@/lib/domain/audit/contracts";

interface AuditWorkspaceProps {
  projectId: string | null;
}

const COMMON_ACTIONS = [
  "ALL",
  "AUTH_LOGIN_SUCCESS",
  "AUTH_LOGIN_FAILURE",
  "AUTH_LOGOUT",
  "CONTENT_PAGE_CREATED",
  "CONTENT_DRAFT_UPDATED",
  "CONTENT_REVIEW_SUBMITTED",
  "CONTENT_REVIEW_APPROVED",
  "CONTENT_RELEASE_PUBLISHED",
  "CONTENT_RELEASE_ROLLED_BACK",
  "BRAND_PUBLISHED",
  "BRAND_ROLLED_BACK",
  "MEDIA_ASSET_CREATED",
  "MEDIA_ASSET_DELETED",
  "PLUGIN_ENABLE",
  "PLUGIN_DISABLE",
];

export function AuditWorkspace({ projectId }: AuditWorkspaceProps) {
  const [records, setRecords] = useState<SafeAuditRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const limit = 20;

  // Filters
  const [actionFilter, setActionFilter] = useState<string>("ALL");
  const [fromFilter, setFromFilter] = useState<string>("");
  const [toFilter, setToFilter] = useState<string>("");
  const [viewScope, setViewScope] = useState<"PROJECT" | "SYSTEM">(
    projectId ? "PROJECT" : "SYSTEM"
  );

  // Detail Modal
  const [selectedRecord, setSelectedRecord] = useState<SafeAuditRecord | null>(null);

  const fetchAuditLogs = useCallback(
    async (currentPage: number = 1) => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set("page", String(currentPage));
        params.set("limit", String(limit));

        if (actionFilter !== "ALL") {
          params.set("action", actionFilter);
        }
        if (fromFilter) {
          params.set("from", new Date(fromFilter).toISOString());
        }
        if (toFilter) {
          // Set to end of the selected day
          const toDate = new Date(toFilter);
          toDate.setHours(23, 59, 59, 999);
          params.set("to", toDate.toISOString());
        }

        let url = "";
        if (viewScope === "PROJECT") {
          if (!projectId) {
            setRecords([]);
            setLoading(false);
            return;
          }
          url = `/api/admin/projects/${projectId}/audit?${params.toString()}`;
        } else {
          params.set("scopeType", "SYSTEM");
          url = `/api/admin/audit?${params.toString()}`;
        }

        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok) {
          const errMsg =
            data?.error?.message ||
            data?.error ||
            "Nepodařilo se načíst záznamy auditního protokolu.";
          throw new Error(errMsg);
        }

        const result = data.data;
        setRecords(result.items || []);
        setTotal(result.total || 0);
        setPage(result.page || 1);
        setTotalPages(result.totalPages || 1);
      } catch (err: unknown) {
        console.error("Error fetching audit logs:", err);
        setError(
          err instanceof Error ? err.message : "Chyba při načítání auditního protokolu"
        );
        setRecords([]);
      } finally {
        setLoading(false);
      }
    },
    [projectId, viewScope, actionFilter, fromFilter, toFilter]
  );

  useEffect(() => {
    fetchAuditLogs(page);
  }, [fetchAuditLogs, page]);

  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchAuditLogs(1);
  };

  const handleResetFilters = () => {
    setActionFilter("ALL");
    setFromFilter("");
    setToFilter("");
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
      fetchAuditLogs(newPage);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat("cs-CZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  const getActionBadgeClass = (action: string) => {
    if (action.includes("FAILURE") || action.includes("REVOKED") || action.includes("ROLLED_BACK") || action.includes("DELETE")) {
      return "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20";
    }
    if (action.includes("SUCCESS") || action.includes("PUBLISHED") || action.includes("APPROVED")) {
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
    }
    if (action.includes("REVIEW") || action.includes("DRAFT")) {
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
    }
    return "bg-stone-500/10 text-stone-700 dark:text-stone-300 border-stone-500/20";
  };

  return (
    <CapabilityShell
      group="SPRÁVA"
      title="Bezpečnostní auditní protokol"
      description="Neměnný záznam všech redakčních zásahů, přihlášení a bezpečnostních událostí v systému."
      status="ZÁKLAD"
      helpKey="management.audit.view"
      emptyTitle="Auditní protokol je prázdný"
      emptyDescription="V systému zatím nebyly zaznamenány žádné auditované události odpovídající zadaným filtrům."
      emptyActionLabel="Obnovit protokol"
      onEmptyAction={() => fetchAuditLogs(1)}
    >
      {() => (
        <div className="space-y-6">
          {/* Top Bar: Scope Selector & Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20 p-3 rounded-2xl border border-border">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Pohled:</span>
              <button
                type="button"
                onClick={() => { setViewScope("PROJECT"); setPage(1); }}
                disabled={!projectId}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  viewScope === "PROJECT"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-card text-muted-foreground hover:text-foreground border border-border"
                } ${!projectId ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                Projektový audit
              </button>
              <button
                type="button"
                onClick={() => { setViewScope("SYSTEM"); setPage(1); }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  viewScope === "SYSTEM"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-card text-muted-foreground hover:text-foreground border border-border"
                }`}
              >
                Systémový audit
              </button>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => fetchAuditLogs(page)}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                <span>Obnovit</span>
              </button>
            </div>
          </div>

          {/* Filters Form */}
          <form
            onSubmit={handleApplyFilter}
            className="p-4 rounded-2xl border border-border bg-card shadow-xs space-y-3"
          >
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5" />
              <span>Filtry záznamů</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                  Typ události (Akce)
                </label>
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-input bg-card text-foreground px-3 py-2"
                >
                  {COMMON_ACTIONS.map((act) => (
                    <option key={act} value={act}>
                      {act === "ALL" ? "Všechny akce" : act}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                  Od data
                </label>
                <input
                  type="date"
                  value={fromFilter}
                  onChange={(e) => setFromFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-input bg-card text-foreground px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                  Do data
                </label>
                <input
                  type="date"
                  value={toFilter}
                  onChange={(e) => setToFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-input bg-card text-foreground px-3 py-2"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Vymazat filtry
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
              >
                Použít filtr
              </button>
            </div>
          </form>

          {/* Missing Project State */}
          {viewScope === "PROJECT" && !projectId && (
            <div className="p-8 text-center bg-card border border-border rounded-2xl shadow-xs space-y-3">
              <FolderKanban className="w-8 h-8 text-muted-foreground mx-auto" />
              <h3 className="text-sm font-bold text-foreground">Není vybrán žádný projekt</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Pro zobrazení auditních logů konkrétního projektu vyberte aktivní projekt v hlavičce administrace, nebo přepněte na systémový audit.
              </p>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs">
                <span className="font-bold text-rose-700 dark:text-rose-300 block">
                  Chyba při načítání auditu
                </span>
                <span className="text-rose-600/90 dark:text-rose-400/90">{error}</span>
              </div>
              <button
                type="button"
                onClick={() => fetchAuditLogs(page)}
                className="text-xs font-semibold text-rose-700 dark:text-rose-300 underline hover:no-underline cursor-pointer"
              >
                Zkusit znovu
              </button>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="p-12 text-center bg-card border border-border rounded-2xl">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Načítání záznamů auditního protokolu...</p>
            </div>
          )}

          {/* Data Table */}
          {!loading && !error && records.length > 0 && (
            <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border text-muted-foreground font-bold">
                      <th className="py-3 px-4">Časové razítko</th>
                      <th className="py-3 px-4">Akce</th>
                      <th className="py-3 px-4">Rozsah (Scope)</th>
                      <th className="py-3 px-4">Uživatel / Identita</th>
                      <th className="py-3 px-4">Prostředek (Resource)</th>
                      <th className="py-3 px-4 text-right">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {records.map((rec) => (
                      <tr
                        key={rec.id}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                          {formatDate(rec.createdAt)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${getActionBadgeClass(
                              rec.action
                            )}`}
                          >
                            {rec.action}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-mono text-[11px] text-foreground">
                            {rec.scopeType}
                          </div>
                          {rec.scopeId && (
                            <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[120px]">
                              {rec.scopeId}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {rec.actor ? (
                            <div>
                              <span className="font-semibold text-foreground block">
                                {rec.actor.name || rec.actor.email || rec.actor.id}
                              </span>
                              {rec.actor.name && rec.actor.email && (
                                <span className="text-[10px] text-muted-foreground block">
                                  {rec.actor.email}
                                </span>
                              )}
                            </div>
                          ) : rec.actorId ? (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {rec.actorId}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">Systém</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {rec.resourceType ? (
                            <div>
                              <span className="font-semibold text-foreground">
                                {rec.resourceType}
                              </span>
                              {rec.resourceId && (
                                <span className="font-mono text-[10px] text-muted-foreground block truncate max-w-[120px]">
                                  {rec.resourceId}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedRecord(rec)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Zobrazit</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Bar */}
              <div className="p-3 bg-muted/20 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
                <div>
                  Celkem nalezeno <span className="font-semibold text-foreground">{total}</span> záznamů (strana <span className="font-semibold text-foreground">{page}</span> z <span className="font-semibold text-foreground">{totalPages}</span>)
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1}
                    className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2 font-mono text-xs font-semibold text-foreground">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= totalPages}
                    className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && records.length === 0 && (
            <div className="p-12 text-center bg-card border border-border rounded-2xl space-y-2">
              <ShieldAlert className="w-8 h-8 text-muted-foreground mx-auto mb-1" />
              <h3 className="text-sm font-bold text-foreground">Žádné auditní záznamy</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Pro zadaná kritéria nebyly nalezeny žádné auditované události.
              </p>
            </div>
          )}

          {/* Safe Event Detail Modal */}
          {selectedRecord && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-card text-foreground border border-border rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="p-4 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${getActionBadgeClass(
                        selectedRecord.action
                      )}`}
                    >
                      {selectedRecord.action}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {selectedRecord.id}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedRecord(null)}
                    className="p-1 text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/20 p-4 rounded-xl border border-border">
                    <div>
                      <span className="text-[11px] font-semibold text-muted-foreground block">
                        Časové razítko
                      </span>
                      <span className="font-mono text-foreground">
                        {formatDate(selectedRecord.createdAt)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-muted-foreground block">
                        Uživatel (Actor)
                      </span>
                      {selectedRecord.actor ? (
                        <span className="text-foreground font-medium">
                          {selectedRecord.actor.name || selectedRecord.actor.email || selectedRecord.actor.id}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">Systém / Neznámý</span>
                      )}
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-muted-foreground block">
                        Rozsah (Scope)
                      </span>
                      <span className="font-mono text-foreground">
                        {selectedRecord.scopeType}
                        {selectedRecord.scopeId ? ` (${selectedRecord.scopeId})` : ""}
                      </span>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-muted-foreground block">
                        Prostředek (Resource)
                      </span>
                      <span className="font-mono text-foreground">
                        {selectedRecord.resourceType || "—"}
                        {selectedRecord.resourceId ? ` (${selectedRecord.resourceId})` : ""}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                      <FileCode className="w-3.5 h-3.5" />
                      <span>Bezpečná projekce metadat (Sanitized Metadata)</span>
                    </div>
                    {selectedRecord.metadata && Object.keys(selectedRecord.metadata).length > 0 ? (
                      <pre className="p-3 rounded-xl bg-muted/40 border border-border font-mono text-[11px] overflow-x-auto text-foreground whitespace-pre-wrap">
                        {JSON.stringify(selectedRecord.metadata, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-xs text-muted-foreground italic p-3 rounded-xl bg-muted/20 border border-border">
                        K této události nejsou evidována žádná dodatečná metadata.
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-4 border-t border-border flex justify-end sticky bottom-0 bg-card">
                  <button
                    type="button"
                    onClick={() => setSelectedRecord(null)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer"
                  >
                    Zavřít detail
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
