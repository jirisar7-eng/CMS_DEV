import React from 'react';

export function FeaturedSection() {
  return (
    <section className="py-24 bg-background border-t">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          <div className="flex-1 space-y-6">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Focus on creating, not configuring</h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Synthesis CMS provides a streamlined editorial experience. With powerful semantic blocks and a clean interface, 
              your team can produce content faster without worrying about layout breaking or inconsistent styling.
            </p>
            <ul className="space-y-4 pt-4">
              {['Intuitive block editor', 'Real-time collaborative editing', 'Built-in SEO tools', 'Automated responsive images'].map((feature, i) => (
                <li key={i} className="flex items-center gap-3 text-foreground font-medium">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex-1 w-full relative">
            <div className="aspect-[4/3] rounded-2xl bg-muted border overflow-hidden relative shadow-lg">
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground font-medium text-lg">
                Featured Content Area
              </div>
            </div>
            {/* Decorative background elements */}
            <div className="absolute -inset-4 bg-primary/5 rounded-3xl -z-10 blur-xl"></div>
          </div>
        </div>
      </div>
    </section>
  );
}
