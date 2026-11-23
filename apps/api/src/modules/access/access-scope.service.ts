import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PermissionScope } from '../../generated/prisma/enums.js';
import type { SchoolActor } from '../../common/request-context.js';
import type { Tx } from '../../prisma/tenant-db.service.js';
import type { Permission } from './permissions.js';

/** Matches nothing. Used when a user holds a scope that cannot apply to them. */
const NONE = { id: { in: [] as string[] } };

/**
 * Attribute-based, record-level access. Tenant isolation is already enforced by
 * RLS; these filters decide *which* of the school's records a user may see.
 *
 * Each helper returns a Prisma `where` fragment that is the OR of every scope
 * the user holds for the permission. A user without the permission gets NONE.
 */
@Injectable()
export class AccessScopeService {
  scopes(actor: SchoolActor, permission: Permission): Set<PermissionScope> {
    return actor.permissions.get(permission) ?? new Set();
  }

  has(actor: SchoolActor, permission: Permission, scope?: PermissionScope): boolean {
    const s = this.scopes(actor, permission);
    return scope ? s.has(scope) : s.size > 0;
  }

  /** Sections a staff member is linked to this academic year (class teacher, subject teacher, or HOD). */
  private assignedSectionWhere(staffId: string): Prisma.SectionWhereInput {
    return {
      academicYear: { isCurrent: true },
      OR: [
        { classTeacherId: staffId },
        { teachingAssignments: { some: { staffId } } },
        { teachingAssignments: { some: { subject: { department: { headId: staffId } } } } },
      ],
    };
  }

  studentWhere(actor: SchoolActor, permission: Permission = 'students:read'): Prisma.StudentWhereInput {
    const scopes = this.scopes(actor, permission);
    if (scopes.has('ALL')) return {};
    const or: Prisma.StudentWhereInput[] = [];
    if (scopes.has('ASSIGNED') && actor.staffId) {
      or.push({ enrollments: { some: { status: 'ACTIVE', section: this.assignedSectionWhere(actor.staffId) } } });
    }
    if (scopes.has('LINKED') && actor.guardianId) {
      or.push({ guardians: { some: { guardianId: actor.guardianId } } });
    }
    if (scopes.has('OWN') && actor.studentId) {
      or.push({ id: actor.studentId });
    }
    return or.length ? { OR: or } : NONE;
  }

  guardianWhere(actor: SchoolActor, permission: Permission = 'guardians:read'): Prisma.GuardianWhereInput {
    const scopes = this.scopes(actor, permission);
    if (scopes.has('ALL')) return {};
    const or: Prisma.GuardianWhereInput[] = [];
    if (scopes.has('ASSIGNED') && actor.staffId) {
      or.push({
        students: {
          some: { student: { enrollments: { some: { status: 'ACTIVE', section: this.assignedSectionWhere(actor.staffId) } } } },
        },
      });
    }
    if ((scopes.has('OWN') || scopes.has('LINKED')) && actor.guardianId) {
      or.push({ id: actor.guardianId });
    }
    return or.length ? { OR: or } : NONE;
  }

  staffWhere(actor: SchoolActor, permission: Permission = 'staff:read'): Prisma.StaffProfileWhereInput {
    const scopes = this.scopes(actor, permission);
    if (scopes.has('ALL')) return {};
    const or: Prisma.StaffProfileWhereInput[] = [];
    if (actor.staffId && (scopes.has('ASSIGNED') || scopes.has('OWN'))) {
      or.push({ id: actor.staffId });
    }
    if (scopes.has('ASSIGNED') && actor.staffId) {
      // A head of department sees the members of the departments they head.
      or.push({ department: { headId: actor.staffId } });
    }
    return or.length ? { OR: or } : NONE;
  }

  /** Record-level guard for a single student. Returns 404 (not 403) to avoid confirming existence. */
  async assertStudent(tx: Tx, actor: SchoolActor, studentId: string, permission: Permission = 'students:read') {
    const found = await tx.student.findFirst({
      where: { AND: [{ id: studentId }, this.studentWhere(actor, permission)] },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Student not found');
  }

  /** Write operations require the ALL scope unless a module explicitly supports narrower writes. */
  requireAll(actor: SchoolActor, permission: Permission) {
    if (!this.has(actor, permission, 'ALL')) {
      throw new ForbiddenException(`'${permission}' with school-wide scope is required`);
    }
  }
}
