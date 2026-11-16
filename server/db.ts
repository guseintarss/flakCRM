import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

const SCHEMA_V1 = `
CREATE TABLE workspace (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  base_currency TEXT NOT NULL,
  timezone TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE app_user (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  workspace_id INTEGER NOT NULL REFERENCES workspace(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  timezone TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE membership (
  workspace_id INTEGER NOT NULL REFERENCES workspace(id),
  user_id INTEGER NOT NULL REFERENCES app_user(id),
  role TEXT NOT NULL CHECK (role IN ('owner')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE pipeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspace(id),
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE stage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspace(id),
  pipeline_id INTEGER NOT NULL REFERENCES pipeline(id),
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  probability INTEGER NOT NULL CHECK (probability BETWEEN 0 AND 100),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (pipeline_id, position)
);

CREATE TABLE company (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspace(id),
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL,
  domain TEXT,
  domain_norm TEXT,
  industry TEXT,
  size TEXT,
  location TEXT,
  telegram TEXT,
  stack TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(stack)),
  tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
  notes TEXT,
  owner_id INTEGER NOT NULL REFERENCES app_user(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX company_domain_unique
  ON company(workspace_id, domain_norm)
  WHERE domain_norm IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX company_list_idx
  ON company(workspace_id, deleted_at, name_norm);
CREATE INDEX company_industry_idx
  ON company(workspace_id, industry);

CREATE TABLE contact (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspace(id),
  first_name TEXT NOT NULL,
  last_name TEXT,
  first_name_norm TEXT NOT NULL,
  last_name_norm TEXT,
  email TEXT,
  phone TEXT,
  telegram TEXT,
  linkedin TEXT,
  job_title TEXT,
  company_id INTEGER REFERENCES company(id) ON DELETE SET NULL,
  tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
  notes TEXT,
  owner_id INTEGER NOT NULL REFERENCES app_user(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX contact_company_idx
  ON contact(workspace_id, deleted_at, company_id);
CREATE INDEX contact_email_idx
  ON contact(workspace_id, deleted_at, email);
CREATE INDEX contact_name_idx
  ON contact(workspace_id, deleted_at, first_name_norm, last_name_norm);

CREATE TABLE lead (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspace(id),
  company_name TEXT NOT NULL,
  company_name_norm TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_name_norm TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  source TEXT NOT NULL,
  service_type TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'disqualified')),
  estimated_amount_minor INTEGER CHECK (estimated_amount_minor IS NULL OR estimated_amount_minor >= 0),
  currency TEXT,
  notes TEXT,
  owner_id INTEGER NOT NULL REFERENCES app_user(id),
  converted_company_id INTEGER REFERENCES company(id),
  converted_contact_id INTEGER REFERENCES contact(id),
  converted_deal_id INTEGER,
  converted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX lead_status_idx
  ON lead(workspace_id, deleted_at, status, updated_at);
CREATE INDEX lead_email_idx
  ON lead(workspace_id, deleted_at, email);
CREATE INDEX lead_created_idx
  ON lead(workspace_id, deleted_at, created_at);

CREATE TABLE deal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspace(id),
  pipeline_id INTEGER NOT NULL REFERENCES pipeline(id),
  stage_id INTEGER NOT NULL REFERENCES stage(id),
  company_id INTEGER NOT NULL REFERENCES company(id),
  primary_contact_id INTEGER REFERENCES contact(id),
  owner_id INTEGER NOT NULL REFERENCES app_user(id),
  title TEXT NOT NULL,
  title_norm TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL,
  service_type TEXT NOT NULL,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost')),
  expected_close_date TEXT,
  closed_at TEXT,
  lost_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX deal_stage_idx
  ON deal(workspace_id, deleted_at, status, stage_id);
CREATE INDEX deal_company_idx
  ON deal(workspace_id, deleted_at, company_id);
CREATE INDEX deal_contact_idx
  ON deal(workspace_id, deleted_at, primary_contact_id);
CREATE INDEX deal_closed_idx
  ON deal(workspace_id, status, closed_at);
CREATE INDEX deal_expected_idx
  ON deal(workspace_id, deleted_at, expected_close_date);
CREATE INDEX deal_currency_idx
  ON deal(workspace_id, deleted_at, currency);

CREATE TABLE deal_stage_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  deal_id INTEGER NOT NULL REFERENCES deal(id),
  from_stage_id INTEGER REFERENCES stage(id),
  to_stage_id INTEGER NOT NULL REFERENCES stage(id),
  note TEXT,
  changed_by INTEGER NOT NULL REFERENCES app_user(id),
  changed_at TEXT NOT NULL
);

CREATE INDEX deal_stage_history_idx
  ON deal_stage_history(deal_id, changed_at DESC, id DESC);

CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('call', 'email', 'meeting', 'note')),
  subject TEXT NOT NULL,
  body TEXT,
  occurred_at TEXT NOT NULL,
  author_id INTEGER NOT NULL REFERENCES app_user(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('company', 'contact', 'lead', 'deal')),
  entity_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX activity_entity_idx
  ON activity(workspace_id, deleted_at, entity_type, entity_id, occurred_at DESC);
CREATE INDEX activity_recent_idx
  ON activity(workspace_id, deleted_at, occurred_at DESC);

CREATE TABLE task (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  completed_at TEXT,
  assignee_id INTEGER NOT NULL REFERENCES app_user(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('company', 'contact', 'lead', 'deal')),
  entity_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX task_status_idx
  ON task(workspace_id, deleted_at, status, due_date);
CREATE INDEX task_entity_idx
  ON task(workspace_id, deleted_at, entity_type, entity_id);

CREATE TABLE audit_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  actor_id INTEGER NOT NULL REFERENCES app_user(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('company', 'contact', 'lead', 'deal', 'activity', 'task')),
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'convert', 'stage_change')),
  changes TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(changes)),
  metadata TEXT CHECK (metadata IS NULL OR json_valid(metadata)),
  created_at TEXT NOT NULL
);

CREATE INDEX audit_entity_idx
  ON audit_event(workspace_id, entity_type, entity_id, created_at DESC);
CREATE INDEX audit_recent_idx
  ON audit_event(workspace_id, created_at DESC);
`;

