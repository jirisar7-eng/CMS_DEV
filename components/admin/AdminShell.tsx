"use client";

import React, { useState, useMemo } from 'react';
import { 
  Menu, 
  X, 
  Search, 
  Bell, 
  ChevronRight, 
  ChevronDown, 
  Layers
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from "../theme/theme-toggle";
import { HelpTrigger } from '@/components/help/HelpTrigger';
import { useI18n } from '@/lib/i18n';
import { ADMIN_NAV_GROUPS, getNavItemByPath } from '@/lib/navigation/adminNav';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const pathname = usePathname();
  const dict = useI18n();

  const currentItem = getNavItemByPath(pathname);

  // Toggle group collapse
  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  // Filter navigation items by search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return ADMIN_NAV_GROUPS;
    const q = searchQuery.toLowerCase().trim();
    return ADMIN_NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.href.toLowerCase().includes(q)
      ),
    })).filter((group) => group.items.length > 0);
  }, [searchQuery]);

  return (
    <div className="flex h-screen bg-muted/30 overflow-hidden">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-card border-r transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:flex md:flex-col shadow-lg md:shadow-none ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Brand header */}
        <div className="flex items-center justify-between h-16 px-4 border-b shrink-0">
          <Link href="/admin" className="flex items-center gap-2.5 font-bold text-base text-foreground tracking-tight">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-black shadow-xs">
              S
            </div>
            <div className="flex flex-col">
              <span className="leading-tight">Synthesis CMS</span>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                CMS DEV
              </span>
            </div>
          </Link>
          <button 
            type="button"
            className="md:hidden p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center" 
            onClick={() => setSidebarOpen(false)}
            aria-label="Zavřít menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick capability filter in sidebar */}
        <div className="p-3 border-b border-border/60">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrovat schopnosti..."
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                aria-label="Vymazat filtr"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        
        {/* Scrollable navigation groups */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {filteredGroups.map((group) => {
            const isCollapsed = !searchQuery && collapsedGroups[group.id];
            return (
              <div key={group.id} className="space-y-1">
                {/* Group Header */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between px-2.5 py-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors cursor-pointer"
                >
                  <span>{group.name}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-normal px-1.5 py-0.2 rounded-full bg-muted border border-border/60">
                      {group.items.length}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${
                        isCollapsed ? '-rotate-90' : 'rotate-0'
                      }`}
                    />
                  </div>
                </button>

                {/* Group items */}
                {!isCollapsed && (
                  <div className="space-y-0.5 pl-0.5">
                    {group.items.map((item) => {
                      const isActive =
                        item.href === '/admin'
                          ? pathname === '/admin'
                          : pathname === item.href || pathname.startsWith(item.href + '/');
                      const Icon = item.icon;

                      return (
                        <Link
                          key={item.id}
                          href={item.href}
                          className={`flex items-center justify-between gap-2.5 px-2.5 py-2 text-xs font-medium rounded-lg transition-colors min-h-[38px] ${
                            isActive
                              ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
                          }`}
                          onClick={() => setSidebarOpen(false)}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                            <span className="truncate">{item.name}</span>
                          </div>
                          {item.status === 'FUNKČNÍ' && (
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                isActive ? 'bg-primary-foreground' : 'bg-emerald-500'
                              }`}
                              title="Funkční"
                            />
                          )}
                          {item.status === 'PLÁNOVÁNO' && (
                            <span
                              className={`text-[9px] px-1 py-0.2 rounded border uppercase shrink-0 font-bold ${
                                isActive
                                  ? 'border-primary-foreground/40 text-primary-foreground'
                                  : 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10'
                              }`}
                            >
                              Plán
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        
        {/* User profile footer */}
        <div className="p-3 border-t shrink-0 bg-card/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0">
              JS
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-foreground truncate">Jiří Šár</p>
              <p className="text-[11px] text-muted-foreground truncate">Správce ekosystému</p>
            </div>
            <HelpTrigger helpKey="system.settings.view" size="sm" align="right" />
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top command bar */}
        <header className="flex items-center justify-between h-16 px-4 md:px-6 bg-card border-b z-30 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button 
              type="button"
              className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted min-h-[44px] min-w-[44px] flex items-center justify-center"
              onClick={() => setSidebarOpen(true)}
              aria-label={dict.shell.open_menu}
            >
              <Menu className="w-5 h-5" />
            </button>
            
            {/* Dynamic Breadcrumbs */}
            <div className="hidden md:flex items-center gap-2 text-xs sm:text-sm text-muted-foreground truncate">
              <Link href="/admin" className="hover:text-foreground transition-colors font-medium">
                Synthesis CMS
              </Link>
              {currentItem && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                  <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                    {currentItem.group}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                  <span className="text-foreground font-semibold truncate">
                    {currentItem.name}
                  </span>
                </>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Link 
               href="/preview/site" 
               className="text-xs font-semibold text-primary hover:underline underline-offset-4 hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors min-h-[36px]"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{dict.shell.public_preview}</span>
            </Link>

            <Link
              href="/admin/notifications"
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted relative"
              aria-label="Upozornění"
            >
              <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full ring-2 ring-card"></span>
            </Link>

            <ThemeToggle />
          </div>
        </header>

        {/* Main scrollable area */}
        <main className={`flex-1 overflow-auto ${pathname?.endsWith('/edit') ? 'p-0' : 'p-3 sm:p-4 md:p-6 lg:p-8'}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
