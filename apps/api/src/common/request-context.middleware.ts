import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { RequestContext } from './request-context.js';

/** Opens an AsyncLocalStorage scope for the whole request lifecycle. */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', requestId);
  RequestContext.run({ requestId, ip: req.ip, userAgent: req.header('user-agent')?.slice(0, 255) }, () => next());
}
