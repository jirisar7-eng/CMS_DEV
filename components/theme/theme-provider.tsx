"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"
import { resolveBrandTokens } from "@/lib/domain/brand/resolver"
import { BrandVersionData } from "@/lib/domain/brand/contracts"

interface ThemeProviderProps extends React.ComponentProps<typeof NextThemesProvider> {
  brandData?: BrandVersionData;
}

export function ThemeProvider({ children, brandData, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      <ThemeSynchronizer brandData={brandData} />
      {children}
    </NextThemesProvider>
  )
}

function ThemeSynchronizer({ brandData }: { brandData?: BrandVersionData }) {
  const { resolvedTheme } = useTheme();

  React.useEffect(() => {
    // Treat 'dark' and 'extraDark' explicitly, fallback to 'light'
    const mode = (resolvedTheme === 'dark' || resolvedTheme === 'extraDark') ? resolvedTheme : 'light';
    const tokens = resolveBrandTokens(brandData, mode);
    const root = document.documentElement;

    root.style.setProperty('--background', tokens.canvas);
    root.style.setProperty('--foreground', tokens.text.primary);
    
    root.style.setProperty('--card', tokens.surfaceElevated);
    root.style.setProperty('--card-foreground', tokens.text.primary);
    
    root.style.setProperty('--popover', tokens.surfaceElevated);
    root.style.setProperty('--popover-foreground', tokens.text.primary);
    
    root.style.setProperty('--primary', tokens.brand.primary);
    root.style.setProperty('--primary-foreground', tokens.action.primaryText);
    
    root.style.setProperty('--secondary', tokens.brand.soft);
    root.style.setProperty('--secondary-foreground', tokens.text.primary);
    
    root.style.setProperty('--muted', tokens.surface);
    root.style.setProperty('--muted-foreground', tokens.text.muted);
    
    root.style.setProperty('--accent', tokens.brand.soft);
    root.style.setProperty('--accent-foreground', tokens.text.primary);
    
    root.style.setProperty('--destructive', tokens.state.error);
    root.style.setProperty('--destructive-foreground', '#FFFFFF');

    root.style.setProperty('--border', tokens.border);
    root.style.setProperty('--input', tokens.border);
    root.style.setProperty('--ring', tokens.focus);

    if (brandData?.typography?.fontFamily) {
      root.style.setProperty('--font-sans', brandData.typography.fontFamily);
    }
  }, [resolvedTheme, brandData]);

  return null;
}
