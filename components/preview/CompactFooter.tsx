import React from 'react';
import Link from 'next/link';

export function CompactFooter() {
  return (
    <footer className="bg-background border-t py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center text-primary-foreground font-bold">S</div>
          <span className="font-semibold text-lg">Synthesis</span>
        </div>
        <div className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} Synthesis CMS. All rights reserved.
        </div>
        <div className="flex gap-4">
          <Link href="#" className="text-sm text-muted-foreground hover:text-foreground">Privacy</Link>
          <Link href="#" className="text-sm text-muted-foreground hover:text-foreground">Terms</Link>
          <Link href="#" className="text-sm text-muted-foreground hover:text-foreground">Contact</Link>
        </div>
      </div>
    </footer>
  );
}
