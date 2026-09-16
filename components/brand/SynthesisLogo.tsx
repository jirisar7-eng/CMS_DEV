import React from 'react';

interface SynthesisLogoProps {
  variant?: 'primary' | 'symbol' | 'monochrome-dark' | 'monochrome-white' | 'admin-compact';
  className?: string;
  size?: number;
  decorative?: boolean;
}

const CanonicalSymbol = ({ color = 'currentColor', size = 32, decorative = false }: { color?: string; size?: number; decorative?: boolean }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 32 32" 
    width={size} 
    height={size} 
    fill="none"
    aria-hidden={decorative ? "true" : undefined}
    role={decorative ? undefined : "img"}
    aria-label={decorative ? undefined : "Synthesis CMS symbol"}
  >
    {/* UPPER RIBBON */}
    <path 
      d="M25 8H13C9.68629 8 7 10.6863 7 14C7 17.3137 9.68629 20 13 20H19" 
      stroke={color} 
      strokeWidth="5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    />
    {/* LOWER RIBBON */}
    <path 
      d="M7 24H19C22.3137 24 25 21.3137 25 18C25 14.6863 22.3137 12 19 12H13" 
      stroke={color} 
      strokeWidth="5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    />
  </svg>
);

export function SynthesisLogo({ variant = 'primary', className = '', size, decorative = false }: SynthesisLogoProps) {
  let color = '#FF7A00';
  let defaultSize = 32;
  let showText = true;
  let textColorClass = 'text-foreground';

  if (variant === 'symbol') {
    showText = false;
  } else if (variant === 'admin-compact') {
    showText = false;
    defaultSize = 24;
  } else if (variant === 'monochrome-dark') {
    color = '#1F1F1F'; // Using standard dark hex for single-color dark
    textColorClass = 'text-black';
  } else if (variant === 'monochrome-white') {
    color = '#FFFFFF';
    textColorClass = 'text-white';
  }

  const finalSize = size || defaultSize;

  if (!showText) {
    return (
      <div 
        className={`flex items-center justify-center ${className}`} 
        aria-label={decorative ? undefined : "Synthesis CMS"}
        aria-hidden={decorative ? "true" : undefined}
      >
        <CanonicalSymbol color={color} size={finalSize} decorative={decorative} />
      </div>
    );
  }

  return (
    <div 
      className={`flex items-center gap-2 font-extrabold tracking-tighter ${className}`}
      aria-label={decorative ? undefined : "Synthesis CMS"}
    >
      <CanonicalSymbol color={color} size={finalSize} decorative={true} />
      <span className={`text-xl ${textColorClass} font-sans`}>
        Synthesis CMS
      </span>
    </div>
  );
}
