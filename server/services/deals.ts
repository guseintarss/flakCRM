import type { z } from 'zod';
import { nowIso, type Db } from '../db';
import { ApiError, pageMeta, pagination } from '../http';
import { mapDeal, mapDealListItem, mapStageHistory } from '../mappers';
import type {
  Deal,
  DealBoard,
  DealCard,
  DealListItem,
  PageResult,
  Stage,
  StageHistoryEntry,
} from '../../shared/types';
import { normalizeText } from '../lib/normalize';
import type {
  boardQuerySchema,
  dealCreateSchema,
  dealStageChangeSchema,
  dealsQuerySchema,
  dealUpdateSchema,
} from '../schemas';
import { diffFields, writeAudit } from './audit';
import {
  assertEntity,
  assertStageInPipeline,
  getContactRow,
  getDealRow,
  getPipeline,
  getWorkspace,
  likeParam,
} from './entities';

type Row = Record<string, unknown>;
type ListQuery = z.infer<typeof dealsQuerySchema>;
type CreateInput = z.infer<typeof dealCreateSchema>;
type UpdateInput = z.infer<typeof dealUpdateSchema>;
type StageChangeInput = z.infer<typeof dealStageChangeSchema>;
type BoardQuery = z.infer<typeof boardQuerySchema>;

const DEAL_SELECT = `
  SELECT d.id, d.title, d.amount_minor AS amountMinor, d.currency,
    d.service_type AS serviceType, d.source, d.status,
    d.expected_close_date AS expectedCloseDate, d.closed_at AS closedAt,
    d.lost_reason AS lostReason, d.version, d.pipeline_id AS pipelineId,
    d.created_at AS createdAt, d.updated_at AS updatedAt,
    s.id AS stageId, s.name AS stageName, s.position AS stagePosition, s.probability AS stageProbability,
    comp.id AS companyId, comp.name AS companyName, comp.domain AS companyDomain,
    ct.id AS contactId, TRIM(ct.first_name || ' ' || COALESCE(ct.last_name, '')) AS contactFullName,
    ct.email AS contactEmail,
    u.id AS ownerId, u.name AS ownerName, u.email AS ownerEmail
  FROM deal d
  JOIN stage s ON s.id = d.stage_id
  JOIN app_user u ON u.id = d.owner_id
  LEFT JOIN company comp ON comp.id = d.company_id AND comp.deleted_at IS NULL
  LEFT JOIN contact ct ON ct.id = d.primary_contact_id AND ct.deleted_at IS NULL
`;

function sortClause(sort: ListQuery['sort']): string {
  switch (sort) {
    case 'updatedAt':
      return 'd.updated_at ASC, d.id ASC';
    case '-updatedAt':
      return 'd.updated_at DESC, d.id DESC';
    case 'createdAt':
      return 'd.created_at ASC, d.id ASC';
    case '-createdAt':
      return 'd.created_at DESC, d.id DESC';
    case 'amountMinor':
      return 'd.amount_minor ASC, d.id ASC';
    case '-amountMinor':
      return 'd.amount_minor DESC, d.id DESC';
    case 'expectedCloseDate':
      return '(d.expected_close_date IS NULL) ASC, d.expected_close_date ASC, d.id ASC';
    case '-expectedCloseDate':
      return '(d.expected_close_date IS NULL) ASC, d.expected_close_date DESC, d.id DESC';
  }
}

