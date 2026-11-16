import type { z } from 'zod';
import { nowIso, type Db } from '../db';
import { ApiError, pageMeta, pagination } from '../http';
import {
  mapCompany,
  mapCompanyListItem,
} from '../mappers';
import type { Company, CompanyListItem, PageResult } from '../../shared/types';
import {
  normalizeDomain,
  normalizeStack,
  normalizeTags,
  normalizeText,
} from '../lib/normalize';
import type { companiesQuerySchema, companyCreateSchema, companyUpdateSchema } from '../schemas';
import { diffFields, writeAudit } from './audit';
import { cascadeChildren, getCompanyRow, likeParam } from './entities';

type Row = Record<string, unknown>;
type ListQuery = z.infer<typeof companiesQuerySchema>;
type CreateInput = z.infer<typeof companyCreateSchema>;
type UpdateInput = z.infer<typeof companyUpdateSchema>;

const COMPANY_SELECT = `
  SELECT c.id, c.name, c.domain, c.industry, c.size, c.location, c.telegram,
    c.stack, c.tags, c.notes,
    c.created_at AS createdAt, c.updated_at AS updatedAt,
    u.id AS ownerId, u.name AS ownerName, u.email AS ownerEmail,
    (SELECT COUNT(*) FROM contact ct
      WHERE ct.company_id = c.id AND ct.deleted_at IS NULL) AS contactsCount,
    (SELECT COUNT(*) FROM deal d
      WHERE d.company_id = c.id AND d.deleted_at IS NULL AND d.status = 'open') AS openDealsCount,
    (SELECT COUNT(*) FROM deal d
      WHERE d.company_id = c.id AND d.deleted_at IS NULL AND d.status = 'won') AS wonDealsCount,
    (SELECT COALESCE(SUM(d.amount_minor), 0) FROM deal d
      WHERE d.company_id = c.id AND d.deleted_at IS NULL AND d.status = 'open') AS openPipelineMinor
  FROM company c
  JOIN app_user u ON u.id = c.owner_id
`;

