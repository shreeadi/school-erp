import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { loadConfig } from '../config/env.js';

/**
 * The raw Prisma client, connected as the restricted runtime role.
 *
 * Only platform tables (schools, platform admins/sessions) can be read through
 * it directly. Every tenant table is protected by RLS, so querying it outside
 * TenantDb.run() returns no rows and inserts fail. That is deliberate.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: loadConfig().databaseUrl }) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
