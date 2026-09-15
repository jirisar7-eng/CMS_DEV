import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

export function TechRequirements() {
  return (
    <section id="pozadavky" className="py-20 bg-muted/30 border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Technické požadavky</h2>
          <p className="mt-4 text-lg text-muted-foreground">Synthesis CMS vyžaduje moderní serverové prostředí.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-card p-6 rounded-2xl border border-border">
            <h3 className="text-lg font-bold text-foreground mb-4">Podporované prostředí</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-2 text-muted-foreground">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <span>Node.js / Next.js runtime</span>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <span>PostgreSQL databáze</span>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <span>S3-compatible object storage</span>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <span>Správa environment variables</span>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <span>HTTPS šifrování</span>
              </li>
            </ul>
          </div>

          <div className="bg-card p-6 rounded-2xl border border-border">
            <h3 className="text-lg font-bold text-foreground mb-4">Podporované typy hostingu</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-2 text-muted-foreground">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <span>Docker / VPS kontejnery</span>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <span>Managed Node.js hosting</span>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <span>Plesk/cPanel (pouze pokud splňuje runtime požadavky Node.js)</span>
              </li>
            </ul>
          </div>

          <div className="bg-card p-6 rounded-2xl border border-border">
            <h3 className="text-lg font-bold text-foreground mb-4">Nepodporované</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-2 text-muted-foreground">
                <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <span>Čistý PHP + MySQL + FTP hosting (bez Node.js)</span>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <span>Čistě statický hosting (vyžadován server-side kód)</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
