import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createNetworkApp, type NetworkApp } from '../network/app';

interface NetContext {
  base: string;
  network: NetworkApp;
}

interface Auth {
  cookie: string;
  token: string;
}

interface CallOptions {
  body?: unknown;
  auth?: Auth;
  headers?: Record<string, string>;
}

interface CallResult {
  status: number;
  headers: Headers;
  json: any;
  text: string;
}

async function withNetwork(fn: (ctx: NetContext) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'flakcrm-net-'));
  const network = createNetworkApp({
    registryPath: join(dir, 'registry.db'),
    tenantsDir: join(dir, 'tenants'),
    serveStatic: false,
  });
  const server = network.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  try {
    await fn({ base: `http://127.0.0.1:${port}`, network });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    network.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function call(
  ctx: NetContext,
  method: string,
  path: string,
  options: CallOptions = {},
): Promise<CallResult> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  let body: string | undefined;
  if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }
  if (options.auth) headers.Cookie = options.auth.cookie;
  const response = await fetch(`${ctx.base}${path}`, { method, headers, body });
  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: response.status, headers: response.headers, json, text };
}

function authFrom(response: CallResult): Auth {
  const setCookie = response.headers.getSetCookie().find((value) =>
    value.startsWith('flakcrm_session='),
  );
  assert.ok(setCookie, 'ожидалась сессионная cookie');
  const cookie = setCookie.split(';')[0];
  return { cookie, token: cookie.slice('flakcrm_session='.length) };
}

async function register(
  ctx: NetContext,
  input: Partial<{
    businessName: string;
    vertical: string;
    email: string;
    name: string;
    password: string;
  }> = {},
): Promise<{ response: CallResult; auth: Auth }> {
  const response = await call(ctx, 'POST', '/api/auth/register', {
    body: {
      businessName: 'Тестовый бизнес',
      vertical: 'restaurant',
      email: `owner${Date.now()}${Math.random().toString(16).slice(2)}@example.ru`,
      name: 'Владелец',
      password: 'secret123',
      ...input,
    },
  });
  assert.equal(response.status, 201, response.text);
  return { response, auth: authFrom(response) };
}

function errorCode(body: any): string | undefined {
  return body?.error?.code;
}

