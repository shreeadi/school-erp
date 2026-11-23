import { BullModule, InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { loadConfig } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export const MAINTENANCE_QUEUE = 'maintenance';

@Processor(MAINTENANCE_QUEUE)
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);
  constructor(private readonly prisma: PrismaService) { super(); }

  async process(job: Job) {
    if (job.name === 'purge-sessions') {
      const rows = await this.prisma.$queryRaw<{ n: number }[]>`SELECT auth_purge_expired_sessions() AS n`;
      this.logger.log(`Purged ${rows[0]?.n ?? 0} expired sessions`);
      return rows[0]?.n ?? 0;
    }
  }
}

@Injectable()
export class MaintenanceScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue) {}
  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler('purge-sessions-hourly', { every: 60 * 60 * 1000 }, { name: 'purge-sessions' });
  }
}

/** BullMQ background processing. Later phases add notification, report-card and AI-ingestion queues here. */
@Module({})
export class JobsModule {
  static register() {
    if (!loadConfig().enableJobs) return { module: JobsModule };
    const url = new URL(loadConfig().redisUrl);
    return {
      module: JobsModule,
      imports: [
        BullModule.forRoot({
          connection: { host: url.hostname, port: Number(url.port || 6379), password: url.password || undefined, db: Number(url.pathname.slice(1) || 0) },
          defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500, attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
        }),
        BullModule.registerQueue({ name: MAINTENANCE_QUEUE }),
      ],
      providers: [MaintenanceProcessor, MaintenanceScheduler],
    };
  }
}
