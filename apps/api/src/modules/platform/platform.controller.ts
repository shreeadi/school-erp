import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentPlatformActor, PlatformOnly, Public } from '../../common/decorators.js';
import type { PlatformActor } from '../../common/request-context.js';
import { loadConfig, PLATFORM_SESSION_COOKIE } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantDb, inSequence } from '../../prisma/tenant-db.service.js';
import { AuditService } from '../audit/audit.service.js';
import { clearSessionCookie, setSessionCookie } from '../auth/cookies.js';
import { verifyPassword } from '../auth/crypto.js';
import { PlatformLoginDto } from '../auth/dto.js';
import { SessionService } from '../auth/session.service.js';
import { CreateSchoolDto, UpdateSchoolStatusDto } from './dto.js';
import { ProvisioningService } from './provisioning.service.js';

/**
 * Platform (Super Admin) API. Uses its own accounts table, session table and
 * cookie, so a school session can never reach these routes and vice versa.
 */
@ApiTags('Platform (Super Admin)')
@ApiCookieAuth()
@PlatformOnly()
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly db: TenantDb,
    private readonly sessions: SessionService,
    private readonly provisioning: ProvisioningService,
    private readonly audit: AuditService,
  ) {}

  @Post('auth/login')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: () => loadConfig().loginRateLimitPerMinute, ttl: 60_000 } })
  async login(@Body() dto: PlatformLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { email: dto.email } });
    const ok = (await verifyPassword(admin?.passwordHash, dto.password)) && admin?.isActive;
    if (!admin || !ok) throw new UnauthorizedException('Invalid email or password');
    await this.prisma.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    const { token, expiresAt } = await this.sessions.createPlatformSession(admin.id, { ip: req.ip, userAgent: req.header('user-agent')?.slice(0, 255) });
    setSessionCookie(res, PLATFORM_SESSION_COOKIE, token, expiresAt);
    return { expiresAt };
  }

  @Post('auth/logout')
  @HttpCode(204)
  async logout(@CurrentPlatformActor() actor: PlatformActor, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revokePlatformSession(actor.sessionId);
    clearSessionCookie(res, PLATFORM_SESSION_COOKIE);
  }

  @Get('auth/me')
  me(@CurrentPlatformActor() actor: PlatformActor) {
    return { id: actor.adminId, email: actor.email, fullName: actor.fullName };
  }

  @Get('schools')
  @ApiOperation({ summary: 'All schools with live record counts' })
  async listSchools() {
    const schools = await this.prisma.school.findMany({ orderBy: { createdAt: 'asc' } });
    return Promise.all(schools.map(async (s) => ({ ...s, stats: await this.statsFor(s.id) })));
  }

  @Get('schools/:id')
  async getSchool(@Param('id', ParseUUIDPipe) id: string) {
    const school = await this.prisma.school.findUnique({ where: { id } });
    if (!school) throw new NotFoundException();
    return { ...school, stats: await this.statsFor(id) };
  }

  @Post('schools')
  @ApiOperation({ summary: 'Provision a new school with system roles, board templates and a School Admin' })
  async createSchool(@Body() dto: CreateSchoolDto) {
    const result = await this.provisioning.provisionSchool(dto);
    return { school: result.school, admin: { userId: result.adminUserId, email: dto.admin.email, temporaryPassword: result.temporaryPassword } };
  }

  @Patch('schools/:id/status')
  async setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSchoolStatusDto) {
    const school = await this.prisma.school.update({ where: { id }, data: { status: dto.status } });
    await this.db.runFor(id, (tx) => this.audit.record(tx, { schoolId: id, action: 'school.status_changed', entityType: 'school', entityId: id, metadata: { status: dto.status } }));
    return school;
  }

  /** Counts are read inside the school's own tenant context, one school at a time. */
  private statsFor(schoolId: string) {
    return this.db.runFor(schoolId, async (tx) => {
      const [students, staff, guardians, sections] = await inSequence(
        () => tx.student.count({ where: { status: 'ACTIVE' } }),
        () => tx.staffProfile.count({ where: { isActive: true } }),
        () => tx.guardian.count(),
        () => tx.section.count({ where: { academicYear: { isCurrent: true } } })
      );
      return { students, staff, guardians, sections };
    });
  }
}
