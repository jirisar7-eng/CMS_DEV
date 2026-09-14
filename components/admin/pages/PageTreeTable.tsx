import React from 'react';
import { PageTreeNode, PageActionType, PageSummary } from '@/lib/domain/pages';
import { PageStatusBadge } from './PageStatusBadge';
import { PageRowActions } from './PageRowActions';
import { ChevronRight, ChevronDown, FileText, CornerDownRight, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface PageTreeTableProps {
  nodes: PageTreeNode[];
  expandedMap: Record<string, boolean>;
  onToggleExpand: (id: string) => void;
  onAction: (action: PageActionType, page: PageSummary) => void;
}

export function PageTreeTable({ nodes, expandedMap, onToggleExpand, onAction }: PageTreeTableProps) {
  const renderRow = (node: PageTreeNode) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedMap[node.id] ?? true;

    const formattedDate = new Intl.DateTimeFormat('cs-CZ', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(node.updatedAt));

    return (
      <React.Fragment key={node.id}>
        <tr className="border-b border-border/70 hover:bg-muted/40 transition-colors">
          {/* Název stránky s odsazením a stromovým collapse/expand */}
          <td className="py-3.5 pl-4 pr-3 text-sm font-medium text-foreground">
            <div
              className="flex items-center gap-1.5"
              style={{ paddingLeft: `${node.level * 24}px` }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  aria-label={isExpanded ? `Sbalit podstránky pro ${node.title}` : `Rozbalit podstránky pro ${node.title}`}
                  onClick={() => onToggleExpand(node.id)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors shrink-0"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
              ) : (
                <span className="w-6 shrink-0 flex items-center justify-center text-muted-foreground/40">
                  {node.level > 0 && <CornerDownRight className="w-3.5 h-3.5" />}
                </span>
              )}

              <Link
                href={`/admin/pages/${node.id}`}
                className="flex items-center gap-2 group/title truncate min-w-0"
              >
                <FileText className="w-4 h-4 text-muted-foreground shrink-0 group-hover/title:text-primary transition-colors" />
                <span className="truncate max-w-[260px] lg:max-w-md font-semibold text-foreground group-hover/title:text-primary transition-colors">
                  {node.title}
                </span>
              </Link>
              {hasChildren && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0 font-normal">
                  {node.children.length}
                </span>
              )}
            </div>
          </td>

          {/* Stav */}
          <td className="py-3.5 px-3 whitespace-nowrap">
            <PageStatusBadge status={node.status} size="sm" />
          </td>

          {/* Cesta */}
          <td className="py-3.5 px-3 text-xs font-mono text-muted-foreground whitespace-nowrap">
            <div className="flex items-center gap-1 max-w-[200px] truncate">
              <span className="truncate">{node.path || '/'}</span>
              <Link
                href={`/preview/site?path=${encodeURIComponent(node.path || '/')}`}
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
            {node.author.name}
          </td>

          {/* Akce */}
          <td className="py-3.5 pr-4 pl-3 text-right whitespace-nowrap">
            <PageRowActions page={node} onAction={onAction} />
          </td>
        </tr>

        {hasChildren && isExpanded && node.children.map((child) => renderRow(child))}
      </React.Fragment>
    );
  };

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
          {nodes.map((node) => renderRow(node))}
        </tbody>
      </table>
    </div>
  );
}
