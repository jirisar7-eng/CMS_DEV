import { z } from 'zod';

export const SemanticTokensSchema = z.object({
  brand: z.object({
    primary: z.string(),
    soft: z.string(),
  }),
  action: z.object({
    primary: z.string(),
    primaryText: z.string(),
  }),
  text: z.object({
    primary: z.string(),
    secondary: z.string(),
    muted: z.string(),
  }),
  canvas: z.string(),
  surface: z.string(),
  surfaceElevated: z.string(),
  border: z.string(),
  link: z.string(),
  focus: z.string(),
  state: z.object({
    success: z.string(),
    warning: z.string(),
    error: z.string(),
    info: z.string(),
  }),
});

export const TypographySchema = z.object({
  fontFamily: z.string(),
  headingWeight: z.string(),
  bodyWeight: z.string(),
});

export const AssetsSchema = z.object({
  logoPrimary: z.string().nullable(),
  logoDark: z.string().nullable(),
  logoExtraDark: z.string().nullable(),
  symbol: z.string().nullable(),
  favicon: z.string().nullable(),
});

export const ThemeModesSchema = z.object({
  light: SemanticTokensSchema,
  dark: SemanticTokensSchema.nullable(),
  extraDark: SemanticTokensSchema.nullable(),
});

export const BrandVersionSchema = z.object({
  tokens: SemanticTokensSchema, // Can be base tokens or simplified
  typography: TypographySchema,
  assets: AssetsSchema,
  themeModes: ThemeModesSchema,
});

export type SemanticTokens = z.infer<typeof SemanticTokensSchema>;
export type Typography = z.infer<typeof TypographySchema>;
export type Assets = z.infer<typeof AssetsSchema>;
export type ThemeModes = z.infer<typeof ThemeModesSchema>;
export type BrandVersionData = z.infer<typeof BrandVersionSchema>;

// Default built-in fallback for Synthesis Orange
export const SYNTHESIS_ORANGE_DEFAULT: BrandVersionData = {
  tokens: {
    brand: { primary: '#FF7A00', soft: '#FFE4CC' },
    action: { primary: '#E66E00', primaryText: '#FFFFFF' },
    text: { primary: '#1F1F1F', secondary: '#4D4D4D', muted: '#737373' },
    canvas: '#FFFFFF',
    surface: '#F5F5F5',
    surfaceElevated: '#FFFFFF',
    border: '#E5E5E5',
    link: '#FF7A00',
    focus: '#FF9E40',
    state: {
      success: '#16A34A',
      warning: '#F59E0B',
      error: '#DC2626',
      info: '#2563EB'
    }
  },
  typography: {
    fontFamily: 'Inter, sans-serif',
    headingWeight: '700',
    bodyWeight: '400',
  },
  assets: {
    logoPrimary: null,
    logoDark: null,
    logoExtraDark: null,
    symbol: null,
    favicon: null,
  },
  themeModes: {
    light: {
      brand: { primary: '#FF7A00', soft: '#FFE4CC' },
      action: { primary: '#E66E00', primaryText: '#FFFFFF' },
      text: { primary: '#1F1F1F', secondary: '#4D4D4D', muted: '#737373' },
      canvas: '#FFFFFF',
      surface: '#F5F5F5',
      surfaceElevated: '#FFFFFF',
      border: '#E5E5E5',
      link: '#FF7A00',
      focus: '#FF9E40',
      state: {
        success: '#16A34A',
        warning: '#F59E0B',
        error: '#DC2626',
        info: '#2563EB'
      }
    },
    dark: null,
    extraDark: null,
  }
};
