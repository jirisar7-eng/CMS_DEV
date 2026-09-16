import React from 'react';
import Link from 'next/link';

export function CompactFinalCta() {
  return (
    <section className="py-12 sm:py-16 bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center space-y-4">
        <h2 className="text-heading-3 text-foreground">
          Synthesis CMS
        </h2>
        <p className="text-heading-2 text-foreground tracking-tight max-w-2xl mx-auto">
          Technologie, která se přizpůsobí projektu.<br className="hidden sm:block" /> Ne projekt technologii.
        </p>
        
        <div className="pt-6">
          <Link 
            href="/features" 
            className="touch-target inline-flex items-center justify-center px-8 border border-transparent text-ui rounded-md text-primary-foreground bg-primary hover:bg-primary/90 shadow-sm transition-colors"
          >
            Prozkoumat CMS
          </Link>
        </div>
      </div>
    </section>
  );
}
