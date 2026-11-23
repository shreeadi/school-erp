import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AUDIENCE, IS_PUBLIC, REQUIRED_PERMISSIONS } from '../../common/decorators.js';
import { RequestContext } from '../../common/request-context.js';
import { loadConfig, PLATFORM_SESSION_COOKIE, SESSION_COOKIE } from '../../config/env.js';
import type { Permission } from '../access/permissions.js';
import { SessionService } from './session.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function bearer(req: Request): string | undefined {
  const h = req.header('authorization');
  return h?.startsWith('Bearer ') ? h.slice(7).trim() : undefined;
}

/**
 * Global guard: resolves the session, attaches the actor to the request
 * context, separates platform and school audiences, and enforces module-level
 * permissions. Record-level checks happen in the services.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const req = context.switchToHttp().getRequest<Request>();
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const audience = this.reflector.getAllAndOverride<'platform' | undefined>(AUDIENCE, targets) ?? 'school';
    const cookieName = audience === 'platform' ? PLATFORM_SESSION_COOKIE : SESSION_COOKIE;
    const cookieToken: string | undefined = req.cookies?.[cookieName];
    const token = bearer(req) ?? cookieToken;
    if (!token) throw new UnauthorizedException('Not signed in');

    // CSRF defence for cookie-authenticated writes: the Origin must be one we serve.
    if (cookieToken && !bearer(req) && !SAFE_METHODS.has(req.method)) {
      const origin = req.header('origin');
      if (origin && !loadConfig().corsOrigins.includes(origin)) throw new ForbiddenException('Cross-origin request refused');
    }

    const store = RequestContext.get();
    if (!store) throw new UnauthorizedException();

    if (audience === 'platform') {
      const actor = await this.sessions.resolvePlatform(token);
      if (!actor) throw new UnauthorizedException('Session expired');
      store.actor = actor;
      return true;
    }

    const actor = await this.sessions.resolveSchool(token);
    if (!actor) throw new UnauthorizedException('Session expired');
    store.actor = actor;

    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(REQUIRED_PERMISSIONS, targets) ?? [];
    const missing = required.filter((p) => !actor.permissions.has(p));
    if (missing.length) throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`);
    return true;
  }
}
