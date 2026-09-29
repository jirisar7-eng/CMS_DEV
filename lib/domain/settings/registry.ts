import { SettingDefinition, SettingsScope, SettingValidationResult } from './contracts';

const ALLOWED_LOCALES = new Set(['cs', 'en', 'sk', 'de']);
const ALLOWED_TIMEZONES = new Set(['Europe/Prague', 'UTC', 'Europe/London', 'America/New_York']);
const ALLOWED_DATE_FORMATS = new Set(['DD.MM.YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY', 'D. M. YYYY']);

const FORBIDDEN_SECURITY_KEYWORDS = [
  'auth',
  'mfa',
  'session',
  'token',
  'secret',
  'password',
  'passwd',
  'private_key',
  'api_key',
  'encryption',
  'signing',
  'cors',
  'header',
  'security_header',
  'role',
  'permission',
  'rbac',
  'ttl',
  'cookie',
  'maintenance',
];

export function isSecurityPolicyOrSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  return FORBIDDEN_SECURITY_KEYWORDS.some((kw) => lower.includes(kw));
}

function validateLocale(val: unknown): SettingValidationResult<string> {
  if (typeof val !== 'string') {
    return { valid: false, error: 'Locale must be a string' };
  }
  const trimmed = val.trim().toLowerCase();
  if (!ALLOWED_LOCALES.has(trimmed)) {
    return { valid: false, error: `Invalid locale. Allowed: ${Array.from(ALLOWED_LOCALES).join(', ')}` };
  }
  return { valid: true, sanitized: trimmed };
}

function validateTimezone(val: unknown): SettingValidationResult<string> {
  if (typeof val !== 'string') {
    return { valid: false, error: 'Timezone must be a string' };
  }
  const trimmed = val.trim();
  if (!ALLOWED_TIMEZONES.has(trimmed)) {
    return { valid: false, error: `Invalid timezone. Allowed: ${Array.from(ALLOWED_TIMEZONES).join(', ')}` };
  }
  return { valid: true, sanitized: trimmed };
}

function validateInstanceName(val: unknown): SettingValidationResult<string> {
  if (typeof val !== 'string') {
    return { valid: false, error: 'Instance name must be a string' };
  }
  const trimmed = val.trim();
  if (trimmed.length < 1 || trimmed.length > 100) {
    return { valid: false, error: 'Instance name must be between 1 and 100 characters' };
  }
  // Sanitize out dangerous control characters
  if (/[<>]/.test(trimmed)) {
    return { valid: false, error: 'Instance name contains invalid characters' };
  }
  return { valid: true, sanitized: trimmed };
}

function validatePublicUrl(val: unknown): SettingValidationResult<string | null> {
  if (val === null || val === undefined || val === '') {
    return { valid: true, sanitized: null };
  }
  if (typeof val !== 'string') {
    return { valid: false, error: 'Public URL must be a string or null' };
  }
  const trimmed = val.trim();
  if (trimmed === '') {
    return { valid: true, sanitized: null };
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { valid: false, error: 'Public URL must use http or https scheme' };
    }
    return { valid: true, sanitized: url.origin + (url.pathname === '/' ? '' : url.pathname) };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

function validateDateFormat(val: unknown): SettingValidationResult<string> {
  if (typeof val !== 'string') {
    return { valid: false, error: 'Date format must be a string' };
  }
  const trimmed = val.trim();
  if (!ALLOWED_DATE_FORMATS.has(trimmed)) {
    return { valid: false, error: `Invalid date format. Allowed: ${Array.from(ALLOWED_DATE_FORMATS).join(', ')}` };
  }
  return { valid: true, sanitized: trimmed };
}

function validateEmail(val: unknown): SettingValidationResult<string | null> {
  if (val === null || val === undefined || val === '') {
    return { valid: true, sanitized: null };
  }
  if (typeof val !== 'string') {
    return { valid: false, error: 'Contact email must be a string or null' };
  }
  const trimmed = val.trim().toLowerCase();
  if (trimmed === '') {
    return { valid: true, sanitized: null };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed) || trimmed.length > 255) {
    return { valid: false, error: 'Invalid email address' };
  }
  return { valid: true, sanitized: trimmed };
}


