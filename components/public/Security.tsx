import React from 'react';
import { Shield } from 'lucide-react';

export function Security() {
  const points = [
    { title: 'Fail-closed přístup', text: 'Bezpečnostní modely a kontroly oprávnění jsou implicitně uzavřeny (deny by default).' },
    { title: 'Auditovatelnost', text: 'Každá klíčová akce v administraci je zaznamenávána pro snadnou zpětnou kontrolu.' },
    { title: 'Bezpečná práce s médii', text: 'Validace obsahu souborů a sanitace aktivního SVG obsahu chrání před nahráním nebezpečných skriptů.' },
    { title: 'Oddělení dat', text: 'Kritická a neveřejná data jsou striktně izolována mimo dosah veřejných API.' },
    { title: 'Žádný kill-switch', text: 'Systém neobsahuje skryté zadní vrátka ani licenční přepínače, které by smazaly vaše data.' },
  ];

  return (
    <section id="bezpecnost" className="py-20 bg-muted/30 border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-12 items-center">
          <div className="lg:w-1/2">
            <h2 className="text-3xl font-bold tracking-tight text-foreground mb-6 flex items-center gap-3">
              <Shield className="w-8 h-8 text-primary" />
              Bezpečnost v jádru
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Klademe maximální důraz na bezpečnost a kontrolu dat. Chráníme váš obsah od infrastruktury až po frontend.
            </p>
            <div className="space-y-6">
              {points.map((p, i) => (
                <div key={i}>
                  <h4 className="font-semibold text-foreground">{p.title}</h4>
                  <p className="text-sm text-muted-foreground mt-1">{p.text}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="lg:w-1/2">
            <div className="aspect-square bg-card rounded-3xl border border-border flex items-center justify-center p-8 shadow-sm">
              <div className="w-full h-full border border-dashed border-primary/20 rounded-2xl flex flex-col items-center justify-center bg-primary/5 text-primary/40">
                <Shield className="w-24 h-24 mb-4" />
                <span className="font-mono text-sm tracking-widest uppercase">Security Engine</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
