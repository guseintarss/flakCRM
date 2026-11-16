import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { openDatabase, type Db } from '../db';
import { seedDatabase } from '../seed';
import { createApp } from '../app';

export interface TestContext {
  base: string;
  db: Db;
}

export interface ApiResponse<T = any> {
  status: number;
  headers: Headers;
  json: T;
  text: string;
}

export interface RequestOptions {
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
}

export async function withApp(fn: (ctx: TestContext) => Promise<void>): Promise<void> {
  const db = openDatabase(':memory:');
  seedDatabase(db, { demo: false });
  const app = createApp(db, { serveStatic: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  try {
    await fn({ base: `http://127.0.0.1:${port}`, db });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  }
}

export async function api<T = any>(
  ctx: TestContext,
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const headers = { ...(options.headers ?? {}) };
  let body: string | undefined;
  if (options.rawBody !== undefined) {
    body = options.rawBody;
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }
  }
  const response = await fetch(`${ctx.base}${path}`, { method, headers, body });
  const text = await response.text();
  let json: T = undefined as T;
  try {
    json = JSON.parse(text) as T;
  } catch {
    json = undefined as T;
  }
  return { status: response.status, headers: response.headers, json, text };
}

export async function createCompany(
  ctx: TestContext,
  overrides: Record<string, unknown> = {},
): Promise<any> {
  const response = await api(ctx, 'POST', '/api/v1/companies', {
    body: { name: 'Acme', domain: 'acme.ru', ...overrides },
  });
  if (response.status !== 201) {
    throw new Error(`Не удалось создать компанию: ${response.status} ${response.text}`);
  }
  return response.json;
}

export async function createContact(
  ctx: TestContext,
  companyId: number,
  overrides: Record<string, unknown> = {},
): Promise<any> {
  const response = await api(ctx, 'POST', '/api/v1/contacts', {
    body: {
      firstName: 'Иван',
      lastName: 'Петров',
      email: `ivan${Date.now()}${Math.random().toString(16).slice(2)}@acme.ru`,
      companyId,
      ...overrides,
    },
  });
  if (response.status !== 201) {
    throw new Error(`Не удалось создать контакт: ${response.status} ${response.text}`);
  }
  return response.json;
}

export async function createDeal(
  ctx: TestContext,
  companyId: number,
  overrides: Record<string, unknown> = {},
): Promise<any> {
  const response = await api(ctx, 'POST', '/api/v1/deals', {
    body: {
      title: 'Внедрение CRM',
      amountMinor: 100_000_00,
      currency: 'RUB',
      serviceType: 'consulting',
      companyId,
      ...overrides,
    },
  });
  if (response.status !== 201) {
    throw new Error(`Не удалось создать сделку: ${response.status} ${response.text}`);
  }
  return response.json;
}
