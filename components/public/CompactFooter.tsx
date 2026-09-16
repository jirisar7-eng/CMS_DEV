import React from 'react';
import Link from 'next/link';

export function CompactFooter() {
  return (
    <footer className="bg-background border-t border-border py-5 sm:py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground font-medium">
          © {new Date().getFullYear()} Synthesis CMS
        </div>
        
        <nav className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-sm font-medium">
          <Link href="/docs" className="text-muted-foreground hover:text-foreground transition-colors">
            Dokumentace
          </Link>
          <Link href="/pricing" className="text-muted-foreground hover:text-foreground transition-colors">
            Ceník a licence
          </Link>
          <Link href="/security" className="text-muted-foreground hover:text-foreground transition-colors">
            Bezpečnost
          </Link>
          <Link href="/requirements" className="text-muted-foreground hover:text-foreground transition-colors">
            Požadavky
          </Link>
        </nav>
      </div>
    </footer>
  );
}
