import React from 'react';
import { 
  FileText, Image as ImageIcon, Menu, Layout, 
  Send, History, Search, Shield, Package, Lock 
} from 'lucide-react';

export function Features() {
  const features = [
    { name: 'Role a oprávnění', desc: 'Detailní RBAC, audit logy, tenant izolace.', icon: Shield, status: 'Dostupné' },
    { name: 'Média', desc: 'Upload, S3 storage, MIME validace, antivirová karanténa.', icon: ImageIcon, status: 'Dostupné' },
    { name: 'Audit a bezpečnost', desc: 'Detailní auditní záznamy, signatury webhooků, JWT.', icon: Lock, status: 'Dostupné' },
    { name: 'Vizuální editor', desc: 'Puck editor integrace pro drag & drop tvorbu stránek.', icon: Layout, status: 'Ve vývoji' },
    { name: 'Stránky', desc: 'Správa dynamického obsahu, slugů a stromové struktury.', icon: FileText, status: 'Ve vývoji' },
    { name: 'Publikování', desc: 'Schvalovací procesy, drafty, časování vydání (Releases).', icon: Send, status: 'Ve vývoji' },
    { name: 'Revize', desc: 'Historie změn obsahu a možnost návratu k předchozím verzím.', icon: History, status: 'Ve vývoji' },
    { name: 'Project Packs', desc: 'Rozšiřitelné modulární balíčky pro specifické byznys funkce.', icon: Package, status: 'Plánováno' },
    { name: 'Navigace', desc: 'Správa hlavního menu a struktury webu v administraci.', icon: Menu, status: 'Plánováno' },
    { name: 'SEO', desc: 'Metadata, OpenGraph, Schema.org automatizace.', icon: Search, status: 'Plánováno' },
  ];

  return (
    <section id="funkce" className="py-20 bg-background border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Hlavní funkce</h2>
          <p className="mt-4 text-lg text-muted-foreground">Přehled základních modulů a jejich aktuální stav.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div key={i} className="p-6 border border-border rounded-2xl bg-card hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
                  <f.icon className="w-6 h-6" />
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider ${
                  f.status === 'Dostupné' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' :
                  f.status === 'Ve vývoji' ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {f.status}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{f.name}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
