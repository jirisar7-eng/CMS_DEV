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
        <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm">
          {state.error}
        </div>
      )}

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-[var(--color-text-primary)]"
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
            className="appearance-none block w-full px-3 py-2 border border-[var(--color-border)] rounded-md shadow-sm placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] sm:text-sm bg-transparent text-[var(--color-text-primary)]"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-[var(--color-text-primary)]"
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
            className="appearance-none block w-full px-3 py-2 border border-[var(--color-border)] rounded-md shadow-sm placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] sm:text-sm bg-transparent text-[var(--color-text-primary)]"
          />
        </div>
      </div>

      <div>
        <button
          type="submit"
          disabled={isPending}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[var(--color-primary)] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-primary)] disabled:opacity-50"
        >
          {isPending ? 'Přihlašování...' : 'Přihlásit se'}
        </button>
      </div>
    </form>
  );
}
