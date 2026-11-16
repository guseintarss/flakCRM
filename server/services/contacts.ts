import type { z } from 'zod';
import { nowIso, type Db } from '../db';
import { ApiError, pageMeta, pagination } from '../http';
import { mapContact, mapContactListItem } from '../mappers';
import type { Contact, ContactListItem, PageResult } from '../../shared/types';
import {
  fullName,
  normalizeEmail,
  normalizeTags,
  normalizeText,
} from '../lib/normalize';
import type { contactCreateSchema, contactUpdateSchema, contactsQuerySchema } from '../schemas';
import { diffFields, writeAudit } from './audit';
import { assertEntity, cascadeChildren, getContactRow, likeParam } from './entities';

type Row = Record<string, unknown>;
type ListQuery = z.infer<typeof contactsQuerySchema>;
type CreateInput = z.infer<typeof contactCreateSchema>;
type UpdateInput = z.infer<typeof contactUpdateSchema>;

const CONTACT_SELECT = `
  SELECT c.id, c.first_name AS firstName, c.last_name AS lastName,
    TRIM(c.first_name || ' ' || COALESCE(c.last_name, '')) AS fullName,
    c.email, c.phone, c.telegram, c.linkedin, c.job_title AS jobTitle, c.tags, c.notes,
    c.created_at AS createdAt, c.updated_at AS updatedAt,
    u.id AS ownerId, u.name AS ownerName, u.email AS ownerEmail,
    comp.id AS companyId, comp.name AS companyName, comp.domain AS companyDomain
  FROM contact c
  JOIN app_user u ON u.id = c.owner_id
  LEFT JOIN company comp ON comp.id = c.company_id AND comp.deleted_at IS NULL
`;

function sortClause(sort: ListQuery['sort']): string {
  switch (sort) {
    case 'name':
      return 'c.first_name_norm ASC, c.last_name_norm ASC, c.id ASC';
    case '-name':
      return 'c.first_name_norm DESC, c.last_name_norm DESC, c.id DESC';
    case 'createdAt':
      return 'c.created_at ASC, c.id ASC';
    case '-createdAt':
      return 'c.created_at DESC, c.id DESC';
    case 'updatedAt':
      return 'c.updated_at ASC, c.id ASC';
    case '-updatedAt':
      return 'c.updated_at DESC, c.id DESC';
  }
}

