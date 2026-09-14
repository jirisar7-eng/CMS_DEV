'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error for diagnostics
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center justify-center text-center px-4 max-w-md space-y-4">
        <div className="w-16 h-16 bg-red-500/10 text-red-600 rounded-full flex items-center justify-center">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Nastala neočekávaná chyba</h2>
        <p className="text-sm text-muted-foreground">
          Při zpracování požadavku došlo k systémové chybě.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Zkusit znovu
          </button>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 px-4 py-2 bg-muted text-muted-foreground hover:text-foreground rounded-lg text-sm font-medium transition-colors"
          >
            Zpět na přehled
          </Link>
        </div>
      </div>
    </div>
  );
}
