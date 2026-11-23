import { createParamDecorator, type ExecutionContext, SetMetadata, UnauthorizedException } from '@nestjs/common';
import type { Permission } from '../modules/access/permissions.js';
import { RequestContext, type PlatformActor, type SchoolActor } from './request-context.js';

export const IS_PUBLIC = 'isPublic';
export const REQUIRED_PERMISSIONS = 'requiredPermissions';
export const AUDIENCE = 'audience';

/** Route needs no session. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route is for platform Super Admins only (separate session + cookie). */
export const PlatformOnly = () => SetMetadata(AUDIENCE, 'platform');

/** Module-level permission check. The user needs every listed permission (in any scope). */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(REQUIRED_PERMISSIONS, permissions);

export const CurrentSchoolActor = createParamDecorator((_: unknown, _ctx: ExecutionContext): SchoolActor => {
  const actor = RequestContext.actor();
  if (!actor || actor.kind !== 'school') throw new UnauthorizedException();
  return actor;
});

export const CurrentPlatformActor = createParamDecorator((_: unknown, _ctx: ExecutionContext): PlatformActor => {
  const actor = RequestContext.actor();
  if (!actor || actor.kind !== 'platform') throw new UnauthorizedException();
  return actor;
});
