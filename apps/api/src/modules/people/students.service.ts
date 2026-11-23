import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { SchoolActor } from '../../common/request-context.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Tx } from '../../prisma/tenant-db.service.js';
import { AccessScopeService } from '../access/access-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AdmitStudentDto, GuardianLinkDto } from './students.dto.js';

const day = (s?: string) => (s ? new Date(`${s.slice(0, 10)}T00:00:00Z`) : undefined);

export const STUDENT_LIST_SELECT = {
  id: true, admissionNumber: true, firstName: true, lastName: true, gender: true, dateOfBirth: true, status: true, admissionDate: true,
  enrollments: {
    where: { academicYear: { isCurrent: true } },
    select: { rollNumber: true, status: true, section: { select: { id: true, name: true, grade: { select: { id: true, name: true } } } } },
  },
} satisfies Prisma.StudentSelect;

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScopeService, private readonly audit: AuditService) {}

  /** Admission number: `<prefix><year>/<seq>`, serialized per school with an advisory lock. */
  async nextAdmissionNumber(tx: Tx, schoolId: string): Promise<string> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`admission:${schoolId}`}))`;
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { settings: true, code: true } });
    const prefix = String((school.settings as Record<string, unknown>).admissionNumberPrefix ?? school.code.slice(0, 4)).toUpperCase();
    const year = new Date().getUTCFullYear();
    const stem = `${prefix}${year}/`;
    const last = await tx.student.findFirst({ where: { admissionNumber: { startsWith: stem } }, orderBy: { admissionNumber: 'desc' }, select: { admissionNumber: true } });
    const seq = last ? Number.parseInt(last.admissionNumber.slice(stem.length), 10) + 1 : 1;
    return `${stem}${String(seq).padStart(4, '0')}`;
  }

  async admit(tx: Tx, actor: SchoolActor, dto: AdmitStudentDto) {
    const section = await tx.section.findUnique({ where: { id: dto.sectionId }, include: { _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } } } });
    if (!section) throw new NotFoundException('Section not found');
    if (section.capacity && section._count.enrollments >= section.capacity) throw new ConflictException('Section is at capacity');

    const admissionNumber = dto.admissionNumber?.toUpperCase() ?? (await this.nextAdmissionNumber(tx, actor.schoolId));
    const taken = await tx.student.findUnique({ where: { schoolId_admissionNumber: { schoolId: actor.schoolId, admissionNumber } } });
    if (taken) throw new ConflictException('Admission number already in use');

    const student = await tx.student.create({
      data: {
        schoolId: actor.schoolId, admissionNumber, firstName: dto.firstName, lastName: dto.lastName, dateOfBirth: day(dto.dateOfBirth)!, gender: dto.gender,
        bloodGroup: dto.bloodGroup, admissionDate: day(dto.admissionDate) ?? day(new Date().toISOString())!,
        addressLine1: dto.addressLine1, addressLine2: dto.addressLine2, city: dto.city, state: dto.state, postalCode: dto.postalCode,
      },
    });
    await tx.enrollment.create({
      data: { schoolId: actor.schoolId, studentId: student.id, academicYearId: section.academicYearId, sectionId: section.id, rollNumber: dto.rollNumber },
    });
    for (const link of dto.guardians ?? []) await this.linkGuardian(tx, actor, student.id, link);
    await this.audit.record(tx, { schoolId: actor.schoolId, action: 'student.admitted', entityType: 'student', entityId: student.id, metadata: { admissionNumber, sectionId: section.id } });
    return student;
  }

  async linkGuardian(tx: Tx, actor: SchoolActor, studentId: string, link: GuardianLinkDto) {
    let guardianId = link.guardianId;
    if (guardianId) {
      const g = await tx.guardian.findUnique({ where: { id: guardianId } });
      if (!g) throw new NotFoundException('Guardian not found');
    } else if (link.guardian) {
      const g = await tx.guardian.create({ data: { schoolId: actor.schoolId, ...link.guardian } });
      guardianId = g.id;
    } else {
      throw new BadRequestException('Provide guardianId or guardian details');
    }
    if (link.isPrimary) await tx.studentGuardian.updateMany({ where: { studentId }, data: { isPrimary: false } });
    const sg = await tx.studentGuardian.upsert({
      where: { studentId_guardianId: { studentId, guardianId } },
      create: { schoolId: actor.schoolId, studentId, guardianId, relationship: link.relationship, isPrimary: link.isPrimary ?? false, canPickup: link.canPickup ?? true },
      update: { relationship: link.relationship, isPrimary: link.isPrimary, canPickup: link.canPickup },
    });
    await this.audit.record(tx, { schoolId: actor.schoolId, action: 'student.guardian_linked', entityType: 'student', entityId: studentId, metadata: { guardianId } });
    return sg;
  }

  listWhere(actor: SchoolActor, f: { search?: string; gradeId?: string; sectionId?: string; status?: string }): Prisma.StudentWhereInput {
    const and: Prisma.StudentWhereInput[] = [this.scope.studentWhere(actor)];
    if (f.status) and.push({ status: f.status as Prisma.StudentWhereInput['status'] });
    if (f.sectionId || f.gradeId) {
      and.push({ enrollments: { some: { academicYear: { isCurrent: true }, ...(f.sectionId ? { sectionId: f.sectionId } : {}), ...(f.gradeId ? { section: { gradeId: f.gradeId } } : {}) } } });
    }
    if (f.search) {
      const s = f.search.trim();
      and.push({ OR: [
        { admissionNumber: { contains: s, mode: 'insensitive' } },
        { firstName: { contains: s, mode: 'insensitive' } },
        { lastName: { contains: s, mode: 'insensitive' } },
      ] });
    }
    return { AND: and };
  }
}
