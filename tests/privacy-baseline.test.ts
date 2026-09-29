import assert from 'node:assert';
import test from 'node:test';
import {
  getRegisteredSetting,
  isSecurityPolicyOrSecretKey,
} from '../lib/domain/settings/registry';
import { validateSettingsPayload } from '../lib/domain/settings/validation';
import { SettingsValidationError } from '../lib/domain/settings/contracts';
import { ADMIN_NAV_GROUPS } from '../lib/navigation/adminNav';

test('Privacy Baseline - Registry Keys Registration', () => {
  const policyUrlDef = getRegisteredSetting('project.privacy_policy_url');
  assert.ok(policyUrlDef, 'project.privacy_policy_url must be registered');
  assert.strictEqual(policyUrlDef.scope, 'PROJECT');
  assert.strictEqual(policyUrlDef.defaultValue, null, 'Default privacy policy URL must be null (no assumed page)');

  const retentionDef = getRegisteredSetting('project.data_retention_days');
  assert.ok(retentionDef, 'project.data_retention_days must be registered');
  assert.strictEqual(retentionDef.scope, 'PROJECT');
  assert.strictEqual(retentionDef.defaultValue, 365);

  const privacyContactDef = getRegisteredSetting('project.privacy_contact_email');
  assert.ok(privacyContactDef, 'project.privacy_contact_email must be registered');
  assert.strictEqual(privacyContactDef.scope, 'PROJECT');
  assert.strictEqual(privacyContactDef.defaultValue, null);

  // Confirm removed/renamed keys do NOT exist
  assert.strictEqual(
    getRegisteredSetting('project.dpo_contact_email'),
    undefined,
    'project.dpo_contact_email must not exist (renamed to generic privacy_contact_email)'
  );
  assert.strictEqual(
    getRegisteredSetting('project.tracking_mode'),
    undefined,
    'project.tracking_mode must not exist (no fake runtime consent enforcement)'
  );
});

test('Privacy Baseline - project.privacy_policy_url Validation', () => {
  const def = getRegisteredSetting('project.privacy_policy_url')!;

  // Valid paths and URLs
  assert.deepStrictEqual(def.validate('/privacy'), { valid: true, sanitized: '/privacy' });
  assert.deepStrictEqual(def.validate('/zasady-ochrany-osobnich-udaju'), {
    valid: true,
    sanitized: '/zasady-ochrany-osobnich-udaju',
  });
  assert.deepStrictEqual(def.validate('https://example.com/privacy'), {
    valid: true,
    sanitized: 'https://example.com/privacy',
  });
  assert.deepStrictEqual(def.validate(null), { valid: true, sanitized: null });
  assert.deepStrictEqual(def.validate(''), { valid: true, sanitized: null });

  // Invalid formats
  assert.strictEqual(def.validate('javascript:alert(1)').valid, false);
  assert.strictEqual(def.validate('/privacy<script>').valid, false);
  assert.strictEqual(def.validate('ftp://example.com').valid, false);
  assert.strictEqual(def.validate(12345).valid, false);
});

test('Privacy Baseline - project.data_retention_days Validation', () => {
  const def = getRegisteredSetting('project.data_retention_days')!;

  assert.deepStrictEqual(def.validate(365), { valid: true, sanitized: 365 });
  assert.deepStrictEqual(def.validate('180'), { valid: true, sanitized: 180 });
  assert.deepStrictEqual(def.validate(30), { valid: true, sanitized: 30 });
  assert.deepStrictEqual(def.validate(3650), { valid: true, sanitized: 3650 });

  // Out of range or invalid
  assert.strictEqual(def.validate(29).valid, false);
  assert.strictEqual(def.validate(3651).valid, false);
  assert.strictEqual(def.validate(-5).valid, false);
  assert.strictEqual(def.validate('invalid').valid, false);
  assert.strictEqual(def.validate(null).valid, false);
});

test('Privacy Baseline - project.privacy_contact_email Validation', () => {
  const def = getRegisteredSetting('project.privacy_contact_email')!;

  assert.deepStrictEqual(def.validate('privacy@example.com'), { valid: true, sanitized: 'privacy@example.com' });
  assert.deepStrictEqual(def.validate(' Privacy@Example.COM '), { valid: true, sanitized: 'privacy@example.com' });
  assert.deepStrictEqual(def.validate(null), { valid: true, sanitized: null });
  assert.deepStrictEqual(def.validate(''), { valid: true, sanitized: null });

  assert.strictEqual(def.validate('not-an-email').valid, false);
  assert.strictEqual(def.validate(123).valid, false);
});

test('Privacy Baseline - Security Keyword and Scope Isolation', () => {
  // Confirm 'cookie' keyword is still strictly forbidden
  assert.strictEqual(isSecurityPolicyOrSecretKey('cookie'), true);
  assert.strictEqual(isSecurityPolicyOrSecretKey('project.cookie_banner'), true);

  // Confirm privacy keys are not forbidden
  assert.strictEqual(isSecurityPolicyOrSecretKey('project.privacy_policy_url'), false);
  assert.strictEqual(isSecurityPolicyOrSecretKey('project.data_retention_days'), false);
  assert.strictEqual(isSecurityPolicyOrSecretKey('project.privacy_contact_email'), false);

  // Validate payload through validateSettingsPayload
  const payload = {
    'project.privacy_policy_url': '/gdpr-zasady',
    'project.data_retention_days': 180,
    'project.privacy_contact_email': 'soukromi@firma.cz',
  };

  const validated = validateSettingsPayload('PROJECT', payload);
  assert.strictEqual(validated.sanitizedSettings['project.privacy_policy_url'], '/gdpr-zasady');
  assert.strictEqual(validated.sanitizedSettings['project.data_retention_days'], 180);
  assert.strictEqual(validated.sanitizedSettings['project.privacy_contact_email'], 'soukromi@firma.cz');

  // Attempting to save under SYSTEM scope must fail
  assert.throws(() => {
    validateSettingsPayload('SYSTEM', payload);
  }, SettingsValidationError);

  // Attempting to save forbidden cookie keys must fail
  assert.throws(() => {
    validateSettingsPayload('PROJECT', { 'project.cookie_banner': true });
  }, SettingsValidationError);

  // Attempting to save removed fake tracking_mode must fail
  assert.throws(() => {
    validateSettingsPayload('PROJECT', { 'project.tracking_mode': 'DISABLED' });
  }, SettingsValidationError);

  // Attempting to save removed dpo_contact_email must fail
  assert.throws(() => {
    validateSettingsPayload('PROJECT', { 'project.dpo_contact_email': 'dpo@test.cz' });
  }, SettingsValidationError);
});

test('Privacy Baseline - Navigation Capability Status is FUNKČNÍ', () => {
  const securityGroup = ADMIN_NAV_GROUPS.find((g) => g.id === 'BEZPEČNOST');
  assert.ok(securityGroup, 'BEZPEČNOST nav group must exist');

  const privacyItem = securityGroup.items.find((item) => item.id === 'privacy');
  assert.ok(privacyItem, 'Privacy item must exist in BEZPEČNOST nav group');
  assert.strictEqual(privacyItem.status, 'FUNKČNÍ', 'Privacy capability status must be FUNKČNÍ');
  assert.strictEqual(privacyItem.href, '/admin/privacy');
});
