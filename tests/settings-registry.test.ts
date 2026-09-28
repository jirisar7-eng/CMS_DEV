import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SETTINGS_REGISTRY,
  getScopeDefaults,
  isSecurityPolicyOrSecretKey,
  validateSettingsPayload,
  SettingsValidationError,
} from '../lib/domain/settings';

test('Settings Registry: exposes defined SYSTEM and PROJECT settings with valid defaults', () => {
  const systemDefaults = getScopeDefaults('SYSTEM');
  assert.equal(typeof systemDefaults['system.instance_name'], 'string');
  assert.equal(systemDefaults['system.default_locale'], 'cs');
  assert.equal(systemDefaults['system.default_timezone'], 'Europe/Prague');

  const projectDefaults = getScopeDefaults('PROJECT');
  assert.equal(projectDefaults['project.public_url'], null);
  assert.equal(projectDefaults['project.default_locale'], 'cs');
  assert.equal(projectDefaults['project.default_timezone'], 'Europe/Prague');
  assert.equal(projectDefaults['project.date_format'], 'DD.MM.YYYY');
  assert.equal(projectDefaults['project.contact_email'], null);
});

test('Settings Validation: accepts valid SYSTEM settings', () => {
  const payload = {
    'system.instance_name': 'Production Synthesis Hub',
    'system.default_locale': 'en',
    'system.default_timezone': 'UTC',
  };

  const { sanitizedSettings, changedKeys } = validateSettingsPayload('SYSTEM', payload);
  assert.deepEqual(changedKeys.sort(), Object.keys(payload).sort());
  assert.equal(sanitizedSettings['system.instance_name'], 'Production Synthesis Hub');
  assert.equal(sanitizedSettings['system.default_locale'], 'en');
  assert.equal(sanitizedSettings['system.default_timezone'], 'UTC');
});

test('Settings Validation: accepts valid PROJECT settings', () => {
  const payload = {
    'project.public_url': 'https://example.com/site',
    'project.default_locale': 'sk',
    'project.default_timezone': 'Europe/London',
    'project.date_format': 'YYYY-MM-DD',
    'project.contact_email': 'admin@example.com',
  };

  const { sanitizedSettings, changedKeys } = validateSettingsPayload('PROJECT', payload);
  assert.deepEqual(changedKeys.sort(), Object.keys(payload).sort());
  assert.equal(sanitizedSettings['project.public_url'], 'https://example.com/site');
  assert.equal(sanitizedSettings['project.default_locale'], 'sk');
  assert.equal(sanitizedSettings['project.date_format'], 'YYYY-MM-DD');
  assert.equal(sanitizedSettings['project.contact_email'], 'admin@example.com');
});

test('Settings Validation: rejects unknown setting keys', () => {
  assert.throws(
    () => validateSettingsPayload('SYSTEM', { 'unknown.custom_key': 'value' }),
    (err: any) => {
      assert(err instanceof SettingsValidationError);
      assert(err.validationErrors['unknown.custom_key'].includes('Unknown setting key'));
      return true;
    }
  );
});

test('Settings Validation: rejects scope mismatch', () => {
  // Attempting to set project setting in SYSTEM scope
  assert.throws(
    () => validateSettingsPayload('SYSTEM', { 'project.public_url': 'https://example.com' }),
    (err: any) => {
      assert(err instanceof SettingsValidationError);
      assert(err.validationErrors['project.public_url'].includes('belongs to PROJECT scope'));
      return true;
    }
  );

  // Attempting to set system setting in PROJECT scope
  assert.throws(
    () => validateSettingsPayload('PROJECT', { 'system.instance_name': 'My Site' }),
    (err: any) => {
      assert(err instanceof SettingsValidationError);
      assert(err.validationErrors['system.instance_name'].includes('belongs to SYSTEM scope'));
      return true;
    }
  );
});

test('Settings Security Boundary: permanently rejects security policy, credentials and secrets', () => {
  const forbiddenKeys = [
    'auth.mfa_enforced',
    'session.ttl_minutes',
    'rbac.custom_role',
    'security.headers_hsts',
    'cors.allowed_origins',
    'jwt_secret_token',
    'admin_password',
    'private_key',
    'api_key_secret',
    'maintenance_mode',
  ];

  for (const key of forbiddenKeys) {
    assert.equal(isSecurityPolicyOrSecretKey(key), true, `Expected ${key} to be identified as forbidden`);
    assert.throws(
      () => validateSettingsPayload('SYSTEM', { [key]: 'payload' }),
      (err: any) => {
        assert(err instanceof SettingsValidationError);
        assert(err.validationErrors[key].includes('Security policies'));
        return true;
      }
    );
  }
});

test('Settings Validation: rejects invalid URLs, locales and formats', () => {
  assert.throws(
    () => validateSettingsPayload('PROJECT', { 'project.public_url': 'javascript:alert(1)' }),
    (err: any) => {
      assert(err instanceof SettingsValidationError);
      assert(err.validationErrors['project.public_url'].includes('must use http or https'));
      return true;
    }
  );

  assert.throws(
    () => validateSettingsPayload('PROJECT', { 'project.default_locale': 'invalid_lang' }),
    (err: any) => {
      assert(err instanceof SettingsValidationError);
      assert(err.validationErrors['project.default_locale'].includes('Invalid locale'));
      return true;
    }
  );

  assert.throws(
    () => validateSettingsPayload('PROJECT', { 'project.contact_email': 'not-an-email' }),
    (err: any) => {
      assert(err instanceof SettingsValidationError);
      assert(err.validationErrors['project.contact_email'].includes('Invalid email'));
      return true;
    }
  );
});
