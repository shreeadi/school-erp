'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorNote, Loading, PageHeader } from '@/components/ui/feedback';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useApi } from '@/lib/api';
import { formatDate, fullName, titleCase } from '@/lib/utils';

interface StudentDetail {
  id: string; admissionNumber: string; firstName: string; lastName: string | null; dateOfBirth: string; gender: string; bloodGroup: string | null;
  admissionDate: string; status: string; addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null; postalCode: string | null;
  enrollments: { id: string; rollNumber: number | null; status: string; academicYear: { name: string; isCurrent: boolean }; section: { name: string; grade: { name: string } } }[];
  guardians: { relationship: string; isPrimary: boolean; canPickup: boolean; guardian: { id: string; fullName: string; phone: string; email: string | null; occupation: string | null } }[];
  user: { email: string; status: string } | null;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between gap-4 py-1.5 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium">{value || '—'}</dd></div>;
}

export default function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: s, error, loading } = useApi<StudentDetail>(`/students/${id}`);
  if (loading) return <Loading />;
  if (error || !s) return <ErrorNote message={error?.status === 404 ? 'This student record is not available to you.' : error?.message} />;
  const current = s.enrollments.find((e) => e.academicYear.isCurrent);
  const address = [s.addressLine1, s.addressLine2, s.city, s.state, s.postalCode].filter(Boolean).join(', ');

  return (
    <>
      <Link href="/students" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Students</Link>
      <PageHeader
        title={fullName(s)}
        description={`${s.admissionNumber}${current ? ` · ${current.section.grade.name} ${current.section.name}` : ''}`}
        actions={<Badge tone={s.status === 'ACTIVE' ? 'success' : 'muted'}>{titleCase(s.status)}</Badge>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              <Row label="Date of birth" value={formatDate(s.dateOfBirth)} />
              <Row label="Gender" value={titleCase(s.gender)} />
              <Row label="Blood group" value={s.bloodGroup} />
              <Row label="Admitted on" value={formatDate(s.admissionDate)} />
              <Row label="Roll number" value={current?.rollNumber} />
              <Row label="Portal login" value={s.user ? s.user.email : 'Not created'} />
              <Row label="Address" value={address} />
            </dl>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Guardians</CardTitle></CardHeader>
          <CardContent className="px-2">
            <Table>
              <THead><Tr><Th>Name</Th><Th>Relationship</Th><Th>Phone</Th><Th className="hidden sm:table-cell">Occupation</Th></Tr></THead>
              <TBody>
                {s.guardians.map((g) => (
                  <Tr key={g.guardian.id}>
                    <Td className="font-medium">{g.guardian.fullName}{g.isPrimary && <Badge className="ml-2">Primary</Badge>}</Td>
                    <Td>{titleCase(g.relationship)}</Td>
                    <Td className="tabular-nums">{g.guardian.phone}</Td>
                    <Td className="hidden sm:table-cell">{g.guardian.occupation ?? '—'}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Academic history</CardTitle></CardHeader>
          <CardContent className="px-2">
            <Table>
              <THead><Tr><Th>Academic year</Th><Th>Class</Th><Th>Roll no.</Th><Th>Status</Th></Tr></THead>
              <TBody>
                {s.enrollments.map((e) => (
                  <Tr key={e.id}><Td>{e.academicYear.name}</Td><Td>{e.section.grade.name} {e.section.name}</Td><Td>{e.rollNumber ?? '—'}</Td><Td>{titleCase(e.status)}</Td></Tr>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
