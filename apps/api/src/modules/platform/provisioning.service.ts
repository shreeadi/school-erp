import { ConflictException, Injectable } from '@nestjs/common';
import type { Board } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantDb, type Tx } from '../../prisma/tenant-db.service.js';
import { expandGrants, SYSTEM_ROLES } from '../access/system-roles.js';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword, temporaryPassword } from '../auth/crypto.js';
import { templateFor } from './board-templates.js';

export interface ProvisionSchoolInput {
  code: string;
  name: string;
  board: Board;
  boardName?: string;
  city?: string;
  state?: string;
  applyBoardTemplate?: boolean;
  admin: { fullName: string; email: string; password?: string };
}

@Injectable()
export class ProvisioningService {
  constructor(private readonly prisma: PrismaService, private readonly db: TenantDb, private readonly audit: AuditService) {}

  /** Creates a school, its system roles, optional board templates, and its first School Admin. */
  async provisionSchool(input: ProvisionSchoolInput) {
    const exists = await this.prisma.school.findUnique({ where: { code: input.code } });
    if (exists) throw new ConflictException('School code already in use');

    const school = await this.prisma.school.create({
      data: {
        code: input.code, name: input.name, board: input.board, boardName: input.boardName, city: input.city, state: input.state,
        settings: { admissionNumberPrefix: input.code.slice(0, 4), attendanceMode: 'DAILY' },
      },
    });

    const password = input.admin.password ?? temporaryPassword();
    try {
      const adminUserId = await this.db.runFor(school.id, async (tx) => {
        const roleIds = await this.createSystemRoles(tx, school.id);
        if (input.applyBoardTemplate !== false) await this.applyBoardTemplate(tx, school.id, input.board);
        const admin = await tx.user.create({
          data: {
            schoolId: school.id, email: input.admin.email.toLowerCase(), fullName: input.admin.fullName,
            userType: 'STAFF', passwordHash: await hashPassword(password),
          },
        });
        await tx.userRole.create({ data: { schoolId: school.id, userId: admin.id, roleId: roleIds.get('SCHOOL_ADMIN')! } });
        await this.audit.record(tx, { schoolId: school.id, actorUserId: null, action: 'school.provisioned', entityType: 'school', entityId: school.id });
        return admin.id;
      }, { timeoutMs: 30_000 });
      return { school, adminUserId, temporaryPassword: input.admin.password ? undefined : password };
    } catch (err) {
      await this.prisma.school.delete({ where: { id: school.id } }).catch(() => undefined);
      throw err;
    }
  }

  async createSystemRoles(tx: Tx, schoolId: string): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    for (const def of SYSTEM_ROLES) {
      const role = await tx.role.create({
        data: { schoolId, key: def.key, name: def.name, description: def.description, isSystem: true },
      });
      await tx.rolePermission.createMany({
        data: expandGrants(def.grants).map((g) => ({ schoolId, roleId: role.id, permission: g.permission, scope: g.scope })),
      });
      ids.set(def.key, role.id);
    }
    return ids;
  }

  async applyBoardTemplate(tx: Tx, schoolId: string, board: Board) {
    const t = templateFor(board);
    if (!t) return;
    const scale = await tx.gradingScale.create({
      data: { schoolId, name: t.gradingScale.name, type: t.gradingScale.type, passPercent: t.gradingScale.passPercent, isDefault: true },
    });
    await tx.gradingBand.createMany({
      data: t.gradingScale.bands.map((b, i) => ({
        schoolId, gradingScaleId: scale.id, label: b.label, minPercent: b.min, maxPercent: b.max, gradePoint: b.point, remark: b.remark, sortOrder: i,
      })),
    });
    await tx.examCategory.createMany({
      data: t.examCategories.map((c, i) => ({
        schoolId, name: c.name, code: c.code, weightage: c.weightage, defaultMaxMarks: c.maxMarks, passingMarks: c.passing, isInternal: c.internal ?? false, sortOrder: i,
      })),
    });
  }
}