function dealFilters(query: ListQuery): { where: string; params: (string | number | null)[] } {
  const clauses = ['d.workspace_id = 1', 'd.deleted_at IS NULL'];
  const params: (string | number | null)[] = [];
  if (query.status !== 'all') {
    clauses.push('d.status = ?');
    params.push(query.status);
  }
  if (query.stageId) {
    clauses.push('d.stage_id = ?');
    params.push(query.stageId);
  }
  if (query.companyId) {
    clauses.push('d.company_id = ?');
    params.push(query.companyId);
  }
  if (query.primaryContactId) {
    clauses.push('d.primary_contact_id = ?');
    params.push(query.primaryContactId);
  }
  if (query.serviceType) {
    clauses.push('d.service_type = ?');
    params.push(query.serviceType);
  }
  if (query.source) {
    clauses.push('d.source = ?');
    params.push(query.source);
  }
  if (query.currency) {
    clauses.push('d.currency = ?');
    params.push(query.currency);
  }
  if (query.expectedCloseFrom) {
    clauses.push('d.expected_close_date >= ?');
    params.push(query.expectedCloseFrom);
  }
  if (query.expectedCloseTo) {
    clauses.push('d.expected_close_date <= ?');
    params.push(query.expectedCloseTo);
  }
  if (query.q) {
    const value = likeParam(query.q);
    clauses.push(
      `(d.title_norm LIKE ? ESCAPE '\\' OR comp.name_norm LIKE ? ESCAPE '\\')`,
    );
    params.push(value, value);
  }
  return { where: clauses.join(' AND '), params };
}

export function listDeals(db: Db, query: ListQuery): PageResult<DealListItem> {
  const { where, params } = dealFilters(query);
  const total = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS total FROM deal d
           LEFT JOIN company comp ON comp.id = d.company_id AND comp.deleted_at IS NULL
           WHERE ${where}`,
        )
        .get(...params) as Row
    ).total,
  );
  const { limit, offset } = pagination(query);
  const rows = db
    .prepare(`${DEAL_SELECT} WHERE ${where} ORDER BY ${sortClause(query.sort)} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Row[];
  return {
    data: rows.map(mapDealListItem),
    page: pageMeta(total, query.page, query.pageSize),
  };
}

export function listDealsForExport(db: Db, query: ListQuery, limit: number): Deal[] {
  const { where, params } = dealFilters(query);
  const rows = db
    .prepare(`${DEAL_SELECT} WHERE ${where} ORDER BY ${sortClause(query.sort)} LIMIT ?`)
    .all(...params, limit) as Row[];
  return rows.map(mapDeal);
}

export function getDeal(db: Db, id: number): Deal {
  const row = db
    .prepare(`${DEAL_SELECT} WHERE d.id = ? AND d.workspace_id = 1 AND d.deleted_at IS NULL`)
    .get(id) as Row | undefined;
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Сделка не найдена.');
  return mapDeal(row);
}

function assertContactBelongsToCompany(
  db: Db,
  contactId: number | null | undefined,
  companyId: number,
): void {
  if (contactId == null) return;
  const contact = getContactRow(db, contactId);
  if (Number(contact.company_id) !== companyId) {
    throw new ApiError(
      422,
      'CONTACT_COMPANY_MISMATCH',
      'Контакт не принадлежит выбранной компании.',
      { contactId, currentCompanyId: contact.company_id ?? null },
    );
  }
}

export function createDeal(db: Db, input: CreateInput): Deal {
  assertEntity(db, 'company', input.companyId);
  if (input.primaryContactId) {
    assertEntity(db, 'contact', input.primaryContactId);
    assertContactBelongsToCompany(db, input.primaryContactId, input.companyId);
  }
  const pipeline = getPipeline(db);
  const stage = input.stageId
    ? assertStageInPipeline(db, input.stageId, pipeline.id)
    : pipeline.stages[0];
  if (!stage) throw new ApiError(500, 'INTERNAL_ERROR', 'В воронке нет стадий.');

  const timestamp = nowIso();
  const result = db
    .prepare(
      `INSERT INTO deal
        (workspace_id, pipeline_id, stage_id, company_id, primary_contact_id, owner_id,
         title, title_norm, amount_minor, currency, service_type, source, status,
         expected_close_date, version, created_at, updated_at)
       VALUES (1, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'open', ?, 1, ?, ?)`,
    )
    .run(
      pipeline.id,
      stage.id,
      input.companyId,
      input.primaryContactId ?? null,
      input.title,
      normalizeText(input.title),
      input.amountMinor,
      input.currency,
      input.serviceType,
      input.source ?? null,
      input.expectedCloseDate ?? null,
      timestamp,
      timestamp,
    );
  const id = Number(result.lastInsertRowid);
  db.prepare(
    `INSERT INTO deal_stage_history
      (workspace_id, deal_id, from_stage_id, to_stage_id, note, changed_by, changed_at)
     VALUES (1, ?, NULL, ?, 'Сделка создана', 1, ?)`,
  ).run(id, stage.id, timestamp);
  writeAudit(db, {
    entityType: 'deal',
    entityId: id,
    action: 'create',
    changes: [
      { field: 'title', from: null, to: input.title },
      { field: 'amountMinor', from: null, to: input.amountMinor },
      { field: 'currency', from: null, to: input.currency },
    ],
  });
  return getDeal(db, id);
}

