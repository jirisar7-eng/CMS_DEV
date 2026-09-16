'use client';

import { useActionState } from 'react';
import { loginAction } from '@/app/admin/login/actions';

const initialState = {
  error: null as string | null,
};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div role="alert" className="bg-[var(--state-danger)]/10 text-[var(--state-danger)] border border-[var(--state-danger)]/20 p-3 rounded-md text-sm font-medium">
          {state.error}
        </div>
      )}

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-foreground"
        >
          E-mailová adresa
        </label>
        <div className="mt-1">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="appearance-none block w-full px-3 py-2 border border-border rounded-lg shadow-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent sm:text-sm bg-background text-foreground min-h-[44px]"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-foreground"
        >
          Heslo
        </label>
        <div className="mt-1">
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="appearance-none block w-full px-3 py-2 border border-border rounded-lg shadow-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent sm:text-sm bg-background text-foreground min-h-[44px]"
          />
        </div>
      </div>

      <div>
        <button
          type="submit"
          disabled={isPending}
          className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-primary-foreground bg-primary hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50 min-h-[44px] transition-colors transition-opacity"
        >
          {isPending ? 'Přihlašování...' : 'Přihlásit se'}
        </button>
      </div>
    </form>
  );
}
