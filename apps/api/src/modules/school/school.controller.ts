import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, Length } from 'class-validator';
import { CurrentSchoolActor, RequirePermissions } from '../../common/decorators.js';
import type { SchoolActor } from '../../common/request-context.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantDb, inSequence } from '../../prisma/tenant-db.service.js';
import { AuditService } from '../audit/audit.service.js';

class UpdateSchoolDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 120) boardName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 80) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 80) state?: string;
  @ApiProperty({ required: false, description: 'School-specific settings, merged into existing settings' })
  @IsOptional() @IsObject() settings?: Record<string, unknown>;
}

const ALLOWED_SETTING_KEYS = new Set(['admissionNumberPrefix', 'attendanceMode', 'workingDays', 'periodsPerDay', 'reportCardTemplate', 'promotionPolicy']);

@ApiTags('School')
@ApiCookieAuth()
@Controller('school')
export class SchoolController {
  constructor(private readonly prisma: PrismaService, private readonly db: TenantDb, private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('school.settings:read')
  get(@CurrentSchoolActor() actor: SchoolActor) {
    return this.prisma.school.findUniqueOrThrow({ where: { id: actor.schoolId } });
  }

  @Patch()
  @RequirePermissions('school.settings:manage')
  async update(@CurrentSchoolActor() actor: SchoolActor, @Body() dto: UpdateSchoolDto) {
    const current = await this.prisma.school.findUniqueOrThrow({ where: { id: actor.schoolId } });
    const settings = { ...(current.settings as Record<string, unknown>) };
    for (const [k, v] of Object.entries(dto.settings ?? {})) if (ALLOWED_SETTING_KEYS.has(k)) settings[k] = v;
    const updated = await this.prisma.school.update({
      where: { id: actor.schoolId },
      data: { name: dto.name, boardName: dto.boardName, city: dto.city, state: dto.state, settings: settings as Prisma.InputJsonValue },
    });
    await this.db.run((tx) => this.audit.record(tx, { schoolId: actor.schoolId, action: 'school.updated', entityType: 'school', entityId: actor.schoolId }));
    return updated;
  }

  @Get('overview')
  @RequirePermissions('dashboard:read')
  @ApiOperation({ summary: 'Management overview computed from live records' })
  overview() {
    return this.db.run(async (tx) => {
      const year = await tx.academicYear.findFirst({ where: { isCurrent: true } });
      const [students, teachingStaff, nonTeachingStaff, guardians, grades, sections, subjects, byGrade, recentAdmissions] = await inSequence(
        () => tx.student.count({ where: { status: 'ACTIVE' } }),
        () => tx.staffProfile.count({ where: { isActive: true, staffType: 'TEACHING' } }),
        () => tx.staffProfile.count({ where: { isActive: true, staffType: 'NON_TEACHING' } }),
        () => tx.guardian.count(),
        () => tx.grade.count(),
        () => tx.section.count({ where: { academicYearId: year?.id ?? '00000000-0000-0000-0000-000000000000' } }),
        () => tx.subject.count(),
        () => tx.grade.findMany({
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true, name: true,
            sections: { where: { academicYearId: year?.id ?? '00000000-0000-0000-0000-000000000000' }, select: { _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } } } },
          },
        }),
        () => tx.student.findMany({
          orderBy: { admissionDate: 'desc' }, take: 5,
          select: { id: true, admissionNumber: true, firstName: true, lastName: true, admissionDate: true },
        })
      );
      return {
        academicYear: year ? { id: year.id, name: year.name } : null,
        counts: { students, teachingStaff, nonTeachingStaff, guardians, grades, sections, subjects },
        enrollmentByGrade: byGrade.map((g) => ({
          gradeId: g.id, grade: g.name, sections: g.sections.length,
          students: g.sections.reduce((n, s) => n + s._count.enrollments, 0),
        })),
        recentAdmissions,
      };
    });
  }
}
