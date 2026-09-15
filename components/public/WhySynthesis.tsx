import React from 'react';
import { Layers, Server, ShieldCheck, Smartphone } from 'lucide-react';

export function WhySynthesis() {
  return (
    <section id="proc-synthesis" className="py-20 bg-muted/30 border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Proč Synthesis CMS</h2>
          <p className="mt-4 text-lg text-muted-foreground">Architektura postavená pro flexibilitu, kontrolu nad daty a bezpečí.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="flex gap-4">
            <div className="flex-shrink-0 mt-1">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Layers className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Modulární architektura</h3>
              <p className="text-muted-foreground">Přísné oddělení Core systému a rozšíření (Project Packs). Instalujte pouze to, co váš projekt skutečně potřebuje.</p>
            </div>
          </div>
          
          <div className="flex gap-4">
            <div className="flex-shrink-0 mt-1">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Server className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Vlastní data a infrastruktura</h3>
              <p className="text-muted-foreground">Provozováno nad PostgreSQL a S3-compatible storage. Žádný vendor lock-in na konkrétní poskytovatele či proprietární API.</p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0 mt-1">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Bezpečnost a auditovatelnost</h3>
              <p className="text-muted-foreground">Návrh postavený na fail-closed principech. Ochrana PII, detailní záznamy přístupů, žádný destruktivní licenční kill switch.</p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0 mt-1">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Smartphone className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Mobile/tablet-first administrace</h3>
              <p className="text-muted-foreground">Spravujte obsah pohodlně na jakémkoliv zařízení. Plně responzivní UI, PWA podpora pro nativní zážitek.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
