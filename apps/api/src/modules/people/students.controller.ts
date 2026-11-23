import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentSchoolActor, RequirePermissions } from '../../common/decorators.js';
import { guardPrisma } from '../../common/errors.js';
import { paged, StudentQueryDto } from '../../common/pagination.js';
import type { SchoolActor } from '../../common/request-context.js';
import { TenantDb, inSequence } from '../../prisma/tenant-db.service.js';
import { AccessScopeService } from '../access/access-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AccountsService } from './accounts.service.js';
import { AdmitStudentDto, CreateAccountDto, EnrollDto, GuardianLinkDto, UpdateStudentDto } from './students.dto.js';
import { STUDENT_LIST_SELECT, StudentsService } from './students.service.js';

const day = (s?: string) => (s ? new Date(`${s.slice(0, 10)}T00:00:00Z`) : undefined);

@ApiTags('Students')
@ApiCookieAuth()
@Controller('students')
export class StudentsController {
  constructor(
    private readonly db: TenantDb,
    private readonly scope: AccessScopeService,
    private readonly students: StudentsService,
    private readonly accounts: AccountsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('students:read')
  @ApiOperation({ summary: 'Students visible to the caller (all / assigned sections / linked children / self)' })
  list(@CurrentSchoolActor() a: SchoolActor, @Query() q: StudentQueryDto) {
    const where = this.students.listWhere(a, q);
    return this.db.run(async (tx) => {
      const [items, total] = await inSequence(
        () => tx.student.findMany({ where, select: STUDENT_LIST_SELECT, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }], skip: q.skip, take: q.take }),
        () => tx.student.count({ where })
      );
      return paged(items, total, q);
    });
  }

  @Get(':id')
  @RequirePermissions('students:read')
  get(@CurrentSchoolActor() a: SchoolActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.run(async (tx) => {
      const student = await tx.student.findFirst({
        where: { AND: [{ id }, this.scope.studentWhere(a)] },
        include: {
          enrollments: {
            orderBy: { academicYear: { startDate: 'desc' } },
            select: { id: true, rollNumber: true, status: true, academicYear: { select: { id: true, name: true, isCurrent: true } }, section: { select: { id: true, name: true, grade: { select: { id: true, name: true } } } } },
          },
          guardians: { select: { relationship: true, isPrimary: true, canPickup: true, guardian: { select: { id: true, fullName: true, phone: true, email: true, occupation: true } } } },
          user: { select: { id: true, email: true, status: true } },
        },
      });
      if (!student) throw new NotFoundException('Student not found');
      return student;
    });
  }

  @Post()
  @RequirePermissions('students:manage')
  @ApiOperation({ summary: 'Admit a student: record, enrollment and guardians in one transaction' })
  admit(@CurrentSchoolActor() a: SchoolActor, @Body() dto: AdmitStudentDto) {
    this.scope.requireAll(a, 'students:manage');
    return this.db.run((tx) => this.students.admit(tx, a, dto));
  }

  @Patch(':id')
  @RequirePermissions('students:manage')
  update(@CurrentSchoolActor() a: SchoolActor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStudentDto) {
    this.scope.requireAll(a, 'students:manage');
    return this.db.run(async (tx) => {
      const student = await guardPrisma(tx.student.update({
        where: { id },
        data: { ...dto, dateOfBirth: day(dto.dateOfBirth) },
      }));
      if (dto.status === 'TRANSFERRED' || dto.status === 'WITHDRAWN') {
        await tx.enrollment.updateMany({ where: { studentId: id, status: 'ACTIVE' }, data: { status: dto.status } });
        if (student.userId) await tx.user.update({ where: { id: student.userId }, data: { status: 'DISABLED' } });
      }
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'student.updated', entityType: 'student', entityId: id, metadata: { fields: Object.keys(dto) } });
      return student;
    });
  }

  @Post(':id/enrollment')
  @RequirePermissions('students:manage')
  @ApiOperation({ summary: 'Enrol in, or move to, a section. One enrollment per academic year.' })
  enroll(@CurrentSchoolActor() a: SchoolActor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EnrollDto) {
    this.scope.requireAll(a, 'students:manage');
    return this.db.run(async (tx) => {
      const [student, section] = await inSequence(() => tx.student.findUnique({ where: { id } }), () => tx.section.findUnique({ where: { id: dto.sectionId } }));
      if (!student || !section) throw new NotFoundException();
      const e = await tx.enrollment.upsert({
        where: { studentId_academicYearId: { studentId: id, academicYearId: section.academicYearId } },
        create: { schoolId: a.schoolId, studentId: id, academicYearId: section.academicYearId, sectionId: section.id, rollNumber: dto.rollNumber },
        update: { sectionId: section.id, rollNumber: dto.rollNumber, status: 'ACTIVE' },
      });
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'student.enrolled', entityType: 'student', entityId: id, metadata: { sectionId: section.id } });
      return e;
    });
  }

  @Post(':id/guardians')
  @RequirePermissions('guardians:manage')
  linkGuardian(@CurrentSchoolActor() a: SchoolActor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GuardianLinkDto) {
    this.scope.requireAll(a, 'guardians:manage');
    return this.db.run(async (tx) => {
      const student = await tx.student.findUnique({ where: { id } });
      if (!student) throw new NotFoundException('Student not found');
      return this.students.linkGuardian(tx, a, id, dto);
    });
  }

  @Delete(':id/guardians/:guardianId')
  @HttpCode(204)
  @RequirePermissions('guardians:manage')
  async unlinkGuardian(@CurrentSchoolActor() a: SchoolActor, @Param('id', ParseUUIDPipe) id: string, @Param('guardianId', ParseUUIDPipe) guardianId: string) {
    this.scope.requireAll(a, 'guardians:manage');
    await this.db.run(async (tx) => {
      const { count } = await tx.studentGuardian.deleteMany({ where: { studentId: id, guardianId } });
      if (!count) throw new NotFoundException();
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'student.guardian_unlinked', entityType: 'student', entityId: id, metadata: { guardianId } });
    });
  }

  @Post(':id/account')
  @RequirePermissions('accounts:manage')
  @ApiOperation({ summary: 'Create the student\'s portal login. Returns a one-time temporary password.' })
  createAccount(@CurrentSchoolActor() a: SchoolActor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateAccountDto) {
    return this.db.run(async (tx) => {
      const student = await tx.student.findUnique({ where: { id } });
      if (!student) throw new NotFoundException('Student not found');
      if (student.userId) throw new BadRequestException('Student already has an account');
      const { user, temporaryPassword } = await this.accounts.createUser(tx, {
        schoolId: a.schoolId, email: dto.email, fullName: [student.firstName, student.lastName].filter(Boolean).join(' '), userType: 'STUDENT', roleKeys: ['STUDENT'],
      });
      await tx.student.update({ where: { id }, data: { userId: user.id } });
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'student.account_created', entityType: 'student', entityId: id });
      return { userId: user.id, email: user.email, temporaryPassword };
    });
  }
}
