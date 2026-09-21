import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import crypto from 'crypto';
import { isDatabaseConfigured } from '@/lib/runtime/database';

export const SESSION_COOKIE_NAME = 'syn_admin_session';

// Absolute session lifetime: 30 days
export const SESSION_EXPIRATION_DAYS = 30;
export const SESSION_ABSOLUTE_TIMEOUT_MS = SESSION_EXPIRATION_DAYS * 24 * 60 * 60 * 1000;

// Idle session lifetime: 12 hours of inactivity
export const SESSION_IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000;

// Throttle lastSeenAt / sliding expiration updates: 5 minutes
export const SESSION_TOUCH_THROTTLE_MS = 5 * 60 * 1000;

export interface SessionData {
  id: string;
  userId: string;
  expiresAt: Date;
  idleExpiresAt?: Date | null;
  lastSeenAt?: Date;
  revokedAt?: Date | null;
}

export interface UserContext {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
}

/**
 * Safely access cookies() if request context is available.
 */
async function getSafeCookieStore() {
  try {
    return await cookies();
  } catch {
    return null;
  }
}

/**
 * Computes deterministic SHA-256 hash of a raw session token.
 * Only this hash is stored in the database.
 */
export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

/**
 * Creates a new secure session:
 * - Generates high-entropy raw bearer token
 * - Stores ONLY sha256(token) in the database
 * - Sets idleExpiresAt and absolute expiresAt
 * - Sets lastSeenAt to current timestamp
 * - Issues raw token exclusively into HttpOnly secure cookie
 * - Never returns raw token in plaintext to caller (returns opaque session ID)
 */
export async function createSession(userId: string): Promise<string> {
  if (!isDatabaseConfigured()) {
    throw new Error('DATABASE_UNAVAILABLE');
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const sessionId = crypto.randomUUID();

  const now = Date.now();
  const expiresAt = new Date(now + SESSION_ABSOLUTE_TIMEOUT_MS);
  const idleExpiresAt = new Date(now + SESSION_IDLE_TIMEOUT_MS);
  const lastSeenAt = new Date(now);

  await prisma.session.create({
    data: {
      id: sessionId,
      tokenHash,
      userId,
      expiresAt,
      idleExpiresAt,
      lastSeenAt,
    },
  });

  const cookieStore = await getSafeCookieStore();
  if (cookieStore) {
    cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });
  }

  // Return opaque sessionId, NEVER the raw bearer token
  return sessionId;
}

/**
 * Resolves current session and authenticated user:
 * - Validates cookie presence
 * - Supports hashed token lookup
 * - Gracefully handles legacy plaintext sessions by requiring relogin
 * - Enforces absolute expiration
 * - Enforces idle expiration
 * - Enforces session revocation
 * - Enforces user status (ACTIVE only)
 * - Throttles sliding idle touch (lastSeenAt) to avoid excessive database writes
 */
export async function getSession(): Promise<{ session: SessionData | null; user: UserContext | null }> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!rawToken) {
    return { session: null, user: null };
  }

  if (!isDatabaseConfigured()) {
    return { session: null, user: null };
  }

  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();
  const nowMs = now.getTime();

  // Primary lookup: by tokenHash
  let sessionRecord = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          status: true,
        },
      },
    },
  });

  // Backward compatibility / migration check:
  // If not found by tokenHash, check if the raw token matches an old unhashed session ID.
  // For security, old plaintext sessions are safely invalidated and require re-login.
  if (!sessionRecord) {
    const legacySession = await prisma.session.findUnique({
      where: { id: rawToken },
      select: { id: true },
    });

    if (legacySession) {
      // Invalidate legacy unhashed session and clear cookie to force fresh secure login
      await invalidateSession(legacySession.id);
    }
    return { session: null, user: null };
  }

  const session = sessionRecord;

  // 1. Check early revocation
  if (session.revokedAt) {
    await invalidateSession(session.id);
    return { session: null, user: null };
  }

  // 2. Check absolute expiration
  if (session.expiresAt.getTime() <= nowMs) {
    await invalidateSession(session.id);
    return { session: null, user: null };
  }

  // 3. Check idle expiration (if set)
  if (session.idleExpiresAt && session.idleExpiresAt.getTime() <= nowMs) {
    await invalidateSession(session.id);
    return { session: null, user: null };
  }

  // 4. Fail closed if user is not ACTIVE
  if (session.user.status !== 'ACTIVE') {
    await invalidateSession(session.id);
    return { session: null, user: null };
  }

  // 5. Sliding idle touch (throttled):
  // If more than SESSION_TOUCH_THROTTLE_MS has passed since lastSeenAt, update lastSeenAt & idleExpiresAt
  const lastSeenMs = session.lastSeenAt ? session.lastSeenAt.getTime() : 0;
  if (nowMs - lastSeenMs >= SESSION_TOUCH_THROTTLE_MS) {
    const newIdleExpiresAt = new Date(Math.min(nowMs + SESSION_IDLE_TIMEOUT_MS, session.expiresAt.getTime()));
    await prisma.session.update({
      where: { id: session.id },
      data: {
        lastSeenAt: now,
        idleExpiresAt: newIdleExpiresAt,
      },
    });
  }

  return {
    session: {
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
      idleExpiresAt: session.idleExpiresAt,
      lastSeenAt: session.lastSeenAt,
      revokedAt: session.revokedAt,
    },
    user: session.user,
  };
}

/**
 * Revokes an existing session by marking revokedAt timestamp in DB and deleting cookie if current.
 */
export async function revokeSession(sessionId: string): Promise<void> {
  let cookieStore = null;
  try {
    cookieStore = await cookies();
  } catch {
    // Non-request scope
  }
  const currentToken = cookieStore?.get(SESSION_COOKIE_NAME)?.value;

  if (isDatabaseConfigured()) {
    const now = new Date();
    await prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  // If this was the current session in the cookie, delete cookie
  if (currentToken && cookieStore) {
    const currentHash = hashSessionToken(currentToken);
    const session = isDatabaseConfigured()
      ? await prisma.session.findUnique({ where: { id: sessionId }, select: { tokenHash: true } })
      : null;
    if (session?.tokenHash === currentHash || sessionId === currentToken) {
      cookieStore.delete(SESSION_COOKIE_NAME);
    }
  }
}

/**
 * Revokes all sessions belonging to a specific user (e.g. on password reset, role change, or compromise).
 */
export async function revokeAllUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
  if (!isDatabaseConfigured()) {
    return;
  }

  const now = new Date();
  await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: now },
  });
}

/**
 * Completely invalidates / deletes a session by ID and clears session cookie.
 */
export async function invalidateSession(sessionId: string): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch {
    // Non-request scope (e.g. CLI or background test)
  }

  if (isDatabaseConfigured()) {
    await prisma.session.deleteMany({
      where: { id: sessionId },
    });
  }
}

/**
 * Fail-closed authentication assertion for server components / routes.
 */
export async function requireAuthenticatedUser(): Promise<UserContext> {
  const { user } = await getSession();
  if (!user || user.status !== 'ACTIVE') {
    throw new Error('UNAUTHENTICATED');
  }
  return user;
}
