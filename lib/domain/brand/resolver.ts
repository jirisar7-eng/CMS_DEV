import { BrandVersionData, SemanticTokens, SYNTHESIS_ORANGE_DEFAULT } from './contracts';

export type ThemeMode = 'light' | 'dark' | 'extraDark';

export function resolveBrandTokens(brandVersionData: BrandVersionData | null | undefined, mode: ThemeMode): SemanticTokens {
  const safeData = brandVersionData || SYNTHESIS_ORANGE_DEFAULT;
  const modes = safeData.themeModes;

  switch (mode) {
    case 'extraDark':
      if (modes.extraDark) return modes.extraDark;
      if (modes.dark) return modes.dark;
      return modes.light;
    case 'dark':
      if (modes.dark) return modes.dark;
      return modes.light;
    case 'light':
    default:
      return modes.light;
  }
}
