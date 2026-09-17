import React from 'react';
import { PageSummary, PageActionType } from '@/lib/domain/pages';
import { PageStatusBadge } from './PageStatusBadge';
import { PageRowActions } from './PageRowActions';
import { FileText, ExternalLink, CornerDownRight } from 'lucide-react';
import Link from 'next/link';
import { withAdminProjectContext } from '@/lib/domain/pages-client/project-context';

interface PageListTableProps {
  pages: PageSummary[];
  parentMap: Map<string, string>;
  onAction: (action: PageActionType, page: PageSummary) => void;
  projectId?: string;
}

export function PageListTable({ pages, parentMap, onAction, projectId }: PageListTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <th scope="col" className="py-3 pl-4 pr-3">
              Název stránky
            </th>
            <th scope="col" className="py-3 px-3">
              Stav
            </th>
            <th scope="col" className="py-3 px-3">
              Cesta
            </th>
            <th scope="col" className="py-3 px-3">
              Poslední úprava
            </th>
            <th scope="col" className="py-3 px-3">
              Autor
            </th>
            <th scope="col" className="py-3 pr-4 pl-3 text-right">
              Akce
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {pages.map((page) => {
            const formattedDate = new Intl.DateTimeFormat('cs-CZ', {
              day: 'numeric',
              month: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(page.updatedAt));

            const parentTitle = page.parentId ? parentMap.get(page.parentId) : undefined;

            return (
              <tr
                key={page.id}
                className="border-b border-border/70 hover:bg-muted/40 transition-colors"
              >
                {/* Název */}
                <td className="py-3.5 pl-4 pr-3 text-sm font-medium text-foreground">
                  <div className="flex flex-col">
                    <Link
                      href={withAdminProjectContext(`/admin/pages/${page.id}`, projectId)}
                      className="flex items-center gap-2 group/title"
                    >
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0 group-hover/title:text-primary transition-colors" />
                      <span className="truncate max-w-[240px] lg:max-w-md font-semibold text-foreground group-hover/title:text-primary transition-colors">
                        {page.title}
                      </span>
                    </Link>
                    {parentTitle && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground pl-6 mt-0.5 truncate">
                        <CornerDownRight className="w-3 h-3 shrink-0" />
                        <span>Pod: {parentTitle}</span>
                      </span>
                    )}
                  </div>
                </td>

                {/* Stav */}
                <td className="py-3.5 px-3 whitespace-nowrap">
                  <PageStatusBadge status={page.status} size="sm" />
                </td>

                {/* Cesta */}
                <td className="py-3.5 px-3 text-xs font-mono text-muted-foreground whitespace-nowrap">
                  <div className="flex items-center gap-1 max-w-[200px] truncate">
                    <span className="truncate">{page.path || '/'}</span>
                    <Link
                      href={`/preview/site?path=${encodeURIComponent(page.path || '/')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Otevřít veřejný náhled"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </Link>
                  </div>
                </td>

                {/* Poslední úprava */}
                <td className="py-3.5 px-3 text-xs text-muted-foreground whitespace-nowrap">
                  {formattedDate}
                </td>

                {/* Autor */}
                <td className="py-3.5 px-3 text-xs text-foreground/80 whitespace-nowrap">
                  {page.author.name}
                </td>

                {/* Akce */}
                <td className="py-3.5 pr-4 pl-3 text-right whitespace-nowrap">
                  <PageRowActions page={page} onAction={onAction} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
