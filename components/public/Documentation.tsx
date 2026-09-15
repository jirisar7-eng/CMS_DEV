import React from 'react';
import Link from 'next/link';
import { Book, ChevronRight } from 'lucide-react';

export function Documentation() {
  const topics = [
    'Začínáme',
    'Instalace',
    'Administrace',
    'Média',
    'Stránky',
    'Bezpečnost',
    'Licence',
    'Technické požadavky',
    'FAQ'
  ];

  return (
    <section id="dokumentace" className="py-20 bg-background border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row gap-12 items-start">
          <div className="md:w-1/3">
            <div className="p-3 bg-primary/10 text-primary w-fit rounded-xl mb-4">
              <Book className="w-6 h-6" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground mb-4">Dokumentace</h2>
            <p className="text-lg text-muted-foreground mb-6">
              Kompletní příručka pro vývojáře i editory. Dokumentace je aktuálně ve výstavbě.
            </p>
            <button disabled className="px-5 py-2.5 bg-muted text-muted-foreground rounded-lg font-medium cursor-not-allowed">
              Otevřít dokumentaci
            </button>
          </div>
          <div className="md:w-2/3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
            {topics.map((topic, i) => (
              <Link 
                key={i} 
                href="#dokumentace" 
                className="flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-muted/30 transition-colors"
              >
                <span className="font-medium text-foreground">{topic}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
