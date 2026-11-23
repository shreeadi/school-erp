'use client';

import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { can, useSession } from '@/components/shell/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Empty, ErrorNote, Loading, PageHeader } from '@/components/ui/feedback';
import { Input, Select } from '@/components/ui/input';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { type Paged, useApi } from '@/lib/api';
import { formatDate, fullName, titleCase } from '@/lib/utils';

interface StudentRow {
  id: string; admissionNumber: string; firstName: string; lastName: string | null; gender: string; dateOfBirth: string; status: string;
  enrollments: { rollNumber: number | null; section: { id: string; name: string; grade: { id: string; name: string } } }[];
}
interface Grade { id: string; name: string }
interface Section { id: string; name: string; grade: { id: string; name: string } }

export default function StudentsPage() {
  const me = useSession();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setDebounced(search); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);

  const isStaff = me.user.userType === 'STAFF';
  const grades = useApi<Grade[]>(isStaff ? '/academics/grades' : null);
  const sections = useApi<Section[]>(isStaff && gradeId ? `/academics/sections?gradeId=${gradeId}` : null);

  const query = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (debounced) p.set('search', debounced);
    if (gradeId) p.set('gradeId', gradeId);
    if (sectionId) p.set('sectionId', sectionId);
    return `/students?${p}`;
  }, [page, debounced, gradeId, sectionId]);
  const { data, error, loading } = useApi<Paged<StudentRow>>(query);

  const scope = me.permissions['students:read'] ?? [];
  const description = scope.includes('ALL') ? 'Every student in the school' : scope.includes('ASSIGNED') ? 'Students in the sections you teach or lead' : scope.includes('LINKED') ? 'Your linked children' : 'Your record';

  return (
    <>
      <PageHeader
        title={me.user.userType === 'GUARDIAN' ? 'My children' : 'Students'}
        description={data ? `${description} · ${data.total.toLocaleString('en-IN')} found` : description}
        actions={can(me, 'students:manage', 'ALL') && <Link href="/students/new"><Button><Plus className="h-4 w-4" />Admit student</Button></Link>}
      />
      {isStaff && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or admission number" className="pl-9" />
          </div>
          <Select value={gradeId} onChange={(e) => { setGradeId(e.target.value); setSectionId(''); setPage(1); }} className="sm:w-44" aria-label="Class">
            <option value="">All classes</option>
            {grades.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
          <Select value={sectionId} onChange={(e) => { setSectionId(e.target.value); setPage(1); }} className="sm:w-36" disabled={!gradeId} aria-label="Section">
            <option value="">All sections</option>
            {sections.data?.map((s) => <option key={s.id} value={s.id}>Section {s.name}</option>)}
          </Select>
        </div>
      )}
      <Card>
        {loading && !data ? <Loading /> : error ? <div className="p-4"><ErrorNote message={error.message} /></div> : !data?.items.length ? <Empty>No students match.</Empty> : (
          <>
            <Table>
              <THead><Tr><Th>Student</Th><Th>Admission no.</Th><Th>Class</Th><Th className="hidden md:table-cell">Date of birth</Th><Th>Status</Th></Tr></THead>
              <TBody>
                {data.items.map((s) => {
                  const e = s.enrollments[0];
                  return (
                    <Tr key={s.id}>
                      <Td><Link href={`/students/${s.id}`} className="font-medium hover:underline">{fullName(s)}</Link></Td>
                      <Td className="font-mono text-xs">{s.admissionNumber}</Td>
                      <Td>{e ? `${e.section.grade.name} ${e.section.name}` : '—'}{e?.rollNumber ? <span className="text-muted-foreground"> · #{e.rollNumber}</span> : null}</Td>
                      <Td className="hidden md:table-cell">{formatDate(s.dateOfBirth)}</Td>
                      <Td><Badge tone={s.status === 'ACTIVE' ? 'success' : 'muted'}>{titleCase(s.status)}</Badge></Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
            <div className="flex items-center justify-between border-t border-border p-3 text-sm text-muted-foreground">
              <span>Page {data.page} of {data.totalPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" />Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next<ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
