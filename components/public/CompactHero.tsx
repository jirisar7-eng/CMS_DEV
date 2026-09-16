import React from 'react';
import Link from 'next/link';

export function CompactHero() {
  return (
    <section className="relative pt-14 pb-12 sm:pt-16 sm:pb-14 border-b border-border bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 relative z-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-foreground text-sm font-semibold mb-6">
          <span className="w-2 h-2 rounded-full bg-primary"></span>
          Jednoduchost, která tvoří víc.
        </div>
        
        <h1 className="text-heading-1 text-foreground mb-4">
          Tvořte. Spravujte. Růstě.
        </h1>
        
        <p className="mt-6 max-w-2xl text-body text-muted-foreground mx-auto">
          Moderní modulární CMS pro tvorbu a správu webů, portálů a PWA. Obsah, média, publikování a oprávnění v jednom přehledném systému.
        </p>
        
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center items-center">
          <Link 
            href="/features" 
            className="touch-target w-full sm:w-auto inline-flex items-center justify-center px-8 border border-transparent text-ui rounded-md text-primary-foreground bg-primary hover:bg-primary/90 transition-colors"
          >
            Prozkoumat CMS
          </Link>
          <Link 
            href="/docs" 
            className="touch-target w-full sm:w-auto inline-flex items-center justify-center px-8 border border-border text-ui rounded-md text-foreground bg-background hover:bg-secondary transition-colors"
          >
            Dokumentace
          </Link>
        </div>
      </div>
    </section>
  );
}
