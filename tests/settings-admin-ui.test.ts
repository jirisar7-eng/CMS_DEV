import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getCapabilityStatus, getCapabilityById } from '../lib/navigation/adminNav';

test('SYN-SETTINGS-001: Settings capability truthfulness in admin navigation', () => {
  const capability = getCapabilityById('settings');
  assert.ok(capability, 'Settings capability must be registered');
  assert.equal(capability.status, 'FUNKČNÍ');
  assert.equal(capability.group, 'SYSTÉM');
  assert.equal(capability.href, '/admin/settings');
  assert.equal(getCapabilityStatus('settings'), 'FUNKČNÍ');
});

test('SYN-SETTINGS-001: Settings admin page wires SettingsWorkspace server-side', () => {
  const pagePath = path.resolve(__dirname, '../app/admin/settings/page.tsx');
  const pageCode = fs.readFileSync(pagePath, 'utf8');

  assert.match(pageCode, /SettingsWorkspace/);
  assert.match(pageCode, /getActiveProjectId/);
  assert.doesNotMatch(pageCode, /handleUnfinishedAction/);
  assert.doesNotMatch(pageCode, /Režim plánované údržby/);
});

test('SYN-SETTINGS-001: SettingsWorkspace implements real persistence and cleanup', () => {
  const workspacePath = path.resolve(__dirname, '../components/admin/settings/SettingsWorkspace.tsx');
  const workspaceCode = fs.readFileSync(workspacePath, 'utf8');

  // Status must be FUNKČNÍ
  assert.match(workspaceCode, /status="FUNKČNÍ"/);

  // Real APIs
  assert.match(workspaceCode, /\/api\/admin\/settings/);
  assert.match(workspaceCode, /\/api\/admin\/projects\/.*\/?settings/);

  // System keys
  assert.match(workspaceCode, /system\.instance_name/);
  assert.match(workspaceCode, /system\.default_locale/);
  assert.match(workspaceCode, /system\.default_timezone/);

  // Project keys
  assert.match(workspaceCode, /project\.public_url/);
  assert.match(workspaceCode, /project\.default_locale/);
  assert.match(workspaceCode, /project\.default_timezone/);
  assert.match(workspaceCode, /project\.date_format/);
  assert.match(workspaceCode, /project\.contact_email/);

  // Excluded sensitive settings
  assert.doesNotMatch(workspaceCode, /maintenance_mode/i);
  assert.doesNotMatch(workspaceCode, /auth\.mfa/i);
  assert.doesNotMatch(workspaceCode, /session\.ttl/i);
  assert.doesNotMatch(workspaceCode, /password/i);

  // React cleanup hygiene
  assert.match(workspaceCode, /isMounted/);
  assert.match(workspaceCode, /controller\.abort\(\)/);
});