function validatePrivacyPolicyUrl(val: unknown): SettingValidationResult<string | null> {
  if (val === null || val === undefined || val === '') {
    return { valid: true, sanitized: null };
  }
  if (typeof val !== 'string') {
    return { valid: false, error: 'Privacy policy URL must be a string or null' };
  }
  const trimmed = val.trim();
  if (trimmed === '') {
    return { valid: true, sanitized: null };
  }
  if (trimmed.startsWith('/')) {
    if (/[<>\s"']/.test(trimmed) || trimmed.length > 200) {
      return { valid: false, error: 'Privacy policy path contains invalid characters or exceeds 200 chars' };
    }
    return { valid: true, sanitized: trimmed };
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { valid: false, error: 'Privacy policy URL must use http or https scheme' };
    }
    return { valid: true, sanitized: url.origin + (url.pathname === '/' ? '' : url.pathname) };
  } catch {
    return { valid: false, error: 'Invalid URL or path format' };
  }
}

function validateDataRetentionDays(val: unknown): SettingValidationResult<number> {
  let num: number;
  if (typeof val === 'number') {
    num = val;
  } else if (typeof val === 'string' && /^\d+$/.test(val.trim())) {
    num = parseInt(val.trim(), 10);
  } else {
    return { valid: false, error: 'Retention days must be an integer between 30 and 3650' };
  }
  if (!Number.isInteger(num) || num < 30 || num > 3650) {
    return { valid: false, error: 'Retention days must be an integer between 30 and 3650' };
  }
  return { valid: true, sanitized: num };
}

export const SETTINGS_REGISTRY: Record<string, SettingDefinition<any>> = {
  // SYSTEM SCOPE
  'system.instance_name': {
    key: 'system.instance_name',
    scope: 'SYSTEM',
    description: 'System instance name',
    defaultValue: 'Synthesis CMS',
    validate: validateInstanceName,
  },
  'system.default_locale': {
    key: 'system.default_locale',
    scope: 'SYSTEM',
    description: 'Default system locale',
    defaultValue: 'cs',
    validate: validateLocale,
  },
  'system.default_timezone': {
    key: 'system.default_timezone',
    scope: 'SYSTEM',
    description: 'Default system timezone',
    defaultValue: 'Europe/Prague',
    validate: validateTimezone,
  },

  // PROJECT SCOPE
  'project.public_url': {
    key: 'project.public_url',
    scope: 'PROJECT',
    description: 'Canonical public website URL',
    defaultValue: null,
    validate: validatePublicUrl,
  },
  'project.default_locale': {
    key: 'project.default_locale',
    scope: 'PROJECT',
    description: 'Default project language',
    defaultValue: 'cs',
    validate: validateLocale,
  },
  'project.default_timezone': {
    key: 'project.default_timezone',
    scope: 'PROJECT',
    description: 'Default project timezone',
    defaultValue: 'Europe/Prague',
    validate: validateTimezone,
  },
  'project.date_format': {
    key: 'project.date_format',
    scope: 'PROJECT',
    description: 'Default date format display',
    defaultValue: 'DD.MM.YYYY',
    validate: validateDateFormat,
  },
  'project.contact_email': {
    key: 'project.contact_email',
    scope: 'PROJECT',
    description: 'Public contact email',
    defaultValue: null,
    validate: validateEmail,
  },
  'project.privacy_policy_url': {
    key: 'project.privacy_policy_url',
    scope: 'PROJECT',
    description: 'Public Privacy Policy page path or URL',
    defaultValue: null,
    validate: validatePrivacyPolicyUrl,
  },
  'project.data_retention_days': {
    key: 'project.data_retention_days',
    scope: 'PROJECT',
    description: 'Declared operational data retention period in days',
    defaultValue: 365,
    validate: validateDataRetentionDays,
  },
  'project.privacy_contact_email': {
    key: 'project.privacy_contact_email',
    scope: 'PROJECT',
    description: 'Privacy inquiries contact email',
    defaultValue: null,
    validate: validateEmail,
  },
};

export function getRegisteredSetting(key: string): SettingDefinition | undefined {
  return SETTINGS_REGISTRY[key];
}

export function getScopeDefinitions(scope: SettingsScope): SettingDefinition[] {
  return Object.values(SETTINGS_REGISTRY).filter((def) => def.scope === scope);
}

export function getScopeDefaults(scope: SettingsScope): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const def of getScopeDefinitions(scope)) {
    result[def.key] = def.defaultValue;
  }
  return result;
}
