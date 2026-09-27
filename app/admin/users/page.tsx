"use client";

import React, { useState, useEffect, useCallback } from "react";
import { CapabilityShell } from "@/components/admin/CapabilityShell";
import type { SafeUserRecord, ListUsersResult, UserStatus } from "@/lib/domain/users/types";
import {
  Users,
  UserPlus,
  ShieldCheck,
  ShieldAlert,
  Search,
  Edit,
  Power,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
} from "lucide-react";

function mapUserErrorCode(code?: string): string {
  switch (code) {
    case "UNAUTHENTICATED":
      return "Přihlášení vypršelo nebo účet není aktivní.";
    case "FORBIDDEN":
      return "Nemáte oprávnění spravovat uživatele.";
    case "INVALID_INPUT":
      return "Zadané údaje nejsou platné.";
    case "EMAIL_EXISTS":
      return "Uživatel s tímto e-mailem již existuje.";
    case "NOT_FOUND":
      return "Uživatel nebyl nalezen.";
    case "INVALID_USER_STATE":
      return "Účet nelze v aktuálním stavu změnit.";
    case "CANNOT_DEACTIVATE_SELF":
      return "Vlastní účet nelze deaktivovat.";
    case "CANNOT_DEACTIVATE_LAST_ADMIN":
      return "Nelze deaktivovat posledního aktivního administrátora.";
    case "DATABASE_ERROR":
      return "Chyba databáze při zpracování požadavku.";
    default:
      return "Operaci se nepodařilo dokončit.";
  }
}

