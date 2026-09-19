"use client";

import React, { useState } from 'react';
import {
  Layers,
  Search,
  Filter,
  Lock,
  Globe,
  Info,
} from 'lucide-react';
import { BasicSystemMap, BasicCapabilityRecord } from './types';
import { DependencyFlow } from './DependencyFlow';

export interface BasicSystemMapViewProps {
  data: BasicSystemMap;
  onSelectCapability?: (id: string) => void;
  selectedCapabilityId?: string | null;
}

export function BasicSystemMapView({
  data,
  onSelectCapability,
  selectedCapabilityId,
}: BasicSystemMapViewProps) {
  const [search, setSearch] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'ALL' | 'OWNER_INTERNAL' | 'SAFE_PUBLIC_METADATA'>('ALL');

  const filteredCapabilities = data.capabilities.filter((cap) => {
    const matchesSearch = cap.capability_id.toLowerCase().includes(search.toLowerCase());
    const matchesVisibility =
      visibilityFilter === 'ALL' || cap.visibility === visibilityFilter;
    return matchesSearch && matchesVisibility;
  });

  const publicCount = data.capabilities.filter((c) => c.visibility === 'SAFE_PUBLIC_METADATA').length;
  const internalCount = data.capabilities.filter((c) => c.visibility === 'OWNER_INTERNAL').length;

  return (
    <div className="space-y-6">
      {/* Top Banner / Summary metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wider">
              Celkem funkcí (Basic View)
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

      {/* Info notice explaining Basic View boundary */}
      <div className="p-3 bg-stone-50 dark:bg-stone-900/40 rounded-lg border border-stone-200 dark:border-stone-800 flex items-start gap-2 text-xs text-stone-600 dark:text-stone-400">
        <Info className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-stone-800 dark:text-stone-200">Základní pohled (Basic System Map): </span>
          Zobrazuje bezpečné systémové schopnosti a graf závislostí. Interní souborové cesty, datové modely, API hranice a Git historie jsou skryté podle zásad bezpečného přístupu.
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white dark:bg-stone-900 p-3 rounded-lg border border-stone-200 dark:border-stone-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Hledat podle capability ID..."
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

      {/* Capabilities Card Grid */}
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

                <div className="mt-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-stone-500 dark:text-stone-400 font-mono text-[11px]">
                    <span>Scope:</span>
                    <span className="font-semibold">
                      {cap.project_scoped ? 'Project Scoped' : 'Global'}
                    </span>
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
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
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
