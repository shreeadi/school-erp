'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const BAR = '#3b5bdb'; // validated: lightness band, chroma floor, ≥3:1 on the light surface

export interface GradeEnrollment { grade: string; students: number; sections: number }

/** Single-series bar: active students per class, current academic year. */
export function EnrollmentChart({ data }: { data: GradeEnrollment[] }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Active students by class">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="#e7e9ee" />
          <XAxis dataKey="grade" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={(v: string) => v.replace('Class ', '')} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
          <Tooltip
            cursor={{ fill: 'rgba(59,91,219,0.08)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as GradeEnrollment;
              return (
                <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
                  <div className="font-medium">{d.grade}</div>
                  <div className="text-muted-foreground">{d.students} students · {d.sections} sections</div>
                </div>
              );
            }}
          />
          <Bar dataKey="students" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
