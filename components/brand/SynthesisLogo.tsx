import React from 'react';

interface SynthesisLogoProps {
  variant?: 'primary' | 'symbol' | 'monochrome-dark' | 'monochrome-white' | 'admin-compact';
  className?: string;
  size?: number;
}

const CanonicalSymbol = ({ color = 'currentColor', size = 32 }: { color?: string; size?: number }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 32 32" 
    width={size} 
    height={size} 
    fill="none"
    aria-hidden="true"
  >
    <path d="M12 4H20C24.4183 4 28 7.58172 28 12V20M20 28H12C7.58172 28 4 24.4183 4 20V12" stroke={color} strokeWidth="4" strokeLinecap="round" />
    <path d="M4 12C4 7.58172 7.58172 4 12 4H20C17.7909 4 16 5.79086 16 8V12M28 20C28 24.4183 24.4183 28 20 28H12C14.2091 28 16 26.2091 16 24V20" fill={color} opacity="0.2" />
    <path d="M16 8C13.7909 8 12 9.79086 12 12V20C12 22.2091 14.2091 24 16 24C18.2091 24 20 22.2091 20 20V12C20 9.79086 18.2091 8 16 8Z" fill={color} />
  </svg>
);

export function SynthesisLogo({ variant = 'primary', className = '', size }: SynthesisLogoProps) {
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
      <div className={`flex items-center justify-center ${className}`} aria-label="Synthesis CMS">
        <CanonicalSymbol color={color} size={finalSize} />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 font-extrabold tracking-tighter ${className}`} aria-label="Synthesis CMS">
      <CanonicalSymbol color={color} size={finalSize} />
      <span className={`text-xl ${textColorClass} font-sans`}>
        Synthesis CMS
      </span>
    </div>
  );
}
