export type SettingsScope = 'SYSTEM' | 'PROJECT';

export interface SettingValidationResult<T = unknown> {
  valid: boolean;
  sanitized?: T;
  error?: string;
}

export interface SettingDefinition<T = unknown> {
  key: string;
  scope: SettingsScope;
  description: string;
  defaultValue: T;
  validate: (val: unknown) => SettingValidationResult<T>;
}

export type SettingsMap = Record<string, unknown>;

export class SettingsError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'SettingsError';
    this.code = code;
    this.status = status;
  }
}

export class SettingsValidationError extends SettingsError {
  readonly validationErrors: Record<string, string>;

  constructor(message: string, validationErrors: Record<string, string> = {}) {
    super('VALIDATION_FAILED', message, 400);
    this.name = 'SettingsValidationError';
    this.validationErrors = validationErrors;
  }
}

export class SettingsAuthorizationError extends SettingsError {
  constructor(message = 'Insufficient permissions to access settings') {
    super('FORBIDDEN', message, 403);
    this.name = 'SettingsAuthorizationError';
  }
}

export class SettingsNotFoundError extends SettingsError {
  constructor(message = 'Requested setting or resource not found') {
    super('NOT_FOUND', message, 404);
    this.name = 'SettingsNotFoundError';
  }
}
