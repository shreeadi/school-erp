import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentSchoolActor, RequirePermissions } from '../../common/decorators.js';
import { guardPrisma } from '../../common/errors.js';
import { paged, SearchPageQueryDto } from '../../common/pagination.js';
import type { SchoolActor } from '../../common/request-context.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { TenantDb, inSequence } from '../../prisma/tenant-db.service.js';
import { AccessScopeService } from '../access/access-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AccountsService } from './accounts.service.js';
import { CreateAccountDto, CreateGuardianDto, UpdateGuardianDto } from './students.dto.js';

@ApiTags('Guardians')
@ApiCookieAuth()
@Controller('guardians')
export class GuardiansController {
  constructor(
    private readonly db: TenantDb,
    private readonly scope: AccessScopeService,
    private readonly accounts: AccountsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('guardians:read')
  list(@CurrentSchoolActor() a: SchoolActor, @Query() q: SearchPageQueryDto) {
    const search = q.search;
    const where: Prisma.GuardianWhereInput = {
      AND: [
        this.scope.guardianWhere(a),
        search ? { OR: [{ fullName: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] } : {},
      ],
    };
    return this.db.run(async (tx) => {
      const [items, total] = await inSequence(
        () => tx.guardian.findMany({ where, orderBy: { fullName: 'asc' }, skip: q.skip, take: q.take, include: { _count: { select: { students: true } } } }),
        () => tx.guardian.count({ where })
      );
      return paged(items, total, q);
    });
  }

  @Get(':id')
  @RequirePermissions('guardians:read')
  get(@CurrentSchoolActor() a: SchoolActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.run(async (tx) => {
      const g = await tx.guardian.findFirst({
        where: { AND: [{ id }, this.scope.guardianWhere(a)] },
        include: {
          // Only children the caller may also see are listed.
          students: {
            where: { student: this.scope.studentWhere(a) },
            select: { relationship: true, isPrimary: true, student: { select: { id: true, admissionNumber: true, firstName: true, lastName: true, status: true } } },
          },
          user: { select: { id: true, email: true, status: true } },
        },
      });
      if (!g) throw new NotFoundException('Guardian not found');
      return g;
    });
  }

  @Post()
  @RequirePermissions('guardians:manage')
  create(@CurrentSchoolActor() a: SchoolActor, @Body() dto: CreateGuardianDto) {
    this.scope.requireAll(a, 'guardians:manage');
    return this.db.run(async (tx) => {
      const g = await tx.guardian.create({ data: { schoolId: a.schoolId, ...dto } });
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'guardian.created', entityType: 'guardian', entityId: g.id });
      return g;
    });
  }

  @Patch(':id')
  @RequirePermissions('guardians:manage')
  update(@CurrentSchoolActor() a: SchoolActor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGuardianDto) {
    this.scope.requireAll(a, 'guardians:manage');
    return this.db.run(async (tx) => {
      const g = await guardPrisma(tx.guardian.update({ where: { id }, data: dto }));
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'guardian.updated', entityType: 'guardian', entityId: id });
      return g;
    });
  }

  @Post(':id/account')
  @RequirePermissions('accounts:manage')
  @ApiOperation({ summary: 'Create the parent portal login (one account covers all linked children)' })
  createAccount(@CurrentSchoolActor() a: SchoolActor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateAccountDto) {
    return this.db.run(async (tx) => {
      const g = await tx.guardian.findUnique({ where: { id } });
      if (!g) throw new NotFoundException('Guardian not found');
      if (g.userId) throw new BadRequestException('Guardian already has an account');
      const { user, temporaryPassword } = await this.accounts.createUser(tx, {
        schoolId: a.schoolId, email: dto.email, fullName: g.fullName, phone: g.phone, userType: 'GUARDIAN', roleKeys: ['GUARDIAN'],
      });
      await tx.guardian.update({ where: { id }, data: { userId: user.id } });
      await this.audit.record(tx, { schoolId: a.schoolId, action: 'guardian.account_created', entityType: 'guardian', entityId: id });
      return { userId: user.id, email: user.email, temporaryPassword };
    });
  }
}
