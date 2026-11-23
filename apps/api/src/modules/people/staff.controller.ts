import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentSchoolActor, RequirePermissions } from '../../common/decorators.js';
import { guardPrisma } from '../../common/errors.js';
import { paged, StaffQueryDto } from '../../common/pagination.js';
import type { SchoolActor } from '../../common/request-context.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { TenantDb, inSequence } from '../../prisma/tenant-db.service.js';
import { AccessScopeService } from '../access/access-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SessionService } from '../auth/session.service.js';
import { AccountsService } from './accounts.service.js';
import { CreateAssignmentDto, CreateStaffDto, UpdateStaffDto } from './staff.dto.js';

const STAFF_SELECT = {
  id: true, employeeCode: true, designation: true, staffType: true, qualifications: true, dateOfJoining: true, isActive: true,
  department: { select: { id: true, name: true } },
  user: { select: { id: true, fullName: true, email: true, phone: true, status: true, roles: { select: { role: { select: { key: true, name: true } } } } } },
} satisfies Prisma.StaffProfileSelect;

@ApiTags('Staff')
@ApiCookieAuth()
@Controller('staff')
export class StaffController {
  constructor(
    private readonly db: TenantDb,
    private readonly scope: AccessScopeService,
    private readonly audit: AuditService,
    private readonly accounts: AccountsService,
    private readonly sessions: SessionService,
  ) {}

  @Get()
  @RequirePermissions('staff:read')
  list(@CurrentSchoolActor() a: SchoolActor, @Query() q: StaffQueryDto) {
    const { search, staffType, departmentId } = q;
    const where: Prisma.StaffProfileWhereInput = {
      AND: [
        this.scope.staffWhere(a),
        staffType ? { staffType } : {},
        departmentId ? { departmentId } : {},
        search ? { OR: [{ employeeCode: { contains: search, mode: 'insensitive' } }, { user: { fullName: { contains: search, mode: 'insensitive' } } }] } : {},
      ],
    };
    return this.db.run(async (tx) => {
      const [items, total] = await inSequence(
        () => tx.staffProfile.findMany({ where, select: STAFF_SELECT, orderBy: { user: { fullName: 'asc' } }, skip: q.skip, take: q.take }),
        () => tx.staffProfile.count({ where })
      );
      return paged(items, total, q);
    });
  }

  @Get(':id')
  @RequirePermissions('staff:read')
  get(@CurrentSchoolActor() a: SchoolActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.run(async (tx) => {
      const staff = await tx.staffProfile.findFirst({
        where: { AND: [{ id }, this.scope.staffWhere(a)] },
        select: {
          ...STAFF_SELECT,
          classTeacherOf: { where: { academicYear: { isCurrent: true } }, select: { id: true, name: true, grade: { select: { name: true } } } },
          headOfDepartments: { select: { id: true, name: true } },
          teachingAssignments: {
            where: { academicYear: { isCurrent: true } },
            select: { id: true, subject: { select: { id: true, name: true } }, section: { select: { id: true, name: true, grade: { select: { name: true } } } } },
          },
        },
      });
      if (!staff) throw new NotFoundException('Staff member not found');
      return staff;
    });
  }

