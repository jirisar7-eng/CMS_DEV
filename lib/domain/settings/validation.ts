import { SettingsScope, SettingsValidationError } from './contracts';
import { getRegisteredSetting, isSecurityPolicyOrSecretKey } from './registry';

export interface ValidatedSettingsResult {
  sanitizedSettings: Record<string, unknown>;
  changedKeys: string[];
}

export function validateSettingsPayload(
  scope: SettingsScope,
  payload: unknown
): ValidatedSettingsResult {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new SettingsValidationError('Settings payload must be a non-empty object');
  }

  const rawObj = payload as Record<string, unknown>;
  const keys = Object.keys(rawObj);

  if (keys.length === 0) {
    throw new SettingsValidationError('Settings payload must contain at least one setting to update');
  }

  const errors: Record<string, string> = {};
  const sanitizedSettings: Record<string, unknown> = {};
  const changedKeys: string[] = [];

  for (const key of keys) {
    if (isSecurityPolicyOrSecretKey(key)) {
      errors[key] = 'Security policies, credentials, auth rules and secrets cannot be managed via settings';
      continue;
    }

    const definition = getRegisteredSetting(key);
    if (!definition) {
      errors[key] = `Unknown setting key '${key}'`;
      continue;
    }

    if (definition.scope !== scope) {
      errors[key] = `Setting key '${key}' belongs to ${definition.scope} scope, not ${scope}`;
      continue;
    }

    const val = rawObj[key];
    const validation = definition.validate(val);
    if (!validation.valid) {
      errors[key] = validation.error || 'Invalid setting value';
      continue;
    }

    sanitizedSettings[key] = validation.sanitized;
    changedKeys.push(key);
  }

  if (Object.keys(errors).length > 0) {
    throw new SettingsValidationError('Settings validation failed', errors);
  }

  return { sanitizedSettings, changedKeys };
}
