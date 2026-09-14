"use client";

import React, { useState, useEffect } from 'react';
import { Menu, X, LayoutDashboard, FileText, Image as ImageIcon, Paintbrush, Tags, Blocks, Users, ShieldAlert, Search, Bell, Settings, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from "../theme/theme-toggle";
import { HelpTrigger } from '@/components/help/HelpTrigger';
import { useI18n } from '@/lib/i18n';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const dict = useI18n();

  const navItems = [
    { name: dict.nav.dashboard, href: '/admin', icon: LayoutDashboard },
    { name: dict.nav.pages, href: '/admin/pages', icon: FileText },
    { name: dict.nav.media, href: '/admin/media', icon: ImageIcon },
    { name: dict.nav.themes, href: '/admin/themes', icon: Paintbrush },
    { name: dict.nav.brands, href: '/admin/brands', icon: Tags },
    { name: dict.nav.modules, href: '/admin/modules', icon: Blocks },
    { name: dict.nav.users, href: '/admin/users', icon: Users },
    { name: dict.nav.audit, href: '/admin/audit', icon: ShieldAlert },
    { name: dict.nav.settings, href: '/admin/settings', icon: Settings },
  ];

  const currentItem = navItems.find(item => item.href === pathname) || navItems.find(item => pathname.startsWith(item.href) && item.href !== '/admin');

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
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:flex md:flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between h-16 px-4 border-b">
          <Link href="/admin" className="flex items-center gap-2 font-semibold text-lg">
            <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center text-primary-foreground font-bold">S</div>
            Synthesis CMS
          </Link>
          <button className="md:hidden p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/admin');
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon className="w-5 h-5" />
                {item.name}
              </Link>
            )
          })}
        </nav>
        
        <div className="p-4 border-t">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-medium">AD</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{dict.shell.admin_user}</p>
              <p className="text-xs text-muted-foreground truncate">admin@synthesis.com</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top command bar */}
        <header className="flex items-center justify-between h-16 px-4 md:px-6 bg-card border-b z-30">
          <div className="flex items-center gap-4">
            <button 
              className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
              onClick={() => setSidebarOpen(true)}
              aria-label={dict.shell.open_menu}
            >
              <Menu className="w-5 h-5" />
            </button>
            
            <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
              <Link href="/admin" className="hover:text-foreground transition-colors">{dict.nav.dashboard}</Link>
              {currentItem && currentItem.href !== '/admin' && (
                <>
                  <ChevronRight className="w-4 h-4" />
                  {pathname === currentItem.href ? (
                    <span className="text-foreground font-medium">{currentItem.name}</span>
                  ) : (
                    <Link href={currentItem.href} className="hover:text-foreground transition-colors">
                      {currentItem.name}
                    </Link>
                  )}
                </>
              )}
              {pathname === '/admin/pages/new' && (
                <>
                  <ChevronRight className="w-4 h-4" />
                  <span className="text-foreground font-medium">Nová stránka</span>
                </>
              )}
              {pathname.startsWith('/admin/pages/') && pathname !== '/admin/pages/new' && (
                <>
                  <ChevronRight className="w-4 h-4" />
                  <span className="text-foreground font-medium">
                    {pathname.endsWith('/edit') ? 'Editor obsahu' : 'Detail stránky'}
                  </span>
                </>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm text-muted-foreground w-64 border border-border/50">
              <Search className="w-4 h-4" />
              <span>{dict.shell.search}</span>
            </div>

            <Link 
               href="/preview/site" 
               className="text-sm font-medium text-primary hover:underline underline-offset-4 hidden sm:block"
            >
              {dict.shell.public_preview}
            </Link>
            <button className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted relative" aria-label={dict.shell.notifications}>
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full border-2 border-card"></span>
            </button>
            <ThemeToggle />
            <HelpTrigger helpKey="theme.switch" size="sm" align="right" label="Nápověda k motivu a ovládání rozhraní" />
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
