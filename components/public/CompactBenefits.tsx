import React from 'react';
import { Blocks, ShieldCheck, Database, Smartphone } from 'lucide-react';

export function CompactBenefits() {
  const benefits = [
    {
      title: 'Modulární',
      description: 'Používejte jen funkce, které skutečně potřebujete.',
      icon: Blocks,
    },
    {
      title: 'Bezpečný',
      description: 'Fail-closed přístup, audit a kontrola oprávnění.',
      icon: ShieldCheck,
    },
    {
      title: 'Vaše data',
      description: 'PostgreSQL, S3-compatible storage a žádný vendor lock-in.',
      icon: Database,
    },
    {
      title: 'Mobile-first',
      description: 'Plnohodnotná správa z telefonu, tabletu i počítače.',
      icon: Smartphone,
    },
  ];

  return (
    <section className="py-16 bg-background border-b border-border">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
          {benefits.map((benefit, i) => (
            <div key={i} className="flex flex-col items-center sm:items-start text-center sm:text-left">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-4 shrink-0">
                <benefit.icon className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">{benefit.title}</h3>
              <p className="text-sm text-muted-foreground">{benefit.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
