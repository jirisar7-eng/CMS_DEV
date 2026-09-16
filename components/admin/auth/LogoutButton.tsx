'use client';

import { useActionState } from 'react';
import { logoutAction } from '@/app/(auth)/admin/login/actions';
import { LogOut } from 'lucide-react';

export function LogoutButton() {
  const [, formAction, isPending] = useActionState(logoutAction, null);

  return (
    <form action={formAction}>
      <button 
        type="submit"
        disabled={isPending}
        className="p-2 text-muted-foreground hover:text-red-500 rounded-lg hover:bg-muted transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
        aria-label="Odhlásit se"
        title="Odhlásit se"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </form>
  );
}
