'use server';

import { prisma } from "@/lib/db";
import { createSession, invalidateSession } from "@/lib/auth/session";
import { logAudit } from "@/lib/auth/audit";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isDatabaseConfigured } from "@/lib/runtime/database";
import {
  computePrivacyIdentifier,
  checkLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
  UNIFORM_LOGIN_ERROR,
  RATE_LIMIT_ERROR,
  STORAGE_ERROR_LOGIN_MESSAGE,
  DUMMY_BCRYPT_HASH,
} from "@/lib/auth/abuse-protection";

async function getClientIp(): Promise<string> {
  try {
    const headerList = await headers();
    const forwardedFor = headerList.get("x-forwarded-for");
    if (forwardedFor) {
      return forwardedFor.split(",")[0].trim();
    }
    const realIp = headerList.get("x-real-ip");
    if (realIp) {
      return realIp.trim();
    }
    return "127.0.0.1";
  } catch {
    return "127.0.0.1";
  }
}

export async function loginAction(state: any, formData: FormData) {
  if (!isDatabaseConfigured()) {
    return { error: "Administrace není v tomto prostředí dostupná." };
  }

  const email = formData.get("email")?.toString().toLowerCase().trim();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return { error: "Zadejte e-mail a heslo." };
  }

  const clientIp = await getClientIp();
  const accountHash = computePrivacyIdentifier("account", email);
  const ipHash = computePrivacyIdentifier("ip", clientIp);

  // 1. Abuse & Rate Limiting Check (Fail-Closed)
  try {
    const abuseCheck = await checkLoginAllowed({ accountHash, ipHash });
    if (!abuseCheck.allowed) {
      await logAudit({
        action: "AUTH_LOGIN_FAILURE",
        scopeType: "SYSTEM",
        metadata: {
          identifierHash: accountHash,
          clientIpHash: ipHash,
          reason: "rate_limited",
        },
      });
      return { error: RATE_LIMIT_ERROR };
    }
  } catch (limiterErr) {
    console.error("[LoginAction] Rate limiter check error (failing closed):", limiterErr);
    return { error: STORAGE_ERROR_LOGIN_MESSAGE };
  }

  // 2. User Lookup & Uniform Error Handling
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    // Timing attack mitigation: compare against precomputed cost-10 bcrypt hash
    await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
    try {
      await recordLoginFailure({ accountHash, ipHash });
    } catch (recordErr) {
      console.error("[LoginAction] Error recording login failure:", recordErr);
    }
    await logAudit({
      action: "AUTH_LOGIN_FAILURE",
      scopeType: "SYSTEM",
      metadata: {
        identifierHash: accountHash,
        clientIpHash: ipHash,
        reason: "invalid_credentials",
      },
    });
    return { error: UNIFORM_LOGIN_ERROR };
  }

  if (user.status !== "ACTIVE") {
    // Timing attack mitigation: run real bcrypt compare to match duration
    await bcrypt.compare(password, user.passwordHash);
    try {
      await recordLoginFailure({ accountHash, ipHash });
    } catch (recordErr) {
      console.error("[LoginAction] Error recording login failure:", recordErr);
    }
    await logAudit({
      action: "AUTH_LOGIN_FAILURE",
      scopeType: "SYSTEM",
      actorId: user.id,
      metadata: {
        identifierHash: accountHash,
        clientIpHash: ipHash,
        reason: "invalid_credentials",
      },
    });
    // Return identical error to prevent account enumeration
    return { error: UNIFORM_LOGIN_ERROR };
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    try {
      await recordLoginFailure({ accountHash, ipHash });
    } catch (recordErr) {
      console.error("[LoginAction] Error recording login failure:", recordErr);
    }
    await logAudit({
      action: "AUTH_LOGIN_FAILURE",
      scopeType: "SYSTEM",
      actorId: user.id,
      metadata: {
        identifierHash: accountHash,
        clientIpHash: ipHash,
        reason: "invalid_credentials",
      },
    });
    return { error: UNIFORM_LOGIN_ERROR };
  }

  // 3. Success: Reset rate limiter and establish session
  try {
    await recordLoginSuccess({ accountHash, ipHash });
  } catch (resetErr) {
    console.warn("[LoginAction] Non-fatal error resetting limiter on success:", resetErr);
  }

  const sessionId = await createSession(user.id);
  
  await logAudit({
    action: "AUTH_LOGIN_SUCCESS",
    scopeType: "SYSTEM",
    actorId: user.id,
  });

  redirect("/admin");
}

export async function logoutAction() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("syn_admin_session")?.value;

  if (sessionId) {
    if (isDatabaseConfigured()) {
      await logAudit({
        action: "AUTH_LOGOUT",
        scopeType: "SYSTEM",
      });
    }
    await invalidateSession(sessionId);
  }

  redirect("/admin/login");
}
