'use client';

import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorNote } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/input';
import { api } from '@/lib/api';

export default function PlatformLogin() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api('/platform/auth/login', { method: 'POST', json: { email: f.get('email'), password: f.get('password') } });
      router.replace('/platform');
    } catch (err) { setError((err as Error).message); }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-foreground/[0.03] p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background"><ShieldCheck className="h-6 w-6" /></div>
          <CardTitle className="text-xl">Platform administration</CardTitle>
          <CardDescription>Super Admin access only. Separate from school accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email"><Input name="email" type="email" required autoComplete="username" /></Field>
            <Field label="Password"><Input name="password" type="password" required autoComplete="current-password" /></Field>
            <ErrorNote message={error} />
            <Button type="submit" className="w-full">Sign in</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
