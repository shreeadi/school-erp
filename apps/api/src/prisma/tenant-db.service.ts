import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { RequestContext } from '../common/request-context.js';
import { PrismaService } from './prisma.service.js';

export type Tx = Prisma.TransactionClient;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs work inside a transaction bound to one school.
 *
 * `set_config('app.current_school_id', <id>, true)` is transaction-local, so the
 * tenant can never leak to another request through a pooled connection.
 */
@Injectable()
export class TenantDb {
  constructor(private readonly prisma: PrismaService) {}

  /** Run as the tenant of the signed-in school user. */
  run<T>(fn: (tx: Tx) => Promise<T>, options?: { timeoutMs?: number }): Promise<T> {
    const actor = RequestContext.actor();
    if (!actor || actor.kind !== 'school') {
      throw new ForbiddenException('A school session is required');
    }
    return this.runFor(actor.schoolId, fn, options);
  }

  /**
   * Run for an explicit school. Only for code paths where the school was
   * established server-side: login (school looked up by code), platform
   * provisioning by an authenticated Super Admin, background jobs, seeding.
   */
  async runFor<T>(schoolId: string, fn: (tx: Tx) => Promise<T>, options?: { timeoutMs?: number }): Promise<T> {
    if (!UUID_RE.test(schoolId)) throw new ForbiddenException('Invalid tenant');
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_school_id', ${schoolId}, true)`;
        return fn(tx);
      },
      { timeout: options?.timeoutMs ?? 15_000, maxWait: 5_000 },
    );
  }
}

/**
 * Run several queries on one transaction one after another. A transaction holds
 * a single connection, so issuing them concurrently (Promise.all) gains nothing
 * and is deprecated by node-postgres.
 */
export async function inSequence<T extends readonly (() => PromiseLike<unknown>)[]>(
  ...fns: T
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const out: unknown[] = [];
  for (const fn of fns) out.push(await fn());
  return out as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
}
