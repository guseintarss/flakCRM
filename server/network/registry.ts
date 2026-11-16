import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import type { Vertical } from '../../shared/site';
import { nowIso } from '../db';

export type Db = DatabaseSync;

export interface Tenant {
  id: number;
  slug: string;
  name: string;
  vertical: Vertical;
  dbPath: string;
  createdAt: string;
}

export interface Account {
  id: number;
  email: string;
  name: string;
  createdAt: string;
}

export interface SessionContext {
  account: Account;
  tenant: Tenant;
  tenants: Tenant[];
}

const REGISTRY_SCHEMA = `
CREATE TABLE tenant (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  vertical TEXT NOT NULL CHECK (vertical IN ('restaurant', 'service', 'tourism')),
  db_path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE account (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE membership (
  tenant_id INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, account_id)
);

CREATE INDEX membership_account_idx ON membership(account_id);

CREATE TABLE session (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX session_expiry_idx ON session(expires_at);
`;

type Row = Record<string, unknown>;

function rowToTenant(row: Row): Tenant {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    name: String(row.name),
    vertical: String(row.vertical) as Vertical,
    dbPath: String(row.db_path),
    createdAt: String(row.created_at),
  };
}

function rowToAccount(row: Row): Account {
  return {
    id: Number(row.id),
    email: String(row.email),
    name: String(row.name),
    createdAt: String(row.created_at),
  };
}

export function openRegistry(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  const version =
    Number(
      (db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined)
        ?.user_version ?? 0,
    ) || 0;
  if (version < 1) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(REGISTRY_SCHEMA);
      db.exec('PRAGMA user_version = 1');
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return db;
}

export function createAccount(
  db: Db,
  input: { email: string; name: string; passwordHash: string },
): Account {
  const timestamp = nowIso();
  const result = db
    .prepare(
      `INSERT INTO account (email, name, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(input.email.toLowerCase(), input.name, input.passwordHash, timestamp, timestamp);
  return getAccount(db, Number(result.lastInsertRowid));
}

export function getAccount(db: Db, id: number): Account {
  const row = db.prepare('SELECT * FROM account WHERE id = ?').get(id) as Row | undefined;
  if (!row) throw new Error('Аккаунт не найден.');
  return rowToAccount(row);
}

export function findAccountByEmail(
  db: Db,
  email: string,
): (Account & { passwordHash: string }) | null {
  const row = db
    .prepare('SELECT * FROM account WHERE email = ?')
    .get(email.trim().toLowerCase()) as Row | undefined;
  if (!row) return null;
  return { ...rowToAccount(row), passwordHash: String(row.password_hash) };
}

export function createTenantRecord(
  db: Db,
  input: { slug: string; name: string; vertical: Vertical; dbPath: string },
): Tenant {
  const timestamp = nowIso();
  const result = db
    .prepare(
      `INSERT INTO tenant (slug, name, vertical, db_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(input.slug, input.name, input.vertical, input.dbPath, timestamp, timestamp);
  return getTenantById(db, Number(result.lastInsertRowid));
}

export function updateTenantIdentity(
  db: Db,
  id: number,
  input: { slug: string; name: string; vertical: Vertical },
): Tenant {
  db.prepare(
    'UPDATE tenant SET slug = ?, name = ?, vertical = ?, updated_at = ? WHERE id = ?',
  ).run(input.slug, input.name, input.vertical, nowIso(), id);
  return getTenantById(db, id);
}

export function getTenantById(db: Db, id: number): Tenant {
  const row = db.prepare('SELECT * FROM tenant WHERE id = ?').get(id) as Row | undefined;
  if (!row) throw new Error('Бизнес не найден.');
  return rowToTenant(row);
}

export function getTenantBySlug(db: Db, slug: string): Tenant | null {
  const row = db.prepare('SELECT * FROM tenant WHERE slug = ?').get(slug) as Row | undefined;
  return row ? rowToTenant(row) : null;
}

export function addMembership(db: Db, tenantId: number, accountId: number): void {
  db.prepare(
    `INSERT OR IGNORE INTO membership (tenant_id, account_id, role, created_at)
     VALUES (?, ?, 'owner', ?)`,
  ).run(tenantId, accountId, nowIso());
}

export function tenantsForAccount(db: Db, accountId: number): Tenant[] {
  const rows = db
    .prepare(
      `SELECT t.* FROM tenant t
       JOIN membership m ON m.tenant_id = t.id
       WHERE m.account_id = ?
       ORDER BY t.id ASC`,
    )
    .all(accountId) as Row[];
  return rows.map(rowToTenant);
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(
  db: Db,
  accountId: number,
  tenantId: number,
  days = 7,
): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  db.prepare(
    `INSERT INTO session (token_hash, account_id, tenant_id, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(hashSessionToken(token), accountId, tenantId, expiresAt, nowIso());
  return { token, expiresAt };
}

export function resolveSession(db: Db, token: string): SessionContext | null {
  const hash = hashSessionToken(token);
  const row = db
    .prepare(
      `SELECT s.account_id, s.tenant_id, s.expires_at
       FROM session s WHERE s.token_hash = ?`,
    )
    .get(hash) as Row | undefined;
  if (!row) return null;
  if (String(row.expires_at) <= nowIso()) {
    db.prepare('DELETE FROM session WHERE token_hash = ?').run(hash);
    return null;
  }
  const accountId = Number(row.account_id);
  const tenantId = Number(row.tenant_id);
  const tenants = tenantsForAccount(db, accountId);
  if (!tenants.some((tenant) => tenant.id === tenantId)) return null;
  return {
    account: getAccount(db, accountId),
    tenant: tenants.find((tenant) => tenant.id === tenantId)!,
    tenants,
  };
}

export function deleteSession(db: Db, token: string): void {
  db.prepare('DELETE FROM session WHERE token_hash = ?').run(hashSessionToken(token));
}

export function switchSessionTenant(db: Db, token: string, tenantId: number): void {
  db.prepare('UPDATE session SET tenant_id = ? WHERE token_hash = ?').run(
    tenantId,
    hashSessionToken(token),
  );
}

export function slugify(value: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  const normalized = value
    .toLowerCase()
    .split('')
    .map((char) => map[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return normalized || 'business';
}

export function uniqueTenantSlug(db: Db, desired: string, excludeId?: number): string {
  const base = slugify(desired);
  let candidate = base;
  let counter = 2;
  let row = db
    .prepare('SELECT id FROM tenant WHERE slug = ? AND id != ?')
    .get(candidate, excludeId ?? 0) as Row | undefined;
  while (row) {
    candidate = `${base}-${counter}`;
    counter += 1;
    row = db
      .prepare('SELECT id FROM tenant WHERE slug = ? AND id != ?')
      .get(candidate, excludeId ?? 0) as Row | undefined;
  }
  return candidate;
}
