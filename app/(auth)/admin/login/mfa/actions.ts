'use server';

import { redirect } from "next/navigation";
import { clearMfaChallengeCookie, getMfaChallengeCookieToken } from "@/lib/auth/mfa-challenge";
import { MFA_LOGIN_ERROR, verifyMfaLogin } from "@/lib/auth/mfa-login";
import { createSession } from "@/lib/auth/session";
import { logAudit } from "@/lib/auth/audit";
import { isDatabaseConfigured } from "@/lib/runtime/database";

export async function verifyMfaAction(_state: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  try {
    if (!isDatabaseConfigured()) return { error: MFA_LOGIN_ERROR };
    const userId = await verifyMfaLogin(await getMfaChallengeCookieToken(), formData.get("code"));
    if (!userId) return { error: MFA_LOGIN_ERROR };
    await clearMfaChallengeCookie();
    await logAudit({ action: "AUTH_LOGIN_SUCCESS", scopeType: "SYSTEM", actorId: userId,
      resourceType: "UserMfa" });
    await createSession(userId);
  } catch {
    return { error: MFA_LOGIN_ERROR };
  }
  redirect("/admin");
}
