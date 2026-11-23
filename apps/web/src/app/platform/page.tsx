'use client';

import { LogOut, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorNote, Loading, PageHeader } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/input';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api, useApi } from '@/lib/api';
import { formatDate, titleCase } from '@/lib/utils';

interface School {
  id: string; code: string; name: string; board: string; boardName: string | null; city: string | null; state: string | null; status: string; createdAt: string;
  stats: { students: number; staff: number; guardians: number; sections: number };
}

function NewSchool({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{ code: string; email: string; temporaryPassword?: string }>();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      const r = await api<{ school: { code: string }; admin: { email: string; temporaryPassword?: string } }>('/platform/schools', {
        method: 'POST',
        json: { code: f.code, name: f.name, board: f.board, boardName: f.boardName || undefined, city: f.city || undefined, state: f.state || undefined, admin: { fullName: f.adminName, email: f.adminEmail } },
      });
      setResult({ code: r.school.code, email: r.admin.email, temporaryPassword: r.admin.temporaryPassword });
      onDone();
    } catch (err) { setError((err as Error).message); }
  }
  if (result) return <p className="text-sm">School <strong>{result.code}</strong> is ready. Its School Admin <strong>{result.email}</strong> can sign in with the one-time password <code className="rounded bg-muted px-1.5 py-0.5">{result.temporaryPassword}</code>.</p>;
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
      <Field label="School code" hint="3-16 letters or digits, used at sign-in"><Input name="code" required pattern="[A-Za-z0-9]{3,16}" className="uppercase" /></Field>
      <Field label="School name"><Input name="name" required /></Field>
      <Field label="Board" hint="Applies a starting grading template, editable later">
        <Select name="board" defaultValue="CBSE">{['CBSE', 'ICSE', 'STATE_BOARD', 'IB', 'CAMBRIDGE', 'CUSTOM'].map((b) => <option key={b} value={b}>{b === 'STATE_BOARD' ? 'State Board' : titleCase(b).replace('Cbse', 'CBSE').replace('Icse', 'ICSE').replace('Ib', 'IB')}</option>)}</Select>
      </Field>
      <Field label="Board name (optional)"><Input name="boardName" placeholder="e.g. Kerala State Board" /></Field>
      <Field label="City"><Input name="city" /></Field>
      <Field label="State"><Input name="state" /></Field>
      <Field label="School Admin name"><Input name="adminName" required /></Field>
      <Field label="School Admin email"><Input name="adminEmail" type="email" required /></Field>
      <div className="flex items-end"><Button type="submit" className="w-full">Provision school</Button></div>
      <div className="sm:col-span-3"><ErrorNote message={error} /></div>
    </form>
  );
}

export default function PlatformHome() {
  const router = useRouter();
  const me = useApi<{ fullName: string }>('/platform/auth/me');
  const schools = useApi<School[]>('/platform/schools');
  const [adding, setAdding] = useState(false);
  useEffect(() => { if (me.error?.status === 401) router.replace('/platform/login'); }, [me.error, router]);
  if (!me.data) return <Loading />;

  async function setStatus(id: string, status: string) {
    await api(`/platform/schools/${id}/status`, { method: 'PATCH', json: { status } });
    void schools.reload();
  }

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-8">
      <PageHeader title="Schools on the platform" description={`Signed in as ${me.data.fullName} (Super Admin)`} actions={<>
        <Button onClick={() => setAdding(!adding)}>{adding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{adding ? 'Close' : 'New school'}</Button>
        <Button variant="outline" onClick={async () => { await api('/platform/auth/logout', { method: 'POST' }); router.replace('/platform/login'); }}><LogOut className="h-4 w-4" />Sign out</Button>
      </>} />
      {adding && <Card className="mb-6"><CardHeader><CardTitle>Provision a school</CardTitle></CardHeader><CardContent><NewSchool onDone={schools.reload} /></CardContent></Card>}
      <Card>
        {!schools.data ? <Loading /> : (
          <Table>
            <THead><Tr><Th>School</Th><Th>Board</Th><Th className="text-right">Students</Th><Th className="text-right">Staff</Th><Th className="text-right">Sections</Th><Th className="hidden md:table-cell">Since</Th><Th>Status</Th><Th /></Tr></THead>
            <TBody>
              {schools.data.map((s) => (
                <Tr key={s.id}>
                  <Td><div className="font-medium">{s.name}</div><div className="text-xs text-muted-foreground">{s.code} · {[s.city, s.state].filter(Boolean).join(', ')}</div></Td>
                  <Td>{s.boardName ?? (s.board === 'STATE_BOARD' ? 'State Board' : s.board)}</Td>
                  <Td className="text-right tabular-nums">{s.stats.students.toLocaleString('en-IN')}</Td>
                  <Td className="text-right tabular-nums">{s.stats.staff}</Td>
                  <Td className="text-right tabular-nums">{s.stats.sections}</Td>
                  <Td className="hidden md:table-cell">{formatDate(s.createdAt)}</Td>
                  <Td><Badge tone={s.status === 'ACTIVE' ? 'success' : 'danger'}>{titleCase(s.status)}</Badge></Td>
                  <Td className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setStatus(s.id, s.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')}>{s.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</Button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </main>
  );
}