function sortClause(sort: ListQuery['sort']): string {
  switch (sort) {
    case 'name':
      return 'c.name_norm ASC, c.id ASC';
    case '-name':
      return 'c.name_norm DESC, c.id DESC';
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

export function listCompanies(db: Db, query: ListQuery): PageResult<CompanyListItem> {
  const clauses = ['c.workspace_id = 1', 'c.deleted_at IS NULL'];
  const params: (string | number | null)[] = [];

  if (query.q) {
    clauses.push(`(c.name_norm LIKE ? ESCAPE '\\' OR c.domain_norm LIKE ? ESCAPE '\\')`);
    params.push(likeParam(query.q), likeParam(query.q));
  }
  if (query.industry) {
    clauses.push('c.industry = ?');
    params.push(query.industry);
  }
  if (query.size) {
    clauses.push('c.size = ?');
    params.push(query.size);
  }
  if (query.tag) {
    clauses.push('EXISTS (SELECT 1 FROM json_each(c.tags) WHERE value = ?)');
    params.push(query.tag.toLocaleLowerCase('ru-RU'));
  }

  const where = clauses.join(' AND ');
  const total = Number(
    (db.prepare(`SELECT COUNT(*) AS total FROM company c WHERE ${where}`).get(...params) as Row)
      .total,
  );
  const { limit, offset } = pagination(query);
  const rows = db
    .prepare(`${COMPANY_SELECT} WHERE ${where} ORDER BY ${sortClause(query.sort)} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Row[];

  return {
    data: rows.map(mapCompanyListItem),
    page: pageMeta(total, query.page, query.pageSize),
  };
}

export function getCompany(db: Db, id: number): Company {
  const row = db
    .prepare(`${COMPANY_SELECT} WHERE c.id = ? AND c.workspace_id = 1 AND c.deleted_at IS NULL`)
    .get(id) as Row | undefined;
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Компания не найдена.');
  return mapCompany(row);
}

function normalizedDomainOrThrow(value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') return null;
  const domain = normalizeDomain(value);
  if (!domain) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Некорректный домен компании.', {
      field: 'domain',
    });
  }
  return domain;
}

function assertDomainFree(db: Db, domain: string | null, excludeId?: number): void {
  if (!domain) return;
  const row = db
    .prepare(
      `SELECT id FROM company
       WHERE workspace_id = 1 AND domain_norm = ? AND deleted_at IS NULL
       ${excludeId ? 'AND id != ?' : ''}`,
    )
    .get(...(excludeId ? [domain, excludeId] : [domain])) as Row | undefined;
  if (row) {
    throw new ApiError(409, 'DUPLICATE_COMPANY', 'Компания с таким доменом уже существует.', {
      existingId: Number(row.id),
    });
  }
}

export function checkCompanyDomain(db: Db, input: string): {
  input: string;
  normalizedDomain: string | null;
  duplicate: { id: number; name: string; domain: string | null } | null;
} {
  const domain = normalizeDomain(input);
  if (!domain) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Некорректный домен.', { field: 'domain' });
  }
  const row = db
    .prepare(
      `SELECT id, name, domain FROM company
       WHERE workspace_id = 1 AND domain_norm = ? AND deleted_at IS NULL`,
    )
    .get(domain) as Row | undefined;
  return {
    input,
    normalizedDomain: domain,
    duplicate: row
      ? { id: Number(row.id), name: String(row.name), domain: row.domain as string | null }
      : null,
  };
}

export function createCompany(db: Db, input: CreateInput): Company {
  const domain = normalizedDomainOrThrow(input.domain);
  assertDomainFree(db, domain);
  const timestamp = nowIso();
  const result = db
    .prepare(
      `INSERT INTO company
        (workspace_id, name, name_norm, domain, domain_norm, industry, size, location,
         telegram, stack, tags, notes, owner_id, created_at, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      input.name,
      normalizeText(input.name),
      domain,
      domain,
      input.industry ?? null,
      input.size ?? null,
      input.location ?? null,
      input.telegram ?? null,
      JSON.stringify(normalizeStack(input.stack)),
      JSON.stringify(normalizeTags(input.tags)),
      input.notes ?? null,
      timestamp,
      timestamp,
    );
  const id = Number(result.lastInsertRowid);
  writeAudit(db, { entityType: 'company', entityId: id, action: 'create' });
  return getCompany(db, id);
}

export function updateCompany(db: Db, id: number, input: UpdateInput): Company {
  const before = getCompanyRow(db, id);
  const next = {
    name: input.name ?? String(before.name),
    domain:
      input.domain === undefined
        ? (before.domain as string | null)
        : normalizedDomainOrThrow(input.domain),
    industry: input.industry === undefined ? (before.industry as string | null) : input.industry,
    size: input.size === undefined ? (before.size as string | null) : input.size,
    location: input.location === undefined ? (before.location as string | null) : input.location,
    telegram: input.telegram === undefined ? (before.telegram as string | null) : input.telegram,
    stack:
      input.stack === undefined
        ? JSON.parse(String(before.stack))
        : normalizeStack(input.stack),
    tags:
      input.tags === undefined ? JSON.parse(String(before.tags)) : normalizeTags(input.tags),
    notes: input.notes === undefined ? (before.notes as string | null) : input.notes,
  };
  assertDomainFree(db, next.domain, id);
  const timestamp = nowIso();
  db.prepare(
    `UPDATE company SET
      name = ?, name_norm = ?, domain = ?, domain_norm = ?, industry = ?, size = ?,
      location = ?, telegram = ?, stack = ?, tags = ?, notes = ?, updated_at = ?
     WHERE id = ? AND workspace_id = 1 AND deleted_at IS NULL`,
  ).run(
    next.name,
    normalizeText(next.name),
    next.domain,
    next.domain,
    next.industry,
    next.size,
    next.location,
    next.telegram,
    JSON.stringify(next.stack),
    JSON.stringify(next.tags),
    next.notes,
    timestamp,
    id,
  );

  const changes = diffFields(
    before,
    {
      name: next.name,
      domain: next.domain,
      industry: next.industry,
      size: next.size,
      stack: JSON.stringify(next.stack),
      tags: JSON.stringify(next.tags),
    },
    [
      ['name', 'name'],
      ['domain', 'domain'],
      ['industry', 'industry'],
      ['size', 'size'],
      ['stack', 'stack'],
      ['tags', 'tags'],
    ],
  );
  if (changes.length) {
    writeAudit(db, { entityType: 'company', entityId: id, action: 'update', changes });
  }
  return getCompany(db, id);
}

export function deleteCompany(db: Db, id: number): void {
  const row = getCompanyRow(db, id);
  const open = db
    .prepare(
      `SELECT COUNT(*) AS total FROM deal
       WHERE company_id = ? AND workspace_id = 1 AND deleted_at IS NULL AND status = 'open'`,
    )
    .get(id) as Row;
  if (Number(open.total) > 0) {
    throw new ApiError(409, 'COMPANY_HAS_OPEN_DEALS', 'Нельзя удалить компанию с открытыми сделками.', {
      openDealCount: Number(open.total),
    });
  }
  const timestamp = nowIso();
  db.prepare(
    'UPDATE company SET deleted_at = ?, updated_at = ? WHERE id = ? AND workspace_id = 1',
  ).run(timestamp, timestamp, id);
  cascadeChildren(db, 'company', id, timestamp);
  writeAudit(db, {
    entityType: 'company',
    entityId: id,
    action: 'delete',
    metadata: { snapshot: { name: String(row.name) } },
  });
}
