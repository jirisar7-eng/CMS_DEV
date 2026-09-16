import { BrandVersionData, SemanticTokens, hexColorRegex } from './contracts';

// Relative luminance calculation
export function getLuminance(r: number, g: number, b: number) {
  const a = [r, g, b].map(function (v) {
    v /= 255;
    return v <= 0.03928
      ? v / 12.92
      : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

// Parse hex color to rgb
export function hexToRgb(hex: string) {
  if (!hexColorRegex.test(hex)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex[0] + cleanHex[0] + cleanHex[1] + cleanHex[1] + cleanHex[2] + cleanHex[2];
  }
  
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(cleanHex);
  if (!result) {
    throw new Error(`Invalid hex color parsing: ${hex}`);
  }
  
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  };
}

// Calculate contrast ratio
export function getContrastRatio(color1: string, color2: string): number {
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);
  const l1 = getLuminance(c1.r, c1.g, c1.b);
  const l2 = getLuminance(c2.r, c2.g, c2.b);
  const lightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);
  return (lightest + 0.05) / (darkest + 0.05);
}

export interface ContrastFailure {
  pair: string;
  ratio: number;
  expected: number;
  mode: string;
}

export function validateTokensAccessibility(tokens: SemanticTokens, mode: string): ContrastFailure[] {
  const failures: ContrastFailure[] = [];
  const normalTextRatio = 4.5; // AA normal text
  const focusRatio = 3.0; // AA non-text (focus)

  const checks = [
    { name: 'text.primary / canvas', fg: tokens.text.primary, bg: tokens.canvas, expected: normalTextRatio },
    { name: 'text.primary / surface', fg: tokens.text.primary, bg: tokens.surface, expected: normalTextRatio },
    { name: 'text.muted / canvas', fg: tokens.text.muted, bg: tokens.canvas, expected: normalTextRatio },
    { name: 'action.primaryText / action.primary', fg: tokens.action.primaryText, bg: tokens.action.primary, expected: normalTextRatio },
    { name: 'link / canvas', fg: tokens.link, bg: tokens.canvas, expected: normalTextRatio },
    { name: 'focus / canvas', fg: tokens.focus, bg: tokens.canvas, expected: focusRatio },
    { name: 'focus / surface', fg: tokens.focus, bg: tokens.surface, expected: focusRatio }
  ];

  for (const check of checks) {
    try {
      const ratio = getContrastRatio(check.fg, check.bg);
      if (ratio < check.expected) {
        failures.push({
          pair: check.name,
          ratio: Math.round(ratio * 100) / 100,
          expected: check.expected,
          mode
        });
      }
    } catch (e: any) {
      // If parsing fails, it's an automatic contrast failure for the pair
      failures.push({
        pair: check.name,
        ratio: 1.0,
        expected: check.expected,
        mode
      });
    }
  }

  return failures;
}

export function validateAllThemesAccessibility(data: BrandVersionData): ContrastFailure[] {
  const failures: ContrastFailure[] = [];
  
  if (data.themeModes.light) {
    failures.push(...validateTokensAccessibility(data.themeModes.light, 'light'));
  }
  if (data.themeModes.dark) {
    failures.push(...validateTokensAccessibility(data.themeModes.dark, 'dark'));
  }
  if (data.themeModes.extraDark) {
    failures.push(...validateTokensAccessibility(data.themeModes.extraDark, 'extraDark'));
  }
  
  return failures;
}
