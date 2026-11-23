import { createHmac } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { SchoolActor } from '../../common/request-context.js';
import { loadConfig } from '../../config/env.js';

/**
 * Calls the Python AI service on behalf of a signed-in user. The tenant
 * context is signed here, from the server-side session, so the AI service can
 * trust the school id without ever seeing a browser request.
 */
@Injectable()
export class AiClientService {
  signContext(actor: SchoolActor, ttlSeconds = 30): string {
    const payload = { schoolId: actor.schoolId, userId: actor.userId, roles: actor.roles, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const mac = createHmac('sha256', loadConfig().aiServiceToken).update(body).digest('base64url');
    return `${body}.${mac}`;
  }

  async get<T>(actor: SchoolActor, path: string): Promise<T> {
    const cfg = loadConfig();
    const res = await fetch(`${cfg.aiServiceUrl}${path}`, {
      headers: { authorization: `Bearer ${cfg.aiServiceToken}`, 'x-tenant-context': this.signContext(actor) },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!res?.ok) throw new ServiceUnavailableException('AI service unavailable');
    return (await res.json()) as T;
  }
}
