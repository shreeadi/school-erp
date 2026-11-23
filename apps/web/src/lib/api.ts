'use client';

import { useCallback, useEffect, useState } from 'react';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Same-origin call to the API (proxied by Next). The session is an httpOnly cookie. */
export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`/api/v1${path}`, {
    ...rest,
    credentials: 'same-origin',
    headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message ?? res.statusText;
    throw new ApiError(res.status, msg);
  }
  return body as T;
}

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<ApiError | undefined>();
  const [loading, setLoading] = useState(Boolean(path));

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(undefined);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)));
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { void load(); }, [load]);
  return { data, error, loading, reload: load };
}

export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number; totalPages: number }

export interface Me {
  user: { id: string; email: string; fullName: string; userType: 'STAFF' | 'STUDENT' | 'GUARDIAN' };
  school: { id: string; code: string; name: string; board: string; boardName: string | null };
  roles: string[];
  permissions: Record<string, string[]>;
  staffId: string | null;
  studentId: string | null;
  guardianId: string | null;
  teaching: null | {
    isClassTeacher: boolean; isSubjectTeacher: boolean; isHeadOfDepartment: boolean;
    classTeacherOf: { sectionId: string; label: string }[];
    subjects: { sectionId: string; label: string; subjectId: string; subject: string }[];
    headOf: { id: string; name: string }[];
  };
}
