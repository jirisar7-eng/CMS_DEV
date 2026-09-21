import React from 'react';
import { LoginForm } from '@/components/admin/auth/LoginForm';
import { getSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import { redirect } from 'next/navigation';
import { isDatabaseConfigured } from '@/lib/runtime/database';
import { SynthesisLogo } from '@/components/brand/SynthesisLogo';

export default async function LoginPage() {
  if (!isDatabaseConfigured()) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col justify-center px-4 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
          <SynthesisLogo variant="primary" decorative={false} />
          <h2 className="mt-6 text-center text-2xl font-extrabold text-foreground">
            Administrace
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Administrace není v tomto prostředí dostupná.
          </p>
        </div>
        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-card p-5 sm:p-6 shadow-sm rounded-xl border border-border text-center text-sm text-muted-foreground">
            Databázové prostředí není nakonfigurováno.
          </div>
        </div>
      </div>
    );
  }

  const { user } = await getSession();
  if (user) {
    const isAuthorized = await hasPermission(user.id, 'admin.access').catch(() => false);
    if (isAuthorized) {
      redirect('/admin');
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-center px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
        <SynthesisLogo variant="primary" decorative={false} />
        <h2 className="mt-6 text-center text-2xl font-extrabold text-foreground">
          Administrace
        </h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Přihlaste se ke správě systému
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-card p-5 sm:p-6 shadow-sm rounded-xl border border-border">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
