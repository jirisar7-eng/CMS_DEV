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
    <section className="py-10 sm:py-12 bg-secondary border-b border-border">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <h2 className="text-meta text-muted-foreground mb-6">
          Aktuálně dostupné
        </h2>
        
        <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-8">
          {available.map((item, i) => (
            <div key={i} className="inline-flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-md shadow-sm">
              <Check className="w-4 h-4 text-primary" />
              <span className="text-ui text-foreground">{item}</span>
            </div>
          ))}
        </div>
        
        <Link 
          href="/features" 
          className="touch-target inline-flex items-center justify-center px-6 border border-transparent text-ui text-primary hover:bg-background rounded-md transition-colors"
        >
          Zobrazit všechny funkce
        </Link>
      </div>
    </section>
  );
}
