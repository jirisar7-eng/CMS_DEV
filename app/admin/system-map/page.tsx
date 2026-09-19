import React from 'react';
import { getSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import {
  resolveBasicSystemMap,
  resolveInternalSystemMap,
} from '@/lib/domain/system-map/resolver';
import { SystemMapWorkspace } from '@/components/admin/system-map/SystemMapWorkspace';
import { Lock } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SystemMapPage() {
  const { user } = await getSession();

  if (!user || user.status !== 'ACTIVE') {
    return (
      <div className="p-8 text-center max-w-md mx-auto my-12 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl shadow-sm space-y-3">
        <Lock className="w-8 h-8 text-red-500 mx-auto" />
        <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
          Přístup odepřen
        </h2>
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Pro zobrazení mapy systému musíte být přihlášeni do administrace.
        </p>
      </div>
    );
  }

  const canReadInternal = await hasPermission(user.id, 'system_map.read_internal');
  const canReadBasic = canReadInternal || (await hasPermission(user.id, 'system_map.read_basic'));

  if (!canReadBasic) {
    return (
      <div className="p-8 text-center max-w-md mx-auto my-12 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl shadow-sm space-y-3">
        <Lock className="w-8 h-8 text-red-500 mx-auto" />
        <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
          Nedostatečná oprávnění
        </h2>
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Nemáte potřebná oprávnění (system_map.read_basic ani system_map.read_internal) pro přístup k mapě systému.
        </p>
      </div>
    );
  }

  if (canReadInternal) {
    const data = resolveInternalSystemMap();
    return <SystemMapWorkspace data={data} accessLevel="internal" />;
  }

  const data = resolveBasicSystemMap();
  return <SystemMapWorkspace data={data} accessLevel="basic" />;
}
