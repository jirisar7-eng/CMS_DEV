'use server';

import { redirect } from "next/navigation";
import { clearMfaChallengeCookie, getMfaChallengeCookieToken } from "@/lib/auth/mfa-challenge";
import { completeMfaLogin, MFA_LOGIN_ERROR } from "@/lib/auth/mfa-login";
import { setSessionCookie } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/runtime/database";

export async function verifyMfaAction(_state: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  try {
    if (!isDatabaseConfigured()) return { error: MFA_LOGIN_ERROR };
    const pending = await completeMfaLogin(await getMfaChallengeCookieToken(), formData.get("code"));
    if (!pending) return { error: MFA_LOGIN_ERROR };
    await clearMfaChallengeCookie();
    await setSessionCookie(pending);
  } catch {
    return { error: MFA_LOGIN_ERROR };
  }
  redirect("/admin");
}
