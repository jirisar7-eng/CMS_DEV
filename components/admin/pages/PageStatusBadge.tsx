import React from 'react';
import { PageStatus } from '@/lib/domain/pages';
import { CheckCircle2, Clock, FileEdit, Eye, Archive, AlertCircle } from 'lucide-react';

interface PageStatusBadgeProps {
  status: PageStatus;
  size?: 'sm' | 'md';
}

export function PageStatusBadge({ status, size = 'md' }: PageStatusBadgeProps) {
  const getStatusConfig = (s: PageStatus) => {
    switch (s) {
      case 'Publikováno':
        return {
          bg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
          dot: 'bg-emerald-500',
          icon: CheckCircle2,
          label: 'Publikováno',
        };
      case 'Naplánováno':
        return {
          bg: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20',
          dot: 'bg-sky-500',
          icon: Clock,
          label: 'Naplánováno',
        };
      case 'Schváleno':
        return {
          bg: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20',
          dot: 'bg-indigo-500',
          icon: Eye,
          label: 'Schváleno',
        };
      case 'Ke kontrole':
        return {
          bg: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
          dot: 'bg-amber-500',
          icon: AlertCircle,
          label: 'Ke kontrole',
        };
      case 'Koncept':
        return {
          bg: 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20',
          dot: 'bg-slate-400',
          icon: FileEdit,
          label: 'Koncept',
        };
      case 'Archivováno':
        return {
          bg: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20',
          dot: 'bg-rose-500',
          icon: Archive,
          label: 'Archivováno',
        };
    }
  };

  const config = getStatusConfig(status);
  const Icon = config.icon;

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${config.bg} ${sizeClasses} whitespace-nowrap`}
      title={`Stav: ${config.label}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
}
