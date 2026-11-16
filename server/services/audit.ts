import { nowIso, type Db } from '../db';
import type {
  AuditAction,
  AuditChange,
  AuditEvent,
  EntityType,
  PageResult,
} from '../../shared/types';
import { mapAuditEvent } from '../mappers';

export interface AuditInput {
  entityType: EntityType | 'activity' | 'task';
  entityId: number;
  action: AuditAction;
  changes?: AuditChange[];
  metadata?: Record<string, unknown> | null;
}

export function writeAudit(db: Db, input: AuditInput): void {
  db.prepare(
    `INSERT INTO audit_event
      (workspace_id, actor_id, entity_type, entity_id, action, changes, metadata, created_at)
     VALUES (1, 1, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.entityType,
    input.entityId,
    input.action,
    JSON.stringify(input.changes ?? []),
    input.metadata == null ? null : JSON.stringify(input.metadata),
    nowIso(),
  );
}

export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: Array<[apiField: string, dbField: string]>,
): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const [apiField, dbField] of fields) {
    const from = before[dbField] ?? null;
    const to = after[apiField] ?? null;
    const fromJson = JSON.stringify(from);
    const toJson = JSON.stringify(to);
    if (fromJson !== toJson) changes.push({ field: apiField, from, to });
  }
  return changes;
}

export function auditChangesForJson(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const field of fields) {
    const from = before[field] ?? null;
    const to = after[field] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes.push({ field, from, to });
    }
  }
  return changes;
}

export function listAuditEvents(
  db: Db,
  query: { entityType: string; entityId: number; action?: string; page: number; pageSize: number },
): PageResult<AuditEvent> {
  const clauses = ['ae.workspace_id = 1', 'ae.entity_type = ?', 'ae.entity_id = ?'];
  const params: (string | number | null)[] = [query.entityType, query.entityId];
  if (query.action) {
    clauses.push('ae.action = ?');
    params.push(query.action);
  }
  const where = clauses.join(' AND ');
  const total = Number(
    (
      db.prepare(`SELECT COUNT(*) AS total FROM audit_event ae WHERE ${where}`).get(...params) as {
        total?: number;
      }
    ).total ?? 0,
  );
  const rows = db
    .prepare(
      `SELECT ae.id, ae.action, ae.entity_type AS entityType, ae.entity_id AS entityId,
        ae.changes, ae.metadata, ae.created_at AS createdAt,
        u.id AS actorId, u.name AS actorName, u.email AS actorEmail
       FROM audit_event ae JOIN app_user u ON u.id = ae.actor_id
       WHERE ${where}
       ORDER BY ae.created_at DESC, ae.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, query.pageSize, (query.page - 1) * query.pageSize) as Record<
    string,
    unknown
  >[];
  return {
    data: rows.map(mapAuditEvent),
    page: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}
