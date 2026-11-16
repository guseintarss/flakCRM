import type { z } from 'zod';
import { nowIso, type Db } from '../db';
import { ApiError, pageMeta, pagination } from '../http';
import { mapActivity } from '../mappers';
import type { Activity, PageResult } from '../../shared/types';
import { entityExists } from './entities';
import { diffFields, writeAudit } from './audit';
import type { activitiesQuerySchema, activityCreateSchema, activityUpdateSchema } from '../schemas';

type Row = Record<string, unknown>;
type ListQuery = z.infer<typeof activitiesQuerySchema>;
type CreateInput = z.infer<typeof activityCreateSchema>;
type UpdateInput = z.infer<typeof activityUpdateSchema>;

const ACTIVITY_SELECT = `
  SELECT a.id, a.type, a.subject, a.body, a.occurred_at AS occurredAt,
    a.entity_type AS entityType, a.entity_id AS entityId,
    a.created_at AS createdAt, a.updated_at AS updatedAt,
    u.id AS authorId, u.name AS authorName, u.email AS authorEmail,
    CASE a.entity_type
      WHEN 'company' THEN (SELECT name FROM company WHERE id = a.entity_id)
      WHEN 'contact' THEN (
        SELECT TRIM(first_name || ' ' || COALESCE(last_name, '')) FROM contact WHERE id = a.entity_id
      )
      WHEN 'lead' THEN (
        SELECT company_name || ' · ' || contact_name FROM lead WHERE id = a.entity_id
      )
      WHEN 'deal' THEN (SELECT title FROM deal WHERE id = a.entity_id)
    END AS relatedLabel
  FROM activity a
  JOIN app_user u ON u.id = a.author_id
`;

function assertRelated(db: Db, type: 'company' | 'contact' | 'lead' | 'deal', id: number): void {
  if (!entityExists(db, type, id)) {
    throw new ApiError(404, 'NOT_FOUND', 'Связанная запись не найдена.');
  }
}

export function listActivities(db: Db, query: ListQuery): PageResult<Activity> {
  const clauses = ['a.workspace_id = 1', 'a.deleted_at IS NULL'];
  const params: (string | number | null)[] = [];
  if (query.entityType && query.entityId) {
    assertRelated(db, query.entityType, query.entityId);
    clauses.push('a.entity_type = ?', 'a.entity_id = ?');
    params.push(query.entityType, query.entityId);
  }
  if (query.type) {
    clauses.push('a.type = ?');
    params.push(query.type);
  }
  const where = clauses.join(' AND ');
  const total = Number(
    (db.prepare(`SELECT COUNT(*) AS total FROM activity a WHERE ${where}`).get(...params) as Row)
      .total,
  );
  const { limit, offset } = pagination(query);
  const rows = db
    .prepare(
      `${ACTIVITY_SELECT} WHERE ${where}
       ORDER BY a.occurred_at ${query.sort === 'occurredAt' ? 'ASC' : 'DESC'}, a.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as Row[];
  return {
    data: rows.map(mapActivity),
    page: pageMeta(total, query.page, query.pageSize),
  };
}

function getActivityRow(db: Db, id: number): Row {
  const row = db
    .prepare('SELECT * FROM activity WHERE id = ? AND workspace_id = 1 AND deleted_at IS NULL')
    .get(id) as Row | undefined;
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Активность не найдена.');
  return row;
}

export function getActivity(db: Db, id: number): Activity {
  getActivityRow(db, id);
  const row = db
    .prepare(`${ACTIVITY_SELECT} WHERE a.id = ? AND a.workspace_id = 1 AND a.deleted_at IS NULL`)
    .get(id) as Row | undefined;
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Активность не найдена.');
  return mapActivity(row);
}

export function createActivity(db: Db, input: CreateInput): Activity {
  assertRelated(db, input.relatedTo.type, input.relatedTo.id);
  const timestamp = nowIso();
  const result = db
    .prepare(
      `INSERT INTO activity
        (workspace_id, type, subject, body, occurred_at, author_id, entity_type, entity_id,
         created_at, updated_at)
       VALUES (1, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    )
    .run(
      input.type,
      input.subject,
      input.body ?? null,
      input.occurredAt ?? timestamp,
      input.relatedTo.type,
      input.relatedTo.id,
      timestamp,
      timestamp,
    );
  const id = Number(result.lastInsertRowid);
  writeAudit(db, { entityType: 'activity', entityId: id, action: 'create' });
  return getActivity(db, id);
}

export function updateActivity(db: Db, id: number, input: UpdateInput): Activity {
  const before = getActivityRow(db, id);
  const next = {
    type: input.type ?? String(before.type),
    subject: input.subject ?? String(before.subject),
    body: input.body === undefined ? (before.body as string | null) : input.body,
    occurredAt: input.occurredAt ?? String(before.occurred_at),
  };
  const timestamp = nowIso();
  db.prepare(
    `UPDATE activity SET type = ?, subject = ?, body = ?, occurred_at = ?, updated_at = ?
     WHERE id = ? AND workspace_id = 1 AND deleted_at IS NULL`,
  ).run(next.type, next.subject, next.body, next.occurredAt, timestamp, id);
  const changes = diffFields(
    before,
    { type: next.type, subject: next.subject, occurredAt: next.occurredAt },
    [
      ['type', 'type'],
      ['subject', 'subject'],
      ['occurredAt', 'occurred_at'],
    ],
  );
  if (changes.length) {
    writeAudit(db, { entityType: 'activity', entityId: id, action: 'update', changes });
  }
  return getActivity(db, id);
}

export function deleteActivity(db: Db, id: number): void {
  const row = getActivityRow(db, id);
  const timestamp = nowIso();
  db.prepare(
    'UPDATE activity SET deleted_at = ?, updated_at = ? WHERE id = ? AND workspace_id = 1',
  ).run(timestamp, timestamp, id);
  writeAudit(db, {
    entityType: 'activity',
    entityId: id,
    action: 'delete',
    metadata: { snapshot: { subject: String(row.subject) } },
  });
}
