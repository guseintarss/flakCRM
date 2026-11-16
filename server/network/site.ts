import { randomBytes } from 'node:crypto';
import { nowIso, withTransaction, type Db } from '../db';
import { ApiError } from '../http';
import type { LeadStatus } from '../../shared/types';
import type {
  PublicSite,
  SiteConfig,
  SiteItem,
  SiteItemKind,
  SiteRequest,
  SiteRequestInput,
  SiteRequestResult,
} from '../../shared/site';
import type { Tenant } from './registry';
import { createLead, updateLead } from '../services/leads';

type Row = Record<string, unknown>;

const DEFAULT_COLOR: Record<Tenant['vertical'], string> = {
  restaurant: '#b3541e',
  service: '#245c73',
  tourism: '#2f6f4e',
};

const ITEM_KIND: Record<Tenant['vertical'], SiteItemKind> = {
  restaurant: 'dish',
  service: 'service',
  tourism: 'room',
};

const str = (value: unknown): string => (typeof value === 'string' ? value : String(value ?? ''));
const nullable = (value: unknown): string | null =>
  value == null ? null : typeof value === 'string' ? value : String(value);
const num = (value: unknown): number => Number(value ?? 0);
const nullableNum = (value: unknown): number | null => (value == null ? null : Number(value));

export function itemKindForVertical(vertical: Tenant['vertical']): SiteItemKind {
  return ITEM_KIND[vertical];
}

function mapConfig(row: Row, tenant: Tenant): SiteConfig {
  return {
    vertical: tenant.vertical,
    slug: tenant.slug,
    name: str(row.name),
    tagline: nullable(row.tagline),
    description: nullable(row.description),
    city: nullable(row.city),
    address: nullable(row.address),
    phone: nullable(row.phone),
    email: nullable(row.email),
    workingHours: nullable(row.working_hours),
    brandColor: str(row.brand_color),
    coverUrl: nullable(row.cover_url),
    isPublished: Number(row.is_published) === 1,
    updatedAt: str(row.updated_at),
  };
}

export function ensureSiteConfig(db: Db, tenant: Tenant): void {
  const existing = db.prepare('SELECT 1 AS ok FROM site_config WHERE id = 1').get() as
    | Row
    | undefined;
  if (existing) return;
  const timestamp = nowIso();
  db.prepare(
    `INSERT INTO site_config
      (id, vertical, name, brand_color, is_published, created_at, updated_at)
     VALUES (1, ?, ?, ?, 0, ?, ?)`,
  ).run(tenant.vertical, tenant.name, DEFAULT_COLOR[tenant.vertical], timestamp, timestamp);
}

export function getSiteConfig(db: Db, tenant: Tenant): SiteConfig {
  ensureSiteConfig(db, tenant);
  const row = db.prepare('SELECT * FROM site_config WHERE id = 1').get() as Row;
  return mapConfig(row, tenant);
}

export function updateSiteConfig(
  db: Db,
  tenant: Tenant,
  input: {
    name: string;
    tagline: string | null;
    description: string | null;
    city: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    workingHours: string | null;
    brandColor: string;
    coverUrl: string | null;
  },
): SiteConfig {
  ensureSiteConfig(db, tenant);
  db.prepare(
    `UPDATE site_config SET name = ?, tagline = ?, description = ?, city = ?, address = ?,
       phone = ?, email = ?, working_hours = ?, brand_color = ?, cover_url = ?, updated_at = ?
     WHERE id = 1`,
  ).run(
    input.name,
    input.tagline,
    input.description,
    input.city,
    input.address,
    input.phone,
    input.email,
    input.workingHours,
    input.brandColor,
    input.coverUrl,
    nowIso(),
  );
  return getSiteConfig(db, tenant);
}

export function setSitePublished(db: Db, tenant: Tenant, published: boolean): SiteConfig {
  ensureSiteConfig(db, tenant);
  db.prepare('UPDATE site_config SET is_published = ?, updated_at = ? WHERE id = 1').run(
    published ? 1 : 0,
    nowIso(),
  );
  return getSiteConfig(db, tenant);
}

function mapItem(row: Row): SiteItem {
  return {
    id: num(row.id),
    kind: str(row.kind) as SiteItemKind,
    name: str(row.name),
    description: nullable(row.description),
    priceMinor: nullableNum(row.price_minor),
    durationMin: nullableNum(row.duration_min),
    capacity: nullableNum(row.capacity),
    imageUrl: nullable(row.image_url),
    isActive: Number(row.is_active) === 1,
    position: num(row.position),
  };
}