test('регистрация: сессия, cookie, отсутствие секретов и изоляция workspace', async () => {
  await withNetwork(async (ctx) => {
    const first = await register(ctx, {
      businessName: 'Первый ресторан',
      email: 'first@example.ru',
    });
    assert.equal(first.response.json.tenant.name, 'Первый ресторан');
    assert.equal(first.response.json.tenant.vertical, 'restaurant');
    assert.equal(first.response.json.account.email, 'first@example.ru');
    assert.ok(!first.response.text.includes('scrypt'));
    assert.ok(!first.response.text.includes('dbPath'));

    const setCookie = first.response.headers.getSetCookie()[0];
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.match(setCookie, /Path=\//);

    const unauthorized = await call(ctx, 'GET', '/api/v1/companies');
    assert.equal(unauthorized.status, 401);
    assert.equal(errorCode(unauthorized.json), 'UNAUTHORIZED');

    const meta = await call(ctx, 'GET', '/api/v1/meta', { auth: first.auth });
    assert.equal(meta.status, 200);
    assert.equal(meta.json.workspace.name, 'Первый ресторан');
    assert.equal(meta.json.currentUser.email, 'first@example.ru');

    const duplicate = await call(ctx, 'POST', '/api/auth/register', {
      body: {
        businessName: 'Другой',
        vertical: 'service',
        email: 'first@example.ru',
        name: 'Кто-то',
        password: 'secret123',
      },
    });
    assert.equal(duplicate.status, 409);
    assert.equal(errorCode(duplicate.json), 'EMAIL_TAKEN');

    const wrongPassword = await call(ctx, 'POST', '/api/auth/login', {
      body: { email: 'first@example.ru', password: 'wrong12345' },
    });
    assert.equal(wrongPassword.status, 401);
    assert.equal(errorCode(wrongPassword.json), 'INVALID_CREDENTIALS');

    const bearer = await call(ctx, 'GET', '/api/v1/meta', {
      headers: { Authorization: `Bearer ${first.auth.token}` },
    });
    assert.equal(bearer.status, 200);

    const second = await register(ctx, {
      businessName: 'Сервисный центр',
      vertical: 'service',
      email: 'second@example.ru',
    });

    const company = await call(ctx, 'POST', '/api/v1/companies', {
      auth: first.auth,
      body: { name: 'Клиент первого', domain: 'first-client.ru' },
    });
    assert.equal(company.status, 201);

    const firstCompanies = await call(ctx, 'GET', '/api/v1/companies', { auth: first.auth });
    assert.equal(firstCompanies.json.page.total, 1);
    const secondCompanies = await call(ctx, 'GET', '/api/v1/companies', { auth: second.auth });
    assert.equal(secondCompanies.json.page.total, 0);

    const secondMeta = await call(ctx, 'GET', '/api/v1/meta', { auth: second.auth });
    assert.equal(secondMeta.json.workspace.name, 'Сервисный центр');
  });
});

test('публичный сайт: публикация, заявка в CRM и защита черновика', async () => {
  await withNetwork(async (ctx) => {
    const owner = await register(ctx, {
      businessName: 'Тихий дворик',
      email: 'site@example.ru',
    });
    await register(ctx, {
      businessName: 'Другой бизнес',
      vertical: 'tourism',
      email: 'other@example.ru',
    });

    const draft = await call(ctx, 'GET', '/api/public/sites/testovyy-biznes');
    assert.equal(draft.status, 404);

    const profile = await call(ctx, 'PUT', '/api/network/site', {
      auth: owner.auth,
      body: {
        name: 'Тихий дворик',
        slug: 'tihiy-dvorik-test',
        tagline: 'Домашняя кухня',
        description: 'Готовим на дровах.',
        city: 'Нальчик',
        address: 'ул. Ленина, 24',
        phone: '+7 928 000-11-22',
        email: 'hello@example.ru',
        workingHours: '12:00–23:00',
        brandColor: '#b3541e',
        coverUrl: null,
      },
    });
    assert.equal(profile.status, 200, profile.text);
    assert.equal(profile.json.site.slug, 'tihiy-dvorik-test');
    assert.equal(profile.json.site.isPublished, false);

    const item = await call(ctx, 'POST', '/api/network/site/items', {
      auth: owner.auth,
      body: {
        name: 'Хычины',
        description: 'С сыром',
        priceMinor: 24000,
      },
    });
    assert.equal(item.status, 201, item.text);
    assert.equal(item.json.kind, 'dish');

    const hidden = await call(ctx, 'GET', '/api/public/sites/tihiy-dvorik-test');
    assert.equal(hidden.status, 404);

    const published = await call(ctx, 'POST', '/api/network/site/publish', {
      auth: owner.auth,
      body: { isPublished: true },
    });
    assert.equal(published.status, 200);
    assert.equal(published.json.isPublished, true);

    const publicSite = await call(ctx, 'GET', '/api/public/sites/tihiy-dvorik-test');
    assert.equal(publicSite.status, 200, publicSite.text);
    assert.equal(publicSite.json.name, 'Тихий дворик');
    assert.equal(publicSite.json.items.length, 1);
    assert.equal(publicSite.json.items[0].name, 'Хычины');

    const invalid = await call(
      ctx,
      'POST',
      '/api/public/sites/tihiy-dvorik-test/requests',
      {
        body: {
          guestName: 'Гость',
          phone: '+7 928 111-22-33',
          requestedDate: '2026-12-01',
          guests: 2,
        },
      },
    );
    assert.equal(invalid.status, 422);

    const request = await call(ctx, 'POST', '/api/public/sites/tihiy-dvorik-test/requests', {
      body: {
        guestName: 'Амина',
        phone: '+7 928 111-22-33',
        requestedDate: '2026-12-01',
        requestedTime: '19:30',
        guests: 4,
        comment: 'У окна',
      },
    });
    assert.equal(request.status, 201, request.text);
    assert.match(request.json.code, /^[A-Z0-9]{2}-[A-F0-9]{6}$/);

    const requests = await call(ctx, 'GET', '/api/network/requests', { auth: owner.auth });
    assert.equal(requests.status, 200);
    assert.equal(requests.json.length, 1);
    assert.equal(requests.json[0].guestName, 'Амина');
    assert.equal(requests.json[0].leadStatus, 'new');
    assert.equal(requests.json[0].itemId, null);

    const lead = await call(ctx, 'GET', `/api/v1/leads/${requests.json[0].leadId}`, {
      auth: owner.auth,
    });
    assert.equal(lead.status, 200);
    assert.equal(lead.json.source, 'website');
    assert.equal(lead.json.serviceType, 'restaurant');
    assert.match(lead.json.notes, /19:30/);

    const updated = await call(ctx, 'PATCH', `/api/network/requests/${requests.json[0].id}`, {
      auth: owner.auth,
      body: { status: 'contacted' },
    });
    assert.equal(updated.status, 200, updated.text);
    assert.equal(updated.json.leadStatus, 'contacted');

    const leadAfter = await call(ctx, 'GET', `/api/v1/leads/${requests.json[0].leadId}`, {
      auth: owner.auth,
    });
    assert.equal(leadAfter.json.status, 'contacted');

    const leaked = await call(ctx, 'GET', '/api/network/requests');
    assert.equal(leaked.status, 401);
  });
});

test('переключение бизнеса: доступ только к своим tenant и изолированные базы', async () => {
  await withNetwork(async (ctx) => {
    const owner = await register(ctx, {
      businessName: 'Первый',
      email: 'switch@example.ru',
    });

    const second = await call(ctx, 'POST', '/api/auth/tenants', {
      auth: owner.auth,
      body: { name: 'Второй', vertical: 'tourism' },
    });
    assert.equal(second.status, 201, second.text);
    assert.equal(second.json.slug, 'vtoroy');

    const me = await call(ctx, 'GET', '/api/auth/me', { auth: owner.auth });
    assert.equal(me.json.tenants.length, 2);
    assert.equal(me.json.tenant.name, 'Первый');

    const switched = await call(ctx, 'POST', '/api/auth/switch', {
      auth: owner.auth,
      body: { tenantId: second.json.id },
    });
    assert.equal(switched.status, 200, switched.text);
    assert.equal(switched.json.tenant.name, 'Второй');

    const meta = await call(ctx, 'GET', '/api/v1/meta', { auth: owner.auth });
    assert.equal(meta.json.workspace.name, 'Второй');

    const forbidden = await call(ctx, 'POST', '/api/auth/switch', {
      auth: owner.auth,
      body: { tenantId: 9999 },
    });
    assert.equal(forbidden.status, 403);
    assert.equal(errorCode(forbidden.json), 'FORBIDDEN');

    const site = await call(ctx, 'GET', '/api/network/site', { auth: owner.auth });
    assert.equal(site.status, 200);
    assert.equal(site.json.site.vertical, 'tourism');
  });
});
