import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { UserType } from '../../generated/prisma/enums.js';
import type { Tx } from '../../prisma/tenant-db.service.js';
import { hashPassword, temporaryPassword } from '../auth/crypto.js';

/** Creates portal login accounts and attaches the matching system role. */
@Injectable()
export class AccountsService {
  async createUser(
    tx: Tx,
    input: { schoolId: string; email: string; fullName: string; phone?: string; userType: UserType; roleKeys: string[]; password?: string },
  ) {
    const email = input.email.trim().toLowerCase();
    const existing = await tx.user.findUnique({ where: { schoolId_email: { schoolId: input.schoolId, email } } });
    if (existing) throw new ConflictException('A user with this email already exists in this school');
    const password = input.password ?? temporaryPassword();
    const user = await tx.user.create({
      data: { schoolId: input.schoolId, email, fullName: input.fullName, phone: input.phone, userType: input.userType, passwordHash: await hashPassword(password) },
    });
    if (input.roleKeys.length) {
      const roles = await tx.role.findMany({ where: { key: { in: input.roleKeys } } });
      if (roles.length !== input.roleKeys.length) throw new NotFoundException('Unknown role');
      await tx.userRole.createMany({ data: roles.map((r) => ({ schoolId: input.schoolId, userId: user.id, roleId: r.id })) });
    }
    return { user, temporaryPassword: input.password ? undefined : password };
  }
}