export function listSiteItems(db: Db, options: { activeOnly?: boolean } = {}): SiteItem[] {
  const where = options.activeOnly ? 'WHERE is_active = 1' : '';
  const rows = db
    .prepare(`SELECT * FROM site_item ${where} ORDER BY position ASC, id ASC`)
    .all() as Row[];
  return rows.map(mapItem);
}

export function getSiteItem(db: Db, id: number): SiteItem {
  const row = db.prepare('SELECT * FROM site_item WHERE id = ?').get(id) as Row | undefined;
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Позиция каталога не найдена.');
  return mapItem(row);
}

export function createSiteItem(
  db: Db,
  tenant: Tenant,
  input: {
    name: string;
    description: string | null;
    priceMinor: number | null;
    durationMin: number | null;
    capacity: number | null;
    imageUrl: string | null;
    isActive: boolean;
    position: number;
  },
): SiteItem {
  const timestamp = nowIso();
  const result = db
    .prepare(
      `INSERT INTO site_item
        (kind, name, description, price_minor, duration_min, capacity, image_url,
         is_active, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      itemKindForVertical(tenant.vertical),
      input.name,
      input.description,
      input.priceMinor,
      input.durationMin,
      input.capacity,
      input.imageUrl,
      input.isActive ? 1 : 0,
      input.position,
      timestamp,
      timestamp,
    );
  return getSiteItem(db, Number(result.lastInsertRowid));
}

export function updateSiteItem(
  db: Db,
  id: number,
  input: {
    name?: string;
    description?: string | null;
    priceMinor?: number | null;
    durationMin?: number | null;
    capacity?: number | null;
    imageUrl?: string | null;
    isActive?: boolean;
    position?: number;
  },
): SiteItem {
  const current = getSiteItem(db, id);
  db.prepare(
    `UPDATE site_item SET name = ?, description = ?, price_minor = ?, duration_min = ?,
       capacity = ?, image_url = ?, is_active = ?, position = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    input.name ?? current.name,
    input.description === undefined ? current.description : input.description,
    input.priceMinor === undefined ? current.priceMinor : input.priceMinor,
    input.durationMin === undefined ? current.durationMin : input.durationMin,
    input.capacity === undefined ? current.capacity : input.capacity,
    input.imageUrl === undefined ? current.imageUrl : input.imageUrl,
    (input.isActive ?? current.isActive) ? 1 : 0,
    input.position ?? current.position,
    nowIso(),
    id,
  );
  return getSiteItem(db, id);
}

export function deleteSiteItem(db: Db, id: number): void {
  getSiteItem(db, id);
  db.prepare('DELETE FROM site_item WHERE id = ?').run(id);
}

export function getPublicSite(db: Db, tenant: Tenant): PublicSite {
  const config = getSiteConfig(db, tenant);
  if (!config.isPublished) {
    throw new ApiError(404, 'NOT_FOUND', 'Сайт не найден.');
  }
  return { ...config, items: listSiteItems(db, { activeOnly: true }) };
}

