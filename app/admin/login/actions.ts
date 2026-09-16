'use server';

import { prisma } from '@/lib/db';
import { createSession, invalidateSession } from '@/lib/auth/session';
import { logAudit } from '@/lib/auth/audit';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isDatabaseConfigured } from '@/lib/runtime/database';

export async function loginAction(state: any, formData: FormData) {
  if (!isDatabaseConfigured()) {
    return { error: 'Administrace není v tomto prostředí dostupná.' };
  }

  const email = formData.get('email')?.toString().toLowerCase().trim();
  const password = formData.get('password')?.toString();

  if (!email || !password) {
    return { error: 'Zadejte e-mail a heslo.' };
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    // Avoid user enumeration
    await logAudit({
      action: 'AUTH_LOGIN_FAILURE',
      scopeType: 'SYSTEM',
      metadata: { email, reason: 'user_not_found' },
    });
    return { error: 'Neplatné přihlašovací údaje.' };
  }

  if (user.status !== 'ACTIVE') {
    await logAudit({
      action: 'AUTH_LOGIN_FAILURE',
      scopeType: 'SYSTEM',
      actorId: user.id,
      metadata: { reason: 'account_disabled', status: user.status },
    });
    return { error: 'Účet je deaktivován nebo pozastaven.' };
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);

  if (!isValidPassword) {
    await logAudit({
      action: 'AUTH_LOGIN_FAILURE',
      scopeType: 'SYSTEM',
      actorId: user.id,
      metadata: { reason: 'invalid_password' },
    });
    return { error: 'Neplatné přihlašovací údaje.' };
  }

  // Success
  const sessionId = await createSession(user.id);
  
  await logAudit({
    action: 'AUTH_LOGIN_SUCCESS',
    scopeType: 'SYSTEM',
    actorId: user.id,
  });

  redirect('/admin');
}

export async function logoutAction() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('syn_admin_session')?.value;

  if (sessionId) {
    if (isDatabaseConfigured()) {
      await logAudit({
        action: 'AUTH_LOGOUT',
        scopeType: 'SYSTEM',
      });
    }
    await invalidateSession(sessionId);
  }

  redirect('/admin/login');
}
