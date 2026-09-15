import React from 'react';

interface SynthesisLogoProps {
  variant?: 'primary' | 'symbol' | 'monochrome-dark' | 'monochrome-white' | 'admin-compact';
  className?: string;
}

export function SynthesisLogo({ variant = 'primary', className = '' }: SynthesisLogoProps) {
  // FINAL_VECTOR_LOGO = PENDING
  // This is a temporary typographic/CSS placeholder matching the brand contract
  // until the final SVG asset is approved and provided.

  if (variant === 'symbol' || variant === 'admin-compact') {
    return (
      <div className={`flex items-center justify-center font-extrabold tracking-tighter ${className}`}>
        <span className="text-brand">S</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 font-extrabold tracking-tighter ${className}`}>
      <span className="text-brand text-xl">S</span>
      <span className={variant === 'monochrome-white' ? 'text-white' : variant === 'monochrome-dark' ? 'text-black' : 'text-foreground'}>
        Synthesis
      </span>
    </div>
  );
}
