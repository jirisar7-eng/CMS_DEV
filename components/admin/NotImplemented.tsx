import React from 'react';
import { Construction, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export function NotImplemented({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center text-muted-foreground mb-6">
        <Construction className="w-8 h-8" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight mb-2">{title} Not Implemented Yet</h1>
      <p className="text-muted-foreground max-w-md mb-8">
        This section is part of the future Synthesis CMS roadmap and is not currently available in this environment.
      </p>
      <Link 
        href="/admin" 
        className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-secondary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="w-4 h-4" />
        Return to Dashboard
      </Link>
    </div>
  );
}
