'use client';

import { BookOpen, GraduationCap, LayoutDashboard, LogOut, Menu, ShieldCheck, Users, UserSquare2, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { cn, titleCase } from '@/lib/utils';
import { can, useSession } from './session';

export function AppShell({ children }: { children: React.ReactNode }) {
  const me = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const nav = [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, show: true },
    { href: '/students', label: me.user.userType === 'GUARDIAN' ? 'My children' : me.user.userType === 'STUDENT' ? 'My profile' : 'Students', icon: GraduationCap, show: can(me, 'students:read') },
    { href: '/staff', label: 'Staff', icon: UserSquare2, show: can(me, 'staff:read') && me.user.userType === 'STAFF' },
    { href: '/academics', label: 'Academic setup', icon: BookOpen, show: can(me, 'academics:read') && me.user.userType === 'STAFF' },
    { href: '/roles', label: 'Roles & access', icon: ShieldCheck, show: can(me, 'roles:read') },
  ].filter((n) => n.show);

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
  }

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3">
      <div className="mb-4 px-2 py-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{me.school.board === 'STATE_BOARD' ? me.school.boardName ?? 'State Board' : me.school.board}</div>
        <div className="font-semibold leading-tight">{me.school.name}</div>
      </div>
      {nav.map((n) => (
        <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
          className={cn('flex items-center gap-2.5 rounded-md px-3 py-2 text-sm', pathname.startsWith(n.href) ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted')}>
          <n.icon className="h-4 w-4" />{n.label}
        </Link>
      ))}
      <div className="mt-auto border-t border-border pt-3">
        <div className="px-3 pb-2 text-sm">
          <div className="font-medium">{me.user.fullName}</div>
          <div className="truncate text-xs text-muted-foreground">{me.roles.map(titleCase).join(', ') || titleCase(me.user.userType)}</div>
        </div>
        <button onClick={logout} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-muted"><LogOut className="h-4 w-4" />Sign out</button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card md:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-card shadow-xl">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 md:hidden">
          <button aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          <span className="font-semibold">{me.school.name}</span>
          <Users className="ml-auto h-4 w-4 text-muted-foreground" />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
