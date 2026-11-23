import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccessModule } from './modules/access/access.module.js';
import { AcademicsModule } from './modules/academics/academics.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { PeopleModule } from './modules/people/people.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';
import { RolesModule } from './modules/roles/roles.module.js';
import { SchoolModule } from './modules/school/school.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

/**
 * Modular monolith. Each feature module owns its controllers and services and
 * talks to others only through exported providers, so a module can later be
 * extracted into its own service without rewriting callers.
 */
@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuditModule,
    AccessModule,
    AuthModule,
    PlatformModule,
    SchoolModule,
    RolesModule,
    AcademicsModule,
    PeopleModule,
    JobsModule.register(),
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
