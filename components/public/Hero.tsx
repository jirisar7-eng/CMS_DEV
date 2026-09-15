import React from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';

export function Hero() {
  return (
    <section id="produkt" className="relative pt-24 pb-32 overflow-hidden border-b border-border bg-gradient-to-b from-background to-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand/10 text-brand text-sm font-semibold mb-6">
          <span className="w-2 h-2 rounded-full bg-brand"></span>
          Jednoduchost, která tvoří víc.
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground mb-6">
          Tvořte. Spravujte. Růstě.
        </h1>
        <p className="mt-4 max-w-2xl text-xl sm:text-2xl text-muted-foreground mx-auto font-medium">
          Obsah, který dává smysl.
        </p>
        <p className="mt-4 max-w-2xl text-base sm:text-lg text-muted-foreground mx-auto">
          Univerzální modulární systém pro tvorbu a správu webů, portálů a PWA.
          Obsah, média, publikování, oprávnění a rozšiřitelné Project Packs v jednom systému.
        </p>
        
        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <Link 
            href="/features" 
            className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-xl text-primary-foreground bg-primary hover:bg-primary/90 shadow-sm transition-all"
          >
            Prozkoumat CMS
            <ArrowRight className="ml-2 -mr-1 w-5 h-5" />
          </Link>
          <Link 
            href="/docs" 
            className="inline-flex items-center justify-center px-6 py-3 border border-border text-base font-medium rounded-xl text-foreground bg-background hover:bg-muted shadow-sm transition-all"
          >
            <BookOpen className="mr-2 -ml-1 w-5 h-5" />
            Dokumentace
          </Link>
        </div>
      </div>
    </section>
  );
}
