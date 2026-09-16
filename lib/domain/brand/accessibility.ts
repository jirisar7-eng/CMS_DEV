import { SemanticTokens } from './contracts';

// Relative luminance calculation
function getLuminance(r: number, g: number, b: number) {
  const a = [r, g, b].map(function (v) {
    v /= 255;
    return v <= 0.03928
      ? v / 12.92
      : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

// Parse hex color to rgb
function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 255, b: 255 };
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

export function validateThemeAccessibility(tokens: SemanticTokens, mode: string): ContrastFailure[] {
  const failures: ContrastFailure[] = [];
  const requiredRatio = 4.5; // AA normal text

  const checks = [
    { name: 'text.primary / canvas', fg: tokens.text.primary, bg: tokens.canvas, expected: requiredRatio },
    { name: 'text.primary / surface', fg: tokens.text.primary, bg: tokens.surface, expected: requiredRatio },
    { name: 'text.muted / canvas', fg: tokens.text.muted, bg: tokens.canvas, expected: requiredRatio },
    { name: 'action.primaryText / action.primary', fg: tokens.action.primaryText, bg: tokens.action.primary, expected: requiredRatio },
    { name: 'link / canvas', fg: tokens.link, bg: tokens.canvas, expected: requiredRatio }
  ];

  for (const check of checks) {
    const ratio = getContrastRatio(check.fg, check.bg);
    if (ratio < check.expected) {
      failures.push({
        pair: check.name,
        ratio: Math.round(ratio * 100) / 100,
        expected: check.expected,
        mode
      });
    }
  }

  return failures;
}
