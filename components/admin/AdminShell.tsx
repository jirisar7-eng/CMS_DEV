"use client";

import React, { useState } from 'react';
import { Menu, X, LayoutDashboard, FileText, Image as ImageIcon, Paintbrush, Tags, Blocks, Users, ShieldAlert, Search, Bell, Settings } from 'lucide-react';
import Link from 'next/link';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Pages', href: '/admin/pages', icon: FileText },
    { name: 'Media', href: '/admin/media', icon: ImageIcon },
    { name: 'Themes', href: '/admin/themes', icon: Paintbrush },
    { name: 'Brands', href: '/admin/brands', icon: Tags },
    { name: 'Modules', href: '/admin/modules', icon: Blocks },
    { name: 'Users/RBAC', href: '/admin/users', icon: Users },
    { name: 'Audit', href: '/admin/audit', icon: ShieldAlert },
  ];

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
          <button className="md:hidden p-2 rounded-md hover:bg-muted" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          ))}
        </nav>
        
        <div className="p-4 border-t">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-medium">AD</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">Admin User</p>
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
            >
              <Menu className="w-5 h-5" />
              <span className="sr-only">Open menu</span>
            </button>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm text-muted-foreground w-64 border border-border/50">
              <Search className="w-4 h-4" />
              <span>Search (Ctrl+K)</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <Link 
              href="/preview/site" 
              className="text-sm font-medium text-primary hover:underline underline-offset-4 hidden sm:block"
            >
              Public Preview
            </Link>
            <button className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full border-2 border-card"></span>
            </button>
            <button className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Main scrollable area */}
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