export default function UsersPage() {
  const [users, setUsers] = useState<SafeUserRecord[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | UserStatus>("ALL");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Create User Dialog state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [createEmail, setCreateEmail] = useState<string>("");
  const [createDisplayName, setCreateDisplayName] = useState<string>("");
  const [createPassword, setCreatePassword] = useState<string>("");
  const [isSubmittingCreate, setIsSubmittingCreate] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit User Dialog state
  const [editingUser, setEditingUser] = useState<SafeUserRecord | null>(null);
  const [editEmail, setEditEmail] = useState<string>("");
  const [editDisplayName, setEditDisplayName] = useState<string>("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Lifecycle Dialog state
  const [lifecycleUser, setLifecycleUser] = useState<SafeUserRecord | null>(null);
  const [lifecycleTargetStatus, setLifecycleTargetStatus] = useState<UserStatus | null>(null);
  const [isSubmittingLifecycle, setIsSubmittingLifecycle] = useState<boolean>(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  const loadUsers = useCallback(
    async (targetPage: number, query: string, filter: "ALL" | UserStatus) => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const params = new URLSearchParams();
        params.set("page", String(targetPage));
        params.set("limit", "20");
        if (query.trim()) {
          params.set("query", query.trim());
        }
        if (filter !== "ALL") {
          params.set("status", filter);
        }

        const res = await fetch(`/api/admin/users?${params.toString()}`, {
          method: "GET",
          headers: {
            "Cache-Control": "no-store",
          },
        });

        if (!res.ok) {
          let code: string | undefined;
          try {
            const json = await res.json();
            code = json?.error?.code;
          } catch {
            // non-json response
          }
          setErrorMessage(mapUserErrorCode(code));
          return;
        }

        const data: ListUsersResult = await res.json();
        setUsers(data.items);
        setTotal(data.total);
        setPage(data.page);
        setTotalPages(data.totalPages);
        setHasMore(data.hasMore);
      } catch {
        setErrorMessage("Operaci se nepodařilo dokončit.");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadUsers(page, searchQuery, statusFilter);
  }, [loadUsers, page, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadUsers(1, searchQuery, statusFilter);
  };

  const handleOpenCreate = () => {
    setCreateEmail("");
    setCreateDisplayName("");
    setCreatePassword("");
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const handleCloseCreate = () => {
    setIsCreateOpen(false);
    setCreateEmail("");
    setCreateDisplayName("");
    setCreatePassword("");
    setCreateError(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createEmail.trim() || !createPassword) {
      setCreateError("Vyplňte povinná pole (e-mail a počáteční heslo).");
      return;
    }

    setIsSubmittingCreate(true);
    setCreateError(null);

    try {
      const payload: { email: string; password: string; displayName?: string } = {
        email: createEmail.trim(),
        password: createPassword,
      };
      if (createDisplayName.trim()) {
        payload.displayName = createDisplayName.trim();
      }

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let code: string | undefined;
        try {
          const json = await res.json();
          code = json?.error?.code;
        } catch {
          // non-json response
        }
        setCreateError(mapUserErrorCode(code));
        return;
      }

      // Success: clear form and password from memory
      handleCloseCreate();
      setSuccessMessage("Uživatel byl úspěšně vytvořen.");
      setPage(1);
      await loadUsers(1, searchQuery, statusFilter);
    } catch {
      setCreateError("Operaci se nepodařilo dokončit.");
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleOpenEdit = (user: SafeUserRecord) => {
    setEditingUser(user);
    setEditEmail(user.email);
    setEditDisplayName(user.displayName ?? "");
    setEditError(null);
  };

  const handleCloseEdit = () => {
    setEditingUser(null);
    setEditEmail("");
    setEditDisplayName("");
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!editEmail.trim()) {
      setEditError("E-mail je povinný.");
      return;
    }

    setIsSubmittingEdit(true);
    setEditError(null);

    try {
      const payload: { email: string; displayName?: string | null } = {
        email: editEmail.trim(),
        displayName: editDisplayName.trim() || null,
      };

      const res = await fetch(`/api/admin/users/${encodeURIComponent(editingUser.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let code: string | undefined;
        try {
          const json = await res.json();
          code = json?.error?.code;
        } catch {
          // non-json response
        }
        setEditError(mapUserErrorCode(code));
        return;
      }

      handleCloseEdit();
      setSuccessMessage("Údaje uživatele byly úspěšně aktualizovány.");
      await loadUsers(page, searchQuery, statusFilter);
    } catch {
      setEditError("Operaci se nepodařilo dokončit.");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleOpenLifecycle = (user: SafeUserRecord, targetStatus: UserStatus) => {
    setLifecycleUser(user);
    setLifecycleTargetStatus(targetStatus);
    setLifecycleError(null);
  };

  const handleCloseLifecycle = () => {
    setLifecycleUser(null);
    setLifecycleTargetStatus(null);
    setLifecycleError(null);
  };

  const handleConfirmLifecycle = async () => {
    if (!lifecycleUser || !lifecycleTargetStatus) return;

    setIsSubmittingLifecycle(true);
    setLifecycleError(null);

    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(lifecycleUser.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: lifecycleTargetStatus }),
      });

      if (!res.ok) {
        let code: string | undefined;
        try {
          const json = await res.json();
          code = json?.error?.code;
        } catch {
          // non-json response
        }
        setLifecycleError(mapUserErrorCode(code));
        return;
      }

      const msg =
        lifecycleTargetStatus === "DISABLED"
          ? "Uživatel byl úspěšně deaktivován."
          : "Uživatel byl úspěšně reaktivován.";
      handleCloseLifecycle();
      setSuccessMessage(msg);
      await loadUsers(page, searchQuery, statusFilter);
    } catch {
      setLifecycleError("Operaci se nepodařilo dokončit.");
    } finally {
      setIsSubmittingLifecycle(false);
    }
  };

  return (
    <CapabilityShell
      group="SPRÁVA"
      title="Uživatelské účty"
      description="Správa přístupových účtů do administrace Synthesis CMS, přehled rolí, stav 2FA a životní cyklus."
      status="FUNKČNÍ"
      helpKey="management.users.view"
      emptyTitle="V systému zatím nejsou žádní uživatelé"
      emptyDescription="Vytvořte první administrátorský nebo redakční účet."
      emptyActionLabel="Vytvořit prvního uživatele"
      onEmptyAction={handleOpenCreate}
    >
      {() => (
        <div className="space-y-6">
          {/* Notifications */}
          {errorMessage && (
            <div className="p-3 sm:p-4 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive flex items-start justify-between gap-3 text-xs sm:text-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="p-1 rounded-md hover:bg-destructive/20"
                aria-label="Zavřít chybové hlášení"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {successMessage && (
            <div className="p-3 sm:p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-start justify-between gap-3 text-xs sm:text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessMessage(null)}
                className="p-1 rounded-md hover:bg-emerald-500/20"
                aria-label="Zavřít oznámení"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Action and Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 max-w-lg">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Hledat podle jména nebo e-mailu..."
                  className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-input bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-2 text-xs sm:text-sm font-semibold rounded-xl border border-border bg-card text-foreground hover:bg-muted transition-colors min-h-[38px] cursor-pointer"
              >
                Hledat
              </button>
            </form>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as "ALL" | UserStatus);
                  setPage(1);
                }}
                className="px-3 py-2 text-xs sm:text-sm rounded-xl border border-input bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[38px]"
                aria-label="Filtr stavu uživatele"
              >
                <option value="ALL">Všechny stavy</option>
                <option value="ACTIVE">Aktivní</option>
                <option value="DISABLED">Deaktivováno</option>
              </select>

              <button
                type="button"
                onClick={() => loadUsers(page, searchQuery, statusFilter)}
                className="p-2 text-muted-foreground hover:text-foreground rounded-xl border border-border bg-card hover:bg-muted transition-colors min-h-[38px] min-w-[38px] flex items-center justify-center cursor-pointer"
                title="Obnovit seznam"
                aria-label="Obnovit seznam"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              </button>

              <button
                type="button"
                onClick={handleOpenCreate}
                className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors min-h-[40px] cursor-pointer inline-flex items-center gap-2 shadow-xs"
              >
                <UserPlus className="w-4 h-4" />
                <span>Vytvořit uživatele</span>
              </button>
            </div>
          </div>

          {/* Users Table */}
          <div className="rounded-2xl border border-border bg-card shadow-xs divide-y divide-border overflow-hidden">
            <div className="p-3 bg-muted/40 text-xs font-bold text-muted-foreground grid grid-cols-12 gap-2">
              <span className="col-span-5 sm:col-span-4">Uživatel / E-mail</span>
              <span className="col-span-3 sm:col-span-2">Stav</span>
              <span className="hidden sm:inline sm:col-span-3">Globální role</span>
              <span className="hidden sm:inline sm:col-span-1">2FA</span>
              <span className="col-span-4 sm:col-span-2 text-right">Akce</span>
            </div>

            {isLoading && users.length === 0 ? (
              <div className="p-8 text-center text-xs sm:text-sm text-muted-foreground">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                Načítání uživatelů...
              </div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center text-xs sm:text-sm text-muted-foreground">
                Žádní uživatelé neodpovídají zadanému filtru nebo vyhledávání.
              </div>
            ) : (
              users.map((u) => {
                const isSuspended = u.status === "SUSPENDED";
                const isActive = u.status === "ACTIVE";
                const isDisabled = u.status === "DISABLED";
                const isMutable = isActive || isDisabled;

                return (
                  <div
                    key={u.id}
                    className="p-3.5 text-xs sm:text-sm grid grid-cols-12 gap-2 items-center hover:bg-muted/30 transition-colors"
                  >
                    <div className="col-span-5 sm:col-span-4 flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                        {(u.displayName || u.email).substring(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-foreground truncate">
                          {u.displayName || "Bez jména"}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                      </div>
                    </div>

                    <div className="col-span-3 sm:col-span-2">
                      {isActive && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                          Aktivní
                        </span>
                      )}
                      {isDisabled && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-muted text-muted-foreground border border-border">
                          Deaktivováno
                        </span>
                      )}
                      {isSuspended && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                          Pozastaveno (pouze pro čtení)
                        </span>
                      )}
                    </div>

                    <div className="hidden sm:inline sm:col-span-3 text-xs">
                      {u.globalRoles && u.globalRoles.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {u.globalRoles.map((roleName) => (
                            <span
                              key={roleName}
                              className="px-2 py-0.5 rounded-md bg-muted text-foreground font-medium text-[11px]"
                            >
                              {roleName}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">Bez globální role</span>
                      )}
                    </div>

                    <div className="hidden sm:inline sm:col-span-1 text-xs">
                      {u.hasMfa ? (
                        <span className="text-emerald-600 font-semibold flex items-center gap-1 text-[11px]">
                          <ShieldCheck className="w-3.5 h-3.5" /> Aktivní
                        </span>
                      ) : (
                        <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                          <ShieldAlert className="w-3.5 h-3.5" /> Neaktivní
                        </span>
                      )}
                    </div>

                    <div className="col-span-4 sm:col-span-2 flex items-center justify-end gap-1">
                      {isMutable ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(u)}
                            className="p-1.5 text-xs font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer inline-flex items-center gap-1"
                            title="Upravit uživatele"
                            aria-label={`Upravit ${u.email}`}
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span className="hidden lg:inline">Upravit</span>
                          </button>

                          {isActive && (
                            <button
                              type="button"
                              onClick={() => handleOpenLifecycle(u, "DISABLED")}
                              className="p-1.5 text-xs font-medium rounded-lg text-destructive hover:bg-destructive/10 transition-colors cursor-pointer inline-flex items-center gap-1"
                              title="Deaktivovat uživatele"
                              aria-label={`Deaktivovat ${u.email}`}
                            >
                              <Power className="w-3.5 h-3.5" />
                              <span className="hidden lg:inline">Deaktivovat</span>
                            </button>
                          )}

                          {isDisabled && (
                            <button
                              type="button"
                              onClick={() => handleOpenLifecycle(u, "ACTIVE")}
                              className="p-1.5 text-xs font-medium rounded-lg text-emerald-600 hover:bg-emerald-500/10 transition-colors cursor-pointer inline-flex items-center gap-1"
                              title="Reaktivovat uživatele"
                              aria-label={`Reaktivovat ${u.email}`}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span className="hidden lg:inline">Reaktivovat</span>
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic">
                          Pouze pro čtení
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm text-muted-foreground pt-2">
              <div>
                Strana {page} z {totalPages} (celkem {total} uživatelů)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || isLoading}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  className="px-3 py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Předchozí</span>
                </button>
                <button
                  type="button"
                  disabled={!hasMore || page >= totalPages || isLoading}
                  onClick={() => setPage((prev) => prev + 1)}
                  className="px-3 py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Další</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Create User Dialog */}
          {isCreateOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
              <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between">
                  <h3 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-primary" />
                    Vytvořit nového uživatele
                  </h3>
                  <button
                    type="button"
                    onClick={handleCloseCreate}
                    disabled={isSubmittingCreate}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground"
                    aria-label="Zavřít dialog"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {createError && (
                  <div className="p-3 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs sm:text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{createError}</span>
                  </div>
                )}

                <form onSubmit={handleCreateSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">
                      E-mailová adresa <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={createEmail}
                      onChange={(e) => setCreateEmail(e.target.value)}
                      placeholder="uzivatel@domena.cz"
                      disabled={isSubmittingCreate}
                      className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">
                      Zobrazované jméno (volitelné)
                    </label>
                    <input
                      type="text"
                      value={createDisplayName}
                      onChange={(e) => setCreateDisplayName(e.target.value)}
                      placeholder="např. Jan Novák"
                      disabled={isSubmittingCreate}
                      className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">
                      Počáteční heslo <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      autoComplete="new-password"
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      placeholder="Minimálně 8 znaků"
                      disabled={isSubmittingCreate}
                      className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Heslo musí mít minimálně 8 znaků. Heslo není ukládáno do lokální paměti prohlížeče.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleCloseCreate}
                      disabled={isSubmittingCreate}
                      className="px-4 py-2 text-xs sm:text-sm font-medium rounded-xl border border-border bg-card text-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                      Zrušit
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingCreate}
                      className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors inline-flex items-center gap-2 cursor-pointer shadow-xs"
                    >
                      {isSubmittingCreate ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Vytváření...</span>
                        </>
                      ) : (
                        <span>Vytvořit uživatele</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Edit User Dialog */}
          {editingUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
              <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between">
                  <h3 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                    <Edit className="w-5 h-5 text-primary" />
                    Upravit uživatele
                  </h3>
                  <button
                    type="button"
                    onClick={handleCloseEdit}
                    disabled={isSubmittingEdit}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground"
                    aria-label="Zavřít dialog"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {editError && (
                  <div className="p-3 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs sm:text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{editError}</span>
                  </div>
                )}

                <form onSubmit={handleEditSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">
                      E-mailová adresa <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      disabled={isSubmittingEdit}
                      className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Změna e-mailu z bezpečnostních důvodů okamžitě ukončí všechny aktivní relace uživatele.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">
                      Zobrazované jméno
                    </label>
                    <input
                      type="text"
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      placeholder="např. Jan Novák"
                      disabled={isSubmittingEdit}
                      className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleCloseEdit}
                      disabled={isSubmittingEdit}
                      className="px-4 py-2 text-xs sm:text-sm font-medium rounded-xl border border-border bg-card text-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                      Zrušit
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingEdit}
                      className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors inline-flex items-center gap-2 cursor-pointer shadow-xs"
                    >
                      {isSubmittingEdit ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Ukládání...</span>
                        </>
                      ) : (
                        <span>Uložit změny</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Lifecycle Confirmation Dialog */}
          {lifecycleUser && lifecycleTargetStatus && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
              <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between">
                  <h3 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                    {lifecycleTargetStatus === "DISABLED" ? (
                      <>
                        <Power className="w-5 h-5 text-destructive" />
                        Deaktivovat uživatele
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-5 h-5 text-emerald-600" />
                        Reaktivovat uživatele
                      </>
                    )}
                  </h3>
                  <button
                    type="button"
                    onClick={handleCloseLifecycle}
                    disabled={isSubmittingLifecycle}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground"
                    aria-label="Zavřít dialog"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {lifecycleError && (
                  <div className="p-3 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs sm:text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{lifecycleError}</span>
                  </div>
                )}

                <div className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {lifecycleTargetStatus === "DISABLED" ? (
                    <p>
                      Opravdu chcete deaktivovat účet uživatele{" "}
                      <strong className="text-foreground">{lifecycleUser.email}</strong>?
                      Uživatel ztratí přístup do administrace a všechny jeho aktivní relace budou okamžitě ukončeny.
                    </p>
                  ) : (
                    <p>
                      Opravdu chcete reaktivovat účet uživatele{" "}
                      <strong className="text-foreground">{lifecycleUser.email}</strong>?
                      Uživatel se bude moci znovu přihlásit do administrace.
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleCloseLifecycle}
                    disabled={isSubmittingLifecycle}
                    className="px-4 py-2 text-xs sm:text-sm font-medium rounded-xl border border-border bg-card text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    Zrušit
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmLifecycle}
                    disabled={isSubmittingLifecycle}
                    className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl text-white transition-colors inline-flex items-center gap-2 cursor-pointer shadow-xs ${
                      lifecycleTargetStatus === "DISABLED"
                        ? "bg-destructive hover:bg-destructive/90"
                        : "bg-emerald-600 hover:bg-emerald-500"
                    }`}
                  >
                    {isSubmittingLifecycle ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Zpracování...</span>
                      </>
                    ) : lifecycleTargetStatus === "DISABLED" ? (
                      <span>Deaktivovat uživatele</span>
                    ) : (
                      <span>Reaktivovat uživatele</span>
                    )}
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
