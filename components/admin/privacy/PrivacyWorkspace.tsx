'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import {
  ShieldCheck,
  Lock,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Clock,
  ExternalLink,
  Info,
  Cookie,
  Users,
} from 'lucide-react';

interface PrivacyWorkspaceProps {
  initialProjectId?: string | null;
}

interface PrivacySettingsState {
  'project.privacy_policy_url': string;
  'project.data_retention_days': number;
  'project.privacy_contact_email': string;
}

export function PrivacyWorkspace({ initialProjectId }: PrivacyWorkspaceProps) {
  const [projectId, setProjectId] = useState<string | null>(initialProjectId || null);
  const [loading, setLoading] = useState<boolean>(Boolean(initialProjectId));
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [privacySettings, setPrivacySettings] = useState<PrivacySettingsState>({
    'project.privacy_policy_url': '',
    'project.data_retention_days': 365,
    'project.privacy_contact_email': '',
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

  // Load project settings
  useEffect(() => {
    if (!projectId) {
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    const fetchPrivacySettings = async (pId: string) => {
      try {
        const res = await fetch(`/api/admin/projects/${encodeURIComponent(pId)}/settings`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });

        if (!res.ok) {
          if (res.status === 401) {
            return { error: 'Pro zobrazení nastavení soukromí se musíte přihlásit.' };
          }
          if (res.status === 403) {
            return {
              error: 'Pro zobrazení a správu nastavení soukromí je vyžadováno oprávnění správy projektu (projects.manage).',
            };
          }
          if (res.status === 404) {
            return { error: `Projekt '${pId}' nebyl nalezen.` };
          }
          const data = await res.json().catch(() => ({}));
          return { error: data.message || 'Nepodařilo se načíst nastavení soukromí projektu.' };
        }

        const data = await res.json();
        return { data: data.settings };
      } catch (err: any) {
        if (controller.signal.aborted || err.name === 'AbortError') {
          return {};
        }
        return { error: 'Chyba při komunikaci se serverem při načítání nastavení soukromí.' };
      }
    };

    setLoading(true);
    fetchPrivacySettings(projectId).then((result) => {
      if (!isMounted || controller.signal.aborted) return;
      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        setPrivacySettings({
          'project.privacy_policy_url': result.data['project.privacy_policy_url'] ?? '',
          'project.data_retention_days': result.data['project.data_retention_days'] ?? 365,
          'project.privacy_contact_email': result.data['project.privacy_contact_email'] ?? '',
        });
        setError(null);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [projectId]);

  // Save Settings handler
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) {
      setError('Nejprve vyberte projekt pro uložení nastavení soukromí.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/admin/projects/${encodeURIComponent(projectId)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            'project.privacy_policy_url': privacySettings['project.privacy_policy_url'].trim() || null,
            'project.data_retention_days': Number(privacySettings['project.data_retention_days']),
            'project.privacy_contact_email': privacySettings['project.privacy_contact_email'].trim() || null,
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
        throw new Error(data.message || 'Uložení nastavení soukromí selhalo.');
      }

      setSuccess('Nastavení soukromí bylo úspěšně uloženo a zaznamenáno do auditu.');
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Chyba při ukládání nastavení.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <CapabilityShell
      group="BEZPEČNOST"
      title="GDPR a ochrana soukromí"
      description="Konfigurace zásad ochrany osobních údajů, právní doložky, deklarovaná retence a přehled soukromí bez cookies."
      status="FUNKČNÍ"
      helpKey="security.privacy.view"
    >
      <div className="space-y-6 max-w-4xl text-xs sm:text-sm">
        {/* Project Selector Notice */}
        {!projectId && (
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="font-semibold text-xs">Není vybrán žádný aktivní projekt</p>
              <p className="text-[11px] text-amber-300/80 mt-0.5">
                Pro konfiguraci zásad soukromí a právních parametrů vyberte projekt v horní navigační liště.
              </p>
            </div>
          </div>
        )}

        {/* Status Alerts */}
        {error && (
          <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold">Chyba: </span>
              <span>{error}</span>
            </div>
          </div>
        )}

        {success && (
          <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold">Úspěch: </span>
              <span>{success}</span>
            </div>
          </div>
        )}

        {/* Main Privacy Form */}
        <form onSubmit={handleSave} className="space-y-6">
          {/* Section 1: Cookie-free baseline */}
          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-foreground">
                Veřejný web a sledování (Baseline soukromí)
              </h3>
            </div>

            <div className="p-3.5 rounded-xl border border-border bg-muted/30 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-foreground">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Výchozí instalace jádra bez veřejného sledování</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Jádro Synthesis CMS v základní konfiguraci neukládá veřejné sledovací cookies ani nespouští trackery
                třetích stran, a proto výchozí instalace nezobrazuje cookie lištu. Pokud budoucí nasazení či
                doplňkové moduly zavedou nepovinné sledování, musí příslušná integrace zajistit vlastní vyhodnocení
                a řešení souhlasu.
              </p>
            </div>
          </div>

          {/* Section 2: Technical & Admin Cookies Inventory */}
          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <Cookie className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">
                Technické cookies administrace
              </h3>
            </div>

            <p className="text-xs text-muted-foreground">
              Následující cookies jsou používány výhradně pro zabezpečení administrace CMS a autentizaci oprávněných
              uživatelů. Na veřejné návštěvníky se nevztahují.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-border rounded-xl overflow-hidden">
                <thead className="bg-muted/50 border-b border-border text-[11px] text-muted-foreground uppercase font-semibold">
                  <tr>
                    <th className="p-2.5">Název cookie</th>
                    <th className="p-2.5">Účel</th>
                    <th className="p-2.5">Kategorie</th>
                    <th className="p-2.5">Vlastnosti v kódu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-[11px]">
                  <tr>
                    <td className="p-2.5 font-mono font-bold text-foreground">syn_admin_session</td>
                    <td className="p-2.5 text-muted-foreground">Udržování zabezpečené relace administrátora</td>
                    <td className="p-2.5 text-emerald-400 font-semibold">Nezbytná (Security)</td>
                    <td className="p-2.5 font-mono text-muted-foreground">HttpOnly, Secure (v produkci), SameSite=Lax, Path=/</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono font-bold text-foreground">syn_admin_mfa_challenge</td>
                    <td className="p-2.5 text-muted-foreground">Ověřovací krok pro vícefaktorovou autentizaci (MFA)</td>
                    <td className="p-2.5 text-emerald-400 font-semibold">Nezbytná (Security)</td>
                    <td className="p-2.5 font-mono text-muted-foreground">HttpOnly, Secure (v produkci), SameSite=Lax, MaxAge=300s, Path=/</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono font-bold text-foreground">syn_project_id</td>
                    <td className="p-2.5 text-muted-foreground">Aktivní kontext projektu pro pracovní plochu</td>
                    <td className="p-2.5 text-blue-400 font-semibold">Funkční (Workspace)</td>
                    <td className="p-2.5 font-mono text-muted-foreground">Path=/, max-age=31536000 (SameSite/Secure nejsou v kódu explicitně nastaveny)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Legal & Privacy Policy Configuration */}
          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <FileText className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">
                Zásady ochrany osobních údajů a právní dokumenty
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block font-semibold text-foreground text-xs mb-1">
                  Cesta nebo URL k Zásadám ochrany soukromí (Privacy Policy)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={privacySettings['project.privacy_policy_url']}
                    onChange={(e) =>
                      setPrivacySettings((prev) => ({
                        ...prev,
                        'project.privacy_policy_url': e.target.value,
                      }))
                    }
                    placeholder="/privacy nebo https://example.com/privacy (ponechte prázdné, pokud stránka dosud není publikována)"
                    disabled={loading || saving || !projectId}
                    className="flex-1 px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                  <Link
                    href="/admin/pages"
                    className="px-3 py-2 rounded-xl border border-border bg-muted/40 hover:bg-muted text-foreground text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <span>Spravovat stránky</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Klíč: <code className="text-primary font-mono">project.privacy_policy_url</code>.
                  Právní stránky publikujete standardně prostřednictvím modulu Stránky.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-foreground text-xs mb-1">
                  Kontakt pro otázky ochrany osobních údajů
                </label>
                <input
                  type="email"
                  value={privacySettings['project.privacy_contact_email']}
                  onChange={(e) =>
                    setPrivacySettings((prev) => ({
                      ...prev,
                      'project.privacy_contact_email': e.target.value,
                    }))
                  }
                  placeholder="soukromi@vasedomena.cz"
                  disabled={loading || saving || !projectId}
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Klíč: <code className="text-primary font-mono">project.privacy_contact_email</code>
                </p>
              </div>
            </div>
          </div>

          {/* Section 4: Declared Retention Policy */}
          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <Clock className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">
                Deklarovaná retence údajů (Data Retention Baseline)
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-foreground text-xs mb-1">
                  Výchozí deklarovaná retenční hodnota pro provozní plán projektu (dny)
                </label>
                <input
                  type="number"
                  min={30}
                  max={3650}
                  value={privacySettings['project.data_retention_days']}
                  onChange={(e) =>
                    setPrivacySettings((prev) => ({
                      ...prev,
                      'project.data_retention_days': parseInt(e.target.value, 10) || 30,
                    }))
                  }
                  disabled={loading || saving || !projectId}
                  className="w-full sm:w-48 px-3 py-2 rounded-xl border border-input bg-background text-foreground text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Klíč: <code className="text-primary font-mono">project.data_retention_days</code> (rozsah: 30 až 3650 dní).
                </p>
              </div>

              <div className="p-3 rounded-xl border border-border bg-muted/30 text-[11px] text-muted-foreground space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Info className="w-3.5 h-3.5 text-primary" />
                  <span>Deklarovaná provozní hodnota bez automatizovaného výmazu:</span>
                </div>
                <p>
                  Konfigurovaná hodnota představuje deklarovaný provozní cíl projektu. Synthesis CMS 1.0 neprovádí
                  na základě této hodnoty žádné automatické mazání záznamů. Uchovávání auditních protokolů,
                  historie verzí a dalších datových kategorií se řídí samostatnými provozními a archivačními pravidly.
                </p>
              </div>
            </div>
          </div>

          {/* Section 5: Data Subject Rights (DSAR) */}
          <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <Users className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">
                Práva subjektů údajů (DSAR Postup)
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl border border-border bg-background space-y-2">
                <h4 className="font-bold text-foreground flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Správa a deaktivace účtů</span>
                </h4>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Správa uživatelů v CMS 1.0 podporuje změnu stavu na <code>DISABLED</code> a okamžitou revokaci
                  aktivních relací. Jedná se o bezpečnostní a životní cyklus účtu, nikoliv o automatizovaný výmaz
                  či anonymizaci. Fyzické mazání uživatelů není v aktuálním administrátorském API implementováno
                  a auditní záznamy zůstávají beze změny. Vazba v AuditLog (ON DELETE SET NULL) se v databázi
                  uplatní pouze při přímém fyzickém odstranění záznamu uživatele.
                </p>
                <Link
                  href="/admin/users"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline pt-1"
                >
                  <span>Přejít do správy Uživatelů</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              <div className="p-4 rounded-xl border border-border bg-background space-y-2">
                <h4 className="font-bold text-foreground flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                  <span>Přístup a export údajů</span>
                </h4>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Žádosti subjektů údajů jsou zpracovávány autorizovaným operátorským postupem podle schváleného
                  provozního postupu a příslušných právních lhůt. Rozhraní neobsahuje fiktivní automatizovaná tlačítka
                  pro nekontrolovaný dump dat.
                </p>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2 flex items-center justify-between">
            <button
              type="submit"
              disabled={loading || saving || !projectId}
              className="px-5 py-2.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Ukládání konfigurace...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Uložit nastavení soukromí</span>
                </>
              )}
            </button>

            {loading && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Načítání parametrů projektu...</span>
              </span>
            )}
          </div>
        </form>
      </div>
    </CapabilityShell>
  );
}
