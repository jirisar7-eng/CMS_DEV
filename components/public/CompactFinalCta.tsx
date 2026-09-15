import React from 'react';
import Link from 'next/link';

export function CompactFinalCta() {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center space-y-6">
        <h2 className="text-2xl font-bold text-foreground">
          Synthesis CMS
        </h2>
        <p className="text-xl sm:text-3xl font-extrabold text-foreground tracking-tight leading-tight max-w-2xl mx-auto">
          Technologie, která se přizpůsobí projektu.<br className="hidden sm:block" /> Ne projekt technologii.
        </p>
        
        <div className="pt-8">
          <Link 
            href="/features" 
            className="inline-flex items-center justify-center px-8 py-3.5 border border-transparent text-base font-semibold rounded-xl text-primary-foreground bg-primary hover:bg-primary/90 shadow-sm transition-all"
          >
            Prozkoumat CMS
          </Link>
        </div>
      </div>
    </section>
  );
}
