import React from 'react';
import Link from 'next/link';

export function CompactHero() {
  return (
    <section className="relative pt-24 pb-20 overflow-hidden border-b border-border bg-gradient-to-b from-background to-muted/20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 relative z-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand/10 text-brand text-sm font-semibold mb-6">
          <span className="w-2 h-2 rounded-full bg-brand"></span>
          Jednoduchost, která tvoří víc.
        </div>
        
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground mb-4">
          Tvořte. Spravujte. Růstě.
        </h1>
        
        <p className="mt-6 max-w-2xl text-base sm:text-lg text-muted-foreground mx-auto leading-relaxed">
          Moderní modulární CMS pro tvorbu a správu webů, portálů a PWA. Obsah, média, publikování a oprávnění v jednom přehledném systému.
        </p>
        
        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link 
            href="/features" 
            className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 border border-transparent text-sm sm:text-base font-semibold rounded-xl text-primary-foreground bg-primary hover:bg-primary/90 shadow-sm transition-colors"
          >
            Prozkoumat CMS
          </Link>
          <Link 
            href="/docs" 
            className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 border border-border text-sm sm:text-base font-semibold rounded-xl text-foreground bg-background hover:bg-muted shadow-sm transition-colors"
          >
            Dokumentace
          </Link>
        </div>
      </div>
    </section>
  );
}