export function updateDeal(db: Db, id: number, input: UpdateInput): Deal {
  const before = getDealRow(db, id);
  if (Number(before.version) !== input.version) {
    throw new ApiError(409, 'VERSION_CONFLICT', 'Сделка изменена в другом окне. Обновите данные.', {
      currentVersion: Number(before.version),
      updatedAt: String(before.updated_at),
    });
  }

  const currentStatus = String(before.status) as Deal['status'];
  const nextStatus = input.status ?? currentStatus;
  const currentLostReason = (before.lost_reason as string | null) ?? null;
  let nextLostReason: string | null;

  if (nextStatus === 'lost') {
    nextLostReason =
      input.lostReason === undefined ? currentLostReason : (input.lostReason?.trim() ?? null);
    if (!nextLostReason) {
      throw new ApiError(422, 'LOST_REASON_REQUIRED', 'Укажите причину проигрыша.');
    }
  } else {
    if (input.lostReason != null && input.lostReason.trim() !== '') {
      throw new ApiError(
        422,
        'LOST_REASON_NOT_ALLOWED',
        'Причина проигрыша допустима только для lost.',
      );
    }
    nextLostReason = null;
  }

  const nextCompanyId = input.companyId ?? Number(before.company_id);
  if (input.companyId) assertEntity(db, 'company', input.companyId);

  const nextContactId =
    input.primaryContactId === undefined
      ? (before.primary_contact_id as number | null)
      : input.primaryContactId;
  if (input.primaryContactId !== undefined || input.companyId !== undefined) {
    if (nextContactId != null) {
      assertEntity(db, 'contact', nextContactId);
      const contact = getContactRow(db, nextContactId);
      if (Number(contact.company_id) !== nextCompanyId) {
        throw new ApiError(
          422,
          'CONTACT_COMPANY_MISMATCH',
          'Контакт не принадлежит компании сделки.',
          { contactId: nextContactId, currentCompanyId: contact.company_id ?? null },
        );
      }
    }
  }

  const next = {
    title: input.title ?? String(before.title),
    amountMinor: input.amountMinor ?? Number(before.amount_minor),
    currency: input.currency ?? String(before.currency),
    serviceType: input.serviceType ?? String(before.service_type),
    source: input.source === undefined ? (before.source as string | null) : input.source,
    companyId: nextCompanyId,
    primaryContactId: nextContactId,
    expectedCloseDate:
      input.expectedCloseDate === undefined
        ? (before.expected_close_date as string | null)
        : input.expectedCloseDate,
    status: nextStatus,
    lostReason: nextLostReason,
    closedAt:
      nextStatus === 'open'
        ? null
        : currentStatus === 'open'
          ? nowIso()
          : (before.closed_at as string | null),
  };

  const timestamp = nowIso();
  db.prepare(
    `UPDATE deal SET
      title = ?, title_norm = ?, amount_minor = ?, currency = ?, service_type = ?, source = ?,
      company_id = ?, primary_contact_id = ?, expected_close_date = ?, status = ?,
      closed_at = ?, lost_reason = ?, version = version + 1, updated_at = ?
     WHERE id = ? AND workspace_id = 1 AND deleted_at IS NULL`,
  ).run(
    next.title,
    normalizeText(next.title),
    next.amountMinor,
    next.currency,
    next.serviceType,
    next.source,
    next.companyId,
    next.primaryContactId,
    next.expectedCloseDate,
    next.status,
    next.closedAt,
    next.lostReason,
    timestamp,
    id,
  );

  const changes = diffFields(
    before,
    {
      title: next.title,
      amountMinor: next.amountMinor,
      currency: next.currency,
      serviceType: next.serviceType,
      source: next.source,
      companyId: next.companyId,
      primaryContactId: next.primaryContactId,
      status: next.status,
      lostReason: next.lostReason,
      expectedCloseDate: next.expectedCloseDate,
    },
    [
      ['title', 'title'],
      ['amountMinor', 'amount_minor'],
      ['currency', 'currency'],
      ['serviceType', 'service_type'],
      ['source', 'source'],
      ['companyId', 'company_id'],
      ['primaryContactId', 'primary_contact_id'],
      ['status', 'status'],
      ['lostReason', 'lost_reason'],
      ['expectedCloseDate', 'expected_close_date'],
    ],
  );
  if (changes.length) {
    writeAudit(db, { entityType: 'deal', entityId: id, action: 'update', changes });
  }
  return getDeal(db, id);
}

