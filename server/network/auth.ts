import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { Db } from '../db';
import { ApiError, parse, route } from '../http';
import type { SessionInfo } from '../../shared/network';
import {
  createAccount,
  createSession,
  deleteSession,
  findAccountByEmail,
  resolveSession,
  switchSessionTenant,
  tenantsForAccount,
  type SessionContext,
  type Tenant,
} from './registry';
import type { TenantStore } from './tenant';
import { provisionTenant } from './provision';
import { loginSchema, registerSchema, tenantCreateSchema } from './schemas';

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltValue, hashValue] = stored.split('$');
  if (scheme !== 'scrypt' || !saltValue || !hashValue) return false;
  const salt = Buffer.from(saltValue, 'base64url');
  const expected = Buffer.from(hashValue, 'base64url');
  if (!expected.length) return false;
  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const COOKIE_NAME = 'flakcrm_session';

function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name && value) result[name] = decodeURIComponent(value);
  }
  return result;
}

export function requestToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || null;
  return parseCookies(req.headers.cookie)[COOKIE_NAME] ?? null;
}

function setSessionCookie(
  res: Response,
  token: string,
  expiresAt: string,
  secure: boolean,
): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    expires: new Date(expiresAt),
  });
}

function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', path: '/', secure });
}

export function publicSession(context: SessionContext): SessionInfo {
  return {
    account: {
      id: context.account.id,
      email: context.account.email,
      name: context.account.name,
    },
    tenant: {
      id: context.tenant.id,
      slug: context.tenant.slug,
      name: context.tenant.name,
      vertical: context.tenant.vertical,
    },
    tenants: context.tenants.map(({ id, slug, name, vertical }) => ({
      id,
      slug,
      name,
      vertical,
    })),
  };
}

export function requireSession(
  registry: Db,
  store: TenantStore,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const token = requestToken(req);
    const context = token ? resolveSession(registry, token) : null;
    if (!context) {
      next(new ApiError(401, 'UNAUTHORIZED', 'Войдите в систему.'));
      return;
    }
    res.locals.session = context;
    res.locals.sessionToken = token;
    try {
      store.run(context.tenant, context.account, next);
    } catch (error) {
      next(error);
    }
  };
}

interface AuthOptions {
  registry: Db;
  store: TenantStore;
  tenantsDir: string;
  cookieSecure: boolean;
}

const attempts = new Map<string, { count: number; resetAt: number }>();
const ATTEMPT_LIMIT = 10;
const ATTEMPT_WINDOW = 15 * 60_000;

function attemptKey(req: Request, email: string): string {
  return `${req.ip ?? 'local'}:${email.toLowerCase()}`;
}

function tooManyAttempts(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (entry.resetAt <= Date.now()) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= ATTEMPT_LIMIT;
}

function registerFailure(key: string): void {
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= Date.now()) {
    attempts.set(key, { count: 1, resetAt: Date.now() + ATTEMPT_WINDOW });
    return;
  }
  entry.count += 1;
}

export function authRouter({ registry, store, tenantsDir, cookieSecure }: AuthOptions): Router {
  const router = Router();

  router.post(
    '/register',
    route(async (req, res) => {
      const input = parse(registerSchema, req.body);
      if (findAccountByEmail(registry, input.email)) {
        throw new ApiError(409, 'EMAIL_TAKEN', 'Аккаунт с таким email уже существует.');
      }
      const passwordHash = await hashPassword(input.password);
      const account = createAccount(registry, {
        email: input.email,
        name: input.name,
        passwordHash,
      });

      let tenant: Tenant;
      try {
        tenant = provisionTenant(registry, store, tenantsDir, account, {
          name: input.businessName,
          vertical: input.vertical,
        });
      } catch (error) {
        registry.prepare('DELETE FROM account WHERE id = ?').run(account.id);
        throw error;
      }

      const session = createSession(registry, account.id, tenant.id);
      setSessionCookie(res, session.token, session.expiresAt, cookieSecure);
      res.status(201).json(
        publicSession({
          account,
          tenant,
          tenants: tenantsForAccount(registry, account.id),
        }),
      );
    }),
  );

  router.post(
    '/login',
    route(async (req, res) => {
      const input = parse(loginSchema, req.body);
      const key = attemptKey(req, input.email);
      if (tooManyAttempts(key)) {
        throw new ApiError(
          429,
          'TOO_MANY_ATTEMPTS',
          'Слишком много попыток входа. Попробуйте через 15 минут.',
        );
      }
      const account = findAccountByEmail(registry, input.email);
      if (!account || !(await verifyPassword(input.password, account.passwordHash))) {
        registerFailure(key);
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль.');
      }
      attempts.delete(key);
      const tenants = tenantsForAccount(registry, account.id);
      const tenant = tenants[0];
      if (!tenant) {
        throw new ApiError(403, 'NO_BUSINESS', 'У аккаунта нет подключённого бизнеса.');
      }
      registry.prepare('DELETE FROM session WHERE expires_at <= ?').run(new Date().toISOString());
      const session = createSession(registry, account.id, tenant.id);
      setSessionCookie(res, session.token, session.expiresAt, cookieSecure);
      res.json(
        publicSession({
          account,
          tenant,
          tenants,
        }),
      );
    }),
  );

  router.post(
    '/logout',
    route((req, res) => {
      const token = requestToken(req);
      if (token) deleteSession(registry, token);
      clearSessionCookie(res, cookieSecure);
      res.status(204).end();
    }),
  );

  router.get(
    '/me',
    requireSession(registry, store),
    route((_req, res) => {
      res.json(publicSession(res.locals.session as SessionContext));
    }),
  );

  router.post(
    '/switch',
    requireSession(registry, store),
    route((req, res) => {
      const session = res.locals.session as SessionContext;
      const tenantId = Number((req.body as { tenantId?: unknown } | null)?.tenantId);
      if (!Number.isInteger(tenantId)) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Укажите бизнес.');
      }
      const tenant = session.tenants.find((item) => item.id === tenantId);
      if (!tenant) {
        throw new ApiError(403, 'FORBIDDEN', 'Нет доступа к этому бизнесу.');
      }
      switchSessionTenant(registry, res.locals.sessionToken as string, tenant.id);
      res.json(
        publicSession({
          account: session.account,
          tenant,
          tenants: session.tenants,
        }),
      );
    }),
  );

  router.post(
    '/tenants',
    requireSession(registry, store),
    route((req, res) => {
      const session = res.locals.session as SessionContext;
      const input = parse(tenantCreateSchema, req.body);
      const tenant = provisionTenant(registry, store, tenantsDir, session.account, input);
      res.status(201).json({
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        vertical: tenant.vertical,
      });
    }),
  );

  router.all(['/register', '/login', '/logout', '/switch', '/tenants'], (req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'Метод не поддерживается для этого маршрута.'));
  });
  router.all('/me', (_req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'Метод не поддерживается для этого маршрута.'));
  });

  return router;
}

export function getSession(res: Response): SessionContext {
  const session = res.locals.session as SessionContext | undefined;
  if (!session) throw new ApiError(401, 'UNAUTHORIZED', 'Войдите в систему.');
  return session;
}
