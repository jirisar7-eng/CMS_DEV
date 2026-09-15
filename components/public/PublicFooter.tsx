import React from 'react';
import Link from 'next/link';

export function PublicFooter() {
  const links = [
    { label: 'Produkt', href: '#produkt' },
    { label: 'Dokumentace', href: '#dokumentace' },
    { label: 'Licence', href: '#licence' },
    { label: 'Technické požadavky', href: '#pozadavky' },
    { label: 'Bezpečnost', href: '#bezpecnost' },
    { label: 'Podmínky užití', href: '#podminky' },
    { label: 'Ochrana soukromí', href: '#soukromi' },
  ];

  return (
    <footer className="bg-background border-t border-border py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex flex-col items-center md:items-start gap-2">
          <span className="text-lg font-bold tracking-tight text-foreground">Synthesis CMS</span>
          <span className="text-sm text-muted-foreground">© {new Date().getFullYear()} Synthesis. Všechna práva vyhrazena.</span>
        </div>
        
        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          {links.map((link, i) => (
            <Link key={i} href={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="text-sm text-muted-foreground">
          Powered by <span className="font-semibold text-foreground">Synthesis CMS</span>
        </div>
      </div>
    </footer>
  );
}
