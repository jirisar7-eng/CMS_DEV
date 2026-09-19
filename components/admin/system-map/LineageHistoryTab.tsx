"use client";

import React, { useState } from 'react';
import {
  GitMerge,
  GitCommit,
  GitBranch,
  Search,
  FileCode,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import { InternalSystemMap } from './types';

export interface LineageHistoryTabProps {
  data: InternalSystemMap;
  onSelectCapability?: (id: string) => void;
}

export function LineageHistoryTab({
  data,
  onSelectCapability,
}: LineageHistoryTabProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'MERGED' | 'COMPLETED'>('ALL');
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const filteredTasks = (data.tasks || []).filter((task) => {
    const query = search.toLowerCase();
    const matchesSearch =
      (task.task_id && task.task_id.toLowerCase().includes(query)) ||
      task.pr_title.toLowerCase().includes(query) ||
      task.branch.toLowerCase().includes(query) ||
      task.merge_sha.toLowerCase().includes(query);

    const matchesStatus =
      statusFilter === 'ALL' ||
      task.derived_status === statusFilter ||
      task.capsule_declared_status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const mergedCount = data.tasks.filter((t) => t.derived_status === 'MERGED').length;
  const capsuleCount = data.tasks.filter((t) => t.capsule_present).length;

  return (
    <div className="space-y-6">
      {/* Lineage Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wider">
              Celkem registrovaných úloh
            </div>
            <div className="text-2xl font-bold font-mono text-stone-900 dark:text-stone-100 mt-1">
              {data.total_tasks}
            </div>
          </div>
          <GitMerge className="w-8 h-8 text-stone-400 dark:text-stone-600" />
        </div>

        <div className="p-4 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wider">
              Sloučené úlohy (MERGED)
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              {mergedCount}
            </div>
          </div>
          <ShieldCheck className="w-8 h-8 text-emerald-500/30" />
        </div>

        <div className="p-4 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wider">
              Historické úlohy s kapslí
            </div>
            <div className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-1">
              {capsuleCount}
            </div>
          </div>
          <FileCode className="w-8 h-8 text-indigo-500/30" />
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white dark:bg-stone-900 p-3 rounded-lg border border-stone-200 dark:border-stone-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Hledat podle Task ID, PR násobu, branch nebo SHA..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-900 dark:text-stone-100"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'MERGED' | 'COMPLETED')}
          className="bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded px-2 py-1.5 text-xs text-stone-800 dark:text-stone-200 focus:outline-none"
        >
          <option value="ALL">Všechny stavy</option>
          <option value="MERGED">Pouze MERGED</option>
          <option value="COMPLETED">Pouze COMPLETED</option>
        </select>
      </div>

      {/* Lineage Timeline List */}
      <div className="space-y-3">
        {filteredTasks.length > 0 ? (
          filteredTasks.map((task) => {
            const taskIdKey = task.task_id || `pr-${task.pr_number}`;
            const isExpanded = expandedTask === taskIdKey;

            return (
              <div
                key={taskIdKey}
                className="bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 overflow-hidden shadow-sm transition-all"
              >
                <div
                  onClick={() => setExpandedTask(isExpanded ? null : taskIdKey)}
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/40"
                >
                  <div className="flex items-center gap-3">
                    <button className="text-stone-400 hover:text-stone-600">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold font-mono text-stone-900 dark:text-stone-100">
                          #{task.pr_number}
                        </span>
                        <span className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                          {task.pr_title}
                        </span>
                        {task.task_id && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700">
                            {task.task_id}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-stone-500 font-mono">
                        <span className="flex items-center gap-1">
                          <GitBranch className="w-3 h-3 text-stone-400" />
                          {task.branch}
                        </span>
                        <span className="flex items-center gap-1">
                          <GitCommit className="w-3 h-3 text-stone-400" />
                          {task.merge_sha.slice(0, 8)}
                        </span>
                        <span className="flex items-center gap-1 text-stone-400">
                          <Calendar className="w-3 h-3" />
                          {new Date(task.merged_at).toLocaleDateString('cs-CZ', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded flex items-center gap-1 ${
                        task.derived_status === 'MERGED'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20'
                      }`}
                    >
                      <ShieldCheck className="w-3 h-3" />
                      {task.derived_status}
                    </span>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="p-4 bg-stone-50 dark:bg-stone-900/80 border-t border-stone-200 dark:border-stone-800 text-xs space-y-3 font-mono">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <span className="text-stone-500 text-[10px] uppercase font-sans font-bold tracking-wider block mb-1">
                          Dotčené schopnosti (Touches Capabilities):
                        </span>
                        {task.touches_capabilities.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {task.touches_capabilities.map((capId) => (
                              <button
                                key={capId}
                                onClick={() => onSelectCapability?.(capId)}
                                className="text-[10px] bg-stone-200 dark:bg-stone-800 text-stone-800 dark:text-stone-200 px-1.5 py-0.5 rounded hover:bg-stone-300 dark:hover:bg-stone-700"
                              >
                                {capId}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-stone-400 text-[11px]">Žádné přímé schopnosti</span>
                        )}
                      </div>

                      <div>
                        <span className="text-stone-500 text-[10px] uppercase font-sans font-bold tracking-wider block mb-1">
                          Závislosti úloh (Depends On Tasks):
                        </span>
                        {task.depends_on_tasks.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {task.depends_on_tasks.map((depTask) => (
                              <span
                                key={depTask}
                                className="text-[10px] bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 px-1.5 py-0.5 rounded"
                              >
                                {depTask}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-stone-400 text-[11px]">Žádné předchozí úlohy</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="text-stone-500 text-[10px] uppercase font-sans font-bold tracking-wider block mb-1">
                        Povolené cesty kapsle (Allowed Paths):
                      </span>
                      <div className="bg-white dark:bg-stone-950 p-2 rounded border border-stone-200 dark:border-stone-800 text-[11px] text-stone-700 dark:text-stone-300 max-h-24 overflow-y-auto space-y-0.5">
                        {task.allowed_paths.map((p, idx) => (
                          <div key={idx}>{p}</div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-stone-500 text-[10px] uppercase font-sans font-bold tracking-wider block mb-1">
                        Skutečně změněné soubory ({task.actual_changed_files.length}):
                      </span>
                      <div className="bg-white dark:bg-stone-950 p-2 rounded border border-stone-200 dark:border-stone-800 text-[11px] text-stone-700 dark:text-stone-300 max-h-28 overflow-y-auto space-y-0.5">
                        {task.actual_changed_files.map((f, idx) => (
                          <div key={idx} className="text-emerald-700 dark:text-emerald-400">
                            {f}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 text-stone-500 text-xs">
            Nebyly nalezeny žádné úlohy odpovídající zadaným filtrům.
          </div>
        )}
      </div>
    </div>
  );
}
