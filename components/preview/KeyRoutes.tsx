import React from 'react';
import { Layers, Zap, Globe } from 'lucide-react';

export function KeyRoutes() {
  const routes = [
    {
      title: "Content Architecture",
      description: "Structured content models that scale with your growing business needs seamlessly.",
      icon: Layers
    },
    {
      title: "Lightning Fast",
      description: "Optimized delivery at the edge ensures your site loads instantly worldwide.",
      icon: Zap
    },
    {
      title: "Global Reach",
      description: "Built-in internationalization and localization to serve audiences everywhere.",
      icon: Globe
    }
  ];

  return (
    <section className="py-24 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight">Built for scale</h2>
          <p className="mt-4 text-lg text-muted-foreground">Everything you need to manage your digital footprint.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {routes.map((route, i) => (
            <div key={i} className="bg-card p-8 rounded-2xl border shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6 text-primary">
                <route.icon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold mb-3">{route.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{route.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
