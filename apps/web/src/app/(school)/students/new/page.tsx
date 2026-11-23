'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorNote, PageHeader } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/input';
import { api, useApi } from '@/lib/api';

interface Section { id: string; name: string; capacity: number | null; grade: { name: string }; _count: { enrollments: number } }

export default function AdmitStudentPage() {
  const router = useRouter();
  const sections = useApi<Section[]>('/academics/sections');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const guardians = [
      f.fatherName && { relationship: 'FATHER', isPrimary: f.primary === 'FATHER', guardian: { fullName: f.fatherName, phone: f.fatherPhone, email: f.fatherEmail || undefined } },
      f.motherName && { relationship: 'MOTHER', isPrimary: f.primary === 'MOTHER', guardian: { fullName: f.motherName, phone: f.motherPhone, email: f.motherEmail || undefined } },
    ].filter(Boolean);
    setBusy(true); setError(undefined);
    try {
      const s = await api<{ id: string }>('/students', {
        method: 'POST',
        json: {
          firstName: f.firstName, lastName: f.lastName || undefined, dateOfBirth: f.dateOfBirth, gender: f.gender, bloodGroup: f.bloodGroup || undefined,
          sectionId: f.sectionId, rollNumber: f.rollNumber ? Number(f.rollNumber) : undefined, admissionNumber: f.admissionNumber || undefined,
          addressLine1: f.addressLine1 || undefined, city: f.city || undefined, state: f.state || undefined, postalCode: f.postalCode || undefined,
          guardians,
        },
      });
      router.push(`/students/${s.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Admit a student" description="Creates the student record, the enrollment for the section's academic year and the guardians, all at once." />
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Student</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="First name"><Input name="firstName" required maxLength={80} /></Field>
            <Field label="Last name"><Input name="lastName" maxLength={80} /></Field>
            <Field label="Date of birth"><Input name="dateOfBirth" type="date" required /></Field>
            <Field label="Gender">
              <Select name="gender" required defaultValue="">
                <option value="" disabled>Select</option><option value="FEMALE">Female</option><option value="MALE">Male</option><option value="OTHER">Other</option><option value="UNDISCLOSED">Prefer not to say</option>
              </Select>
            </Field>
            <Field label="Blood group">
              <Select name="bloodGroup" defaultValue=""><option value="">Unknown</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => <option key={b}>{b}</option>)}</Select>
            </Field>
            <Field label="Admission number" hint="Leave empty to auto-generate"><Input name="admissionNumber" pattern="[A-Za-z0-9/\-]{2,30}" /></Field>
            <Field label="Class and section">
              <Select name="sectionId" required defaultValue="">
                <option value="" disabled>Select</option>
                {sections.data?.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.capacity !== null && s._count.enrollments >= s.capacity}>
                    {s.grade.name} {s.name} ({s._count.enrollments}{s.capacity ? `/${s.capacity}` : ''})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Roll number"><Input name="rollNumber" type="number" min={1} max={999} /></Field>
            <div className="sm:col-span-2"><Field label="Address"><Input name="addressLine1" maxLength={200} /></Field></div>
            <Field label="City"><Input name="city" maxLength={80} /></Field>
            <Field label="State"><Input name="state" maxLength={80} /></Field>
            <Field label="PIN code"><Input name="postalCode" pattern="[0-9]{6}" /></Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Guardians</CardTitle>
            <CardDescription>Add at least one. Siblings' existing guardians can be linked from the student page later.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Father's name"><Input name="fatherName" maxLength={120} /></Field>
            <Field label="Father's phone"><Input name="fatherPhone" type="tel" pattern="\+?[0-9]{10,15}" placeholder="+91…" /></Field>
            <div className="sm:col-span-2"><Field label="Father's email"><Input name="fatherEmail" type="email" /></Field></div>
            <Field label="Mother's name"><Input name="motherName" maxLength={120} /></Field>
            <Field label="Mother's phone"><Input name="motherPhone" type="tel" pattern="\+?[0-9]{10,15}" placeholder="+91…" /></Field>
            <div className="sm:col-span-2"><Field label="Mother's email"><Input name="motherEmail" type="email" /></Field></div>
            <Field label="Primary contact"><Select name="primary" defaultValue="FATHER"><option value="FATHER">Father</option><option value="MOTHER">Mother</option></Select></Field>
          </CardContent>
        </Card>
        <div className="space-y-3 lg:col-span-2">
          <ErrorNote message={error} />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Admit student'}</Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
          </div>
        </div>
      </form>
    </>
  );
}
