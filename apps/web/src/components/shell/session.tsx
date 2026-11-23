'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect } from 'react';
import { Loading } from '@/components/ui/feedback';
import { type Me, useApi } from '@/lib/api';

const SessionContext = createContext<Me | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data, error } = useApi<Me>('/auth/me');
  useEffect(() => { if (error?.status === 401) router.replace('/login'); }, [error, router]);
  if (!data) return <Loading label="Loading your workspace" />;
  return <SessionContext.Provider value={data}>{children}</SessionContext.Provider>;
}

export function useSession(): Me {
  const me = useContext(SessionContext);
  if (!me) throw new Error('useSession must be used inside SessionProvider');
  return me;
}

/** UI hint only. The API enforces every permission and record scope. */
export function can(me: Me, permission: string, scope?: string) {
  const s = me.permissions[permission];
  return Boolean(s && (scope ? s.includes(scope) : s.length));
}
