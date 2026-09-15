import React from 'react';
import Link from 'next/link';

export function CompactFooter() {
  return (
    <footer className="bg-background border-t border-border py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground font-medium">
          © {new Date().getFullYear()} Synthesis CMS
        </div>
        
        <nav className="flex items-center gap-6 text-sm font-medium">
          <Link href="/docs" className="text-muted-foreground hover:text-foreground transition-colors">
            Dokumentace
          </Link>
          <Link href="/licence" className="text-muted-foreground hover:text-foreground transition-colors">
            Licence
          </Link>
          <Link href="/security" className="text-muted-foreground hover:text-foreground transition-colors">
            Bezpečnost
          </Link>
          <Link href="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
            Soukromí
          </Link>
        </nav>
      </div>
    </footer>
  );
}
