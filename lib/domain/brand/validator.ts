import { BrandVersionSchema, BrandVersionData } from './contracts';
import { resolveBrandTokens } from './resolver';
import { validateTokensAccessibility, ContrastFailure } from './accessibility';

export interface ValidationResult {
  success: boolean;
  data?: BrandVersionData;
  errors?: any[];
  accessibilityFailures?: ContrastFailure[];
}

export function validateBrandForPublication(data: any): ValidationResult {
  const parsed = BrandVersionSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, errors: [parsed.error] };
  }

  const validData = parsed.data;
  const accessErrors: ContrastFailure[] = [];
  
  for (const mode of ['light', 'dark', 'extraDark'] as const) {
    const resolvedTokens = resolveBrandTokens(validData, mode);
    const modeErrors = validateTokensAccessibility(resolvedTokens, mode);
    accessErrors.push(...modeErrors);
  }

  if (accessErrors.length > 0) {
    return { success: false, accessibilityFailures: accessErrors };
  }

  return { success: true, data: validData };
}
