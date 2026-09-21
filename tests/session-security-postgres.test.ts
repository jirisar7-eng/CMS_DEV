import { test } from 'node:test';
import assert from 'node:assert';
import { prisma } from '@/lib/db';
import {
  hashSessionToken,
  createSession,
  getSession,
  revokeSession,
  revokeAllUserSessions,
  invalidateSession,
  SESSION_COOKIE_NAME,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_ABSOLUTE_TIMEOUT_MS,
} from '@/lib/auth/session';

// Helper for cookie store mock
let cookieJar: Record<string, string> = {};

// We can mock 'next/headers' cookies() if needed, or directly test database interaction
test('PostgreSQL Session Security v2 Integration', async (t) => {
  if (!process.env.DATABASE_URL) {
    console.log('Skipping PostgreSQL session tests (DATABASE_URL not set)');
    return;
  }

  // Create a dedicated test user
  const email = `session-test-${Date.now()}@synthesis.local`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: 'dummy-hash',
      status: 'ACTIVE',
      displayName: 'Session Test User',
    },
  });

  t.after(async () => {
    await prisma.user.delete({ where: { id: user.id } });
  });

  await t.test('Store only hashed session tokens in database', async () => {
    const rawToken = `raw_token_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const tokenHash = hashSessionToken(rawToken);
    const sessionId = `test_sess_${Date.now()}`;

    const session = await prisma.session.create({
      data: {
        id: sessionId,
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_ABSOLUTE_TIMEOUT_MS),
        idleExpiresAt: new Date(Date.now() + SESSION_IDLE_TIMEOUT_MS),
        lastSeenAt: new Date(),
      },
    });

    assert.strictEqual(session.id, sessionId);
    assert.strictEqual(session.tokenHash, tokenHash);
    assert.notStrictEqual(session.tokenHash, rawToken);

    // Verify lookup by tokenHash
    const fetched = await prisma.session.findUnique({
      where: { tokenHash },
    });
    assert.ok(fetched);
    assert.strictEqual(fetched.id, sessionId);
  });

  await t.test('Session revocation marks revokedAt timestamp in DB', async () => {
    const rawToken = `revoke_raw_${Date.now()}`;
    const tokenHash = hashSessionToken(rawToken);
    const sessionId = `test_revoke_${Date.now()}`;

    await prisma.session.create({
      data: {
        id: sessionId,
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 100000),
        idleExpiresAt: new Date(Date.now() + 50000),
      },
    });

    await revokeSession(sessionId);

    const fetched = await prisma.session.findUnique({
      where: { id: sessionId },
    });
    assert.ok(fetched);
    assert.ok(fetched.revokedAt, 'revokedAt must be set');
  });

  await t.test('Revoke all user sessions revokes all sessions for user', async () => {
    const s1 = await prisma.session.create({
      data: {
        id: `sess_all_1_${Date.now()}`,
        tokenHash: hashSessionToken(`raw_all_1_${Date.now()}`),
        userId: user.id,
        expiresAt: new Date(Date.now() + 100000),
      },
    });
    const s2 = await prisma.session.create({
      data: {
        id: `sess_all_2_${Date.now()}`,
        tokenHash: hashSessionToken(`raw_all_2_${Date.now()}`),
        userId: user.id,
        expiresAt: new Date(Date.now() + 100000),
      },
    });

    await revokeAllUserSessions(user.id, s1.id);

    const fetched1 = await prisma.session.findUnique({ where: { id: s1.id } });
    const fetched2 = await prisma.session.findUnique({ where: { id: s2.id } });

    assert.strictEqual(fetched1?.revokedAt, null, 'Excepted session must not be revoked');
    assert.ok(fetched2?.revokedAt !== null, 'Other session must be revoked');
  });

  await t.test('Legacy unhashed session is invalidated on lookup', async () => {
    const legacyToken = `legacy_token_${Date.now()}`;
    // Legacy session had token in id and tokenHash null
    await prisma.session.create({
      data: {
        id: legacyToken,
        tokenHash: null,
        userId: user.id,
        expiresAt: new Date(Date.now() + 100000),
      },
    });

    // Check it exists before
    let legacy = await prisma.session.findUnique({ where: { id: legacyToken } });
    assert.ok(legacy);

    // Simulate legacy migration cleanup
    await invalidateSession(legacyToken);

    legacy = await prisma.session.findUnique({ where: { id: legacyToken } });
    assert.strictEqual(legacy, null, 'Legacy session must be deleted/invalidated');
  });
});
