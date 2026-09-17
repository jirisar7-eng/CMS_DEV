import 'server-only';
import { requireAuthenticatedUser as defaultRequireAuth } from '@/lib/auth/session';
import type { UserContext } from '@/lib/auth/session';

let authOverride: (() => Promise<UserContext>) | null = null;

export async function requireAuthenticatedUser(): Promise<UserContext> {
  if (authOverride) {
    return authOverride();
  }
  return defaultRequireAuth();
}

export function setAuthenticatedUserForTesting(
  user: UserContext | null | undefined
) {
  if (user === undefined) {
    authOverride = null;
  } else {
    authOverride = async () => {
      if (!user || user.status !== 'ACTIVE') {
        throw new Error('UNAUTHENTICATED');
      }
      return user;
    };
  }
}
