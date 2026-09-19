"use client";

import React from 'react';
import { ArrowRight, Layers, Lock, Globe } from 'lucide-react';
import { BasicCapabilityRecord, InternalCapabilityRecord } from './types';

export interface DependencyFlowProps {
  capabilities: (BasicCapabilityRecord | InternalCapabilityRecord)[];
  selectedCapabilityId?: string | null;
  onSelectCapability?: (id: string) => void;
}

export function DependencyFlow({
  capabilities,
  selectedCapabilityId,
  onSelectCapability,
}: DependencyFlowProps) {
  const selectedCap = capabilities.find((c) => c.capability_id === selectedCapabilityId);

  // Derive incoming dependencies (capabilities that depend on selectedCap)
  const incomingDependencies = selectedCap
    ? capabilities.filter((c) => c.depends_on_capabilities.includes(selectedCap.capability_id))
    : [];

  // Outgoing dependencies (capabilities that selectedCap depends on)
  const outgoingDependencies = selectedCap
    ? capabilities.filter((c) => selectedCap.depends_on_capabilities.includes(c.capability_id))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-4">
        <div>
          <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-stone-500" />
            Tok závislostí modulů (Dependency Flow)
          </h3>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Bezpečný přehled vazeb mezi systémovými funkcemi a modulárními závislostmi.
          </p>
        </div>
        {selectedCap && (
          <button
            onClick={() => onSelectCapability?.('')}
            className="text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 underline"
          >
            Zrušit výběr
          </button>
        )}
      </div>

      {/* Capability Selector Cards */}
      <div>
        <label className="text-xs font-medium text-stone-600 dark:text-stone-400 mb-2 block">
          Vyberte schopnost pro zobrazení grafu závislostí:
        </label>
        <div className="flex flex-wrap gap-2">
          {capabilities.map((cap) => {
            const isSelected = cap.capability_id === selectedCapabilityId;
            const hasDeps = cap.depends_on_capabilities.length > 0;
            return (
              <button
                key={cap.capability_id}
                onClick={() => onSelectCapability?.(cap.capability_id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-stone-900 text-white border-stone-900 dark:bg-stone-100 dark:text-stone-900 dark:border-stone-100 shadow-sm'
                    : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-800 dark:hover:bg-stone-800/80'
                }`}
              >
                <span>{cap.capability_id}</span>
                {hasDeps && (
                  <span className="text-[10px] px-1 py-0.2 rounded bg-stone-100 dark:bg-stone-800 text-stone-500 font-mono">
                    {cap.depends_on_capabilities.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Flow Visualization Section */}
      {selectedCap ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch pt-2">
          {/* Incoming Dependencies (Prerequisites) */}
          <div className="bg-stone-50 dark:bg-stone-900/50 p-4 rounded-lg border border-stone-200 dark:border-stone-800 flex flex-col">
            <div className="text-xs font-semibold text-stone-600 dark:text-stone-400 mb-3 flex items-center justify-between">
              <span>Vyžadováno schopností ({outgoingDependencies.length})</span>
              <span className="text-[10px] text-stone-400">Přímé prerekvizity</span>
            </div>
            {outgoingDependencies.length > 0 ? (
              <div className="space-y-2 flex-1">
                {outgoingDependencies.map((dep) => (
                  <div
                    key={dep.capability_id}
                    onClick={() => onSelectCapability?.(dep.capability_id)}
                    className="p-2.5 bg-white dark:bg-stone-900 rounded border border-stone-200 dark:border-stone-800 cursor-pointer hover:border-stone-400 dark:hover:border-stone-600 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-medium text-stone-900 dark:text-stone-100">
                        {dep.capability_id}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-stone-400" />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 font-mono">
                        {dep.visibility}
                      </span>
                      {dep.project_scoped && (
                        <span className="text-[10px] text-stone-500">Project Scoped</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-4 text-center text-xs text-stone-400 border border-dashed border-stone-200 dark:border-stone-800 rounded">
                Žádné přímé závislosti (Nezávislý modul)
              </div>
            )}
          </div>

          {/* Target Focus Capability */}
          <div className="bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 p-4 rounded-lg border border-stone-900 dark:border-stone-100 flex flex-col justify-between shadow-md">
            <div>
              <div className="flex items-center justify-between text-xs text-stone-400 dark:text-stone-600 mb-2 font-mono">
                <span>VYBRANÝ MODUL</span>
                {selectedCap.visibility === 'OWNER_INTERNAL' ? (
                  <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 dark:text-amber-700">
                    <Lock className="w-3 h-3" /> OWNER_INTERNAL
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 dark:text-emerald-700">
                    <Globe className="w-3 h-3" /> SAFE_PUBLIC
                  </span>
                )}
              </div>
              <div className="text-base font-bold font-mono tracking-tight my-2">
                {selectedCap.capability_id}
              </div>
              <div className="text-xs text-stone-300 dark:text-stone-700 space-y-1 mt-3">
                <div className="flex justify-between py-1 border-t border-stone-800 dark:border-stone-200">
                  <span>Scope:</span>
                  <span className="font-medium">
                    {selectedCap.project_scoped ? 'Tenant Project' : 'Global System'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-t border-stone-800 dark:border-stone-200">
                  <span>Závisí na:</span>
                  <span className="font-medium">{selectedCap.depends_on_capabilities.length} modulů</span>
                </div>
                <div className="flex justify-between py-1 border-t border-stone-800 dark:border-stone-200">
                  <span>Využíván v:</span>
                  <span className="font-medium">{incomingDependencies.length} modulů</span>
                </div>
              </div>
            </div>
          </div>

          {/* Outgoing Dependents (Depended On By) */}
          <div className="bg-stone-50 dark:bg-stone-900/50 p-4 rounded-lg border border-stone-200 dark:border-stone-800 flex flex-col">
            <div className="text-xs font-semibold text-stone-600 dark:text-stone-400 mb-3 flex items-center justify-between">
              <span>Moduly závislé na tomto ({incomingDependencies.length})</span>
              <span className="text-[10px] text-stone-400">Následné moduly</span>
            </div>
            {incomingDependencies.length > 0 ? (
              <div className="space-y-2 flex-1">
                {incomingDependencies.map((dep) => (
                  <div
                    key={dep.capability_id}
                    onClick={() => onSelectCapability?.(dep.capability_id)}
                    className="p-2.5 bg-white dark:bg-stone-900 rounded border border-stone-200 dark:border-stone-800 cursor-pointer hover:border-stone-400 dark:hover:border-stone-600 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-medium text-stone-900 dark:text-stone-100">
                        {dep.capability_id}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-stone-400" />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 font-mono">
                        {dep.visibility}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-4 text-center text-xs text-stone-400 border border-dashed border-stone-200 dark:border-stone-800 rounded">
                Žádné navazující moduly (Koncový modul)
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-8 text-center bg-stone-50 dark:bg-stone-900/30 rounded-lg border border-stone-200 dark:border-stone-800 text-stone-500 text-xs">
          Klikněte na některou schopnost výše pro zobrazení toku závislostí.
        </div>
      )}
    </div>
  );
}
