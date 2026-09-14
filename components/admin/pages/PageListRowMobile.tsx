import React from 'react';
import Link from 'next/link';
import { PageSummary, PageActionType } from '@/lib/domain/pages';
import { PageStatusBadge } from './PageStatusBadge';
import { PageRowActions } from './PageRowActions';
import { FileText, CornerDownRight } from 'lucide-react';

interface PageListRowMobileProps {
  page: PageSummary;
  parentTitle?: string;
  onAction: (action: PageActionType, page: PageSummary) => void;
}

export function PageListRowMobile({ page, parentTitle, onAction }: PageListRowMobileProps) {
  const formattedDate = new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(new Date(page.updatedAt));

  return (
    <div
      id={`page-mobile-card-${page.id}`}
      className="p-3.5 bg-card border-b border-border/70 last:border-b-0 space-y-2.5 transition-colors hover:bg-muted/40"
    >
      {/* Top row: Hierarchy/Title & 44px Action Button */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          {/* Subtle parent relationship */}
          {parentTitle && (
            <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground truncate leading-tight">
              <CornerDownRight className="w-3 h-3 shrink-0 text-muted-foreground/70" />
              <span className="truncate">Pod: {parentTitle}</span>
            </div>
          )}

          {/* Dominant Title */}
          <Link
            href={`/admin/pages/${page.id}`}
            className="flex items-center gap-1.5 group/title"
          >
            <FileText className="w-4 h-4 text-muted-foreground shrink-0 group-hover/title:text-primary transition-colors" />
            <h3 className="font-semibold text-foreground group-hover/title:text-primary text-sm leading-snug tracking-tight truncate transition-colors">
              {page.title}
            </h3>
          </Link>

          {/* Secondary Slug / Path */}
          <div className="text-xs font-mono text-muted-foreground/80 truncate pl-5">
            {page.path || '/'}
          </div>
        </div>

        {/* Action Menu (Accessible 44px touch target) */}
        <div className="shrink-0 -mr-1.5 -mt-1">
          <PageRowActions page={page} onAction={onAction} />
        </div>
      </div>

      {/* Bottom row: Compact Status Badge & Unclipped Author/Date Metadata */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40 text-[11px] text-muted-foreground">
        <PageStatusBadge status={page.status} size="sm" />

        <div className="flex items-center gap-2 text-right shrink-0 whitespace-nowrap">
          <span className="font-medium text-foreground/80">{page.author.name}</span>
          <span className="text-border">·</span>
          <span>{formattedDate}</span>
        </div>
      </div>
    </div>
  );
}
