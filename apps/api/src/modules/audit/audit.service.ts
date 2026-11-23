import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { RequestContext } from '../../common/request-context.js';
import type { Tx } from '../../prisma/tenant-db.service.js';

/**
 * Append-only audit trail. Written inside the same tenant transaction as the
 * change it records, so a change and its audit entry commit or roll back together.
 */
@Injectable()
export class AuditService {
  async record(
    tx: Tx,
    entry: { schoolId: string; action: string; entityType: string; entityId?: string; metadata?: Prisma.InputJsonValue; actorUserId?: string | null },
  ) {
    const ctx = RequestContext.get();
    const actor = ctx?.actor;
    await tx.auditLog.create({
      data: {
        schoolId: entry.schoolId,
        actorUserId: entry.actorUserId !== undefined ? entry.actorUserId : actor?.kind === 'school' ? actor.userId : null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: {
          ...(typeof entry.metadata === 'object' && entry.metadata !== null && !Array.isArray(entry.metadata) ? entry.metadata : {}),
          ...(actor?.kind === 'platform' ? { platformAdminId: actor.adminId } : {}),
          requestId: ctx?.requestId,
        },
        ipAddress: ctx?.ip,
      },
    });
  }
}
