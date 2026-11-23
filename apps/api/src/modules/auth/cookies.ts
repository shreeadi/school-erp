import type { Response } from 'express';
import { loadConfig } from '../../config/env.js';

export function setSessionCookie(res: Response, name: string, token: string, expiresAt: Date) {
  res.cookie(name, token, {
    httpOnly: true,
    secure: loadConfig().cookieSecure,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response, name: string) {
  res.clearCookie(name, { httpOnly: true, secure: loadConfig().cookieSecure, sameSite: 'lax', path: '/' });
}
