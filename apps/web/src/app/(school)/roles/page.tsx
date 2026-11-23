'use client';

import { Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Loading, PageHeader } from '@/components/ui/feedback';
import { useApi } from '@/lib/api';
import { titleCase } from '@/lib/utils';

interface Role { id: string; key: string; name: string; isSystem: boolean; permissions: { permission: string; scope: string }[]; _count: { userRoles: number } }
interface Perm { key: string; module: string; description: string }

export default function RolesPage() {
  const roles = useApi<Role[]>('/roles');
  const catalog = useApi<Perm[]>('/permissions');
  if (!roles.data || !catalog.data) return <Loading />;
  return (
    <>
      <PageHeader title="Roles & access" description="Module permissions per role, with the record scope each one applies to. Teacher access also follows real class and subject assignments." />
      <Card className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 bg-card p-3 text-left font-medium">Permission</th>
              {roles.data.map((r) => <th key={r.id} className="min-w-24 p-3 text-center font-medium"><div>{r.name}</div><div className="font-normal text-muted-foreground">{r._count.userRoles} users</div></th>)}
            </tr>
          </thead>
          <tbody>
            {catalog.data.map((p) => (
              <tr key={p.key} className="border-b border-border hover:bg-muted/50">
                <td className="sticky left-0 bg-card p-3"><div className="font-medium">{p.description}</div><div className="font-mono text-muted-foreground">{p.key}</div></td>
                {roles.data!.map((r) => {
                  const g = r.permissions.find((x) => x.permission === p.key);
                  return (
                    <td key={r.id} className="p-3 text-center">
                      {g ? (g.scope === 'ALL' ? <Check className="mx-auto h-4 w-4 text-primary" aria-label="All records" /> : <span className="rounded bg-muted px-1.5 py-0.5">{titleCase(g.scope)}</span>) : <span className="text-border">·</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
