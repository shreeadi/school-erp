import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';

/** OWASP-recommended Argon2id parameters (m=19 MiB, t=2, p=1). */
const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string | null | undefined, password: string): Promise<boolean> {
  if (!hash) {
    // Spend comparable time when the account doesn't exist, to blunt user enumeration.
    await argon2.hash(password, ARGON2_OPTIONS);
    return false;
  }
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/** 256-bit opaque session token. Only its SHA-256 is stored. */
export function newSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Human-typeable temporary password for newly created accounts. */
export function temporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(14);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out.slice(0, 7)}-${out.slice(7)}`;
}

export const PASSWORD_POLICY = {
  minLength: 10,
  description: 'At least 10 characters, including a letter and a digit',
  test: (pw: string) => pw.length >= 10 && pw.length <= 128 && /[A-Za-z]/.test(pw) && /\d/.test(pw),
};
