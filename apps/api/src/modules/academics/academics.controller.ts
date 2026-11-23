import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentSchoolActor, RequirePermissions } from '../../common/decorators.js';
import { guardPrisma } from '../../common/errors.js';
import type { SchoolActor } from '../../common/request-context.js';
import { TenantDb, type Tx, inSequence } from '../../prisma/tenant-db.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  CreateAcademicYearDto, CreateDepartmentDto, CreateGradeDto, CreateSectionDto, CreateSubjectDto, SetCurriculumDto,
  UpdateAcademicYearDto, UpdateDepartmentDto, UpdateGradeDto, UpdateSectionDto, UpdateSubjectDto,
} from './dto.js';

const date = (s?: string) => (s ? new Date(`${s.slice(0, 10)}T00:00:00Z`) : undefined);

async function assertTeachingStaff(tx: Tx, staffId: string | null | undefined) {
  if (!staffId) return;
  const staff = await tx.staffProfile.findUnique({ where: { id: staffId } });
  if (!staff || !staff.isActive || staff.staffType !== 'TEACHING') throw new BadRequestException('Class teacher must be an active teaching staff member');
}

@ApiTags('Academic structure')
@ApiCookieAuth()
@Controller('academics')
export class AcademicsController {
  constructor(private readonly db: TenantDb, private readonly audit: AuditService) {}

  // ───────── Academic years ─────────
  @Get('years')
  @RequirePermissions('academics:read')
  listYears() {
    return this.db.run((tx) => tx.academicYear.findMany({ orderBy: { startDate: 'desc' } }));
  }