export function changeDealStage(
  db: Db,
  id: number,
  input: StageChangeInput,
): { deal: Deal; changed: boolean } {
  const before = getDealRow(db, id);
  if (Number(before.version) !== input.version) {
    throw new ApiError(409, 'VERSION_CONFLICT', 'Сделка изменена в другом окне. Обновите данные.', {
      currentVersion: Number(before.version),
      updatedAt: String(before.updated_at),
    });
  }
  if (String(before.status) !== 'open') {
    throw new ApiError(422, 'DEAL_CLOSED', 'Сначала верните сделку в работу.');
  }
  const pipeline = getPipeline(db);
  const stage = assertStageInPipeline(db, input.stageId, pipeline.id);
  if (Number(before.stage_id) === stage.id) {
    return { deal: getDeal(db, id), changed: false };
  }

  const timestamp = nowIso();
  db.prepare(
    `UPDATE deal SET stage_id = ?, version = version + 1, updated_at = ?
     WHERE id = ? AND workspace_id = 1 AND deleted_at IS NULL`,
  ).run(stage.id, timestamp, id);
  db.prepare(
    `INSERT INTO deal_stage_history
      (workspace_id, deal_id, from_stage_id, to_stage_id, note, changed_by, changed_at)
     VALUES (1, ?, ?, ?, ?, 1, ?)`,
  ).run(id, Number(before.stage_id), stage.id, input.note ?? null, timestamp);
  writeAudit(db, {
    entityType: 'deal',
    entityId: id,
    action: 'stage_change',
    changes: [
      { field: 'stageId', from: Number(before.stage_id), to: stage.id },
    ],
  });
  return { deal: getDeal(db, id), changed: true };
}

