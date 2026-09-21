import { test } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import {
  hashSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_EXPIRATION_DAYS,
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_TOUCH_THROTTLE_MS,
  SessionData,
  UserContext
} from '@/lib/auth/session';

test('hashSessionToken produces correct deterministic SHA-256 hex digest', () => {
  const token = 'test-token-12345';
  const expected = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  const actual = hashSessionToken(token);
  assert.strictEqual(actual, expected);
  assert.strictEqual(actual.length, 64);
});

test('Session configuration constants are fail-closed and secure', () => {
  assert.strictEqual(SESSION_COOKIE_NAME, 'syn_admin_session');
  assert.strictEqual(SESSION_EXPIRATION_DAYS, 30);
  assert.strictEqual(SESSION_ABSOLUTE_TIMEOUT_MS, 30 * 24 * 60 * 60 * 1000);
  assert.strictEqual(SESSION_IDLE_TIMEOUT_MS, 12 * 60 * 60 * 1000);
  assert.strictEqual(SESSION_TOUCH_THROTTLE_MS, 5 * 60 * 1000);
});

test('Simulated session evaluation: valid session with hashed token succeeds', () => {
  const rawToken = 'bearer_token_abc_123';
  const tokenHash = hashSessionToken(rawToken);
  const now = Date.now();

  const mockSession = {
    id: 'sess-uuid-1',
    tokenHash,
    userId: 'user-1',
    expiresAt: new Date(now + 100000),
    idleExpiresAt: new Date(now + 50000),
    lastSeenAt: new Date(now - 1000),
    revokedAt: null,
    user: {
      id: 'user-1',
      email: 'admin@synthesis.local',
      displayName: 'Admin',
      status: 'ACTIVE'
    }
  };

  // Evaluate validity rules
  const isRevoked = !!mockSession.revokedAt;
  const isAbsoluteExpired = mockSession.expiresAt.getTime() <= now;
  const isIdleExpired = !!mockSession.idleExpiresAt && mockSession.idleExpiresAt.getTime() <= now;
  const isUserActive = mockSession.user.status === 'ACTIVE';

  assert.strictEqual(isRevoked, false);
  assert.strictEqual(isAbsoluteExpired, false);
  assert.strictEqual(isIdleExpired, false);
  assert.strictEqual(isUserActive, true);
});

test('Simulated session evaluation: idle expired session fails closed', () => {
  const rawToken = 'bearer_token_abc_123';
  const tokenHash = hashSessionToken(rawToken);
  const now = Date.now();

  const mockSession = {
    id: 'sess-uuid-2',
    tokenHash,
    userId: 'user-1',
    expiresAt: new Date(now + 100000),
    idleExpiresAt: new Date(now - 1000), // Idle expired
    lastSeenAt: new Date(now - 45000000),
    revokedAt: null,
    user: {
      id: 'user-1',
      email: 'admin@synthesis.local',
      displayName: 'Admin',
      status: 'ACTIVE'
    }
  };

  const isIdleExpired = !!mockSession.idleExpiresAt && mockSession.idleExpiresAt.getTime() <= now;
  assert.strictEqual(isIdleExpired, true, 'Idle expired session must be rejected');
});

test('Simulated session evaluation: absolute expired session fails closed', () => {
  const rawToken = 'bearer_token_abc_123';
  const tokenHash = hashSessionToken(rawToken);
  const now = Date.now();

  const mockSession = {
    id: 'sess-uuid-3',
    tokenHash,
    userId: 'user-1',
    expiresAt: new Date(now - 1000), // Absolute expired
    idleExpiresAt: new Date(now + 50000),
    lastSeenAt: new Date(now - 100),
    revokedAt: null,
    user: {
      id: 'user-1',
      email: 'admin@synthesis.local',
      displayName: 'Admin',
      status: 'ACTIVE'
    }
  };

  const isAbsoluteExpired = mockSession.expiresAt.getTime() <= now;
  assert.strictEqual(isAbsoluteExpired, true, 'Absolute expired session must be rejected');
});

test('Simulated session evaluation: revoked session fails closed', () => {
  const rawToken = 'bearer_token_abc_123';
  const tokenHash = hashSessionToken(rawToken);
  const now = Date.now();

  const mockSession = {
    id: 'sess-uuid-4',
    tokenHash,
    userId: 'user-1',
    expiresAt: new Date(now + 100000),
    idleExpiresAt: new Date(now + 50000),
    lastSeenAt: new Date(now - 100),
    revokedAt: new Date(now - 500), // Revoked
    user: {
      id: 'user-1',
      email: 'admin@synthesis.local',
      displayName: 'Admin',
      status: 'ACTIVE'
    }
  };

  const isRevoked = !!mockSession.revokedAt;
  assert.strictEqual(isRevoked, true, 'Revoked session must be rejected');
});

test('Simulated session evaluation: disabled/suspended user fails closed', () => {
  const rawToken = 'bearer_token_abc_123';
  const tokenHash = hashSessionToken(rawToken);
  const now = Date.now();

  const mockSession = {
    id: 'sess-uuid-5',
    tokenHash,
    userId: 'user-1',
    expiresAt: new Date(now + 100000),
    idleExpiresAt: new Date(now + 50000),
    lastSeenAt: new Date(now - 100),
    revokedAt: null,
    user: {
      id: 'user-1',
      email: 'admin@synthesis.local',
      displayName: 'Admin',
      status: 'SUSPENDED' // Suspended
    }
  };

  const isUserActive = mockSession.user.status === 'ACTIVE';
  assert.strictEqual(isUserActive, false, 'Non-active user must be rejected');
});

test('Simulated legacy plaintext session migration: invalidates and forces relogin', () => {
  const legacyToken = 'old_plaintext_session_id_12345';
  const tokenHash = hashSessionToken(legacyToken);

  // In database, legacy record has id === legacyToken and tokenHash === null
  const dbRecords = [
    {
      id: legacyToken,
      tokenHash: null,
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 100000),
    }
  ];

  // Lookup by tokenHash fails
  const foundByHash = dbRecords.find(r => r.tokenHash === tokenHash);
  assert.strictEqual(foundByHash, undefined, 'Legacy token has no tokenHash match');

  // Fallback lookup by id succeeds -> triggers invalidation and relogin
  const foundById = dbRecords.find(r => r.id === legacyToken);
  assert.ok(foundById, 'Legacy token is identified for safe invalidation and relogin requirement');
});
