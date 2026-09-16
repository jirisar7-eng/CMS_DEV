import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import crypto from 'crypto';
import { isDatabaseConfigured } from '@/lib/runtime/database';

const SESSION_COOKIE_NAME = 'syn_admin_session';
const SESSION_EXPIRATION_DAYS = 30;

export interface SessionData {
  id: string;
  userId: string;
  expiresAt: Date;
}

export interface UserContext {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
}

export async function createSession(userId: string): Promise<string> {
  if (!isDatabaseConfigured()) {
    throw new Error('DATABASE_UNAVAILABLE');
  }

  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });

  return sessionId;
}

export async function getSession(): Promise<{ session: SessionData | null; user: UserContext | null }> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    return { session: null, user: null };
  }

  if (!isDatabaseConfigured()) {
    return { session: null, user: null };
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
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

  if (!session) {
    return { session: null, user: null };
  }

  // Check expiration
  if (session.expiresAt.getTime() < Date.now()) {
    await invalidateSession(sessionId);
    return { session: null, user: null };
  }

  // Fail closed if user is not ACTIVE
  if (session.user.status !== 'ACTIVE') {
    await invalidateSession(sessionId);
    return { session: null, user: null };
  }

  // Auto-extend session if it's close to expiration (e.g., less than 15 days left)
  const fifteenDays = 15 * 24 * 60 * 60 * 1000;
  if (session.expiresAt.getTime() - Date.now() < fifteenDays) {
    const newExpiresAt = new Date(Date.now() + SESSION_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);
    await prisma.session.update({
      where: { id: sessionId },
      data: { expiresAt: newExpiresAt },
    });

    cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: newExpiresAt,
    });
  }

  return {
    session: { id: session.id, userId: session.userId, expiresAt: session.expiresAt },
    user: session.user,
  };
}

export async function invalidateSession(sessionId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);

  if (isDatabaseConfigured()) {
    await prisma.session.deleteMany({
      where: { id: sessionId },
    });
  }
}

export async function requireAuthenticatedUser(): Promise<UserContext> {
  const { user } = await getSession();

  if (!user || user.status !== 'ACTIVE') {
    throw new Error('UNAUTHENTICATED');
  }

  return user;
}
