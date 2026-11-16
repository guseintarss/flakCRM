import type { z } from 'zod';
import { nowIso, type Db, withTransaction } from '../db';
import { ApiError, pageMeta, pagination } from '../http';
import { mapLead, mapLeadListItem } from '../mappers';
import type { ConvertLeadResult, Lead, LeadListItem, PageResult } from '../../shared/types';
import {
  emailDomain,
  normalizeEmail,
  normalizeText,
  splitName,
} from '../lib/normalize';
import type {
  convertLeadSchema,
  leadCreateSchema,
  leadUpdateSchema,
  leadsQuerySchema,
} from '../schemas';
import { diffFields, writeAudit } from './audit';
import {
  assertEntity,
  cascadeChildren,
  getCompanyRow,
  getLeadRow,
  getWorkspace,
  likeParam,
} from './entities';
import { createCompany, getCompany } from './companies';
import { createContact, getContact } from './contacts';
import { createDeal, getDeal } from './deals';

type Row = Record<string, unknown>;
type ListQuery = z.infer<typeof leadsQuerySchema>;
type CreateInput = z.infer<typeof leadCreateSchema>;
type UpdateInput = z.infer<typeof leadUpdateSchema>;
type ConvertInput = z.infer<typeof convertLeadSchema>;

const LEAD_SELECT = `
  SELECT l.id, l.company_name AS companyName, l.contact_name AS contactName, l.email, l.phone,
    l.source, l.service_type AS serviceType, l.status,
    l.estimated_amount_minor AS estimatedAmountMinor,
    COALESCE(l.currency, 'RUB') AS currency, l.notes,
    l.converted_company_id AS convertedCompanyId, l.converted_contact_id AS convertedContactId,
    l.converted_deal_id AS convertedDealId, l.converted_at AS convertedAt,
    l.created_at AS createdAt, l.updated_at AS updatedAt,
    u.id AS ownerId, u.name AS ownerName, u.email AS ownerEmail
  FROM lead l
  JOIN app_user u ON u.id = l.owner_id
`;

function sortClause(sort: ListQuery['sort']): string {
  switch (sort) {
    case '-createdAt':
      return 'l.created_at DESC, l.id DESC';
    case 'createdAt':
      return 'l.created_at ASC, l.id ASC';
    case '-updatedAt':
      return 'l.updated_at DESC, l.id DESC';
    case 'updatedAt':
      return 'l.updated_at ASC, l.id ASC';
  }
}

