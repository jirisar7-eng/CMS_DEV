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
    <section className="py-10 sm:py-12 bg-background border-b border-border">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
          {benefits.map((benefit, i) => (
            <div key={i} className="flex flex-col items-center sm:items-start text-center sm:text-left">
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-primary mb-3 shrink-0">
                <benefit.icon className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">{benefit.title}</h3>
              <p className="text-body-small text-muted-foreground">{benefit.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
