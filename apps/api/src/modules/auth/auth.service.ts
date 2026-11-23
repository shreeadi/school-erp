import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { SchoolActor } from '../../common/request-context.js';
import { loadConfig } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantDb, inSequence } from '../../prisma/tenant-db.service.js';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword, PASSWORD_POLICY, verifyPassword } from './crypto.js';
import type { ChangePasswordDto, LoginDto } from './dto.js';
import { SessionService } from './session.service.js';

const INVALID = 'Invalid school code, email or password';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly db: TenantDb,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto, meta: { ip?: string; userAgent?: string }) {
    const cfg = loadConfig();
    // The tenant is derived from the school code on the server, never from an id sent by the client.
    const school = await this.prisma.school.findUnique({ where: { code: dto.schoolCode }, select: { id: true, status: true } });
    if (!school || school.status !== 'ACTIVE') {
      await verifyPassword(null, dto.password);
      throw new UnauthorizedException(INVALID);
    }

    const outcome = await this.db.runFor(school.id, async (tx) => {
      const user = await tx.user.findUnique({ where: { schoolId_email: { schoolId: school.id, email: dto.email } } });
      if (!user) {
        await verifyPassword(null, dto.password);
        return { ok: false as const };
      }
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return { ok: false as const, locked: true };
      }
      const valid = user.status === 'ACTIVE' && (await verifyPassword(user.passwordHash, dto.password));
      if (!valid) {
        const failed = user.failedLoginCount + 1;
        const lock = failed >= cfg.maxFailedLogins;
        await tx.user.update({
          where: { id: user.id },
          data: { failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + cfg.lockoutMinutes * 60_000) : null },
        });
        await this.audit.record(tx, {
          schoolId: school.id, actorUserId: user.id, action: lock ? 'auth.locked' : 'auth.login_failed', entityType: 'user', entityId: user.id,
        });
        return { ok: false as const, locked: lock };
      }
      await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
      await this.audit.record(tx, { schoolId: school.id, actorUserId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id });
      return { ok: true as const, userId: user.id };
    });

    if (!outcome.ok) {
      throw new UnauthorizedException(outcome.locked ? `Too many failed attempts. Try again in ${cfg.lockoutMinutes} minutes.` : INVALID);
    }
    return this.sessions.createSchoolSession(school.id, outcome.userId, meta);
  }

  async logout(actor: SchoolActor) {
    await this.sessions.revokeSchoolSession(actor.schoolId, actor.sessionId);
  }

  async me(actor: SchoolActor) {
    return this.db.run(async (tx) => {
      const school = await this.prisma.school.findUniqueOrThrow({
        where: { id: actor.schoolId },
        select: { id: true, code: true, name: true, board: true, boardName: true, timezone: true, locale: true },
      });
      // Teacher sub-roles come from real assignments in the current academic year.
      let teaching = null;
      const staffId = actor.staffId;
      if (staffId) {
        const [classTeacherOf, assignments, headOf] = await inSequence(
          () => tx.section.findMany({
            where: { classTeacherId: staffId, academicYear: { isCurrent: true } },
            select: { id: true, name: true, grade: { select: { name: true } } },
          }),
          () => tx.teachingAssignment.findMany({
            where: { staffId, academicYear: { isCurrent: true } },
            select: { section: { select: { id: true, name: true, grade: { select: { name: true } } } }, subject: { select: { id: true, name: true } } },
          }),
          () => tx.department.findMany({ where: { headId: staffId }, select: { id: true, name: true } })
        );
        teaching = {
          isClassTeacher: classTeacherOf.length > 0,
          isSubjectTeacher: assignments.length > 0,
          isHeadOfDepartment: headOf.length > 0,
          classTeacherOf: classTeacherOf.map((s) => ({ sectionId: s.id, label: `${s.grade.name} ${s.name}` })),
          subjects: assignments.map((a) => ({ sectionId: a.section.id, label: `${a.section.grade.name} ${a.section.name}`, subjectId: a.subject.id, subject: a.subject.name })),
          headOf,
        };
      }
      return {
        user: { id: actor.userId, email: actor.email, fullName: actor.fullName, userType: actor.userType },
        school,
        roles: actor.roles,
        permissions: Object.fromEntries([...actor.permissions].map(([p, s]) => [p, [...s]])),
        staffId: actor.staffId,
        studentId: actor.studentId,
        guardianId: actor.guardianId,
        teaching,
      };
    });
  }

  async changePassword(actor: SchoolActor, dto: ChangePasswordDto) {
    if (!PASSWORD_POLICY.test(dto.newPassword)) throw new BadRequestException(PASSWORD_POLICY.description);
    await this.db.run(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: actor.userId } });
      if (!(await verifyPassword(user.passwordHash, dto.currentPassword))) throw new UnauthorizedException('Current password is incorrect');
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(dto.newPassword) } });
      await this.audit.record(tx, { schoolId: actor.schoolId, action: 'auth.password_changed', entityType: 'user', entityId: user.id });
    });
    await this.sessions.revokeAllForUser(actor.schoolId, actor.userId, actor.sessionId);
  }
}
