import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';

process.env.ENABLE_JOBS = 'false';
process.env.AUTH_LOGIN_RATE_LIMIT = '1000';

export const PASSWORD = 'Demo@12345';

export interface TestServer { app: INestApplication; base: string }

export async function startServer(): Promise<TestServer> {
  const { createApp } = await import('../src/bootstrap.js');
  const app = await createApp({ logger: false });
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { app, base: `http://127.0.0.1:${port}` };
}

export class Client {
  cookie = '';
  constructor(private readonly base: string) {}

  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    const set = res.headers.getSetCookie();
    if (set.length) this.cookie = set.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');
    const text = await res.text();
    let json: any = undefined;
    try { json = text ? JSON.parse(text) : undefined; } catch { json = text; }
    return { status: res.status, body: json };
  }
  get(path: string) { return this.req('GET', `/api/v1${path}`); }
  post(path: string, body?: unknown) { return this.req('POST', `/api/v1${path}`, body ?? {}); }
  patch(path: string, body: unknown) { return this.req('PATCH', `/api/v1${path}`, body); }
  put(path: string, body: unknown) { return this.req('PUT', `/api/v1${path}`, body); }

  async login(schoolCode: string, email: string, password = PASSWORD) {
    const r = await this.post('/auth/login', { schoolCode, email, password });
    if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.body)}`);
    return this;
  }
}

export async function loginAs(base: string, schoolCode: string, email: string) {
  return new Client(base).login(schoolCode, email);
}