export function listContacts(db: Db, query: ListQuery): PageResult<ContactListItem> {
  const clauses = ['c.workspace_id = 1', 'c.deleted_at IS NULL'];
  const params: (string | number | null)[] = [];

  if (query.q) {
    clauses.push(
      `(c.first_name_norm LIKE ? ESCAPE '\\' OR c.last_name_norm LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\')`,
    );
    const value = likeParam(query.q);
    params.push(value, value, value);
  }
  if (query.companyId) {
    clauses.push('c.company_id = ?');
    params.push(query.companyId);
  }
  if (query.tag) {
    clauses.push('EXISTS (SELECT 1 FROM json_each(c.tags) WHERE value = ?)');
    params.push(query.tag.toLocaleLowerCase('ru-RU'));
  }

  const where = clauses.join(' AND ');
  const total = Number(
    (db.prepare(`SELECT COUNT(*) AS total FROM contact c WHERE ${where}`).get(...params) as Row)
      .total,
  );
  const { limit, offset } = pagination(query);
  const rows = db
    .prepare(`${CONTACT_SELECT} WHERE ${where} ORDER BY ${sortClause(query.sort)} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Row[];

  return {
    data: rows.map(mapContactListItem),
    page: pageMeta(total, query.page, query.pageSize),
  };
}

export function getContact(db: Db, id: number): Contact {
  const row = db
    .prepare(`${CONTACT_SELECT} WHERE c.id = ? AND c.workspace_id = 1 AND c.deleted_at IS NULL`)
    .get(id) as Row | undefined;
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Контакт не найден.');
  return mapContact(row);
}

function normalizedEmailOrThrow(value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') return null;
  const email = normalizeEmail(value);
  if (!email) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Некорректный email.', { field: 'email' });
  }
  return email;
}

function assertEmailFree(
  db: Db,
  email: string | null,
  options: { allowDuplicate?: boolean; excludeId?: number },
): void {
  if (!email || options.allowDuplicate) return;
  const row = db
    .prepare(
      `SELECT id FROM contact
       WHERE workspace_id = 1 AND email = ? AND deleted_at IS NULL
       ${options.excludeId ? 'AND id != ?' : ''}`,
    )
    .get(...(options.excludeId ? [email, options.excludeId] : [email])) as Row | undefined;
  if (row) {
    throw new ApiError(409, 'DUPLICATE_CONTACT', 'Контакт с таким email уже существует.', {
      existingId: Number(row.id),
    });
  }
}

export function checkContactEmail(db: Db, input: string): {
  input: string;
  normalizedEmail: string;
  duplicate: { id: number; fullName: string; email: string | null } | null;
} {
  const email = normalizeEmail(input);
  if (!email) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Некорректный email.', { field: 'email' });
  }
  const row = db
    .prepare(
      `SELECT id, TRIM(first_name || ' ' || COALESCE(last_name, '')) AS fullName, email
       FROM contact WHERE workspace_id = 1 AND email = ? AND deleted_at IS NULL`,
    )
    .get(email) as Row | undefined;
  return {
    input,
    normalizedEmail: email,
    duplicate: row
      ? {
          id: Number(row.id),
          fullName: String(row.fullName),
          email: row.email as string | null,
        }
      : null,
  };
}

export function createContact(db: Db, input: CreateInput): Contact {
  const email = normalizedEmailOrThrow(input.email);
  assertEmailFree(db, email, { allowDuplicate: input.allowDuplicate });
  if (input.companyId) assertEntity(db, 'company', input.companyId);
  const timestamp = nowIso();
  const result = db
    .prepare(
      `INSERT INTO contact
        (workspace_id, first_name, last_name, first_name_norm, last_name_norm, email, phone,
         telegram, linkedin, job_title, company_id, tags, notes, owner_id, created_at, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      input.firstName,
      input.lastName ?? null,
      normalizeText(input.firstName),
      input.lastName ? normalizeText(input.lastName) : null,
      email,
      input.phone ?? null,
      input.telegram ?? null,
      input.linkedin ?? null,
      input.jobTitle ?? null,
      input.companyId ?? null,
      JSON.stringify(normalizeTags(input.tags)),
      input.notes ?? null,
      timestamp,
      timestamp,
    );
  const id = Number(result.lastInsertRowid);
  writeAudit(db, { entityType: 'contact', entityId: id, action: 'create' });
  return getContact(db, id);
}

export function updateContact(db: Db, id: number, input: UpdateInput): Contact {
  const before = getContactRow(db, id);
  const next = {
    firstName: input.firstName ?? String(before.first_name),
    lastName: input.lastName === undefined ? (before.last_name as string | null) : input.lastName,
    email:
      input.email === undefined
        ? (before.email as string | null)
        : normalizedEmailOrThrow(input.email),
    phone: input.phone === undefined ? (before.phone as string | null) : input.phone,
    telegram: input.telegram === undefined ? (before.telegram as string | null) : input.telegram,
    linkedin: input.linkedin === undefined ? (before.linkedin as string | null) : input.linkedin,
    jobTitle: input.jobTitle === undefined ? (before.job_title as string | null) : input.jobTitle,
    companyId:
      input.companyId === undefined ? (before.company_id as number | null) : input.companyId,
    tags:
      input.tags === undefined ? JSON.parse(String(before.tags)) : normalizeTags(input.tags),
    notes: input.notes === undefined ? (before.notes as string | null) : input.notes,
  };
  assertEmailFree(db, next.email, {
    allowDuplicate: input.allowDuplicate,
    excludeId: id,
  });
  if (next.companyId) assertEntity(db, 'company', next.companyId);
  const timestamp = nowIso();
  db.prepare(
    `UPDATE contact SET
      first_name = ?, last_name = ?, first_name_norm = ?, last_name_norm = ?, email = ?,
      phone = ?, telegram = ?, linkedin = ?, job_title = ?, company_id = ?, tags = ?,
      notes = ?, updated_at = ?
     WHERE id = ? AND workspace_id = 1 AND deleted_at IS NULL`,
  ).run(
    next.firstName,
    next.lastName,
    normalizeText(next.firstName),
    next.lastName ? normalizeText(next.lastName) : null,
    next.email,
    next.phone,
    next.telegram,
    next.linkedin,
    next.jobTitle,
    next.companyId,
    JSON.stringify(next.tags),
    next.notes,
    timestamp,
    id,
  );

  const changes = diffFields(
    before,
    {
      firstName: next.firstName,
      lastName: next.lastName,
      email: next.email,
      phone: next.phone,
      jobTitle: next.jobTitle,
      companyId: next.companyId,
      tags: JSON.stringify(next.tags),
    },
    [
      ['firstName', 'first_name'],
      ['lastName', 'last_name'],
      ['email', 'email'],
      ['phone', 'phone'],
      ['jobTitle', 'job_title'],
      ['companyId', 'company_id'],
      ['tags', 'tags'],
    ],
  );
  if (changes.length) {
    writeAudit(db, { entityType: 'contact', entityId: id, action: 'update', changes });
  }
  return getContact(db, id);
}

export function deleteContact(db: Db, id: number): void {
  const row = getContactRow(db, id);
  const timestamp = nowIso();
  db.prepare(
    'UPDATE contact SET deleted_at = ?, updated_at = ? WHERE id = ? AND workspace_id = 1',
  ).run(timestamp, timestamp, id);
  cascadeChildren(db, 'contact', id, timestamp);
  writeAudit(db, {
    entityType: 'contact',
    entityId: id,
    action: 'delete',
    metadata: { snapshot: { name: fullName(String(row.first_name), row.last_name as string | null) } },
  });
}
