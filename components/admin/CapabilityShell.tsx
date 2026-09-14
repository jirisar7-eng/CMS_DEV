"use client";

import React, { useState } from 'react';
import { HelpTrigger } from '@/components/help/HelpTrigger';
import { CapabilityStatusBadge, CapabilityStatus } from './CapabilityStatusBadge';
import { HelpKey } from '@/lib/help/types';
import { 
  Info, 
  X, 
  RefreshCw, 
  AlertTriangle, 
  FolderSearch, 
  PowerOff, 
  Loader2,
  Check
} from 'lucide-react';

export type CapabilityGroup = 
  | 'OBSAH' 
  | 'DESIGN' 
  | 'SPRÁVA' 
  | 'KOMUNIKACE' 
  | 'DATA' 
  | 'BEZPEČNOST' 
  | 'SYSTÉM' 
  | 'PLATFORMA';

export type CapabilityViewState = 'normal' | 'empty' | 'loading' | 'error' | 'disabled';

interface CapabilityShellProps {
  group: CapabilityGroup;
  title: string;
  description: string;
  status: CapabilityStatus;
  helpKey: HelpKey | string;
  children: (helpers: {
    handleUnfinishedAction: (actionName: string, detail?: string) => void;
    viewState: CapabilityViewState;
  }) => React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  onEmptyAction?: () => void;
  emptyActionLabel?: string;
  moduleName?: string;
}

export function CapabilityShell({
  group,
  title,
  description,
  status,
  helpKey,
  children,
  emptyTitle = 'Nebyly nalezeny žádné záznamy',
  emptyDescription = 'Tato sekce momentálně neobsahuje žádná data.',
  onEmptyAction,
  emptyActionLabel = 'Vytvořit první položku',
  moduleName,
}: CapabilityShellProps) {
  const [viewState, setViewState] = useState<CapabilityViewState>('normal');
  const [actionAlert, setActionAlert] = useState<{ name: string; detail?: string } | null>(null);

  const handleUnfinishedAction = (actionName: string, detail?: string) => {
    setActionAlert({
      name: actionName,
      detail: detail || 'UI rozhraní je kompletně navrženo. Připojení serverového API a datové vrstvy proběhne v návazném implementačním kroku.',
    });
  };

  return (
    <div className="space-y-4 md:space-y-6 w-full max-w-7xl mx-auto pb-12">
      {/* Action Notification Banner */}
      {actionAlert && (
        <div className="p-3 sm:p-4 rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-800 dark:text-sky-300 flex items-start justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm">
              <span className="font-bold">Akce „{actionAlert.name}“: </span>
              <span>{actionAlert.detail}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActionAlert(null)}
            className="p-1 min-h-[36px] min-w-[36px] flex items-center justify-center text-sky-700 dark:text-sky-400 hover:opacity-75 -mr-1 rounded-md"
            aria-label="Zavřít oznámení"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Container */}
      <div className="p-4 sm:p-6 rounded-2xl border border-border bg-card shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            {/* Group breadcrumb & Status Badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                {group}
              </span>
              <CapabilityStatusBadge status={status} size="sm" />
            </div>

            {/* Title with inline Contextual HelpTrigger */}
            <div className="flex items-center gap-2 pt-1">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-foreground truncate">
                {title}
              </h1>
              <HelpTrigger helpKey={helpKey} size="sm" align="left" />
            </div>

            {/* Description */}
            <p className="text-xs sm:text-sm text-muted-foreground max-w-3xl leading-relaxed">
              {description}
            </p>
          </div>

          {/* Interactive State Switcher for reviewer verification */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 bg-muted/50 p-1.5 rounded-xl border border-border/80 shrink-0">
            <span className="text-[11px] font-semibold text-muted-foreground px-2 hidden lg:inline">
              Stav zobrazení:
            </span>
            <div className="grid grid-cols-3 sm:flex items-center gap-1 w-full sm:w-auto">
              {(
                [
                  { key: 'normal', label: 'Běžný' },
                  { key: 'empty', label: 'Prázdný' },
                  { key: 'loading', label: 'Načítání' },
                  { key: 'error', label: 'Chyba' },
                  { key: 'disabled', label: 'Vypnuto' },
                ] as const
              ).map((st) => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setViewState(st.key)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors min-h-[32px] cursor-pointer ${
                    viewState === st.key
                      ? 'bg-background text-foreground shadow-2xs font-semibold border border-border'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* View State Rendering */}
      {viewState === 'loading' && (
        <div className="p-8 sm:p-12 rounded-2xl border border-border bg-card shadow-xs text-center space-y-4 animate-pulse">
          <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
          <div className="space-y-2 max-w-sm mx-auto">
            <div className="h-4 bg-muted rounded-md w-3/4 mx-auto"></div>
            <div className="h-3 bg-muted rounded-md w-1/2 mx-auto"></div>
          </div>
          <p className="text-xs text-muted-foreground">Načítání dat modulu {title}...</p>
        </div>
      )}

      {viewState === 'empty' && (
        <div className="p-8 sm:p-12 rounded-2xl border border-dashed border-border bg-card/50 shadow-xs text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
            <FolderSearch className="w-7 h-7" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h3 className="text-base sm:text-lg font-bold text-foreground">{emptyTitle}</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">{emptyDescription}</p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => {
                if (onEmptyAction) onEmptyAction();
                else handleUnfinishedAction(emptyActionLabel);
              }}
              className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px] cursor-pointer inline-flex items-center gap-2 shadow-xs"
            >
              <Check className="w-4 h-4" />
              <span>{emptyActionLabel}</span>
            </button>
          </div>
        </div>
      )}

      {viewState === 'error' && (
        <div className="p-8 sm:p-12 rounded-2xl border border-destructive/20 bg-destructive/5 shadow-xs text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h3 className="text-base sm:text-lg font-bold text-foreground">
              Chyba při komunikaci se serverem
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Nepodařilo se navázat spojení s datovou vrstvou. Zkontrolujte připojení k síti.
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => setViewState('normal')}
              className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl border border-border bg-background hover:bg-muted text-foreground transition-colors min-h-[44px] cursor-pointer inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Zkusit znovu</span>
            </button>
          </div>
        </div>
      )}

      {viewState === 'disabled' && (
        <div className="p-8 sm:p-12 rounded-2xl border border-slate-500/20 bg-slate-500/5 shadow-xs text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
            <PowerOff className="w-7 h-7" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h3 className="text-base sm:text-lg font-bold text-foreground">
              Modul „{moduleName || title}“ je v tomto projektu deaktivován
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Tuto schopnost můžete aktivovat v sekci Správa → Moduly nebo v konfiguraci Project Packu.
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => handleUnfinishedAction('Aktivovat modul v nastavení')}
              className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px] cursor-pointer shadow-xs"
            >
              Přejít do správy modulů
            </button>
          </div>
        </div>
      )}

      {viewState === 'normal' && children({ handleUnfinishedAction, viewState })}
    </div>
  );
}
