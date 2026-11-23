'use client';

import { BookOpen, GraduationCap, Layers, UserSquare2, Users } from 'lucide-react';
import Link from 'next/link';
import { EnrollmentChart, type GradeEnrollment } from '@/components/enrollment-chart';
import { can, useSession } from '@/components/shell/session';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, ErrorNote, Loading, PageHeader } from '@/components/ui/feedback';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { type Paged, useApi } from '@/lib/api';
import { formatDate, fullName } from '@/lib/utils';

interface Overview {
  academicYear: { id: string; name: string } | null;
  counts: { students: number; teachingStaff: number; nonTeachingStaff: number; guardians: number; grades: number; sections: number; subjects: number };
  enrollmentByGrade: (GradeEnrollment & { gradeId: string })[];
  recentAdmissions: { id: string; admissionNumber: string; firstName: string; lastName: string | null; admissionDate: string }[];
}

function Stat({ label, value, icon: Icon, hint }: { label: string; value: number; icon: typeof Users; hint?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
        <div>
          <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString('en-IN')}</div>
          <div className="text-sm text-muted-foreground">{label}{hint ? ` · ${hint}` : ''}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ManagementOverview() {
  const { data, error, loading } = useApi<Overview>('/school/overview');
  if (loading) return <Loading />;
  if (error || !data) return <ErrorNote message={error?.message} />;
  const c = data.counts;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active students" value={c.students} icon={GraduationCap} />
        <Stat label="Teaching staff" value={c.teachingStaff} icon={UserSquare2} hint={`${c.nonTeachingStaff} non-teaching`} />
        <Stat label="Sections" value={c.sections} icon={Layers} hint={`${c.grades} classes`} />
        <Stat label="Subjects" value={c.subjects} icon={BookOpen} />
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Students by class</CardTitle>
            <CardDescription>Active enrollments, {data.academicYear?.name ?? 'no current academic year'}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.enrollmentByGrade.some((g) => g.students > 0) ? <EnrollmentChart data={data.enrollmentByGrade} /> : <Empty>No enrollments yet.</Empty>}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Recent admissions</CardTitle></CardHeader>
          <CardContent className="px-2">
            {data.recentAdmissions.length === 0 ? <Empty>No admissions yet.</Empty> : (
              <Table>
                <TBody>
                  {data.recentAdmissions.map((s) => (
                    <Tr key={s.id}>
                      <Td><Link className="font-medium hover:underline" href={`/students/${s.id}`}>{fullName(s)}</Link><div className="text-xs text-muted-foreground">{s.admissionNumber}</div></Td>
                      <Td className="text-right text-muted-foreground">{formatDate(s.admissionDate)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TeacherOverview() {
  const me = useSession();
  const t = me.teaching;
  if (!t) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>My classes</CardTitle>
          <CardDescription>
            {[t.isClassTeacher && 'Class Teacher', t.isSubjectTeacher && 'Subject Teacher', t.isHeadOfDepartment && 'Head of Department'].filter(Boolean).join(' · ') || 'No assignments this year'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {t.classTeacherOf.map((c) => <div key={c.sectionId} className="flex items-center justify-between text-sm"><span className="font-medium">{c.label}</span><Badge>Class teacher</Badge></div>)}
          {t.subjects.length === 0 ? <Empty>No subjects assigned.</Empty> : (
            <Table>
              <THead><Tr><Th>Class</Th><Th>Subject</Th></Tr></THead>
              <TBody>{t.subjects.map((s) => <Tr key={`${s.sectionId}-${s.subjectId}`}><Td>{s.label}</Td><Td>{s.subject}</Td></Tr>)}</TBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {t.headOf.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Departments I head</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">{t.headOf.map((d) => <Badge key={d.id}>{d.name}</Badge>)}</CardContent>
        </Card>
      )}
    </div>
  );
}

interface StudentRow { id: string; admissionNumber: string; firstName: string; lastName: string | null; enrollments: { rollNumber: number | null; section: { name: string; grade: { name: string } } }[] }

function FamilyOverview() {
  const me = useSession();
  const { data, loading, error } = useApi<Paged<StudentRow>>('/students?pageSize=20');
  if (loading) return <Loading />;
  if (error || !data) return <ErrorNote message={error?.message} />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{me.user.userType === 'GUARDIAN' ? 'My children' : 'My details'}</CardTitle>
        <CardDescription>Attendance, homework and results appear here as those modules are switched on.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {data.items.map((s) => (
          <Link key={s.id} href={`/students/${s.id}`} className="rounded-md border border-border p-4 hover:bg-muted">
            <div className="font-medium">{fullName(s)}</div>
            <div className="text-sm text-muted-foreground">
              {s.enrollments[0] ? `${s.enrollments[0].section.grade.name} ${s.enrollments[0].section.name}, roll no. ${s.enrollments[0].rollNumber ?? '—'}` : 'Not enrolled this year'}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{s.admissionNumber}</div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const me = useSession();
  return (
    <>
      <PageHeader title={`Welcome, ${me.user.fullName.split(' ')[0]}`} description={me.school.name} />
      {can(me, 'dashboard:read') ? <ManagementOverview /> : me.teaching ? <TeacherOverview /> : me.user.userType !== 'STAFF' ? <FamilyOverview /> : (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Your modules will appear here as they are enabled for your role.</CardContent></Card>
      )}
    </>
  );
}
