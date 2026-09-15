import React from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';

export function CompactStatus() {
  const available = [
    'Role a oprávnění',
    'Média',
    'Audit a bezpečnost',
  ];

  return (
    <section className="py-20 bg-muted/30 border-b border-border">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-8">
          COMPACT STATUS: Dostupné
        </h2>
        
        <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-4 sm:gap-6 mb-10">
          {available.map((item, i) => (
            <div key={i} className="inline-flex items-center gap-2 px-4 py-2 bg-background border border-border rounded-lg shadow-sm">
              <Check className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">{item}</span>
            </div>
          ))}
        </div>
        
        <Link 
          href="/features" 
          className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 rounded-xl transition-colors"
        >
          Zobrazit všechny funkce
        </Link>
      </div>
    </section>
  );
}
