"use client";

import React from 'react';
import { 
  FileText, 
  Image as ImageIcon, 
  Paintbrush, 
  Tags, 
  Blocks, 
  Users, 
  ShieldAlert, 
  Plus, 
  ArrowUpRight, 
  Send, 
  ShieldCheck, 
  Globe, 
  Sparkles,
  Rocket,
  FlaskConical
} from 'lucide-react';
import Link from 'next/link';
import { HelpTrigger } from '@/components/help/HelpTrigger';
import { CapabilityStatusBadge } from './CapabilityStatusBadge';
import { ADMIN_NAV_GROUPS } from '@/lib/navigation/adminNav';

export function AdminDashboard() {
  const quickStats = [
    { label: 'Stav prostředí', value: 'PROTOTYP', detail: 'In-memory adaptér • Ukázková data', icon: FlaskConical, color: 'text-brand' },
    { label: 'Obsahové schéma', value: '4 stránky', detail: 'Lokální fixture data', icon: FileText, color: 'text-state-info' },
    { label: 'Perzistentní databáze', value: 'Není připojeno', detail: 'Fáze návrhu rozhraní', icon: Send, color: 'text-state-warning' },
    { label: 'Bezpečnostní telemetrie', value: 'Neověřeno', detail: 'Vývojový sandbox (G2 slice)', icon: ShieldCheck, color: 'text-muted-foreground' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Header Container */}
      <div className="p-4 sm:p-6 rounded-2xl border border-border bg-card shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                OBSAH
              </span>
              <CapabilityStatusBadge status="PROTOTYP" size="sm" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Přehled administrace
              </h1>
              <HelpTrigger helpKey="admin.dashboard.view" size="sm" align="left" />
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl leading-relaxed">
              Vítejte v administračním rozhraní Synthesis CMS. Kompletní přehled publikačního stavu, schopností a rychlých akcí.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Link
              href="/preview/site"
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 min-h-[44px] border border-border bg-background hover:bg-muted text-foreground rounded-xl text-xs sm:text-sm font-semibold transition-colors"
            >
              <Globe className="w-4 h-4" />
              <span>Veřejný náhled</span>
            </Link>
            <Link
              href="/admin/pages/new"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-primary text-primary-foreground rounded-xl text-xs sm:text-sm font-semibold hover:bg-primary/90 transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Nová stránka</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {quickStats.map((stat) => (
          <div
            key={stat.label}
            className="p-4 sm:p-5 rounded-2xl border border-border bg-card shadow-xs flex items-center justify-between gap-3"
          >
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
              <div className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                {stat.value}
              </div>
              <span className="text-[11px] text-muted-foreground block">{stat.detail}</span>
            </div>
            <div className="p-3 rounded-xl bg-muted/60 border border-border/50 shrink-0">
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
          </div>
        ))}
      </div>

      {/* Navigation Capability Grid by Groups */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 className="text-base sm:text-lg font-bold text-foreground">
            Mapa schopností Synthesis CMS
          </h2>
          <span className="text-xs text-muted-foreground">
            8 navigačních skupin • 31 schopností
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {ADMIN_NAV_GROUPS.map((group) => (
            <div
              key={group.id}
              className="p-4 rounded-2xl border border-border bg-card shadow-xs flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <span className="text-xs font-bold text-primary tracking-wider uppercase">
                    {group.name}
                  </span>
                  <span className="text-[11px] font-semibold text-muted-foreground px-1.5 py-0.5 rounded-md bg-muted">
                    {group.items.length} položek
                  </span>
                </div>

                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        className="group flex items-center justify-between gap-2 p-2 rounded-xl hover:bg-muted/70 transition-colors text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                          <span className="font-semibold text-foreground truncate group-hover:text-primary">
                            {item.name}
                          </span>
                        </div>
                        <CapabilityStatusBadge status={item.status} size="sm" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
