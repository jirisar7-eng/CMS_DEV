"use client";

import React, { useState } from 'react';
import { Layers, History, Lock, Globe } from 'lucide-react';
import {
  BasicSystemMap,
  InternalSystemMap,
  SystemMapAccessLevel,
} from './types';
import { BasicSystemMapView } from './BasicSystemMapView';
import { InternalSystemMapView } from './InternalSystemMapView';
import { LineageHistoryTab } from './LineageHistoryTab';

export interface SystemMapWorkspaceProps {
  data: BasicSystemMap | InternalSystemMap;
  accessLevel: SystemMapAccessLevel;
}

export function SystemMapWorkspace({
  data,
  accessLevel,
}: SystemMapWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'map' | 'lineage'>('map');
  const [selectedCapabilityId, setSelectedCapabilityId] = useState<string | null>(null);

  const isInternal = data.view === 'internal' && accessLevel === 'internal';

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-stone-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold font-mono text-stone-900 dark:text-stone-100 tracking-tight">
              Mapa systému
            </h1>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold uppercase flex items-center gap-1 ${
                isInternal
                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
              }`}
            >
              {isInternal ? <Lock className="w-2.5 h-2.5" /> : <Globe className="w-2.5 h-2.5" />}
              {isInternal ? 'Interní přístup' : 'Základní přístup'}
            </span>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
            Architektonický přehled systémových schopností, závislostí a implementační historie.
          </p>
        </div>

        {/* Tabs for Internal Access */}
        {isInternal && (
          <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 p-1 rounded-lg self-start md:self-auto">
            <button
              onClick={() => setActiveTab('map')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'map'
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-sm'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Aktuální mapa
            </button>
            <button
              onClick={() => setActiveTab('lineage')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'lineage'
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-sm'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Historie implementace
            </button>
          </div>
        )}
      </div>

      {/* Main Content View */}
      {isInternal ? (
        activeTab === 'map' ? (
          <InternalSystemMapView
            data={data as InternalSystemMap}
            selectedCapabilityId={selectedCapabilityId}
            onSelectCapability={(id) =>
              setSelectedCapabilityId(selectedCapabilityId === id ? null : id)
            }
          />
        ) : (
          <LineageHistoryTab
            data={data as InternalSystemMap}
            onSelectCapability={(id) => {
              setSelectedCapabilityId(id);
              setActiveTab('map');
            }}
          />
        )
      ) : (
        <BasicSystemMapView
          data={data as BasicSystemMap}
          selectedCapabilityId={selectedCapabilityId}
          onSelectCapability={(id) =>
            setSelectedCapabilityId(selectedCapabilityId === id ? null : id)
          }
        />
      )}
    </div>
  );
}
