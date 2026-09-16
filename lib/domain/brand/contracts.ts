import { z } from 'zod';

export const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

const hexColor = z.string().regex(hexColorRegex, "Must be a valid hex color");

export const SemanticTokensSchema = z.object({
  brand: z.object({
    primary: hexColor,
    soft: hexColor,
  }),
  action: z.object({
    primary: hexColor,
    primaryText: hexColor,
  }),
  text: z.object({
    primary: hexColor,
    secondary: hexColor,
    muted: hexColor,
  }),
  canvas: hexColor,
  surface: hexColor,
  surfaceElevated: hexColor,
  border: hexColor,
  link: hexColor,
  focus: hexColor,
  state: z.object({
    success: hexColor,
    warning: hexColor,
    error: hexColor,
    info: hexColor,
  }),
});

const allowedFonts = ['Inter, sans-serif', 'Roboto, sans-serif', 'Geist, sans-serif'];
const allowedWeights = ['400', '500', '600', '700', '800'];

export const TypographySchema = z.object({
  fontFamily: z.string().refine(v => allowedFonts.includes(v), { message: "Unsupported font family" }),
  headingWeight: z.string().refine(v => allowedWeights.includes(v), { message: "Unsupported font weight" }),
  bodyWeight: z.string().refine(v => allowedWeights.includes(v), { message: "Unsupported font weight" }),
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
  tokens: SemanticTokensSchema,
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
const synthesisLightTokens: SemanticTokens = {
  brand: { primary: '#FF7A00', soft: '#FFE4CC' },
  action: { primary: '#C25700', primaryText: '#FFFFFF' }, // AA accessible against white (#C25700 is 4.51:1)
  text: { primary: '#1F1F1F', secondary: '#4D4D4D', muted: '#737373' },
  canvas: '#FFFFFF',
  surface: '#F5F5F5',
  surfaceElevated: '#FFFFFF',
  border: '#E5E5E5',
  link: '#C25700',
  focus: '#000000',
  state: {
    success: '#16A34A',
    warning: '#F59E0B',
    error: '#DC2626',
    info: '#2563EB'
  }
};

const synthesisDarkTokens: SemanticTokens = {
  brand: { primary: '#FF7A00', soft: '#FFE4CC' },
  action: { primary: '#FF9E40', primaryText: '#121212' },
  text: { primary: '#FFFFFF', secondary: '#A3A3A3', muted: '#888888' },
  canvas: '#121212',
  surface: '#1E1E1E',
  surfaceElevated: '#2A2A2A',
  border: '#333333',
  link: '#FF9E40',
  focus: '#FFFFFF',
  state: {
    success: '#22C55E',
    warning: '#FBBF24',
    error: '#EF4444',
    info: '#3B82F6'
  }
};

const synthesisExtraDarkTokens: SemanticTokens = {
  brand: { primary: '#FF7A00', soft: '#FFE4CC' },
  action: { primary: '#FF9E40', primaryText: '#000000' },
  text: { primary: '#FFFFFF', secondary: '#A3A3A3', muted: '#888888' },
  canvas: '#000000',
  surface: '#0A0A0A',
  surfaceElevated: '#141414',
  border: '#222222',
  link: '#FF9E40',
  focus: '#FFFFFF',
  state: {
    success: '#22C55E',
    warning: '#FBBF24',
    error: '#EF4444',
    info: '#3B82F6'
  }
};

export const SYNTHESIS_ORANGE_DEFAULT: BrandVersionData = {
  tokens: synthesisLightTokens,
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
    light: synthesisLightTokens,
    dark: synthesisDarkTokens,
    extraDark: synthesisExtraDarkTokens,
  }
};

export function validateScopeInvariant(scope: string, projectId?: string | null) {
  if (scope === 'SYSTEM' && projectId) {
    throw new Error('SYSTEM scope cannot have a projectId');
  }
  if (scope === 'PROJECT' && !projectId) {
    throw new Error('PROJECT scope must have a non-empty projectId');
  }
  if (scope !== 'SYSTEM' && scope !== 'PROJECT') {
    throw new Error('Invalid scope: must be SYSTEM or PROJECT');
  }
}

export function getDerivedPermissionScope(scope: string, projectId?: string | null): string | null {
  validateScopeInvariant(scope, projectId);
  return scope === 'SYSTEM' ? null : (projectId || null);
}
