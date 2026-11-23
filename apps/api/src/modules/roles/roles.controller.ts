import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID, Length, Matches, ValidateNested } from 'class-validator';
import { CurrentSchoolActor, RequirePermissions } from '../../common/decorators.js';
import { guardPrisma } from '../../common/errors.js';
import type { SchoolActor } from '../../common/request-context.js';
import { PermissionScope } from '../../generated/prisma/enums.js';
import { TenantDb, inSequence } from '../../prisma/tenant-db.service.js';
import { isPermission, PERMISSIONS } from '../access/permissions.js';
import { LOCKED_ROLE_KEYS } from '../access/system-roles.js';
import { AuditService } from '../audit/audit.service.js';

class PermissionGrantDto {
  @ApiProperty({ example: 'students:read' }) @IsString() permission: string;
  @ApiProperty({ enum: PermissionScope }) @IsEnum(PermissionScope) scope: PermissionScope;
}

class SetPermissionsDto {
  @ApiProperty({ type: [PermissionGrantDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => PermissionGrantDto)
  grants: PermissionGrantDto[];
}

class CreateRoleDto {
  @ApiProperty({ example: 'FRONT_OFFICE' }) @Matches(/^[A-Z][A-Z0-9_]{2,40}$/) key: string;
  @ApiProperty() @IsString() @Length(2, 80) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 300) description?: string;
}

class AssignRoleDto {
  @ApiProperty() @IsUUID() roleId: string;
}

@ApiTags('Roles & permissions')
@ApiCookieAuth()
@Controller()
export class RolesController {
  constructor(private readonly db: TenantDb, private readonly audit: AuditService) {}

  @Get('permissions')
  @RequirePermissions('roles:read')
  @ApiOperation({ summary: 'Permission catalog' })
  catalog() {
    return Object.entries(PERMISSIONS).map(([key, description]) => ({ key, module: key.split(':')[0], description }));
  }

  @Get('roles')
  @RequirePermissions('roles:read')
  list() {
    return this.db.run((tx) =>
      tx.role.findMany({
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
        include: { permissions: { select: { permission: true, scope: true } }, _count: { select: { userRoles: true } } },
      }),
    );
  }

  @Post('roles')
  @RequirePermissions('roles:manage')
  create(@CurrentSchoolActor() actor: SchoolActor, @Body() dto: CreateRoleDto) {
    return this.db.run(async (tx) => {
      const role = await guardPrisma(tx.role.create({ data: { schoolId: actor.schoolId, key: dto.key, name: dto.name, description: dto.description } }));
      await this.audit.record(tx, { schoolId: actor.schoolId, action: 'role.created', entityType: 'role', entityId: role.id });
      return role;
    });
  }

  @Put('roles/:id/permissions')
  @RequirePermissions('roles:manage')
  @ApiOperation({ summary: 'Replace a role\'s permissions' })
  setPermissions(@CurrentSchoolActor() actor: SchoolActor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetPermissionsDto) {
    for (const g of dto.grants) if (!isPermission(g.permission)) throw new BadRequestException(`Unknown permission ${g.permission}`);
    return this.db.run(async (tx) => {
      const role = await tx.role.findUnique({ where: { id } });
      if (!role) throw new NotFoundException('Role not found');
      if (LOCKED_ROLE_KEYS.has(role.key)) throw new ForbiddenException(`${role.name} permissions cannot be changed`);
      // No privilege escalation: you can only grant what you hold yourself, in that scope.
      for (const g of dto.grants) {
        const held = actor.permissions.get(g.permission);
        if (!held || !(held.has(g.scope) || held.has('ALL'))) throw new ForbiddenException(`You cannot grant ${g.permission} (${g.scope})`);
      }
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      const unique = new Map(dto.grants.map((g) => [g.permission, g]));
      await tx.rolePermission.createMany({
        data: [...unique.values()].map((g) => ({ schoolId: actor.schoolId, roleId: id, permission: g.permission, scope: g.scope })),
      });
      await this.audit.record(tx, { schoolId: actor.schoolId, action: 'role.permissions_set', entityType: 'role', entityId: id, metadata: { grants: [...unique.values()].map((g) => `${g.permission}@${g.scope}`) } });
      return tx.role.findUnique({ where: { id }, include: { permissions: { select: { permission: true, scope: true } } } });
    });
  }

  @Post('users/:userId/roles')
  @RequirePermissions('roles:manage')
  assign(@CurrentSchoolActor() actor: SchoolActor, @Param('userId', ParseUUIDPipe) userId: string, @Body() dto: AssignRoleDto) {
    return this.db.run(async (tx) => {
      const [user, role] = await inSequence(() => tx.user.findUnique({ where: { id: userId } }), () => tx.role.findUnique({ where: { id: dto.roleId } }));
      if (!user || !role) throw new NotFoundException();
      if (role.key === 'SCHOOL_ADMIN' && !actor.roles.includes('SCHOOL_ADMIN')) throw new ForbiddenException('Only a School Admin can appoint a School Admin');
      const ur = await guardPrisma(tx.userRole.create({ data: { schoolId: actor.schoolId, userId, roleId: role.id } }));
      await this.audit.record(tx, { schoolId: actor.schoolId, action: 'user.role_assigned', entityType: 'user', entityId: userId, metadata: { role: role.key } });
      return ur;
    });
  }

  @Delete('users/:userId/roles/:roleId')
  @HttpCode(204)
  @RequirePermissions('roles:manage')
  async unassign(@CurrentSchoolActor() actor: SchoolActor, @Param('userId', ParseUUIDPipe) userId: string, @Param('roleId', ParseUUIDPipe) roleId: string) {
    await this.db.run(async (tx) => {
      const role = await tx.role.findUnique({ where: { id: roleId } });
      if (!role) throw new NotFoundException();
      if (role.key === 'SCHOOL_ADMIN') {
        const admins = await tx.userRole.count({ where: { roleId } });
        if (admins <= 1) throw new BadRequestException('A school must keep at least one School Admin');
      }
      const { count } = await tx.userRole.deleteMany({ where: { userId, roleId } });
      if (!count) throw new NotFoundException();
      await this.audit.record(tx, { schoolId: actor.schoolId, action: 'user.role_removed', entityType: 'user', entityId: userId, metadata: { role: role.key } });
    });
  }
}
