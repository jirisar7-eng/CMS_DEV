import React from 'react';
import { FileQuestion, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

// Simple server-side rendering for not found without hooks for pure static extraction
export default function NotFound() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center justify-center text-center px-4 max-w-md">
        <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
          <FileQuestion className="w-10 h-10 text-muted-foreground" />
        </div>
        <h2 className="text-3xl font-bold tracking-tight mb-3">
          Stránka nenalezena
        </h2>
        <p className="text-muted-foreground mb-8">
          Požadovaná stránka neexistuje.
        </p>
        <Link 
          href="/admin" 
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Zpět na přehled
        </Link>
      </div>
    </div>
  );
}