function requestCode(tenant: Tenant): string {
  const prefix = tenant.slug
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 2)
    .toUpperCase()
    .padEnd(2, 'X');
  return `${prefix}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

const timeLabel = (date: string | null, time: string | null): string => {
  if (!date) return '';
  return time ? `${date} в ${time}` : date;
};

function buildNotes(
  tenant: Tenant,
  input: SiteRequestInput,
  code: string,
  itemName: string | null,
): string {
  const lines: string[] = [];
  if (tenant.vertical === 'restaurant') {
    lines.push(`Бронь столика: ${timeLabel(input.requestedDate ?? null, input.requestedTime ?? null)}.`);
    lines.push(`Гостей: ${input.guests ?? '—'}.`);
  } else if (tenant.vertical === 'tourism') {
    const range = input.checkOut
      ? `${input.requestedDate ?? ''} — ${input.checkOut}`
      : (input.requestedDate ?? '');
    lines.push(`Бронь проживания: ${range}.`);
    lines.push(`Гостей: ${input.guests ?? '—'}.`);
  } else {
    if (input.requestedDate) {
      lines.push(`Желаемая дата: ${timeLabel(input.requestedDate, input.requestedTime ?? null)}.`);
    }
  }
  if (itemName) lines.push(`Выбор: ${itemName}.`);
  if (input.comment) lines.push(`Комментарий: ${input.comment}`);
  lines.push(`Код заявки: ${code}.`);
  return lines.join('\n');
}

export function createSiteRequest(
  db: Db,
  tenant: Tenant,
  input: SiteRequestInput,
): SiteRequestResult {
  let item: SiteItem | null = null;
  if (input.itemId != null) {
    item = getSiteItem(db, input.itemId);
    if (!item.isActive) {
      throw new ApiError(422, 'ITEM_UNAVAILABLE', 'Эта позиция сейчас недоступна.');
    }
  }

  if (tenant.vertical === 'restaurant') {
    if (!input.requestedDate || !input.requestedTime || !input.guests) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Укажите дату, время и число гостей.');
    }
  }
  if (tenant.vertical === 'tourism') {
    if (!input.requestedDate || !input.guests) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Укажите дату заезда и число гостей.');
    }
  }
  if (input.checkOut && input.requestedDate && input.checkOut <= input.requestedDate) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Дата выезда должна быть позже даты заезда.');
  }

  const result = withTransaction(db, () => {
    const code = requestCode(tenant);
    const notes = buildNotes(tenant, input, code, item?.name ?? null);
    const lead = createLead(db, {
      companyName: getSiteConfig(db, tenant).name,
      contactName: input.guestName,
      email: input.email ?? null,
      phone: input.phone,
      source: 'website',
      serviceType: tenant.vertical,
      notes,
      allowDuplicate: true,
    });
    db.prepare(
      `INSERT INTO site_request
        (code, guest_name, phone, email, requested_date, requested_time, check_out, guests,
         item_id, comment, lead_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      code,
      input.guestName,
      input.phone,
      input.email ?? null,
      input.requestedDate ?? null,
      input.requestedTime ?? null,
      input.checkOut ?? null,
      input.guests ?? null,
      item?.id ?? null,
      input.comment ?? null,
      lead.id,
      nowIso(),
    );
    return code;
  });

  return {
    code: result,
    message: 'Заявка принята. Мы свяжемся с вами, чтобы подтвердить детали.',
  };
}

const REQUEST_SELECT = `SELECT r.id, r.code, r.guest_name, r.phone, r.email, r.requested_date, r.requested_time,
         r.check_out, r.guests, r.item_id, r.comment, r.lead_id, r.created_at,
         l.status AS lead_status, i.name AS item_name
       FROM site_request r
       JOIN lead l ON l.id = r.lead_id
       LEFT JOIN site_item i ON i.id = r.item_id`;

function mapRequest(row: Row): SiteRequest {
  return {
    id: num(row.id),
    code: str(row.code),
    guestName: str(row.guest_name),
    phone: str(row.phone),
    email: nullable(row.email),
    requestedDate: nullable(row.requested_date),
    requestedTime: nullable(row.requested_time),
    checkOut: nullable(row.check_out),
    guests: nullableNum(row.guests),
    itemId: nullableNum(row.item_id),
    itemName: nullable(row.item_name),
    comment: nullable(row.comment),
    leadId: num(row.lead_id),
    leadStatus: str(row.lead_status) as LeadStatus,
    createdAt: str(row.created_at),
  };
}

export function listSiteRequests(db: Db): SiteRequest[] {
  const rows = db
    .prepare(
      `${REQUEST_SELECT}
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT 200`,
    )
    .all() as Row[];
  return rows.map(mapRequest);
}

function getSiteRequest(db: Db, id: number): SiteRequest {
  const row = db.prepare(`${REQUEST_SELECT} WHERE r.id = ?`).get(id) as Row | undefined;
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Заявка не найдена.');
  return mapRequest(row);
}

export function updateSiteRequestStatus(
  db: Db,
  requestId: number,
  status: 'new' | 'contacted' | 'qualified' | 'disqualified',
): SiteRequest {
  const row = db
    .prepare('SELECT lead_id FROM site_request WHERE id = ?')
    .get(requestId) as Row | undefined;
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Заявка не найдена.');
  updateLead(db, Number(row.lead_id), { status });
  return getSiteRequest(db, requestId);
}
