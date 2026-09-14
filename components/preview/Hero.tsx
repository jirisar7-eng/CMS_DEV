import React from 'react';
import { ArrowRight } from 'lucide-react';

export function Hero() {
  return (
    <div className="relative overflow-hidden bg-background pt-24 pb-32">
      <div className="absolute inset-0 bg-grid-slate-900/[0.04] bg-[bottom_1px_center] dark:bg-grid-slate-400/[0.05] dark:bg-bottom dark:border-b dark:border-slate-100/5" style={{ maskImage: 'linear-gradient(to bottom, transparent, black)' }}></div>
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6">
          The future of digital experience
        </h1>
        <p className="mt-4 text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
          Build, manage, and scale your digital presence with the new generation of Synthesis CMS. 
          Powerful, secure, and incredibly fast.
        </p>
        <div className="flex justify-center gap-4">
          <button className="px-8 py-3 bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Get Started
          </button>
          <button className="px-8 py-3 bg-secondary text-secondary-foreground font-medium rounded-md flex items-center gap-2 hover:bg-secondary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Learn More
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