export function getDealStageHistory(
  db: Db,
  id: number,
  page: number,
  pageSize: number,
): PageResult<StageHistoryEntry> {
  getDealRow(db, id);
  const total = Number(
    (
      db
        .prepare('SELECT COUNT(*) AS total FROM deal_stage_history WHERE deal_id = ?')
        .get(id) as Row
    ).total,
  );
  const rows = db
    .prepare(
      `SELECT h.id, h.from_stage_id AS fromStageId, fs.name AS fromStageName,
        fs.position AS fromStagePosition, fs.probability AS fromStageProbability,
        h.to_stage_id AS toStageId, ts.name AS toStageName, ts.position AS toStagePosition,
        ts.probability AS toStageProbability, h.note, h.changed_at AS changedAt,
        u.id AS changedById, u.name AS changedByName, u.email AS changedByEmail
       FROM deal_stage_history h
       JOIN stage ts ON ts.id = h.to_stage_id
       LEFT JOIN stage fs ON fs.id = h.from_stage_id
       JOIN app_user u ON u.id = h.changed_by
       WHERE h.deal_id = ?
       ORDER BY h.changed_at DESC, h.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(id, pageSize, (page - 1) * pageSize) as Row[];
  return {
    data: rows.map(mapStageHistory),
    page: pageMeta(total, page, pageSize),
  };
}

export function deleteDeal(db: Db, id: number): void {
  const row = getDealRow(db, id);
  const timestamp = nowIso();
  db.prepare(
    'UPDATE deal SET deleted_at = ?, updated_at = ? WHERE id = ? AND workspace_id = 1',
  ).run(timestamp, timestamp, id);
  db.prepare(
    `UPDATE activity SET deleted_at = ?, updated_at = ?
     WHERE workspace_id = 1 AND entity_type = 'deal' AND entity_id = ? AND deleted_at IS NULL`,
  ).run(timestamp, timestamp, id);
  db.prepare(
    `UPDATE task SET deleted_at = ?, updated_at = ?
     WHERE workspace_id = 1 AND entity_type = 'deal' AND entity_id = ? AND deleted_at IS NULL`,
  ).run(timestamp, timestamp, id);
  writeAudit(db, {
    entityType: 'deal',
    entityId: id,
    action: 'delete',
    metadata: { snapshot: { title: String(row.title) } },
  });
}

export function getDealBoard(db: Db, query: BoardQuery): DealBoard {
  const workspace = getWorkspace(db);
  const currency = query.currency ?? (workspace.baseCurrency as DealBoard['currency']);
  const pipeline = getPipeline(db);
  const clauses = [
    'd.workspace_id = 1',
    "d.deleted_at IS NULL",
    "d.status = 'open'",
    'd.currency = ?',
  ];
  const params: (string | number | null)[] = [currency];
  if (query.companyId) {
    clauses.push('d.company_id = ?');
    params.push(query.companyId);
  }
  if (query.serviceType) {
    clauses.push('d.service_type = ?');
    params.push(query.serviceType);
  }
  if (query.source) {
    clauses.push('d.source = ?');
    params.push(query.source);
  }
  if (query.q) {
    const value = likeParam(query.q);
    clauses.push(`(d.title_norm LIKE ? ESCAPE '\\' OR comp.name_norm LIKE ? ESCAPE '\\')`);
    params.push(value, value);
  }
  const where = clauses.join(' AND ');

  const totals = db
    .prepare(
      `SELECT d.stage_id AS stageId, COUNT(*) AS dealCount, COALESCE(SUM(d.amount_minor), 0) AS amountMinor
       FROM deal d LEFT JOIN company comp ON comp.id = d.company_id AND comp.deleted_at IS NULL
       WHERE ${where} GROUP BY d.stage_id`,
    )
    .all(...params) as Row[];
  const totalByStage = new Map(
    totals.map((row) => [
      Number(row.stageId),
      { dealCount: Number(row.dealCount), amountMinor: Number(row.amountMinor) },
    ]),
  );

  let truncated = false;
  const stages = pipeline.stages.map((stage: Stage) => {
    const total = totalByStage.get(stage.id) ?? { dealCount: 0, amountMinor: 0 };
    const rows = db
      .prepare(
        `${DEAL_SELECT} WHERE ${where} AND d.stage_id = ?
         ORDER BY d.updated_at DESC, d.id DESC LIMIT ?`,
      )
      .all(...params, stage.id, query.limitPerStage) as Row[];
    if (total.dealCount > rows.length) truncated = true;
    return {
      stage,
      dealCount: total.dealCount,
      amountMinor: total.amountMinor,
      deals: rows.map(
        (row): DealCard => ({
          id: Number(row.id),
          title: String(row.title),
          amountMinor: Number(row.amountMinor),
          currency: row.currency as DealCard['currency'],
          serviceType: row.serviceType as DealCard['serviceType'],
          company:
            row.companyId == null
              ? null
              : {
                  id: Number(row.companyId),
                  name: String(row.companyName),
                  domain: (row.companyDomain as string | null) ?? null,
                },
          primaryContact:
            row.contactId == null
              ? null
              : {
                  id: Number(row.contactId),
                  fullName: String(row.contactFullName),
                  email: (row.contactEmail as string | null) ?? null,
                },
          expectedCloseDate: (row.expectedCloseDate as string | null) ?? null,
          version: Number(row.version),
          updatedAt: String(row.updatedAt),
        }),
      ),
    };
  });

  return { currency, stages, truncated };
}
