import { BrandVersionData, SemanticTokens } from './contracts';
import { resolveBrandTokens } from './resolver';

export function applyThemeToRoot(brandData: BrandVersionData | undefined, resolvedTheme: string | undefined, root: HTMLElement) {
  const mode = (resolvedTheme === 'dark' || resolvedTheme === 'extra-dark') ? 
    (resolvedTheme === 'extra-dark' ? 'extraDark' : 'dark') : 'light';
    
  const tokens = resolveBrandTokens(brandData, mode);
  
  root.style.setProperty('--brand-primary', tokens.brand.primary);
  root.style.setProperty('--brand-primary-soft', tokens.brand.soft);
  
  root.style.setProperty('--action-primary', tokens.action.primary);
  root.style.setProperty('--action-primary-text', tokens.action.primaryText);
  
  root.style.setProperty('--surface-canvas', tokens.canvas);
  root.style.setProperty('--surface-default', tokens.surfaceElevated);
  root.style.setProperty('--surface-subtle', tokens.surface);
  
  root.style.setProperty('--text-primary', tokens.text.primary);
  root.style.setProperty('--text-secondary', tokens.text.secondary);
  root.style.setProperty('--text-muted', tokens.text.muted);
  
  root.style.setProperty('--border-default', tokens.border);
  root.style.setProperty('--focus-ring', tokens.focus);
  
  root.style.setProperty('--state-success', tokens.state.success);
  root.style.setProperty('--state-warning', tokens.state.warning);
  root.style.setProperty('--state-danger', tokens.state.error);
  root.style.setProperty('--state-info', tokens.state.info);

  if (brandData?.typography?.fontFamily) {
    root.style.setProperty('--font-sans', brandData.typography.fontFamily);
  }
}
