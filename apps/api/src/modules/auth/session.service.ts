import { Injectable } from '@nestjs/common';
import type { PlatformActor, SchoolActor } from '../../common/request-context.js';
import { loadConfig } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantDb } from '../../prisma/tenant-db.service.js';
import { AccessService } from '../access/access.service.js';
import { hashToken, newSessionToken } from './crypto.js';

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDb: TenantDb,
    private readonly access: AccessService,
  ) {}

  async createSchoolSession(schoolId: string, userId: string, meta: { ip?: string; userAgent?: string }) {
    const { token, tokenHash } = newSessionToken();
    const expiresAt = new Date(Date.now() + loadConfig().sessionTtlHours * 3_600_000);
    await this.tenantDb.runFor(schoolId, (tx) =>
      tx.session.create({ data: { schoolId, userId, tokenHash, expiresAt, ipAddress: meta.ip, userAgent: meta.userAgent } }),
    );
    return { token, expiresAt };
  }

  async resolveSchool(token: string): Promise<SchoolActor | null> {
    const tokenHash = hashToken(token);
    // Tenant is unknown until the session is found: resolve through the narrow
    // SECURITY DEFINER function, then continue strictly inside that tenant.
    const rows = await this.prisma.$queryRaw<{ session_id: string; user_id: string; school_id: string; expires_at: Date }[]>`
      SELECT session_id, user_id, school_id, expires_at FROM auth_resolve_session(${tokenHash})`;
    const row = rows[0];
    if (!row) return null;

    return this.tenantDb.runFor(row.school_id, async (tx) => {
      const actor = await this.access.loadSchoolActor(tx, { sessionId: row.session_id, userId: row.user_id, schoolId: row.school_id });
      if (!actor) return null;
      await tx.session.updateMany({
        where: { id: row.session_id, lastSeenAt: { lt: new Date(Date.now() - TOUCH_INTERVAL_MS) } },
        data: { lastSeenAt: new Date() },
      });
      return actor;
    });
  }

  async revokeSchoolSession(schoolId: string, sessionId: string) {
    await this.tenantDb.runFor(schoolId, (tx) =>
      tx.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } }),
    );
  }

  async revokeAllForUser(schoolId: string, userId: string, exceptSessionId?: string) {
    await this.tenantDb.runFor(schoolId, (tx) =>
      tx.session.updateMany({
        where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
        data: { revokedAt: new Date() },
      }),
    );
  }

  async createPlatformSession(platformAdminId: string, meta: { ip?: string; userAgent?: string }) {
    const { token, tokenHash } = newSessionToken();
    const expiresAt = new Date(Date.now() + loadConfig().platformSessionTtlHours * 3_600_000);
    await this.prisma.platformSession.create({
      data: { platformAdminId, tokenHash, expiresAt, ipAddress: meta.ip, userAgent: meta.userAgent },
    });
    return { token, expiresAt };
  }

  async resolvePlatform(token: string): Promise<PlatformActor | null> {
    const session = await this.prisma.platformSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { platformAdmin: true },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.platformAdmin.isActive) return null;
    return {
      kind: 'platform',
      sessionId: session.id,
      adminId: session.platformAdminId,
      email: session.platformAdmin.email,
      fullName: session.platformAdmin.fullName,
    };
  }

  async revokePlatformSession(sessionId: string) {
    await this.prisma.platformSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
