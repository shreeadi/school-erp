'use client';

import { Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { can, useSession } from '@/components/shell/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, ErrorNote, Loading, PageHeader } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/input';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api, type Paged, useApi } from '@/lib/api';
import { titleCase } from '@/lib/utils';

interface StaffRow {
  id: string; employeeCode: string; designation: string; staffType: string; isActive: boolean;
  department: { name: string } | null;
  user: { fullName: string; email: string; phone: string | null; roles: { role: { key: string; name: string } }[] };
}
interface Department { id: string; name: string }

function AddStaff({ onDone }: { onDone: () => void }) {
  const depts = useApi<Department[]>('/academics/departments');
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<{ email: string; password?: string }>();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      const r = await api<{ staff: StaffRow; temporaryPassword?: string }>('/staff', {
        method: 'POST',
        json: { fullName: f.fullName, email: f.email, phone: f.phone || undefined, employeeCode: f.employeeCode, designation: f.designation, staffType: f.staffType, departmentId: f.departmentId || undefined },
      });
      setCreated({ email: r.staff.user.email, password: r.temporaryPassword });
      onDone();
    } catch (err) { setError((err as Error).message); }
  }
  if (created) {
    return (
      <div className="space-y-2 text-sm">
        <p>Account created for <strong>{created.email}</strong>.</p>
        {created.password && <p>One-time password: <code className="rounded bg-muted px-1.5 py-0.5">{created.password}</code>. Share it securely; it is not shown again.</p>}
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
      <Field label="Full name"><Input name="fullName" required /></Field>
      <Field label="Email"><Input name="email" type="email" required /></Field>
      <Field label="Phone"><Input name="phone" type="tel" pattern="\+?[0-9]{10,15}" /></Field>
      <Field label="Employee code"><Input name="employeeCode" required pattern="[A-Za-z0-9\-]{2,20}" /></Field>
      <Field label="Designation"><Input name="designation" required /></Field>
      <Field label="Type"><Select name="staffType" defaultValue="TEACHING"><option value="TEACHING">Teaching</option><option value="NON_TEACHING">Non-teaching</option></Select></Field>
      <Field label="Department"><Select name="departmentId" defaultValue=""><option value="">None</option>{depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
      <div className="flex items-end gap-2 sm:col-span-2"><Button type="submit">Create staff member</Button><ErrorNote message={error} /></div>
    </form>
  );
}

export default function StaffPage() {
  const me = useSession();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [type, setType] = useState('');
  const [adding, setAdding] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(t); }, [search]);
  const path = useMemo(() => {
    const p = new URLSearchParams({ pageSize: '100' });
    if (debounced) p.set('search', debounced);
    if (type) p.set('staffType', type);
    return `/staff?${p}`;
  }, [debounced, type]);
  const { data, error, loading, reload } = useApi<Paged<StaffRow>>(path);

  return (
    <>
      <PageHeader title="Staff" description={data ? `${data.total} staff members` : undefined}
        actions={can(me, 'staff:manage', 'ALL') && <Button onClick={() => setAdding(!adding)}>{adding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{adding ? 'Close' : 'Add staff'}</Button>} />
      {adding && <Card className="mb-6"><CardHeader><CardTitle>New staff member</CardTitle></CardHeader><CardContent><AddStaff onDone={reload} /></CardContent></Card>}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or employee code" className="pl-9" />
        </div>
        <Select value={type} onChange={(e) => setType(e.target.value)} className="sm:w-48" aria-label="Staff type">
          <option value="">All staff</option><option value="TEACHING">Teaching</option><option value="NON_TEACHING">Non-teaching</option>
        </Select>
      </div>
      <Card>
        {loading && !data ? <Loading /> : error ? <div className="p-4"><ErrorNote message={error.message} /></div> : !data?.items.length ? <Empty>No staff match.</Empty> : (
          <Table>
            <THead><Tr><Th>Name</Th><Th>Code</Th><Th>Designation</Th><Th className="hidden lg:table-cell">Department</Th><Th className="hidden md:table-cell">Roles</Th><Th>Status</Th></Tr></THead>
            <TBody>
              {data.items.map((s) => (
                <Tr key={s.id}>
                  <Td><div className="font-medium">{s.user.fullName}</div><div className="text-xs text-muted-foreground">{s.user.email}</div></Td>
                  <Td className="font-mono text-xs">{s.employeeCode}</Td>
                  <Td>{s.designation}</Td>
                  <Td className="hidden lg:table-cell">{s.department?.name ?? '—'}</Td>
                  <Td className="hidden md:table-cell"><div className="flex flex-wrap gap-1">{s.user.roles.map((r) => <Badge key={r.role.key} tone="muted">{r.role.name}</Badge>)}</div></Td>
                  <Td><Badge tone={s.isActive ? 'success' : 'muted'}>{s.isActive ? 'Active' : 'Inactive'}</Badge></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      {!can(me, 'staff:read', 'ALL') && <p className="mt-3 text-xs text-muted-foreground">You see {titleCase('own and department')} records only.</p>}
    </>
  );
}
