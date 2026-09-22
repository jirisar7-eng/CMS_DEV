'use client';

import { useActionState } from "react";
import { verifyMfaAction } from "@/app/(auth)/admin/login/mfa/actions";

export function MfaLoginForm() {
  const [state, action, pending] = useActionState(verifyMfaAction, { error: null });
  return (
    <form action={action} className="space-y-6">
      {state.error && <p role="alert" className="text-[var(--state-danger)] text-sm">{state.error}</p>}
      <div>
        <label htmlFor="mfa-code" className="block text-sm font-medium">Ověřovací nebo záložní kód</label>
        <input id="mfa-code" name="code" type="text" autoComplete="one-time-code"
          required maxLength={23} spellCheck={false} autoCapitalize="characters"
          className="mt-1 block w-full px-3 py-2 border border-border rounded-lg bg-background min-h-[44px] focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>
      <button type="submit" disabled={pending}
        className="w-full py-2 px-4 rounded-lg text-primary-foreground bg-primary min-h-[44px] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring">
        {pending ? "Ověřování…" : "Ověřit a přihlásit se"}
      </button>
    </form>
  );
}
