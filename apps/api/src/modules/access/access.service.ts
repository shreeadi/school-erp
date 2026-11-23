import { Injectable } from '@nestjs/common';
import type { PermissionScope } from '../../generated/prisma/enums.js';
import type { SchoolActor } from '../../common/request-context.js';
import type { Tx } from '../../prisma/tenant-db.service.js';

/** Loads a user's effective roles and permissions (inside a tenant transaction). */
@Injectable()
export class AccessService {
  async loadSchoolActor(
    tx: Tx,
    session: { sessionId: string; userId: string; schoolId: string },
  ): Promise<SchoolActor | null> {
    const user = await tx.user.findUnique({
      where: { id: session.userId },
      include: {
        roles: { include: { role: { include: { permissions: true } } } },
        staffProfile: { select: { id: true, isActive: true } },
        student: { select: { id: true, status: true } },
        guardian: { select: { id: true } },
      },
    });
    if (!user || user.status !== 'ACTIVE' || user.schoolId !== session.schoolId) return null;
    if (user.staffProfile && !user.staffProfile.isActive) return null;

    const permissions = new Map<string, Set<PermissionScope>>();
    for (const ur of user.roles) {
      for (const rp of ur.role.permissions) {
        if (!permissions.has(rp.permission)) permissions.set(rp.permission, new Set());
        permissions.get(rp.permission)!.add(rp.scope);
      }
    }

    return {
      kind: 'school',
      sessionId: session.sessionId,
      userId: user.id,
      schoolId: user.schoolId,
      email: user.email,
      fullName: user.fullName,
      userType: user.userType,
      roles: user.roles.map((r) => r.role.key),
      permissions,
      staffId: user.staffProfile?.id ?? null,
      studentId: user.student?.id ?? null,
      guardianId: user.guardian?.id ?? null,
    };
  }
}
