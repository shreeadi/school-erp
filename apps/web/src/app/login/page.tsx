'use client';

import { GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorNote } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/input';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      await api('/auth/login', { method: 'POST', json: { schoolCode: f.get('schoolCode'), email: f.get('email'), password: f.get('password') } });
      router.replace('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary"><GraduationCap className="h-6 w-6" /></div>
          <CardTitle className="text-xl">Sign in to your school</CardTitle>
          <CardDescription>Students, parents, teachers and staff</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <Field label="School code"><Input name="schoolCode" required autoComplete="organization" placeholder="e.g. GREENWOOD" className="uppercase" /></Field>
            <Field label="Email"><Input name="email" type="email" required autoComplete="username" /></Field>
            <Field label="Password"><Input name="password" type="password" required autoComplete="current-password" /></Field>
            <ErrorNote message={error} />
            <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
          </form>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Platform operator? <Link href="/platform/login" className="text-primary underline-offset-4 hover:underline">Super Admin sign-in</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
