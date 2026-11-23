import { AsyncLocalStorage } from 'node:async_hooks';
import type { PermissionScope } from '../generated/prisma/enums.js';

/** A signed-in school user. Tenant (schoolId) always comes from the session row. */
export interface SchoolActor {
  kind: 'school';
  sessionId: string;
  userId: string;
  schoolId: string;
  email: string;
  fullName: string;
  userType: 'STAFF' | 'STUDENT' | 'GUARDIAN';
  roles: string[];
  /** permission -> scopes granted through any of the user's roles */
  permissions: Map<string, Set<PermissionScope>>;
  staffId: string | null;
  studentId: string | null;
  guardianId: string | null;
}

/** A platform operator (Super Admin). Never carries a school of its own. */
export interface PlatformActor {
  kind: 'platform';
  sessionId: string;
  adminId: string;
  email: string;
  fullName: string;
}

export type Actor = SchoolActor | PlatformActor;

export interface RequestContextStore {
  requestId: string;
  ip?: string;
  userAgent?: string;
  actor?: Actor;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

export const RequestContext = {
  run<T>(store: RequestContextStore, fn: () => T): T {
    return storage.run(store, fn);
  },
  get(): RequestContextStore | undefined {
    return storage.getStore();
  },
  actor(): Actor | undefined {
    return storage.getStore()?.actor;
  },
};
