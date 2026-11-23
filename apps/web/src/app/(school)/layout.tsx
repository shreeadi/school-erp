'use client';

import { AppShell } from '@/components/shell/app-shell';
import { SessionProvider } from '@/components/shell/session';

export default function SchoolLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
