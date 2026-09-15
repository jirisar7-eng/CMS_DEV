import { LoginForm } from '@/components/admin/auth/LoginForm';
import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';

export default async function LoginPage() {
  const { user } = await getSession();

  if (user) {
    redirect('/admin');
  }

  return (
    <div className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-text-primary)] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-[var(--color-text-primary)]">
          Synthesis Admin
        </h2>
        <p className="mt-2 text-center text-sm text-[var(--color-text-muted)]">
          Přihlaste se ke správě systému
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-[var(--color-surface)] py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-[var(--color-border)]">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