  @Post()
  @RequirePermissions('staff:manage')
  @ApiOperation({ summary: 'Add a staff member with a portal login. Returns a one-time temporary password.' })
  create(@CurrentSchoolActor() a: SchoolActor, @Body() dto: CreateStaffDto) {
    this.scope.requireAll(a, 'staff:manage');
    const roleKeys = dto.roleKeys ?? (dto.staffType === 'TEACHING' ? ['TEACHER'] : []);
    if (roleKeys.includes('SCHOOL_ADMIN') && !a.roles.includes('SCHOOL_ADMIN')) throw new BadRequestException('Only a School Admin can appoint a School Admin');
    if (roleKeys.length && !a.permissions.has('roles:manage') && roleKeys.some((k) => k !== 'TEACHER')) {
      throw new BadRequestException('Assigning administrative roles requires roles:manage');
    }
    return this.db.run(async (tx) => {
      const { user, temporaryPassword } = await this.accounts.createUser(tx, {
        schoolId: a.schoolId, email: dto.email, fullName: dto.fullName, phone: dto.phone, userType: 'STAFF', roleKeys,
      });
      const staff = await guardPrisma(tx.staffProfile.create({
        data: {
          schoolId: a.schoolId, userId: user.id, employeeCode: dto.employeeCode.toUpperCase(), designation: dto.designation, staffType: dto.staffType,
          departmentId: dto.departmentId, qualifications: dto.qualifications, dateOfJoining: dto.dateOfJoining ? new Date(dto.dateOfJoining) : undefined,
        },
        select: STAFF_SELECT,
      }));
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'staff.created', entityType: 'staff', entityId: staff.id, metadata: { roles: roleKeys } });
      return { staff, temporaryPassword };
    });
  }

  @Patch(':id')
  @RequirePermissions('staff:manage')
  async update(@CurrentSchoolActor() a: SchoolActor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStaffDto) {
    this.scope.requireAll(a, 'staff:manage');
    const result = await this.db.run(async (tx) => {
      const existing = await tx.staffProfile.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Staff member not found');
      if (dto.fullName || dto.phone) await tx.user.update({ where: { id: existing.userId }, data: { fullName: dto.fullName, phone: dto.phone } });
      if (dto.isActive === false) await tx.user.update({ where: { id: existing.userId }, data: { status: 'DISABLED' } });
      if (dto.isActive === true) await tx.user.update({ where: { id: existing.userId }, data: { status: 'ACTIVE' } });
      const staff = await guardPrisma(tx.staffProfile.update({
        where: { id },
        data: { designation: dto.designation, departmentId: dto.departmentId, qualifications: dto.qualifications, isActive: dto.isActive },
        select: STAFF_SELECT,
      }));
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'staff.updated', entityType: 'staff', entityId: id, metadata: { ...dto } });
      return { staff, userId: existing.userId };
    });
    if (dto.isActive === false) await this.sessions.revokeAllForUser(a.schoolId, result.userId);
    return result.staff;
  }

  // ───────── Teaching assignments (subject teacher) ─────────
  @Post(':id/assignments')
  @RequirePermissions('assignments:manage')
  @ApiOperation({ summary: 'Assign this teacher to teach a subject to a section (current academic year of the section)' })
  assign(@CurrentSchoolActor() a: SchoolActor, @Param('id', ParseUUIDPipe) staffId: string, @Body() dto: CreateAssignmentDto) {
    return this.db.run(async (tx) => {
      const [staff, section] = await inSequence(
        () => tx.staffProfile.findUnique({ where: { id: staffId } }),
        () => tx.section.findUnique({ where: { id: dto.sectionId } })
      );
      if (!staff || !staff.isActive || staff.staffType !== 'TEACHING') throw new BadRequestException('Only active teaching staff can be assigned');
      if (!section) throw new NotFoundException('Section not found');
      const inCurriculum = await tx.gradeSubject.findFirst({
        where: { academicYearId: section.academicYearId, gradeId: section.gradeId, subjectId: dto.subjectId },
      });
      if (!inCurriculum) throw new BadRequestException('This subject is not in the curriculum for that class');
      const assignment = await guardPrisma(tx.teachingAssignment.create({
        data: { schoolId: a.schoolId, academicYearId: section.academicYearId, staffId, sectionId: section.id, subjectId: dto.subjectId },
      }));
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'teaching_assignment.created', entityType: 'staff', entityId: staffId, metadata: { ...dto } });
      return assignment;
    });
  }

  @Delete(':id/assignments/:assignmentId')
  @HttpCode(204)
  @RequirePermissions('assignments:manage')
  async unassign(@CurrentSchoolActor() a: SchoolActor, @Param('id', ParseUUIDPipe) staffId: string, @Param('assignmentId', ParseUUIDPipe) assignmentId: string) {
    await this.db.run(async (tx) => {
      const { count } = await tx.teachingAssignment.deleteMany({ where: { id: assignmentId, staffId } });
      if (!count) throw new NotFoundException();
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'teaching_assignment.deleted', entityType: 'staff', entityId: staffId, metadata: { assignmentId } });
    });
  }
}
