import React from 'react';
import Link from 'next/link';

export function Pricing() {
  return (
    <section id="licence" className="py-20 bg-background border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Edice a licence</h2>
          <p className="mt-4 text-lg text-muted-foreground">Předběžný licenční model — finální ceny před veřejným vydáním.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Community */}
          <div className="flex flex-col p-8 border border-border rounded-2xl bg-card">
            <h3 className="text-2xl font-bold text-foreground mb-2">Community</h3>
            <div className="mt-4 mb-6">
              <span className="text-4xl font-extrabold text-foreground">0 Kč</span>
            </div>
            <ul className="flex-1 space-y-4 mb-8 text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Zdarma pro nekomerční použití
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Bez expirace
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Povinný odkaz &quot;Powered by Synthesis CMS&quot;
              </li>
            </ul>
            <Link href="#dokumentace" className="w-full py-2.5 px-4 text-center border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors">
              Zjistit více o licenci
            </Link>
          </div>

          {/* Commercial */}
          <div className="flex flex-col p-8 border-2 border-primary rounded-2xl bg-primary/5 relative">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              Nejčastější
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-2">Commercial</h3>
            <div className="mt-4 mb-6 flex flex-col">
              <span className="text-4xl font-extrabold text-foreground">6 900 Kč <span className="text-lg text-muted-foreground font-normal">/ rok</span></span>
              <span className="text-sm text-muted-foreground line-through mt-1">Běžně 9 900 Kč / rok</span>
            </div>
            <ul className="flex-1 space-y-4 mb-8 text-foreground">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Komerční projekty
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Odstranění povinného odkazu
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Základní technická podpora
              </li>
            </ul>
            <Link href="#dokumentace" className="w-full py-2.5 px-4 text-center bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm">
              Zjistit více o licenci
            </Link>
          </div>

          {/* Granted */}
          <div className="flex flex-col p-8 border border-border rounded-2xl bg-card">
            <h3 className="text-2xl font-bold text-foreground mb-2">Granted / Partner</h3>
            <div className="mt-4 mb-6">
              <span className="text-4xl font-extrabold text-foreground">Individuálně</span>
            </div>
            <ul className="flex-1 space-y-4 mb-8 text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Pro partnery a neziskovky
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Výchozí platnost 12 měsíců
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Obnova dle individuální dohody
              </li>
            </ul>
            <Link href="#dokumentace" className="w-full py-2.5 px-4 text-center border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors">
              Zjistit více o licenci
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
