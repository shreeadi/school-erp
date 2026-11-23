'use client';

import { useState } from 'react';
import { can, useSession } from '@/components/shell/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, ErrorNote, Loading, PageHeader } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/input';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api, useApi } from '@/lib/api';
import { cn, formatDate, titleCase } from '@/lib/utils';

interface Year { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean }
interface Grade { id: string; name: string; code: string; sortOrder: number }
interface Section { id: string; name: string; capacity: number | null; room: string | null; grade: { id: string; name: string }; classTeacher: { user: { fullName: string } } | null; _count: { enrollments: number } }
interface Subject { id: string; code: string; name: string; type: string; department: { name: string } | null }
interface Scale { id: string; name: string; type: string; isDefault: boolean; passPercent: string; bands: { id: string; label: string; minPercent: string; maxPercent: string; gradePoint: string | null; remark: string | null }[] }
interface Category { id: string; name: string; code: string; weightage: string; defaultMaxMarks: number; passingMarks: number | null; isInternal: boolean }

/** Small inline create form: posts JSON built from the form, then reloads the list. */
function QuickCreate({ path, build, children, onDone, label }: { path: string; build: (f: Record<string, string>) => unknown; children: React.ReactNode; onDone: () => void; label: string }) {
  const [error, setError] = useState<string>();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    try {
      await api(path, { method: 'POST', json: build(Object.fromEntries(new FormData(form)) as Record<string, string>) });
      form.reset(); setError(undefined); onDone();
    } catch (err) { setError((err as Error).message); }
  }
  return (
    <form onSubmit={submit} className="mt-4 space-y-3 border-t border-border pt-4">
      <div className="grid gap-3 sm:grid-cols-4">{children}<div className="flex items-end"><Button type="submit" variant="outline" className="w-full">{label}</Button></div></div>
      <ErrorNote message={error} />
    </form>
  );
}

function YearsTab({ manage }: { manage: boolean }) {
  const { data, loading, reload } = useApi<Year[]>('/academics/years');
  if (loading && !data) return <Loading />;
  return (
    <Card>
      <CardHeader><CardTitle>Academic years</CardTitle><CardDescription>Exactly one year is current. Sections, curriculum and enrollments belong to a year.</CardDescription></CardHeader>
      <CardContent>
        <Table>
          <THead><Tr><Th>Year</Th><Th>Starts</Th><Th>Ends</Th><Th /></Tr></THead>
          <TBody>{data?.map((y) => <Tr key={y.id}><Td className="font-medium">{y.name}</Td><Td>{formatDate(y.startDate)}</Td><Td>{formatDate(y.endDate)}</Td><Td>{y.isCurrent && <Badge tone="success">Current</Badge>}</Td></Tr>)}</TBody>
        </Table>
        {manage && (
          <QuickCreate path="/academics/years" label="Add year" onDone={reload} build={(f) => ({ name: f.name, startDate: f.startDate, endDate: f.endDate, isCurrent: f.isCurrent === 'on' })}>
            <Field label="Name"><Input name="name" required placeholder="2027-28" /></Field>
            <Field label="Start"><Input name="startDate" type="date" required /></Field>
            <Field label="End"><Input name="endDate" type="date" required /></Field>
          </QuickCreate>
        )}
      </CardContent>
    </Card>
  );
}

