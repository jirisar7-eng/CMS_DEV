"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  Paintbrush, 
  Plus, 
  Send, 
  Globe, 
  Database,
  Layers,
  Sparkles,
  Clock,
  CheckCircle2,
  FolderKanban,
  Activity,
  ShieldCheck,
  Server
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useActiveProject } from '@/lib/domain/pages-client/useProject';
import { HelpTrigger } from '@/components/help/HelpTrigger';
import { CapabilityStatusBadge, CapabilityStatus } from './CapabilityStatusBadge';
import { ADMIN_NAV_GROUPS, ALL_ADMIN_NAV_ITEMS, getCapabilityStats } from '@/lib/navigation/adminNav';
import { normalizeAdminProjectId, withAdminProjectContext } from '@/lib/domain/pages-client/project-context';
import { createAdminPagesClient } from '@/lib/domain/pages-client/client';

interface RuntimeHealthData {
  database: {
    status: 'connected' | 'disconnected';
    latencyMs: number | null;
    message: string;
  };
  storage: {
    driver: string;
    status: string;
    message: string;
  };
  project: {
    id: string | null;
    status: string;
    message: string;
  };
  auth: {
    status: string;
    message: string;
  };
}

export function AdminDashboard() {
  // const searchParams = useSearchParams();
  // const rawProjectId = searchParams.get('projectId');
  const projectId = useActiveProject();

  // Runtime Health State
  const [health, setHealth] = useState<RuntimeHealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState(false);

  // Pages Count State
  const [pagesCount, setPagesCount] = useState<number | null>(null);
  const [pagesLoading, setPagesLoading] = useState(false);

  // Dynamic implementation maturity stats from adminNav
  const maturityStats = useMemo(() => getCapabilityStats(), []);
  const nonDashboardCapabilities = useMemo(
    () => ALL_ADMIN_NAV_ITEMS.filter((item) => item.id !== 'dashboard'),
    []
  );
  const totalCapabilitiesCount = nonDashboardCapabilities.length;
  const totalGroupsCount = ADMIN_NAV_GROUPS.length;

  // Fetch Runtime Health
  useEffect(() => {
    let isMounted = true;

    const queryUrl = projectId 
      ? `/api/admin/health?projectId=${encodeURIComponent(projectId)}`
      : '/api/admin/health';

    fetch(queryUrl, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Health check failed');
        return res.json() as Promise<RuntimeHealthData>;
      })
      .then((data) => {
        if (isMounted) {
          setHealth(data);
          setHealthLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setHealthError(true);
          setHealthLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  // Fetch Real Content Pages Count if project is selected
  useEffect(() => {
    if (!projectId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPagesCount(null);
      setPagesLoading(false);
      return;
    }

    let isMounted = true;
    // Set loading true BEFORE initiating request and reset stale page count
    setPagesLoading(true);
    setPagesCount(null);

    Promise.resolve()
      .then(() => {
        const client = createAdminPagesClient(projectId);
        return client.getPages();
      })
      .then((pages) => {
        if (isMounted) {
          setPagesCount(pages.length);
          setPagesLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setPagesCount(null);
          setPagesLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  // Runtime Metrics Cards
  const runtimeMetrics = useMemo(() => {
    const dbValue = healthLoading
      ? 'Ověřování...'
      : healthError
      ? 'Nedostupné'
      : health?.database.status === 'connected'
      ? 'Připojeno'
      : 'Není připojeno';

    const dbDetail = healthLoading
      ? 'Kontrola spojení...'
      : healthError
      ? 'Chyba ověření běhového stavu'
      : health?.database.status === 'connected'
      ? `PostgreSQL • ${health.database.latencyMs ?? 0} ms`
      : 'Offline režim / Nelze se spojit';

    const dbColor = health?.database.status === 'connected'
      ? 'text-state-success'
      : 'text-state-warning';

    const contentValue = !projectId
      ? 'Projekt nevybrán'
      : pagesLoading
      ? 'Načítání...'
      : pagesCount !== null
      ? `${pagesCount} ${
          pagesCount === 1
            ? 'stránka'
            : pagesCount >= 2 && pagesCount <= 4
            ? 'stránky'
            : 'stránek'
        }`
      : 'Nedostupné';

    const contentDetail = !projectId
      ? 'Vyberte projekt pro zobrazení obsahu'
      : pagesCount !== null
      ? 'Reálná data vybraného projektu'
      : 'Chyba načtení stránek projektu';

    const projectValue = projectId ? projectId : 'Projekt nevybrán';
    const projectDetail = projectId ? 'Aktivní tenant' : 'Použijte selektor v záhlaví';

    return [
      {
        label: 'Perzistentní databáze',
        value: dbValue,
        detail: dbDetail,
        icon: Database,
        color: dbColor,
      },
      {
        label: 'Obsahové schéma',
        value: contentValue,
        detail: contentDetail,
        icon: FileText,
        color: projectId && pagesCount !== null ? 'text-state-info' : 'text-muted-foreground',
      },
      {
        label: 'Aktivní projekt',
        value: projectValue,
        detail: projectDetail,
        icon: FolderKanban,
        color: projectId ? 'text-primary' : 'text-muted-foreground',
      },
      {
        label: 'Běhové prostředí',
        value: 'CMS_DEV',
        detail: health?.storage.message ?? 'Cloudové / Místní úložiště',
        icon: Server,
        color: 'text-brand',
      },
    ];
  }, [health, healthLoading, healthError, projectId, pagesCount, pagesLoading]);

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      {/* Header Container */}
      <div className="p-4 sm:p-6 rounded-2xl border border-border bg-card shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                PŘEHLED
              </span>
              <CapabilityStatusBadge status="FUNKČNÍ" size="sm" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Přehled administrace
              </h1>
              <HelpTrigger helpKey="admin.dashboard.view" size="sm" align="left" />
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl leading-relaxed">
              Autoritativní přehled implementačního stavu schopností, modulů a běhového zdraví Synthesis CMS.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Link
              href="/preview/site"
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 min-h-[44px] border border-border bg-background hover:bg-muted text-foreground rounded-xl text-xs sm:text-sm font-semibold transition-colors"
            >
              <Globe className="w-4 h-4" />
              <span>Veřejný náhled</span>
            </Link>
            <Link
              href={withAdminProjectContext('/admin/pages/new', projectId)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-primary text-primary-foreground rounded-xl text-xs sm:text-sm font-semibold hover:bg-primary/90 transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Nová stránka</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Section 1: RUNTIME HEALTH & ENVIRONMENT */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="text-sm sm:text-base font-bold text-foreground uppercase tracking-wider">
              Běhový stav prostředí
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {healthLoading ? 'Ověřování...' : 'Živá telemetrie'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {runtimeMetrics.map((stat) => (
            <div
              key={stat.label}
              className="p-4 sm:p-5 rounded-2xl border border-border bg-card shadow-xs flex items-center justify-between gap-3"
            >
              <div className="space-y-1 min-w-0">
                <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
                <div className="text-base sm:text-lg font-bold text-foreground tracking-tight truncate">
                  {stat.value}
                </div>
                <span className="text-[11px] text-muted-foreground block truncate">{stat.detail}</span>
              </div>
              <div className="p-3 rounded-xl bg-muted/60 border border-border/50 shrink-0">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: IMPLEMENTATION MATURITY SUMMARY */}
      <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-foreground">
              Implementační zralost CMS
            </h2>
            <p className="text-xs text-muted-foreground">
              Skutečný stav implementace v kódu nezávisle na momentální dostupnosti běhových služeb
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted border border-border text-foreground">
            {totalCapabilitiesCount} schopností celkem
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>FUNKČNÍ</span>
            </div>
            <div className="text-2xl font-black text-foreground">
              {maturityStats['FUNKČNÍ']}
            </div>
            <span className="text-[10px] text-muted-foreground block">
              Plně napojeno na API/DB
            </span>
          </div>

          <div className="p-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase">
              <Layers className="w-3.5 h-3.5" />
              <span>ZÁKLAD</span>
            </div>
            <div className="text-2xl font-black text-foreground">
              {maturityStats['ZÁKLAD']}
            </div>
            <span className="text-[10px] text-muted-foreground block">
              Backend/doména hotova
            </span>
          </div>

          <div className="p-3 rounded-xl border border-sky-500/20 bg-sky-500/5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-sky-700 dark:text-sky-400 uppercase">
              <Sparkles className="w-3.5 h-3.5" />
              <span>POUZE UI</span>
            </div>
            <div className="text-2xl font-black text-foreground">
              {maturityStats['POUZE UI']}
            </div>
            <span className="text-[10px] text-muted-foreground block">
              Připravený shell bez API
            </span>
          </div>

          <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400 uppercase">
              <Clock className="w-3.5 h-3.5" />
              <span>PLÁNOVÁNO</span>
            </div>
            <div className="text-2xl font-black text-foreground">
              {maturityStats['PLÁNOVÁNO']}
            </div>
            <span className="text-[10px] text-muted-foreground block">
              Architektonický plán
            </span>
          </div>

          <div className="p-3 rounded-xl border border-teal-500/20 bg-teal-500/5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-teal-700 dark:text-teal-400 uppercase">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>DOKONČENO</span>
            </div>
            <div className="text-2xl font-black text-foreground">
              {maturityStats['DOKONČENO']}
            </div>
            <span className="text-[10px] text-muted-foreground block">
              Celý deklarovaný scope implementován a ověřen
            </span>
          </div>

          <div className="p-3 rounded-xl border border-slate-500/20 bg-slate-500/5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-400 uppercase">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>VYPNUTO</span>
            </div>
            <div className="text-2xl font-black text-foreground">
              {maturityStats['VYPNUTO']}
            </div>
            <span className="text-[10px] text-muted-foreground block">
              Neaktivní schopnosti
            </span>
          </div>
        </div>
      </div>

      {/* Section 3: AUTHORITATIVE CAPABILITY MAP BY GROUPS */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="space-y-0.5">
            <h2 className="text-base sm:text-lg font-bold text-foreground">
              Mapa schopností Synthesis CMS
            </h2>
            <p className="text-xs text-muted-foreground">
              Detailní přehled schopností rozdělených do architektonických skupin
            </p>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-muted border border-border text-muted-foreground">
            {totalGroupsCount} navigačních skupin • {totalCapabilitiesCount} schopností
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {ADMIN_NAV_GROUPS.map((group) => {
            const groupCapabilities = group.items.filter((item) => item.id !== 'dashboard');

            return (
              <div
                key={group.id}
                className="p-4 rounded-2xl border border-border bg-card shadow-xs flex flex-col justify-between space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-border/60 pb-2">
                    <span className="text-xs font-bold text-primary tracking-wider uppercase">
                      {group.name}
                    </span>
                    <span className="text-[11px] font-semibold text-muted-foreground px-1.5 py-0.5 rounded-md bg-muted">
                      {groupCapabilities.length} položek
                    </span>
                  </div>

                  <div className="space-y-1">
                    {groupCapabilities.map((item) => {
                      const Icon = item.icon;
                      const targetHref = withAdminProjectContext(item.href, projectId);

                      return (
                        <Link
                          key={item.id}
                          href={targetHref}
                          className="group flex items-center justify-between gap-2 p-2 rounded-xl hover:bg-muted/70 transition-colors text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                            <span className="font-semibold text-foreground truncate group-hover:text-primary">
                              {item.name}
                            </span>
                          </div>
                          <CapabilityStatusBadge status={item.status} size="sm" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
