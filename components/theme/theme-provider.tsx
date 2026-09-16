"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"
import { BrandVersionData } from "@/lib/domain/brand/contracts"
import { applyThemeToRoot } from "@/lib/domain/brand/runtime"

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
    applyThemeToRoot(brandData, resolvedTheme, document.documentElement);
  }, [resolvedTheme, brandData]);

  return null;
}
