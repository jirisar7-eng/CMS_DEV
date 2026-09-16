"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { SynthesisLogo } from '@/components/brand/SynthesisLogo';
import { Menu, X } from 'lucide-react';

export function PublicHeader() {
  const [isOpen, setIsOpen] = useState(false);

  const navLinks = [
    { label: 'Funkce', href: '/features' },
    { label: 'Dokumentace', href: '/docs' },
    { label: 'Ceník a licence', href: '/pricing' },
    { label: 'Požadavky', href: '/requirements' },
    { label: 'Bezpečnost', href: '/security' },
  ];

  return (
    <header className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex-shrink-0">
            <Link href="/" className="hover:opacity-80 transition-opacity">
              <SynthesisLogo className="text-xl" />
            </Link>
          </div>
          
          <nav className="hidden md:flex gap-6">
            {navLinks.map(link => (
              <Link 
                key={link.href} 
                href={link.href} 
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          
          <div className="hidden md:block">
            <Link 
              href="/admin" 
              className="text-sm font-medium px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity shadow-sm"
            >
              Administrace
            </Link>
          </div>

          <div className="md:hidden">
            <button 
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="touch-target inline-flex items-center justify-center p-2 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded-md"
              aria-label="Přepnout menu"
              aria-expanded={isOpen}
              aria-controls="public-navigation-mobile"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {isOpen && (
        <div id="public-navigation-mobile" className="md:hidden border-t border-border bg-background">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {navLinks.map(link => (
              <Link 
                key={link.href} 
                href={link.href} 
                onClick={() => setIsOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <Link 
              href="/admin" 
              onClick={() => setIsOpen(false)}
              className="block px-3 py-2 rounded-md text-base font-medium text-primary hover:bg-secondary mt-4 transition-colors"
            >
              Administrace
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
