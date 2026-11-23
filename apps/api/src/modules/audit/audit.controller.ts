import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators.js';
import { PageQueryDto, paged } from '../../common/pagination.js';
import { TenantDb, inSequence } from '../../prisma/tenant-db.service.js';

@ApiTags('Audit')
@ApiCookieAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly db: TenantDb) {}

  @Get()
  @RequirePermissions('audit:read')
  list(@Query() q: PageQueryDto) {
    return this.db.run(async (tx) => {
      const [items, total] = await inSequence(
        () => tx.auditLog.findMany({ orderBy: { createdAt: 'desc' }, skip: q.skip, take: q.take }),
        () => tx.auditLog.count()
      );
      return paged(items, total, q);
    });
  }
}
