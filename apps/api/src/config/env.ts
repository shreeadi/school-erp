/**
 * Typed, validated environment configuration. The process refuses to start
 * when a required value is missing, so misconfiguration fails fast.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`Environment variable ${name} must be an integer`);
  return n;
}

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  corsOrigins: string[];
  sessionTtlHours: number;
  platformSessionTtlHours: number;
  cookieSecure: boolean;
  maxFailedLogins: number;
  lockoutMinutes: number;
  enableJobs: boolean;
  loginRateLimitPerMinute: number;
  aiServiceUrl: string;
  aiServiceToken: string;
}

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  cached = {
    nodeEnv,
    isProduction,
    port: int('API_PORT', 4000),
    databaseUrl: required('DATABASE_URL'),
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    sessionTtlHours: int('SESSION_TTL_HOURS', 12),
    platformSessionTtlHours: int('PLATFORM_SESSION_TTL_HOURS', 4),
    cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProduction,
    maxFailedLogins: int('AUTH_MAX_FAILED_LOGINS', 5),
    lockoutMinutes: int('AUTH_LOCKOUT_MINUTES', 15),
    enableJobs: (process.env.ENABLE_JOBS ?? 'true') === 'true',
    loginRateLimitPerMinute: int('AUTH_LOGIN_RATE_LIMIT', 10),
    aiServiceUrl: process.env.AI_SERVICE_URL ?? 'http://localhost:8000',
    aiServiceToken: process.env.AI_SERVICE_TOKEN ?? '',
  };
  if (isProduction && cached.aiServiceToken.length < 32) {
    throw new Error('AI_SERVICE_TOKEN must be at least 32 characters in production');
  }
  return cached;
}

export const SESSION_COOKIE = 'erp_session';
export const PLATFORM_SESSION_COOKIE = 'erp_platform_session';