export function listLeads(db: Db, query: ListQuery): PageResult<LeadListItem> {
  const clauses = ['l.workspace_id = 1', 'l.deleted_at IS NULL'];
  const params: (string | number | null)[] = [];
  if (query.q) {
    const value = likeParam(query.q);
    clauses.push(
      `(l.company_name_norm LIKE ? ESCAPE '\\' OR l.contact_name_norm LIKE ? ESCAPE '\\' OR l.email LIKE ? ESCAPE '\\')`,
    );
    params.push(value, value, value);
  }
  if (query.status) {
    clauses.push('l.status = ?');
    params.push(query.status);
  }
  if (query.source) {
    clauses.push('l.source = ?');
    params.push(query.source);
  }
  if (query.serviceType) {
    clauses.push('l.service_type = ?');
    params.push(query.serviceType);
  }
  const where = clauses.join(' AND ');
  const total = Number(
    (db.prepare(`SELECT COUNT(*) AS total FROM lead l WHERE ${where}`).get(...params) as Row)
      .total,
  );
  const { limit, offset } = pagination(query);
  const rows = db
    .prepare(`${LEAD_SELECT} WHERE ${where} ORDER BY ${sortClause(query.sort)} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Row[];
  return {
    data: rows.map(mapLeadListItem),
    page: pageMeta(total, query.page, query.pageSize),
  };
}

export function listLeadsForExport(db: Db, query: ListQuery, limit: number): Lead[] {
  const clauses = ['l.workspace_id = 1', 'l.deleted_at IS NULL'];
  const params: (string | number | null)[] = [];
  if (query.q) {
    const value = likeParam(query.q);
    clauses.push(
      `(l.company_name_norm LIKE ? ESCAPE '\\' OR l.contact_name_norm LIKE ? ESCAPE '\\' OR l.email LIKE ? ESCAPE '\\')`,
    );
    params.push(value, value, value);
  }
  if (query.status) {
    clauses.push('l.status = ?');
    params.push(query.status);
  }
  if (query.source) {
    clauses.push('l.source = ?');
    params.push(query.source);
  }
  if (query.serviceType) {
    clauses.push('l.service_type = ?');
    params.push(query.serviceType);
  }
  const rows = db
    .prepare(
      `${LEAD_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY ${sortClause(query.sort)} LIMIT ?`,
    )
    .all(...params, limit) as Row[];
  return rows.map(mapLead);
}

export function getLead(db: Db, id: number): Lead {
  const row = db
    .prepare(`${LEAD_SELECT} WHERE l.id = ? AND l.workspace_id = 1 AND l.deleted_at IS NULL`)
    .get(id) as Row | undefined;
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Лид не найден.');
  return mapLead(row);
}

function normalizedEmailOrThrow(value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') return null;
  const email = normalizeEmail(value);
  if (!email) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Некорректный email.', { field: 'email' });
  }
  return email;
}

function assertLeadEmailFree(
  db: Db,
  email: string | null,
  options: { allowDuplicate?: boolean; excludeId?: number },
): void {
  if (!email || options.allowDuplicate) return;
  const row = db
    .prepare(
      `SELECT id FROM lead
       WHERE workspace_id = 1 AND email = ? AND deleted_at IS NULL
       ${options.excludeId ? 'AND id != ?' : ''}`,
    )
    .get(...(options.excludeId ? [email, options.excludeId] : [email])) as Row | undefined;
  if (row) {
    throw new ApiError(409, 'DUPLICATE_LEAD', 'Лид с таким email уже существует.', {
      existingId: Number(row.id),
    });
  }
}

export function checkLeadEmail(db: Db, input: string): {
  input: string;
  normalizedEmail: string;
  duplicate: { id: number; companyName: string; contactName: string } | null;
} {
  const email = normalizeEmail(input);
  if (!email) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Некорректный email.', { field: 'email' });
  }
  const row = db
    .prepare(
      `SELECT id, company_name AS companyName, contact_name AS contactName
       FROM lead WHERE workspace_id = 1 AND email = ? AND deleted_at IS NULL`,
    )
    .get(email) as Row | undefined;
  return {
    input,
    normalizedEmail: email,
    duplicate: row
      ? {
          id: Number(row.id),
          companyName: String(row.companyName),
          contactName: String(row.contactName),
        }
      : null,
  };
}

export function createLead(db: Db, input: CreateInput): Lead {
  const email = normalizedEmailOrThrow(input.email);
  assertLeadEmailFree(db, email, { allowDuplicate: input.allowDuplicate });
  const workspace = getWorkspace(db);
  const timestamp = nowIso();
  const result = db
    .prepare(
      `INSERT INTO lead
        (workspace_id, company_name, company_name_norm, contact_name, contact_name_norm,
         email, phone, source, service_type, status, estimated_amount_minor, currency,
         notes, owner_id, created_at, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      input.companyName,
      normalizeText(input.companyName),
      input.contactName,
      normalizeText(input.contactName),
      email,
      input.phone ?? null,
      input.source,
      input.serviceType ?? null,
      input.status ?? 'new',
      input.estimatedAmountMinor ?? null,
      input.currency ?? workspace.baseCurrency,
      input.notes ?? null,
      timestamp,
      timestamp,
    );
  const id = Number(result.lastInsertRowid);
  writeAudit(db, { entityType: 'lead', entityId: id, action: 'create' });
  return getLead(db, id);
}

export function updateLead(db: Db, id: number, input: UpdateInput): Lead {
  const before = getLeadRow(db, id);
  const wasConverted = String(before.status) === 'converted';
  if (wasConverted) {
    const allowed = Object.keys(input).every((key) => key === 'notes' || key === 'allowDuplicate');
    if (!allowed) {
      throw new ApiError(422, 'LEAD_CONVERTED', 'Конвертированный лид можно менять только в заметках.');
    }
  }
  if (input.status === 'converted') {
    throw new ApiError(422, 'USE_CONVERT_ENDPOINT', 'Для конвертации используйте отдельное действие.');
  }
  const nextEmail =
    input.email === undefined ? (before.email as string | null) : normalizedEmailOrThrow(input.email);
  if (input.email !== undefined) {
    assertLeadEmailFree(db, nextEmail, { allowDuplicate: input.allowDuplicate, excludeId: id });
  }
  const workspace = getWorkspace(db);
  const next = {
    companyName: input.companyName ?? String(before.company_name),
    contactName: input.contactName ?? String(before.contact_name),
    email: nextEmail,
    phone: input.phone === undefined ? (before.phone as string | null) : input.phone,
    source: input.source ?? String(before.source),
    serviceType:
      input.serviceType === undefined ? (before.service_type as string | null) : input.serviceType,
    status: input.status ?? String(before.status),
    estimatedAmountMinor:
      input.estimatedAmountMinor === undefined
        ? (before.estimated_amount_minor as number | null)
        : input.estimatedAmountMinor,
    currency: input.currency ?? (before.currency as string | null) ?? workspace.baseCurrency,
    notes: input.notes === undefined ? (before.notes as string | null) : input.notes,
  };
  const timestamp = nowIso();
  db.prepare(
    `UPDATE lead SET
      company_name = ?, company_name_norm = ?, contact_name = ?, contact_name_norm = ?,
      email = ?, phone = ?, source = ?, service_type = ?, status = ?,
      estimated_amount_minor = ?, currency = ?, notes = ?, updated_at = ?
     WHERE id = ? AND workspace_id = 1 AND deleted_at IS NULL`,
  ).run(
    next.companyName,
    normalizeText(next.companyName),
    next.contactName,
    normalizeText(next.contactName),
    next.email,
    next.phone,
    next.source,
    next.serviceType,
    next.status,
    next.estimatedAmountMinor,
    next.currency,
    next.notes,
    timestamp,
    id,
  );
  const changes = diffFields(
    before,
    {
      companyName: next.companyName,
      contactName: next.contactName,
      email: next.email,
      phone: next.phone,
      source: next.source,
      serviceType: next.serviceType,
      status: next.status,
      estimatedAmountMinor: next.estimatedAmountMinor,
      currency: next.currency,
    },
    [
      ['companyName', 'company_name'],
      ['contactName', 'contact_name'],
      ['email', 'email'],
      ['phone', 'phone'],
      ['source', 'source'],
      ['serviceType', 'service_type'],
      ['status', 'status'],
      ['estimatedAmountMinor', 'estimated_amount_minor'],
      ['currency', 'currency'],
    ],
  );
  if (changes.length) {
    writeAudit(db, { entityType: 'lead', entityId: id, action: 'update', changes });
  }
  return getLead(db, id);
}

export function deleteLead(db: Db, id: number): void {
  const row = getLeadRow(db, id);
  const timestamp = nowIso();
  db.prepare(
    'UPDATE lead SET deleted_at = ?, updated_at = ? WHERE id = ? AND workspace_id = 1',
  ).run(timestamp, timestamp, id);
  cascadeChildren(db, 'lead', id, timestamp);
  writeAudit(db, {
    entityType: 'lead',
    entityId: id,
    action: 'delete',
    metadata: {
      snapshot: {
        companyName: String(row.company_name),
        contactName: String(row.contact_name),
      },
    },
  });
}

export function convertLead(db: Db, id: number, input: ConvertInput): ConvertLeadResult {
  return withTransaction(db, () => {
    const lead = getLead(db, id);
    if (lead.status === 'converted') {
      if (!lead.convertedCompanyId || !lead.convertedContactId || !lead.convertedDealId) {
        throw new ApiError(500, 'INTERNAL_ERROR', 'У конвертированного лида не хватает связей.');
      }
      return {
        lead,
        company: getCompany(db, lead.convertedCompanyId),
        contact: getContact(db, lead.convertedContactId),
        deal: getDeal(db, lead.convertedDealId),
        created: { company: false, contact: false, deal: false },
        alreadyConverted: true,
      };
    }

    const email = normalizedEmailOrThrow(input.contact?.email ?? lead.email);
    const existingContact = email
      ? (db
          .prepare(
            `SELECT * FROM contact
             WHERE workspace_id = 1 AND email = ? AND deleted_at IS NULL
             ORDER BY id ASC LIMIT 1`,
          )
          .get(email) as Row | undefined)
      : undefined;

    let companyId: number;
    let createdCompany = false;
    if (input.companyId) {
      assertEntity(db, 'company', input.companyId);
      companyId = input.companyId;
    } else if (existingContact?.company_id) {
      getCompanyRow(db, Number(existingContact.company_id));
      companyId = Number(existingContact.company_id);
    } else {
      const domain = emailDomain(email);
      const byDomain = domain
        ? (db
            .prepare(
              `SELECT id FROM company
               WHERE workspace_id = 1 AND domain_norm = ? AND deleted_at IS NULL`,
            )
            .get(domain) as Row | undefined)
        : undefined;
      if (byDomain) {
        companyId = Number(byDomain.id);
      } else {
        const companyName =
          input.companyName ?? lead.companyName;
        const company = createCompany(db, {
          name: companyName,
          domain,
          industry: null,
          size: null,
          location: null,
          telegram: null,
          stack: [],
          tags: [],
          notes: null,
        });
        companyId = company.id;
        createdCompany = true;
      }
    }

    let contact;
    let createdContact = false;
    if (existingContact) {
      if (
        existingContact.company_id != null &&
        Number(existingContact.company_id) !== companyId
      ) {
        throw new ApiError(
          422,
          'CONTACT_COMPANY_MISMATCH',
          'Найденный контакт принадлежит другой компании.',
          {
            contactId: Number(existingContact.id),
            currentCompanyId: Number(existingContact.company_id),
          },
        );
      }
      if (existingContact.company_id == null) {
        contact = updateContactCompany(db, Number(existingContact.id), companyId);
      } else {
        contact = getContact(db, Number(existingContact.id));
      }
    } else {
      const parsedName = input.contact?.firstName
        ? {
            firstName: input.contact.firstName,
            lastName: input.contact.lastName ?? null,
          }
        : splitName(lead.contactName);
      contact = createContact(db, {
        firstName: parsedName.firstName,
        lastName: parsedName.lastName,
        email,
        phone: input.contact?.phone ?? lead.phone,
        telegram: null,
        linkedin: null,
        jobTitle: input.contact?.jobTitle ?? null,
        companyId,
        tags: [],
        notes: null,
        allowDuplicate: false,
      });
      createdContact = true;
    }

    const deal = createDeal(db, {
      title: input.deal.title,
      amountMinor: input.deal.amountMinor,
      currency: input.deal.currency,
      serviceType: input.deal.serviceType,
      source: input.deal.source ?? lead.source,
      companyId,
      primaryContactId: contact.id,
      stageId: input.deal.stageId,
      expectedCloseDate: input.deal.expectedCloseDate ?? null,
    });

    const timestamp = nowIso();
    db.prepare(
      `UPDATE lead SET status = 'converted', converted_company_id = ?, converted_contact_id = ?,
        converted_deal_id = ?, converted_at = ?, updated_at = ?
       WHERE id = ? AND workspace_id = 1`,
    ).run(companyId, contact.id, deal.id, timestamp, timestamp, id);
    writeAudit(db, {
      entityType: 'lead',
      entityId: id,
      action: 'convert',
      metadata: { companyId, contactId: contact.id, dealId: deal.id },
    });

    return {
      lead: getLead(db, id),
      company: getCompany(db, companyId),
      contact,
      deal,
      created: { company: createdCompany, contact: createdContact, deal: true },
      alreadyConverted: false,
    };
  });
}

function updateContactCompany(db: Db, id: number, companyId: number) {
  const before = db
    .prepare('SELECT * FROM contact WHERE id = ? AND workspace_id = 1')
    .get(id) as Row;
  const timestamp = nowIso();
  db.prepare(
    'UPDATE contact SET company_id = ?, updated_at = ? WHERE id = ? AND workspace_id = 1',
  ).run(companyId, timestamp, id);
  writeAudit(db, {
    entityType: 'contact',
    entityId: id,
    action: 'update',
    changes: [{ field: 'companyId', from: before.company_id ?? null, to: companyId }],
  });
  return getContact(db, id);
}
