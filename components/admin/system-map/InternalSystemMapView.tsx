"use client";

import React, { useState } from 'react';
import {
  Layers,
  Search,
  Filter,
  Lock,
  Globe,
  Code,
  Database,
  Network,
  Shield,
  GitCommit,
  Info,
} from 'lucide-react';
import { InternalSystemMap, InternalCapabilityRecord } from './types';
import { DependencyFlow } from './DependencyFlow';

export interface InternalSystemMapViewProps {
  data: InternalSystemMap;
  onSelectCapability?: (id: string) => void;
  selectedCapabilityId?: string | null;
}

export function InternalSystemMapView({
  data,
  onSelectCapability,
  selectedCapabilityId,
}: InternalSystemMapViewProps) {
  const [search, setSearch] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'ALL' | 'OWNER_INTERNAL' | 'SAFE_PUBLIC_METADATA'>('ALL');

  const filteredCapabilities = (data.capabilities || []).filter((cap) => {
    const query = search.toLowerCase();
    const matchesSearch =
      cap.capability_id.toLowerCase().includes(query) ||
      cap.source_paths.some((p) => p.toLowerCase().includes(query)) ||
      cap.db_models.some((m) => m.toLowerCase().includes(query)) ||
      cap.api_boundaries.some((a) => a.toLowerCase().includes(query));

    const matchesVisibility =
      visibilityFilter === 'ALL' || cap.visibility === visibilityFilter;

    return matchesSearch && matchesVisibility;
  });

  const publicCount = data.capabilities.filter((c) => c.visibility === 'SAFE_PUBLIC_METADATA').length;
  const internalCount = data.capabilities.filter((c) => c.visibility === 'OWNER_INTERNAL').length;

  const activeCapability = data.capabilities.find((c) => c.capability_id === selectedCapabilityId);

  return (
    <div className="space-y-6">
      {/* Top Banner / Summary metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wider">
              Celkem funkcí (Internal View)
            </div>
            <div className="text-2xl font-bold font-mono text-stone-900 dark:text-stone-100 mt-1">
              {data.total_capabilities}
            </div>
          </div>
          <Layers className="w-8 h-8 text-stone-400 dark:text-stone-600" />
        </div>

        <div className="p-4 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wider">
              Veřejná Metadata
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              {publicCount}
            </div>
          </div>
          <Globe className="w-8 h-8 text-emerald-500/30" />
        </div>

        <div className="p-4 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wider">
              Interní Schopnosti
            </div>
            <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
              {internalCount}
            </div>
          </div>
          <Lock className="w-8 h-8 text-amber-500/30" />
        </div>
      </div>

      {/* Info Notice */}
      <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800/50 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
        <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">Interní pohled (Internal System Map): </span>
          Zobrazuje kompletní architekturu včetně souborových cest, databázových modelů, API rozhraní a bezpečnostních hranic.
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white dark:bg-stone-900 p-3 rounded-lg border border-stone-200 dark:border-stone-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Hledat podle ID, cesty, modelu nebo API..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-900 dark:text-stone-100"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-stone-400" />
          <select
            value={visibilityFilter}
            onChange={(e) =>
              setVisibilityFilter(
                e.target.value as 'ALL' | 'OWNER_INTERNAL' | 'SAFE_PUBLIC_METADATA'
              )
            }
            className="bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded px-2 py-1.5 text-xs text-stone-800 dark:text-stone-200 focus:outline-none"
          >
            <option value="ALL">Všechny viditelnosti</option>
            <option value="OWNER_INTERNAL">OWNER_INTERNAL</option>
            <option value="SAFE_PUBLIC_METADATA">SAFE_PUBLIC_METADATA</option>
          </select>
        </div>
      </div>

      {/* Selected Capability Details Panel */}
      {activeCapability && (
        <div className="p-4 bg-stone-900 text-stone-100 rounded-lg border border-stone-800 space-y-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-stone-800 pb-3">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 block">
                Detail vybrané schopnosti
              </span>
              <h3 className="text-base font-bold font-mono text-white mt-0.5">
                {activeCapability.capability_id}
              </h3>
            </div>
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium flex items-center gap-1 ${
                activeCapability.visibility === 'OWNER_INTERNAL'
                  ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                  : 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30'
              }`}
            >
              {activeCapability.visibility === 'OWNER_INTERNAL' ? (
                <Lock className="w-2.5 h-2.5" />
              ) : (
                <Globe className="w-2.5 h-2.5" />
              )}
              {activeCapability.visibility}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            {/* Security Boundary */}
            <div>
              <span className="text-stone-400 text-[10px] uppercase font-sans font-semibold tracking-wider flex items-center gap-1 mb-1">
                <Shield className="w-3 h-3 text-amber-400" />
                Bezpečnostní hranice:
              </span>
              <div className="bg-stone-950 p-2 rounded border border-stone-800 text-stone-200">
                {activeCapability.security_boundary}
              </div>
            </div>

            {/* Source Paths */}
            <div>
              <span className="text-stone-400 text-[10px] uppercase font-sans font-semibold tracking-wider flex items-center gap-1 mb-1">
                <Code className="w-3 h-3 text-sky-400" />
                Zdrojové kódové cesty ({activeCapability.source_paths.length}):
              </span>
              <div className="bg-stone-950 p-2 rounded border border-stone-800 text-stone-300 max-h-24 overflow-y-auto space-y-0.5">
                {activeCapability.source_paths.length > 0 ? (
                  activeCapability.source_paths.map((p, idx) => <div key={idx}>{p}</div>)
                ) : (
                  <span className="text-stone-500 italic">Žádné explicitní cesty</span>
                )}
              </div>
            </div>

            {/* DB Models */}
            <div>
              <span className="text-stone-400 text-[10px] uppercase font-sans font-semibold tracking-wider flex items-center gap-1 mb-1">
                <Database className="w-3 h-3 text-indigo-400" />
                Databázové modely ({activeCapability.db_models.length}):
              </span>
              <div className="bg-stone-950 p-2 rounded border border-stone-800 text-stone-300 max-h-24 overflow-y-auto space-y-0.5">
                {activeCapability.db_models.length > 0 ? (
                  activeCapability.db_models.map((m, idx) => <div key={idx}>{m}</div>)
                ) : (
                  <span className="text-stone-500 italic">Žádné DB modely</span>
                )}
              </div>
            </div>

            {/* API Boundaries */}
            <div>
              <span className="text-stone-400 text-[10px] uppercase font-sans font-semibold tracking-wider flex items-center gap-1 mb-1">
                <Network className="w-3 h-3 text-emerald-400" />
                API hranice ({activeCapability.api_boundaries.length}):
              </span>
              <div className="bg-stone-950 p-2 rounded border border-stone-800 text-stone-300 max-h-24 overflow-y-auto space-y-0.5">
                {activeCapability.api_boundaries.length > 0 ? (
                  activeCapability.api_boundaries.map((a, idx) => <div key={idx}>{a}</div>)
                ) : (
                  <span className="text-stone-500 italic">Žádné API hranice</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Capabilities Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCapabilities.map((cap) => {
          const isSelected = cap.capability_id === selectedCapabilityId;
          return (
            <div
              key={cap.capability_id}
              onClick={() => onSelectCapability?.(cap.capability_id)}
              className={`p-4 rounded-lg border transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-stone-900 text-white border-stone-900 dark:bg-stone-100 dark:text-stone-900 shadow-md ring-2 ring-stone-900 dark:ring-stone-100'
                  : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-mono text-xs font-bold tracking-tight truncate">
                    {cap.capability_id}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium shrink-0 flex items-center gap-1 ${
                      cap.visibility === 'OWNER_INTERNAL'
                        ? isSelected
                          ? 'bg-amber-400/30 text-amber-200 dark:text-amber-800'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                        : isSelected
                        ? 'bg-emerald-400/30 text-emerald-200 dark:text-emerald-800'
                        : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                    }`}
                  >
                    {cap.visibility === 'OWNER_INTERNAL' ? (
                      <Lock className="w-2.5 h-2.5" />
                    ) : (
                      <Globe className="w-2.5 h-2.5" />
                    )}
                    {cap.visibility}
                  </span>
                </div>

                <div className="mt-3 space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between text-stone-500 dark:text-stone-400 text-[11px]">
                    <span>Boundary:</span>
                    <span className="font-semibold truncate max-w-[150px]">
                      {cap.security_boundary}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-stone-100 dark:border-stone-800/80">
                    <div className="flex items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400 mb-1">
                      <Code className="w-3 h-3 text-sky-500" />
                      <span>Cesty ({cap.source_paths.length}):</span>
                    </div>
                    {cap.source_paths.length > 0 ? (
                      <div className="text-[10px] text-stone-600 dark:text-stone-300 truncate">
                        {cap.source_paths[0]}
                        {cap.source_paths.length > 1 && ` +${cap.source_paths.length - 1} dalších`}
                      </div>
                    ) : (
                      <span className="text-[10px] text-stone-400 italic">Žádné cesty</span>
                    )}
                  </div>

                  <div className="pt-2 border-t border-stone-100 dark:border-stone-800/80">
                    <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400 block mb-1">
                      Závislosti ({cap.depends_on_capabilities.length}):
                    </span>
                    {cap.depends_on_capabilities.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {cap.depends_on_capabilities.map((depId) => (
                          <span
                            key={depId}
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              isSelected
                                ? 'bg-stone-800 text-stone-200 dark:bg-stone-200 dark:text-stone-800'
                                : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                            }`}
                          >
                            {depId}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] text-stone-400 italic">
                        Bez dalších závislostí
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dependency Flow Section */}
      <div className="pt-6 border-t border-stone-200 dark:border-stone-800">
        <DependencyFlow
          capabilities={data.capabilities}
          selectedCapabilityId={selectedCapabilityId}
          onSelectCapability={onSelectCapability}
        />
      </div>
    </div>
  );
}
