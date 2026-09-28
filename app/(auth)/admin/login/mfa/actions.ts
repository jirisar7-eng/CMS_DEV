'use server';

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { clearMfaChallengeCookie, getMfaChallengeCookieToken } from "@/lib/auth/mfa-challenge";
import { completeMfaLogin, MFA_LOGIN_ERROR } from "@/lib/auth/mfa-login";
import { setSessionCookie } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/runtime/database";

export async function verifyMfaAction(_state: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  try {
    if (!isDatabaseConfigured()) return { error: MFA_LOGIN_ERROR };
    let userAgent: string | null = null;
    try {
      const headerList = await headers();
      userAgent = headerList.get("user-agent");
    } catch {
      // Non-request context
    }
    const pending = await completeMfaLogin(await getMfaChallengeCookieToken(), formData.get("code"), userAgent);
    if (!pending) return { error: MFA_LOGIN_ERROR };
    await clearMfaChallengeCookie();
    await setSessionCookie(pending);
  } catch {
    return { error: MFA_LOGIN_ERROR };
  }
  redirect("/admin");
}