const SCHEMA_SITE_V2 = `
CREATE TABLE site_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  vertical TEXT NOT NULL CHECK (vertical IN ('restaurant', 'service', 'tourism')),
  name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  city TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  working_hours TEXT,
  brand_color TEXT NOT NULL DEFAULT '#2f6f4e',
  cover_url TEXT,
  is_published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE site_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('dish', 'service', 'room')),
  name TEXT NOT NULL,
  description TEXT,
  price_minor INTEGER CHECK (price_minor IS NULL OR price_minor >= 0),
  duration_min INTEGER CHECK (duration_min IS NULL OR duration_min > 0),
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  image_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX site_item_list_idx ON site_item(is_active, position, id);

CREATE TABLE site_request (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  guest_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  requested_date TEXT,
  requested_time TEXT,
  check_out TEXT,
  guests INTEGER CHECK (guests IS NULL OR guests > 0),
  item_id INTEGER REFERENCES site_item(id) ON DELETE SET NULL,
  comment TEXT,
  lead_id INTEGER NOT NULL REFERENCES lead(id),
  created_at TEXT NOT NULL
);

CREATE INDEX site_request_created_idx ON site_request(created_at DESC, id DESC);
CREATE INDEX site_request_lead_idx ON site_request(lead_id);
`;

export function migrate(db: Db): void {
  const version = Number(
    (db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined)?.user_version ??
      0,
  );
  if (version >= 2) return;

  db.exec('BEGIN IMMEDIATE');
  try {
    if (version < 1) db.exec(SCHEMA_V1);
    if (version < 2) db.exec(SCHEMA_SITE_V2);
    db.exec('PRAGMA user_version = 2');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function openDatabase(path: string): Db {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  if (path !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  migrate(db);
  return db;
}

export function withTransaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // The original error is more useful.
    }
    throw error;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
