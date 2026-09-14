"use client";

import React from 'react';
import { Construction, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';

export function NotImplemented({ featureName }: { featureName?: string }) {
  const dict = useI18n();
  
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
        <Construction className="w-10 h-10 text-muted-foreground" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight mb-2">
        {featureName ? featureName : dict.not_implemented.title}
      </h2>
      <p className="text-muted-foreground max-w-md mb-8">
        {dict.not_implemented.description}
      </p>
      <Link 
        href="/admin" 
        className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline underline-offset-4"
      >
        <ArrowLeft className="w-4 h-4" />
        {dict.not_implemented.back}
      </Link>
    </div>
  );
}
