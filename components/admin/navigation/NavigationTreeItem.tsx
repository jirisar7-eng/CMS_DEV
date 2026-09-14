"use client";

import React from 'react';
import {
  FileText,
  ExternalLink,
  Hash,
  FolderTree,
  ChevronRight,
  MoveUp,
  MoveDown,
  CornerDownRight,
  CornerUpLeft,
  Settings2,
  Trash2,
  Eye,
  EyeOff,
  AlertTriangle,
  Plus,
} from 'lucide-react';
import { NavigationItem } from '@/lib/domain/navigation/types';
import { PageSummary } from '@/lib/domain/pages';
import { MAX_NAVIGATION_DEPTH } from '@/lib/domain/navigation/validation';

interface NavigationTreeItemProps {
  item: NavigationItem;
  index: number;
  totalSiblings: number;
  siblingIndex: number;
  depth: number;
  hasChildren: boolean;
  pagesMap: Map<string, PageSummary>;
  isBroken: boolean;
  onMoveUp: (itemId: string) => void;
  onMoveDown: (itemId: string) => void;
  onIndent: (itemId: string) => void;
  onOutdent: (itemId: string) => void;
  onToggleVisibility: (itemId: string) => void;
  onEdit: (item: NavigationItem) => void;
  onDelete: (item: NavigationItem) => void;
  onAddSubItem: (parentId: string) => void;
}

export const NavigationTreeItem: React.FC<NavigationTreeItemProps> = ({
  item,
  index,
  totalSiblings,
  siblingIndex,
  depth,
  hasChildren,
  pagesMap,
  isBroken,
  onMoveUp,
  onMoveDown,
  onIndent,
  onOutdent,
  onToggleVisibility,
  onEdit,
  onDelete,
  onAddSubItem,
}) => {
  const canMoveUp = siblingIndex > 0;
  const canMoveDown = siblingIndex < totalSiblings - 1;
  const canIndent = siblingIndex > 0 && depth < MAX_NAVIGATION_DEPTH;
  const canOutdent = depth > 0;

  // Resolve target description
  let targetDisplay = '';
  let targetTypeBadge = '';
  let TypeIcon = FileText;

  if (item.type === 'PAGE') {
    TypeIcon = FileText;
    targetTypeBadge = 'Stránka';
    if (item.pageId) {
      const page = pagesMap.get(item.pageId);
      if (page) {
        targetDisplay = page.path;
      } else {
        targetDisplay = `Neznámé ID: ${item.pageId}`;
      }
    }
  } else if (item.type === 'EXTERNAL_LINK') {
    TypeIcon = ExternalLink;
    targetTypeBadge = 'Externí URL';
    targetDisplay = item.externalUrl || '';
  } else if (item.type === 'ANCHOR') {
    TypeIcon = Hash;
    targetTypeBadge = 'Kotva';
    targetDisplay = item.anchor || '';
  } else if (item.type === 'GROUP') {
    TypeIcon = FolderTree;
    targetTypeBadge = 'Skupina';
    targetDisplay = 'Organizační uzel (bez URL odkazu)';
  }

  return (
    <div
      id={`nav-item-row-${item.id}`}
      className={`group p-3 sm:p-3.5 text-xs sm:text-sm grid grid-cols-12 gap-2 items-center transition-colors border-b border-border/60 ${
        !item.visibility ? 'bg-muted/30 opacity-75' : 'hover:bg-muted/30 bg-card'
      }`}
    >
      {/* 1. Title & Hierarchical Tree Indent (Col 5 / 4) */}
      <div
        className="col-span-12 sm:col-span-5 flex items-center gap-1.5 min-w-0"
        style={{ paddingLeft: `${depth * 20}px` }}
      >
        {depth > 0 && (
          <div className="flex items-center text-muted-foreground/60 shrink-0 select-none mr-0.5">
            <span className="text-muted-foreground/40 font-mono text-xs">└─</span>
          </div>
        )}

        <div className="p-1.5 rounded-lg bg-muted text-foreground shrink-0">
          <TypeIcon className="w-3.5 h-3.5" />
        </div>

        <div className="min-w-0 flex items-center gap-1.5 truncate">
          <span className={`font-bold truncate ${!item.visibility ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
            {item.label}
          </span>

          {/* Visibility pill */}
          {!item.visibility && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium shrink-0">
              Skryto
            </span>
          )}

          {/* Broken ref badge */}
          {isBroken && (
            <span
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-bold shrink-0 animate-pulse"
              title="Cílová stránka neexistuje nebo byla odstraněna"
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Chybí stránka</span>
            </span>
          )}
        </div>
      </div>

      {/* 2. Target Path / URL (Col 4 / 3) */}
      <div className="col-span-7 sm:col-span-3 text-muted-foreground min-w-0 truncate font-mono text-[11px] sm:text-xs">
        {isBroken ? (
          <span className="text-destructive font-semibold truncate">{targetDisplay}</span>
        ) : (
          <span className="truncate">{targetDisplay}</span>
        )}
        {item.type === 'EXTERNAL_LINK' && item.openInNewTab && (
          <span className="ml-1.5 text-[10px] text-muted-foreground/80 font-sans">(nové okno)</span>
        )}
      </div>

      {/* 3. Type Badge (Col 2 - Hidden on mobile) */}
      <div className="hidden sm:inline sm:col-span-1">
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/50 whitespace-nowrap">
          {targetTypeBadge}
        </span>
      </div>

      {/* 4. Action Controls: Keyboard/Click Reorder + Operations (Col 5 / 3) */}
      <div className="col-span-5 sm:col-span-3 flex items-center justify-end gap-1 shrink-0">
        {/* Visibility toggle button */}
        <button
          type="button"
          onClick={() => onToggleVisibility(item.id)}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            item.visibility
              ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
              : 'text-amber-600 hover:text-amber-700 bg-amber-500/10'
          }`}
          title={item.visibility ? 'Skrýt položku na webu' : 'Zobrazit položku na webu'}
          aria-label={item.visibility ? 'Skrýt položku' : 'Zobrazit položku'}
        >
          {item.visibility ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>

        {/* Tree Movement Controls */}
        <div className="flex items-center gap-0.5 bg-muted/40 p-0.5 rounded-lg border border-border/50">
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={() => onMoveUp(item.id)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-card disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            title="Posunout nahoru v aktuální úrovni"
            aria-label="Posunout nahoru"
          >
            <MoveUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={() => onMoveDown(item.id)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-card disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            title="Posunout dolů v aktuální úrovni"
            aria-label="Posunout dolů"
          >
            <MoveDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!canIndent}
            onClick={() => onIndent(item.id)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-card disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            title="Zanořit pod předchozí položku (Indent)"
            aria-label="Zanořit pod předchozí položku"
          >
            <CornerDownRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!canOutdent}
            onClick={() => onOutdent(item.id)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-card disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            title="Posunout o úroveň výše (Outdent)"
            aria-label="Posunout o úroveň výše"
          >
            <CornerUpLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Add sub-item */}
        {depth < MAX_NAVIGATION_DEPTH && (
          <button
            type="button"
            onClick={() => onAddSubItem(item.id)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer hidden md:inline-flex"
            title="Přidat podpoložku"
            aria-label="Přidat podpoložku"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Edit */}
        <button
          type="button"
          onClick={() => onEdit(item)}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          title="Upravit položku"
          aria-label="Upravit"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={() => onDelete(item)}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
          title="Smazat položku"
          aria-label="Smazat"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