  @Post('years')
  @RequirePermissions('academics:manage')
  createYear(@CurrentSchoolActor() a: SchoolActor, @Body() dto: CreateAcademicYearDto) {
    if (date(dto.startDate)! >= date(dto.endDate)!) throw new BadRequestException('startDate must be before endDate');
    return this.db.run(async (tx) => {
      if (dto.isCurrent) await tx.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      const y = await guardPrisma(tx.academicYear.create({
        data: { schoolId: a.schoolId, name: dto.name, startDate: date(dto.startDate)!, endDate: date(dto.endDate)!, isCurrent: dto.isCurrent ?? false },
      }));
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'academic_year.created', entityType: 'academic_year', entityId: y.id });
      return y;
    });
  }

  @Patch('years/:id')
  @RequirePermissions('academics:manage')
  updateYear(@CurrentSchoolActor() a: SchoolActor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAcademicYearDto) {
    return this.db.run(async (tx) => {
      if (dto.isCurrent) await tx.academicYear.updateMany({ where: { isCurrent: true, id: { not: id } }, data: { isCurrent: false } });
      const y = await guardPrisma(tx.academicYear.update({
        where: { id }, data: { name: dto.name, startDate: date(dto.startDate), endDate: date(dto.endDate), isCurrent: dto.isCurrent },
      }));
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'academic_year.updated', entityType: 'academic_year', entityId: id });
      return y;
    });
  }

  // ───────── Grades (classes) ─────────
  @Get('grades')
  @RequirePermissions('academics:read')
  listGrades() {
    return this.db.run((tx) => tx.grade.findMany({ orderBy: { sortOrder: 'asc' } }));
  }

  @Post('grades')
  @RequirePermissions('academics:manage')
  createGrade(@CurrentSchoolActor() a: SchoolActor, @Body() dto: CreateGradeDto) {
    return this.db.run(async (tx) => {
      const g = await guardPrisma(tx.grade.create({ data: { schoolId: a.schoolId, name: dto.name, code: dto.code.toUpperCase(), sortOrder: dto.sortOrder ?? 0 } }));
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'grade.created', entityType: 'grade', entityId: g.id });
      return g;
    });
  }

  @Patch('grades/:id')
  @RequirePermissions('academics:manage')
  updateGrade(@CurrentSchoolActor() a: SchoolActor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGradeDto) {
    return this.db.run(async (tx) => {
      const g = await guardPrisma(tx.grade.update({ where: { id }, data: { name: dto.name, code: dto.code?.toUpperCase(), sortOrder: dto.sortOrder } }));
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'grade.updated', entityType: 'grade', entityId: id });
      return g;
    });
  }

  // ───────── Sections ─────────
  @Get('sections')
  @RequirePermissions('academics:read')
  @ApiQuery({ name: 'academicYearId', required: false, description: 'Defaults to the current academic year' })
  @ApiQuery({ name: 'gradeId', required: false })
  listSections(@Query('academicYearId') academicYearId?: string, @Query('gradeId') gradeId?: string) {
    return this.db.run((tx) =>
      tx.section.findMany({
        where: {
          ...(academicYearId ? { academicYearId } : { academicYear: { isCurrent: true } }),
          ...(gradeId ? { gradeId } : {}),
        },
        orderBy: [{ grade: { sortOrder: 'asc' } }, { name: 'asc' }],
        include: {
          grade: { select: { id: true, name: true, code: true } },
          classTeacher: { select: { id: true, employeeCode: true, user: { select: { fullName: true } } } },
          _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
        },
      }),
    );
  }

  @Post('sections')
  @RequirePermissions('academics:manage')
  createSection(@CurrentSchoolActor() a: SchoolActor, @Body() dto: CreateSectionDto) {
    return this.db.run(async (tx) => {
      await assertTeachingStaff(tx, dto.classTeacherId);
      const s = await guardPrisma(tx.section.create({ data: { schoolId: a.schoolId, ...dto } }));
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'section.created', entityType: 'section', entityId: s.id });
      return s;
    });
  }

  @Patch('sections/:id')
  @RequirePermissions('academics:manage')
  updateSection(@CurrentSchoolActor() a: SchoolActor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSectionDto) {
    return this.db.run(async (tx) => {
      await assertTeachingStaff(tx, dto.classTeacherId);
      const s = await guardPrisma(tx.section.update({ where: { id }, data: dto }));
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'section.updated', entityType: 'section', entityId: id, metadata: { ...dto } });
      return s;
    });
  }

  // ───────── Departments ─────────
  @Get('departments')
  @RequirePermissions('academics:read')
  listDepartments() {
    return this.db.run((tx) =>
      tx.department.findMany({
        orderBy: { name: 'asc' },
        include: { head: { select: { id: true, user: { select: { fullName: true } } } }, _count: { select: { members: true, subjects: true } } },
      }),
    );
  }

  @Post('departments')
  @RequirePermissions('academics:manage')
  createDepartment(@CurrentSchoolActor() a: SchoolActor, @Body() dto: CreateDepartmentDto) {
    return this.db.run(async (tx) => {
      await assertTeachingStaff(tx, dto.headId);
      const d = await guardPrisma(tx.department.create({ data: { schoolId: a.schoolId, ...dto } }));
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'department.created', entityType: 'department', entityId: d.id });
      return d;
    });
  }

  @Patch('departments/:id')
  @RequirePermissions('academics:manage')
  updateDepartment(@CurrentSchoolActor() a: SchoolActor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDepartmentDto) {
    return this.db.run(async (tx) => {
      await assertTeachingStaff(tx, dto.headId);
      const d = await guardPrisma(tx.department.update({ where: { id }, data: dto }));
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'department.updated', entityType: 'department', entityId: id });
      return d;
    });
  }

  // ───────── Subjects ─────────
  @Get('subjects')
  @RequirePermissions('academics:read')
  listSubjects() {
    return this.db.run((tx) => tx.subject.findMany({ orderBy: { name: 'asc' }, include: { department: { select: { id: true, name: true } } } }));
  }

  @Post('subjects')
  @RequirePermissions('academics:manage')
  createSubject(@CurrentSchoolActor() a: SchoolActor, @Body() dto: CreateSubjectDto) {
    return this.db.run(async (tx) => {
      const s = await guardPrisma(tx.subject.create({ data: { schoolId: a.schoolId, ...dto, code: dto.code.toUpperCase() } }));
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'subject.created', entityType: 'subject', entityId: s.id });
      return s;
    });
  }

  @Patch('subjects/:id')
  @RequirePermissions('academics:manage')
  updateSubject(@CurrentSchoolActor() a: SchoolActor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSubjectDto) {
    return this.db.run(async (tx) => {
      const s = await guardPrisma(tx.subject.update({ where: { id }, data: { ...dto, code: dto.code?.toUpperCase() } }));
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'subject.updated', entityType: 'subject', entityId: id });
      return s;
    });
  }

  // ───────── Curriculum ─────────
  @Get('curriculum')
  @RequirePermissions('academics:read')
  @ApiQuery({ name: 'gradeId', required: true })
  @ApiQuery({ name: 'academicYearId', required: false })
  getCurriculum(@Query('gradeId', ParseUUIDPipe) gradeId: string, @Query('academicYearId') academicYearId?: string) {
    return this.db.run((tx) =>
      tx.gradeSubject.findMany({
        where: { gradeId, ...(academicYearId ? { academicYearId } : { academicYear: { isCurrent: true } }) },
        include: { subject: true, gradingScale: { select: { id: true, name: true } } },
        orderBy: { subject: { name: 'asc' } },
      }),
    );
  }

  @Put('curriculum')
  @RequirePermissions('academics:manage')
  @ApiOperation({ summary: 'Replace the subjects a grade studies in an academic year' })
  setCurriculum(@CurrentSchoolActor() a: SchoolActor, @Body() dto: SetCurriculumDto) {
    return this.db.run(async (tx) => {
      const [year, grade] = await inSequence(
        () => tx.academicYear.findUnique({ where: { id: dto.academicYearId } }),
        () => tx.grade.findUnique({ where: { id: dto.gradeId } })
      );
      if (!year || !grade) throw new NotFoundException('Academic year or grade not found');
      await tx.gradeSubject.deleteMany({ where: { academicYearId: dto.academicYearId, gradeId: dto.gradeId } });
      await guardPrisma(tx.gradeSubject.createMany({
        data: dto.subjects.map((s) => ({ schoolId: a.schoolId, academicYearId: dto.academicYearId, gradeId: dto.gradeId, ...s })),
      }));
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'curriculum.set', entityType: 'grade', entityId: dto.gradeId, metadata: { academicYearId: dto.academicYearId, subjects: dto.subjects.length } });
      return tx.gradeSubject.findMany({ where: { academicYearId: dto.academicYearId, gradeId: dto.gradeId }, include: { subject: true } });
    });
  }
}
