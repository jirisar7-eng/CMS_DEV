import React from 'react';
import { FileText, Image as ImageIcon, Paintbrush, Tags, Blocks, Users, ShieldAlert, ArrowRight, Activity, Plus } from 'lucide-react';
import Link from 'next/link';

export function AdminDashboard() {
  const cards = [
    { name: 'Pages', href: '/admin/pages', icon: FileText, count: 24, description: 'Manage content structure and text pages.' },
    { name: 'Media', href: '/admin/media', icon: ImageIcon, count: 142, description: 'Asset library, images, and documents.' },
    { name: 'Themes', href: '/admin/themes', icon: Paintbrush, count: 3, description: 'Visual identity and design tokens.' },
    { name: 'Brands', href: '/admin/brands', icon: Tags, count: 2, description: 'Brand assets and configurations.' },
    { name: 'Modules', href: '/admin/modules', icon: Blocks, count: 8, description: 'Reusable functional components.' },
    { name: 'Users/RBAC', href: '/admin/users', icon: Users, count: 12, description: 'Access control and team members.' },
    { name: 'Audit', href: '/admin/audit', icon: ShieldAlert, count: '99+', description: 'System logs and security events.' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your Synthesis CMS environment.</p>
        </div>
        <button className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Plus className="w-4 h-4" />
          New Page
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        {cards.map((card) => (
          <Link 
            key={card.name} 
            href={card.href}
            className="group flex flex-col p-6 bg-card rounded-xl border shadow-sm hover:shadow-md transition-all hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-muted rounded-lg text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <card.icon className="w-6 h-6" />
              </div>
              <span className="text-2xl font-bold tracking-tight text-muted-foreground">{card.count}</span>
            </div>
            <h3 className="font-semibold text-lg mb-1">{card.name}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">{card.description}</p>
            <div className="flex items-center text-sm font-medium text-primary mt-auto">
              Manage
              <ArrowRight className="w-4 h-4 ml-1 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
            </div>
          </Link>
        ))}
      </div>
      
      <div className="pt-6 border-t mt-10">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-muted-foreground" />
          Recent Activity
        </h2>
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="p-4 md:p-6 text-center text-muted-foreground py-12">
            No recent activity recorded yet.
          </div>
        </div>
      </div>
    </div>
  );
}
