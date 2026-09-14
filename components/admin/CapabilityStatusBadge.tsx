"use client";

import React from 'react';
import { CheckCircle2, Sparkles, Clock, AlertCircle, FlaskConical } from 'lucide-react';

export type CapabilityStatus = 'FUNKČNÍ' | 'PROTOTYP' | 'UI PŘIPRAVENO' | 'PLÁNOVÁNO' | 'VYPNUTO';

interface CapabilityStatusBadgeProps {
  status: CapabilityStatus;
  size?: 'sm' | 'md';
}

export function CapabilityStatusBadge({ status, size = 'md' }: CapabilityStatusBadgeProps) {
  const getBadgeConfig = () => {
    switch (status) {
      case 'FUNKČNÍ':
        return {
          label: 'FUNKČNÍ',
          icon: CheckCircle2,
          className:
            'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-500/30',
        };
      case 'PROTOTYP':
        return {
          label: 'PROTOTYP',
          icon: FlaskConical,
          className:
            'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20 dark:border-indigo-500/30',
        };
      case 'UI PŘIPRAVENO':
        return {
          label: 'UI PŘIPRAVENO',
          icon: Sparkles,
          className:
            'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20 dark:border-sky-500/30',
        };
      case 'PLÁNOVÁNO':
        return {
          label: 'PLÁNOVÁNO',
          icon: Clock,
          className:
            'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 dark:border-amber-500/30',
        };
      case 'VYPNUTO':
      default:
        return {
          label: 'VYPNUTO',
          icon: AlertCircle,
          className:
            'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20 dark:border-slate-500/30',
        };
    }
  };

  const config = getBadgeConfig();
  const Icon = config.icon;

  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-[11px] gap-1 font-semibold'
      : 'px-2.5 py-1 text-xs gap-1.5 font-bold';

  return (
    <span
      className={`inline-flex items-center rounded-full border tracking-wide uppercase shadow-2xs whitespace-nowrap ${sizeClasses} ${config.className}`}
    >
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      <span>{config.label}</span>
    </span>
  );
}
