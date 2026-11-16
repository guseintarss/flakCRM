import { AsyncLocalStorage } from 'node:async_hooks';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { nowIso, openDatabase, type Db } from '../db';
import { seedDatabase } from '../seed';
import { config } from '../config';
import type { Account, Tenant } from './registry';

export interface TenantStore {
  /** Прокси, который внутри запроса указывает на базу активного бизнеса. */
  readonly db: Db;
  open(tenant: Tenant): Db;
  run<T>(tenant: Tenant, account: Account | null, fn: () => T): T;
  current(): Db;
  close(): void;
}

/**
 * Базы бизнесов открываются лениво и кэшируются по пути файла.
 * AsyncLocalStorage позволяет существующим роутерам CRM работать без
 * передачи базы в каждый обработчик: они получают прокси на старте.
 */
export function createTenantStore(tenantsDir: string): TenantStore {
  mkdirSync(tenantsDir, { recursive: true });
  const cache = new Map<string, Db>();
  const storage = new AsyncLocalStorage<Db>();

  const db = new Proxy({} as Db, {
    get(_target, property) {
      const active = storage.getStore();
      if (!active) {
        throw new Error('База бизнеса запрошена вне контекста запроса.');
      }
      const value = Reflect.get(active, property);
      return typeof value === 'function' ? value.bind(active) : value;
    },
  });

  function current(): Db {
    const active = storage.getStore();
    if (!active) throw new Error('База бизнеса запрошена вне контекста запроса.');
    return active;
  }

  function syncIdentity(database: Db, tenant: Tenant, account: Account): void {
    syncTenantIdentity(database, tenant, account);
  }

  function open(tenant: Tenant): Db {
    const cached = cache.get(tenant.dbPath);
    if (cached) return cached;

    mkdirSync(tenantsDir, { recursive: true });
    const database = openDatabase(tenant.dbPath);
    seedDatabase(database, { demo: false });
    cache.set(tenant.dbPath, database);
    return database;
  }

  function run<T>(tenant: Tenant, account: Account | null, fn: () => T): T {
    const fresh = !cache.has(tenant.dbPath);
    const database = open(tenant);
    if (fresh && account) syncIdentity(database, tenant, account);
    return storage.run(database, fn);
  }

  function close(): void {
    for (const database of cache.values()) {
      try {
        database.close();
      } catch {
        // База могла быть уже закрыта.
      }
    }
    cache.clear();
  }

  return { db, open, run, current, close };
}

export function tenantDatabasePath(tenantsDir: string, tenantId: number): string {
  return join(tenantsDir, `tenant-${tenantId}.db`);
}

export function newTenantDatabasePath(tenantsDir: string): string {
  return join(tenantsDir, `tenant-${randomBytes(8).toString('hex')}.db`);
}

export function syncTenantIdentity(database: Db, tenant: Tenant, account: Account): void {
  const timestamp = nowIso();
  database
    .prepare('UPDATE workspace SET name = ?, timezone = ?, updated_at = ? WHERE id = 1')
    .run(tenant.name, config.workspaceTimezone, timestamp);
  database
    .prepare('UPDATE app_user SET name = ?, email = ?, timezone = ?, updated_at = ? WHERE id = 1')
    .run(account.name, account.email, config.workspaceTimezone, timestamp);
}