function ClassesTab({ manage }: { manage: boolean }) {
  const grades = useApi<Grade[]>('/academics/grades');
  const years = useApi<Year[]>('/academics/years');
  const sections = useApi<Section[]>('/academics/sections');
  if (!grades.data || !sections.data) return <Loading />;
  const byGrade = new Map<string, Section[]>();
  for (const s of sections.data) byGrade.set(s.grade.id, [...(byGrade.get(s.grade.id) ?? []), s]);
  const current = years.data?.find((y) => y.isCurrent);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Classes and sections</CardTitle><CardDescription>{current ? `Sections for ${current.name}` : 'Set a current academic year to add sections'}</CardDescription></CardHeader>
        <CardContent className="px-2">
          <Table>
            <THead><Tr><Th>Class</Th><Th>Section</Th><Th>Class teacher</Th><Th className="text-right">Students</Th></Tr></THead>
            <TBody>
              {grades.data.flatMap((g) => {
                const secs = byGrade.get(g.id) ?? [];
                if (!secs.length) return [<Tr key={g.id}><Td className="font-medium">{g.name}</Td><Td colSpan={3} className="text-muted-foreground">No sections</Td></Tr>];
                return secs.map((s, i) => (
                  <Tr key={s.id}>
                    <Td className="font-medium">{i === 0 ? g.name : ''}</Td>
                    <Td>{s.name}{s.room && <span className="text-muted-foreground"> · Room {s.room}</span>}</Td>
                    <Td>{s.classTeacher?.user.fullName ?? <span className="text-muted-foreground">Not assigned</span>}</Td>
                    <Td className="text-right tabular-nums">{s._count.enrollments}{s.capacity ? <span className="text-muted-foreground">/{s.capacity}</span> : null}</Td>
                  </Tr>
                ));
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      {manage && (
        <Card>
          <CardHeader><CardTitle>Add</CardTitle><CardDescription>Names follow your school: "LKG", "Class 10", "Grade 5", "Year 11".</CardDescription></CardHeader>
          <CardContent>
            <QuickCreate path="/academics/grades" label="Add class" onDone={grades.reload} build={(f) => ({ name: f.name, code: f.code, sortOrder: Number(f.sortOrder || 0) })}>
              <Field label="Class name"><Input name="name" required /></Field>
              <Field label="Code"><Input name="code" required pattern="[A-Za-z0-9\-]{1,12}" /></Field>
              <Field label="Order"><Input name="sortOrder" type="number" min={0} /></Field>
            </QuickCreate>
            {current && (
              <QuickCreate path="/academics/sections" label="Add section" onDone={sections.reload} build={(f) => ({ academicYearId: current.id, gradeId: f.gradeId, name: f.name, capacity: f.capacity ? Number(f.capacity) : undefined })}>
                <Field label="Class"><Select name="gradeId" required>{grades.data.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
                <Field label="Section"><Input name="name" required maxLength={30} /></Field>
                <Field label="Capacity"><Input name="capacity" type="number" min={1} max={500} /></Field>
              </QuickCreate>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SubjectsTab({ manage }: { manage: boolean }) {
  const { data, reload } = useApi<Subject[]>('/academics/subjects');
  if (!data) return <Loading />;
  return (
    <Card>
      <CardHeader><CardTitle>Subjects</CardTitle></CardHeader>
      <CardContent className="px-2">
        {!data.length ? <Empty>No subjects yet.</Empty> : (
          <Table>
            <THead><Tr><Th>Code</Th><Th>Subject</Th><Th>Type</Th><Th>Department</Th></Tr></THead>
            <TBody>{data.map((s) => <Tr key={s.id}><Td className="font-mono text-xs">{s.code}</Td><Td className="font-medium">{s.name}</Td><Td>{titleCase(s.type)}</Td><Td>{s.department?.name ?? '—'}</Td></Tr>)}</TBody>
          </Table>
        )}
        {manage && (
          <div className="px-3">
            <QuickCreate path="/academics/subjects" label="Add subject" onDone={reload} build={(f) => ({ code: f.code, name: f.name, type: f.type })}>
              <Field label="Code"><Input name="code" required pattern="[A-Za-z0-9\-]{2,16}" /></Field>
              <Field label="Name"><Input name="name" required /></Field>
              <Field label="Type"><Select name="type">{['CORE', 'ELECTIVE', 'LANGUAGE', 'CO_SCHOLASTIC', 'ACTIVITY'].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select></Field>
            </QuickCreate>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GradingTab() {
  const scales = useApi<Scale[]>('/grading/scales');
  const cats = useApi<{ items: Category[]; totalWeightage: number }>('/grading/exam-categories');
  if (!scales.data || !cats.data) return <Loading />;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {scales.data.map((s) => (
        <Card key={s.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">{s.name}{s.isDefault && <Badge>Default</Badge>}</CardTitle>
            <CardDescription>{titleCase(s.type)} · pass at {Number(s.passPercent)}%</CardDescription>
          </CardHeader>
          <CardContent className="px-2">
            <Table>
              <THead><Tr><Th>Grade</Th><Th>Range</Th><Th>Point</Th><Th>Remark</Th></Tr></THead>
              <TBody>{s.bands.map((b) => <Tr key={b.id}><Td className="font-medium">{b.label}</Td><Td className="tabular-nums">{Number(b.minPercent)}–{Number(b.maxPercent)}%</Td><Td>{b.gradePoint ? Number(b.gradePoint) : '—'}</Td><Td>{b.remark ?? '—'}</Td></Tr>)}</TBody>
            </Table>
          </CardContent>
        </Card>
      ))}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Assessment categories</CardTitle>
          <CardDescription className={cn(cats.data.totalWeightage !== 100 && 'text-destructive')}>Total weightage {cats.data.totalWeightage}%{cats.data.totalWeightage !== 100 && ' (should add up to 100%)'}</CardDescription>
        </CardHeader>
        <CardContent className="px-2">
          <Table>
            <THead><Tr><Th>Category</Th><Th>Code</Th><Th>Weightage</Th><Th>Max marks</Th><Th>Passing</Th><Th>Type</Th></Tr></THead>
            <TBody>{cats.data.items.map((c) => <Tr key={c.id}><Td className="font-medium">{c.name}</Td><Td className="font-mono text-xs">{c.code}</Td><Td>{Number(c.weightage)}%</Td><Td>{c.defaultMaxMarks}</Td><Td>{c.passingMarks ?? '—'}</Td><Td>{c.isInternal ? 'Internal' : 'Examination'}</Td></Tr>)}</TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

const TABS = ['Years', 'Classes', 'Subjects', 'Grading'] as const;

export default function AcademicsPage() {
  const me = useSession();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Classes');
  const manage = can(me, 'academics:manage');
  return (
    <>
      <PageHeader title="Academic setup" description="Configured per school. Nothing here is fixed to one board." />
      <div className="mb-6 inline-flex rounded-md border border-border bg-card p-1" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn('rounded px-3 py-1.5 text-sm', tab === t ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{t}</button>
        ))}
      </div>
      {tab === 'Years' && <YearsTab manage={manage} />}
      {tab === 'Classes' && <ClassesTab manage={manage} />}
      {tab === 'Subjects' && <SubjectsTab manage={manage} />}
      {tab === 'Grading' && (can(me, 'grading:read') ? <GradingTab /> : <ErrorNote message="You don't have access to grading configuration." />)}
    </>
  );
}
