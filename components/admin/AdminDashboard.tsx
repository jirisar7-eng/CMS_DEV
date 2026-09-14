"use client";

import React from 'react';
import { FileText, Image as ImageIcon, Paintbrush, Tags, Blocks, Users, ShieldAlert, ArrowRight, Activity, Plus } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';

export function AdminDashboard() {
  const dict = useI18n();

  const cards = [
    { name: dict.nav.pages, href: '/admin/pages', icon: FileText, count: 24, description: dict.dashboard.manage_pages },
    { name: dict.nav.media, href: '/admin/media', icon: ImageIcon, count: 142, description: dict.dashboard.manage_media },
    { name: dict.nav.themes, href: '/admin/themes', icon: Paintbrush, count: 3, description: dict.dashboard.manage_themes },
    { name: dict.nav.brands, href: '/admin/brands', icon: Tags, count: 2, description: dict.dashboard.manage_brands },
    { name: dict.nav.modules, href: '/admin/modules', icon: Blocks, count: 8, description: dict.dashboard.manage_modules },
    { name: dict.nav.users, href: '/admin/users', icon: Users, count: 12, description: dict.dashboard.manage_users },
    { name: dict.nav.audit, href: '/admin/audit', icon: ShieldAlert, count: '99+', description: dict.dashboard.manage_audit },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{dict.dashboard.title}</h1>
          <p className="text-muted-foreground mt-1">{dict.dashboard.description}</p>
        </div>
        <Link
          href="/admin/pages/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="w-4 h-4" />
          {dict.dashboard.new_page}
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        {cards.map((card) => (
          <Link key={card.name} href={card.href} className="block group">
            <div className="p-5 h-full bg-card rounded-lg border shadow-sm hover:shadow-md transition-all hover:border-primary/50 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-primary/10 rounded-md text-primary group-hover:scale-110 transition-transform">
                  <card.icon className="w-5 h-5" />
                </div>
                <span className="text-2xl font-bold">{card.count}</span>
              </div>
              <h3 className="font-semibold text-lg mb-1 group-hover:text-primary transition-colors">{card.name}</h3>
              <p className="text-sm text-muted-foreground line-clamp-2 mt-auto">{card.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
