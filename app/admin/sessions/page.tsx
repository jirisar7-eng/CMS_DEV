"use client";

import React, { useEffect, useState, useCallback } from "react";
import { CapabilityShell } from "@/components/admin/CapabilityShell";
import {
  Laptop,
  Smartphone,
  Tablet,
  Globe,
  LogOut,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { SafeSessionProjection } from "@/lib/domain/sessions/contracts";

function mapErrorCodeToMessage(code: string | undefined): string {
  switch (code) {
    case "UNAUTHENTICATED":
      return "Pro správu relací se musíte přihlásit.";
    case "FORBIDDEN":
      return "Nemáte dostatečná oprávnění k provedení této operace.";
    case "NOT_FOUND":
      return "Relace nebyla nalezena nebo již byla ukončena.";
    case "INVALID_INPUT":
      return "Neplatný požadavek.";
    case "CURRENT_SESSION_PROTECTED":
      return "Aktuální aktivní relaci nelze odvolat tímto způsobem. Použijte standardní odhlášení.";
    case "DATABASE_ERROR":
      return "Chyba databázové služby. Zkuste to prosím znovu.";
    case "CSRF_REJECTED":
      return "Bezpečnostní kontrola původu požadavku selhala.";
    default:
      return "Operaci se nepodařilo dokončit.";
  }
}

function getDeviceIcon(label: string) {
  if (label.includes("Mobile") || label.includes("iOS") || label.includes("Android")) {
    if (label.includes("Tablet") || label.includes("iPad")) {
      return <Tablet className="w-5 h-5" />;
    }
    return <Smartphone className="w-5 h-5" />;
  }
  if (label.includes("Tablet") || label.includes("iPad")) {
    return <Tablet className="w-5 h-5" />;
  }
  if (label.includes("Windows") || label.includes("macOS") || label.includes("Linux") || label.includes("Chrome") || label.includes("Firefox") || label.includes("Edge") || label.includes("Safari")) {
    return <Laptop className="w-5 h-5" />;
  }
  return <Globe className="w-5 h-5" />;
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString("cs-CZ", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SafeSessionProjection[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState<boolean>(false);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sessions", {
        method: "GET",
        headers: { "Cache-Control": "no-store" },
      });

      if (!res.ok) {
        let errCode = "DATABASE_ERROR";
        try {
          const errData = await res.json();
          errCode = errData?.error?.code || errCode;
        } catch {
          // Ignored
        }
        setError(mapErrorCodeToMessage(errCode));
        setSessions([]);
        return;
      }

      const data: SafeSessionProjection[] = await res.json();
      setSessions(Array.isArray(data) ? data : []);
      setError(null);
    } catch {
      setError(mapErrorCodeToMessage("DATABASE_ERROR"));
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    await fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  const handleRevokeSingle = async (sessionId: string, deviceLabel: string) => {
    const confirmed = window.confirm(
      `Opravdu chcete ukončit relaci pro zařízení "${deviceLabel}"?`,
    );
    if (!confirmed) return;

    setRevokingId(sessionId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
        headers: { "Cache-Control": "no-store" },
      });

      if (!res.ok) {
        let errCode = "DATABASE_ERROR";
        try {
          const errData = await res.json();
          errCode = errData?.error?.code || errCode;
        } catch {
          // Ignored
        }
        setFeedback({
          type: "error",
          message: mapErrorCodeToMessage(errCode),
        });
        return;
      }

      setFeedback({
        type: "success",
        message: "Relace byla úspěšně ukončena.",
      });
      await refreshSessions();
    } catch {
      setFeedback({
        type: "error",
        message: mapErrorCodeToMessage("DATABASE_ERROR"),
      });
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeOthers = async () => {
    const confirmed = window.confirm(
      "Opravdu chcete odhlásit všechna ostatní zařízení kromě tohoto?",
    );
    if (!confirmed) return;

    setRevokingOthers(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/sessions/revoke-others", {
        method: "POST",
        headers: { "Cache-Control": "no-store" },
      });

      if (!res.ok) {
        let errCode = "DATABASE_ERROR";
        try {
          const errData = await res.json();
          errCode = errData?.error?.code || errCode;
        } catch {
          // Ignored
        }
        setFeedback({
          type: "error",
          message: mapErrorCodeToMessage(errCode),
        });
        return;
      }

      const data = await res.json();
      const count = typeof data?.revokedCount === "number" ? data.revokedCount : 0;

      setFeedback({
        type: "success",
        message: `Úspěšně odhlášeno ${count} ostatních zařízení.`,
      });
      await refreshSessions();
    } catch {
      setFeedback({
        type: "error",
        message: mapErrorCodeToMessage("DATABASE_ERROR"),
      });
    } finally {
      setRevokingOthers(false);
    }
  };

  const nonCurrentCount = sessions.filter((s) => !s.isCurrent).length;

  return (
    <CapabilityShell
      group="BEZPEČNOST"
      title="Relace a přihlášená zařízení"
      description="Přehled aktivních přihlášených zařízení k vašemu účtu s možností okamžitého vzdáleného odhlášení."
      status="ZÁKLAD"
      helpKey="security.sessions.view"
    >
      {() => (
        <div className="space-y-6 max-w-4xl">
          {/* Feedback banner */}
          {feedback && (
            <div
              className={`p-4 rounded-xl flex items-center justify-between gap-3 border text-xs sm:text-sm font-medium ${
                feedback.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                  : "bg-destructive/10 border-destructive/20 text-destructive"
              }`}
            >
              <div className="flex items-center gap-2">
                {feedback.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{feedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                Zavřít
              </button>
            </div>
          )}

          {/* Header controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">
                Aktivní relace ({sessions.length})
              </h3>
              <button
                type="button"
                onClick={refreshSessions}
                disabled={loading}
                title="Obnovit seznam"
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>

            <button
              type="button"
              onClick={handleRevokeOthers}
              disabled={revokingOthers || loading || nonCurrentCount === 0}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl text-destructive hover:bg-destructive/10 border border-destructive/20 transition-colors inline-flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-40 disabled:pointer-events-none"
            >
              {revokingOthers ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <LogOut className="w-3.5 h-3.5" />
              )}
              <span>Odhlásit ostatní zařízení</span>
            </button>
          </div>

          {/* Main content list / states */}
          {loading && sessions.length === 0 ? (
            <div className="p-8 rounded-2xl border border-border bg-card shadow-xs flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <p className="text-xs sm:text-sm text-muted-foreground">Načítání aktivních relací...</p>
            </div>
          ) : error ? (
            <div className="p-8 rounded-2xl border border-destructive/20 bg-destructive/5 shadow-xs flex flex-col items-center justify-center text-center space-y-3">
              <AlertCircle className="w-6 h-6 text-destructive" />
              <p className="text-xs sm:text-sm font-semibold text-destructive">{error}</p>
              <button
                type="button"
                onClick={refreshSessions}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl border border-border bg-card hover:bg-muted transition-colors text-foreground"
              >
                Zkusit znovu
              </button>
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-8 rounded-2xl border border-border bg-card shadow-xs flex flex-col items-center justify-center text-center space-y-3">
              <ShieldCheck className="w-8 h-8 text-muted-foreground/60" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Žádné aktivní relace</p>
                <p className="text-xs text-muted-foreground">Nebyly nalezeny žádné aktivní relace k vašemu účtu.</p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card shadow-xs divide-y divide-border overflow-hidden">
              {sessions.map((s) => {
                const isItemRevoking = revokingId === s.id;
                return (
                  <div
                    key={s.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="p-2.5 rounded-xl bg-muted shrink-0 text-foreground">
                        {getDeviceIcon(s.deviceLabel)}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs sm:text-sm font-bold text-foreground">
                            {s.deviceLabel}
                          </p>
                          {s.isCurrent && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                              Tato relace
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span>Aktivita: {formatDate(s.lastSeenAt)}</span>
                          <span>•</span>
                          <span>Vytvořeno: {formatDate(s.createdAt)}</span>
                          <span>•</span>
                          <span>Vyprší: {formatDate(s.expiresAt)}</span>
                        </div>
                      </div>
                    </div>

                    {!s.isCurrent && (
                      <button
                        type="button"
                        onClick={() => handleRevokeSingle(s.id, s.deviceLabel)}
                        disabled={isItemRevoking || revokingOthers}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center gap-1.5 self-end sm:self-auto disabled:opacity-50"
                      >
                        {isItemRevoking ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <LogOut className="w-3.5 h-3.5" />
                        )}
                        <span>Ukončit relaci</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </CapabilityShell>
  );
}
